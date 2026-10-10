"""Run the site's deterministic importer locally, then review its rows with LM Studio.

Requires Python 3.11+, Node 24, npm dependencies, and a loaded LM Studio model.
Environment: CAVESTOCK_URL, IMPORT_WORKER_TOKEN, LM_STUDIO_MODEL.
Optional: LM_STUDIO_URL (default http://127.0.0.1:1234), BRAVE_SEARCH_API_KEY.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
FIELDS = ("category", "region", "appellation", "domaine", "cuvee", "vintage")
LOCAL_KEYS = {"CAVESTOCK_URL", "IMPORT_WORKER_TOKEN", "LM_STUDIO_MODEL", "LM_STUDIO_URL", "BRAVE_SEARCH_API_KEY"}


def load_local_config() -> None:
    """Read the ignored laptop configuration without overriding explicit environment variables."""
    path = ROOT / ".env.import-worker"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if not line.strip() or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in LOCAL_KEYS:
            os.environ.setdefault(key, value.strip().strip('"'))


def request_json(url: str, *, token: str | None = None, payload: dict | None = None,
                 headers: dict | None = None, timeout: int = 60, method: str | None = None) -> dict:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request = Request(url, data=body, method=method or ("POST" if body is not None else "GET"),
                      headers={"Accept": "application/json", **({"Content-Type": "application/json"} if body else {}),
                               **({"Authorization": f"Bearer {token}"} if token else {}), **(headers or {})})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as error:
        detail = error.read(1000).decode("utf-8", "replace")
        raise RuntimeError(f"HTTP {error.code} : {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Connexion impossible à {url}: {error.reason}") from error


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFD", value.casefold())
    return re.sub(r"\s+", " ", "".join(char for char in value if unicodedata.category(char) != "Mn")).strip()


def source_label(row: dict) -> str:
    if row.get("rawLabel"):
        return str(row["rawLabel"])
    match = re.search(r"Libellé source\s*:\s*(.*?)(?:\s*·\s*[^·]*\s*:|$)", row.get("comment", ""), re.I)
    if match:
        return match.group(1).strip()
    return " - ".join(filter(None, (row.get("appellation"), row.get("domaine"), row.get("cuvee"))))


def search_wine(label: str, api_key: str) -> list[dict]:
    # Only a wine name leaves the laptop; no account, stock, prices or comments.
    query = quote(f'vin {label[:120]} appellation domaine cuvée')
    result = request_json(f"https://api.search.brave.com/res/v1/web/search?q={query}&count=3",
                          headers={"X-Subscription-Token": api_key}, timeout=15)
    return [{"title": item.get("title", "")[:150], "description": item.get("description", "")[:350],
             "url": item.get("url", "")[:300]} for item in result.get("web", {}).get("results", [])[:3]]


def parse_local(file_bytes: bytes, file_name: str) -> dict:
    suffix = Path(file_name).suffix.lower()
    if suffix not in {".xls", ".xlsx", ".csv", ".tsv"}:
        raise ValueError("Extension non prise en charge.")
    with tempfile.TemporaryDirectory(prefix="cavestock-import-") as folder:
        path = Path(folder) / ("input" + suffix)
        path.write_bytes(file_bytes)
        result = subprocess.run(["node", str(ROOT / "scripts" / "parse-import.mjs"), str(path), file_name],
                                cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=180, check=False)
        if result.returncode:
            raise RuntimeError(result.stderr.strip()[-400:] or "Analyse locale impossible.")
        return json.loads(result.stdout)


def model_response(model: str, server: str, rows: list[dict], references: dict[str, list[dict]]) -> dict:
    compact = [{"source": row["source"], "libellé": source_label(row),
                "extrait": row.get("comment", "")[:450],
                "analyse": {field: row.get(field, "") for field in FIELDS},
                "alertes": row.get("warnings", [])[:3],
                "références": references.get(row["source"], [])} for row in rows]
    instructions = (
        "Tu contrôles une extraction de vins. Réponds en JSON strict, objet {reviews:[{source,fields,warnings}]}. "
        "Un review par ligne, source identique. fields contient seulement les corrections utiles parmi "
        "category,region,appellation,domaine,cuvee,vintage. Aucune donnée inventée. Une valeur ajoutée ou corrigée doit "
        "figurer littéralement dans le libellé ou l'extrait fourni; tu peux déplacer une expression entre champs. "
        "Les références web servent uniquement à vérifier le sens d'un terme, jamais à créer un champ absent du fichier. "
        "Une appellation doit être une appellation de vin, pas un domaine ni une cuvée. "
        "Une cuvée doit être un nom de cuvée ou lieu-dit explicitement présent. "
        "Si une classification est incertaine, conserve l'analyse et explique le doute dans warnings. "
        "Un millésime manquant peut être rempli uniquement si le libellé indique explicitement 'Millésime AAAA'. "
        "Ne modifie jamais un millésime déjà renseigné, ni la quantité, le prix, la date ou le commentaire. "
        "Ne mets aucun texte hors JSON."
    )
    review_schema = {"type": "object", "properties": {"reviews": {"type": "array", "items": {
        "type": "object", "properties": {
            "source": {"type": "string"},
            "fields": {"type": "object", "properties": {field: {"type": "string"} for field in FIELDS},
                       "additionalProperties": False},
            "warnings": {"type": "array", "items": {"type": "string"}},
        }, "required": ["source", "fields", "warnings"], "additionalProperties": False,
    }}}, "required": ["reviews"], "additionalProperties": False}
    result = request_json(f"{server.rstrip('/')}/v1/chat/completions", payload={
        "model": model, "temperature": 0, "max_tokens": 2400, "reasoning_effort": "none",
        "response_format": {"type": "json_schema", "json_schema": {"name": "wine_import_review", "schema": review_schema}},
        "messages": [{"role": "system", "content": instructions},
                     {"role": "user", "content": json.dumps(compact, ensure_ascii=False)}],
    }, timeout=420)
    choice = result["choices"][0]
    content = choice["message"]["content"]
    if not isinstance(content, str) or not content.strip():
        raise RuntimeError("Réponse de l'IA vide. Vérifiez que le modèle accepte le mode sans raisonnement.")
    if choice.get("finish_reason") == "length":
        raise RuntimeError("Réponse de l'IA tronquée. Réessayez avec moins de lignes par lot.")
    content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(content)


def apply_reviews(rows: list[dict], response: dict) -> None:
    reviews = response.get("reviews")
    if not isinstance(reviews, list):
        raise ValueError("Le modèle n'a pas renvoyé de liste de contrôles.")
    by_source = {row["source"]: row for row in rows}
    checked: set[str] = set()
    for review in reviews:
        if not isinstance(review, dict) or review.get("source") not in by_source:
            continue
        row = by_source[review["source"]]
        checked.add(row["source"])
        evidence = normalized(source_label(row) + " " + row.get("comment", ""))
        changes = review.get("fields", {})
        if isinstance(changes, dict):
            for field, proposed in changes.items():
                if field not in FIELDS or not isinstance(proposed, str) or len(proposed) > (100 if field == "category" else 150):
                    continue
                proposed = proposed.strip()
                if not proposed or proposed == row.get(field):
                    continue
                if field == "vintage":
                    if row.get("vintage") or not re.fullmatch(r"(?:19|20)\d{2}", proposed) or not re.search(
                        rf"\bmillesime\s*[:\s-]*{re.escape(proposed)}\b", evidence
                    ):
                        row.setdefault("warnings", []).append("Suggestion IA écartée pour millésime : année non explicitement indiquée.")
                        continue
                # The existing region/category may come from a sheet heading; don't erase it without evidence.
                if normalized(proposed) not in evidence and normalized(proposed) not in normalized(" ".join(str(row.get(key, "")) for key in FIELDS)):
                    row.setdefault("warnings", []).append(f"Suggestion IA écartée pour {field} : valeur absente du fichier.")
                    continue
                row[field] = proposed
            for field, proposed in changes.items():
                if field not in FIELDS or field == "vintage" or proposed != "" or not row.get(field):
                    continue
                old_value = normalized(str(row[field]))
                if any(other != field and normalized(str(row.get(other, ""))) == old_value for other in FIELDS):
                    row[field] = ""
        for warning in review.get("warnings", []) if isinstance(review.get("warnings"), list) else []:
            if isinstance(warning, str) and warning.strip() and len(warning) <= 250:
                row.setdefault("warnings", []).append(warning.strip())
        if row.get("appellation"):
            row["warnings"] = [warning for warning in row.get("warnings", []) if not warning.startswith("Appellation non identifiable")]
        if row.get("vintage"):
            row["warnings"] = [warning for warning in row.get("warnings", []) if not warning.startswith("Millésime à renseigner")]
        row["warnings"] = list(dict.fromkeys(row.get("warnings", [])))[:20]
    for row in rows:
        if row["source"] not in checked:
            row.setdefault("warnings", []).append("Contrôle IA non obtenu pour cette ligne : vérifiez-la manuellement.")


def harmonize_repeated_labels(rows: list[dict]) -> None:
    """Reuse a unanimous classification for the exact same wine label across vintages."""
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for row in rows:
        key = (normalized(source_label(row)), normalized(row.get("category", "")), normalized(row.get("region", "")))
        if key[0]:
            groups.setdefault(key, []).append(row)
    for group in groups.values():
        if len(group) < 2:
            continue
        for field in ("appellation", "domaine", "cuvee"):
            values = {normalized(row[field]): row[field] for row in group if row.get(field)}
            if len(values) != 1:
                continue
            value = next(iter(values.values()))
            for row in group:
                if not row.get(field) and normalized(value) in normalized(source_label(row)):
                    row[field] = value
                    if field == "appellation":
                        row["warnings"] = [warning for warning in row.get("warnings", [])
                                           if not warning.startswith("Appellation non identifiable")]
    for row in rows:
        appellation = row.get("appellation", "").strip()
        domaine = row.get("domaine", "").strip()
        if appellation and domaine:
            prefix = re.match(rf"^{re.escape(appellation)}\s*[-–—]\s*(.+)$", domaine, re.I)
            if prefix and normalized(prefix.group(1)) in normalized(source_label(row)):
                row["domaine"] = prefix.group(1).strip()


def review_analysis(analysis: dict, *, model: str, server: str, search_key: str, heartbeat=None) -> dict:
    rows = analysis["rows"]
    for offset in range(0, len(rows), 6):
        batch = rows[offset:offset + 6]
        references: dict[str, list[dict]] = {}
        for row in batch:
            label = source_label(row)
            ambiguous = not row.get("appellation") or bool(row.get("warnings"))
            if search_key and ambiguous and label:
                try:
                    references[row["source"]] = search_wine(label, search_key)
                except Exception as error:
                    row.setdefault("warnings", []).append(f"Vérification web indisponible : {str(error)[:120]}")
        response = model_response(model, server, batch, references)
        apply_reviews(batch, response)
        if heartbeat:
            heartbeat()
        print(f"IA : {min(offset + 6, len(rows))}/{len(rows)} lignes contrôlées", file=sys.stderr, flush=True)
    harmonize_repeated_labels(rows)
    analysis["warnings"] = list(dict.fromkeys(analysis.get("warnings", [])))[:100]
    return analysis


def process_job(job: dict, *, site: str, token: str, model: str, server: str, search_key: str) -> None:
    print(f"Traitement : {job['fileName']} ({job['id']})", file=sys.stderr, flush=True)
    try:
        file_bytes = base64.b64decode(job["fileBase64"], validate=True)
        if len(file_bytes) > 2_000_000:
            raise ValueError("Fichier trop volumineux.")
        analysis = parse_local(file_bytes, job["fileName"])
        analysis = review_analysis(analysis, model=model, server=server, search_key=search_key,
            heartbeat=lambda: request_json(f"{site}/api/cellar/import/jobs/worker", token=token,
                                           payload={"id": job["id"], "lease": job["lease"]}, method="PATCH"))
        result = {"ok": True, "id": job["id"], "lease": job["lease"], "analysis": analysis}
    except Exception as error:
        result = {"ok": False, "id": job["id"], "lease": job["lease"], "error": str(error)[:500]}
        print(f"Échec : {error}", file=sys.stderr, flush=True)
    try:
        saved = request_json(f"{site}/api/cellar/import/jobs/worker", token=token, payload=result, timeout=120)
    except RuntimeError as error:
        if not result["ok"]:
            raise
        # A rejected result must not leave the request in PROCESSING for 12 hours.
        fallback = {"ok": False, "id": job["id"], "lease": job["lease"],
                    "error": f"Résultat d'analyse rejeté par le site : {str(error)[:400]}"}
        saved = request_json(f"{site}/api/cellar/import/jobs/worker", token=token, payload=fallback, timeout=120)
    print(f"Statut enregistré : {saved['status']}", file=sys.stderr, flush=True)


def main() -> int:
    load_local_config()
    parser = argparse.ArgumentParser(description="Traiter les imports CaveStock en attente")
    parser.add_argument("--poll", type=int, metavar="SECONDES", help="Surveiller la file continuellement")
    args = parser.parse_args()
    site = os.environ.get("CAVESTOCK_URL", "").rstrip("/")
    token = os.environ.get("IMPORT_WORKER_TOKEN", "")
    model = os.environ.get("LM_STUDIO_MODEL", "")
    server = os.environ.get("LM_STUDIO_URL", "http://127.0.0.1:1234")
    search_key = os.environ.get("BRAVE_SEARCH_API_KEY", "")
    if not site or len(token) < 32 or not model:
        parser.error("Renseignez CAVESTOCK_URL, IMPORT_WORKER_TOKEN (32 caractères min.) et LM_STUDIO_MODEL.")
    if urlparse(site).scheme != "https" and not site.startswith("http://localhost") and not site.startswith("http://127.0.0.1"):
        parser.error("CAVESTOCK_URL doit utiliser HTTPS hors localhost.")
    while True:
        job = request_json(f"{site}/api/cellar/import/jobs/worker", token=token)
        if job.get("id"):
            process_job(job, site=site, token=token, model=model, server=server, search_key=search_key)
        elif not args.poll:
            print("Aucun fichier en attente.")
        if not args.poll:
            return 0
        time.sleep(max(10, args.poll))


if __name__ == "__main__":
    raise SystemExit(main())
