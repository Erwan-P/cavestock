import contextlib
import copy
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from unittest.mock import patch
from import_identity import review_identities

spec = importlib.util.spec_from_file_location("worker", "scripts/import_worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
row = {field: "" for field in ["category", "region", "appellation", "domaine", "vintage", "quantity", "cuvee", "purchasePrice", "movementDate", "comment"]}
row["source"] = "Feuil1 - ligne 2"
row["rawLabel"] = "Vin de test"
valid = {"rows": [row], "warnings": []}
worker.validate_analysis(valid)

# JSON mode checks the input messages, so instructions alone are insufficient.
def fake_responses(request, **_kwargs):
    payload = json.loads(request.data)
    assert payload["text"]["format"]["type"] == "json_object"
    assert payload["model"] == "gpt-6-luna"
    content = payload["input"][0]["content"]
    assert any(item["type"] == "input_text" and "json" in item["text"].lower() for item in content)
    assert len(content) == 1 and content[0]["type"] == "input_text"
    event = {"type": "response.output_text.delta", "delta": json.dumps(valid)}
    return io.BytesIO(("data: " + json.dumps(event) + "\n\ndata: [DONE]\n\n").encode())

with patch.object(worker.urllib.request, "urlopen", side_effect=fake_responses) as responses:
    assert worker.response_json("synthetic-token", "gpt-6-luna", "Return JSON", "Cellules brutes") == valid
    assert responses.call_count == 1

# A long import must refresh expired credentials and retry the failed request once.
expired = worker.urllib.error.HTTPError("https://api.openai.com/v1/responses", 401, "expired", {}, io.BytesIO())
event = {"type": "response.output_text.delta", "delta": json.dumps(valid)}
stream = io.BytesIO(("data: " + json.dumps(event) + "\n\ndata: [DONE]\n\n").encode())
with patch.object(worker.urllib.request, "urlopen", side_effect=[expired, stream]) as responses:
    provider = lambda force_refresh=False: "refreshed" if force_refresh else "expired"
    assert worker.response_json(provider, "gpt-6-luna", "JSON", "JSON") == valid
    assert responses.call_count == 2
    assert responses.call_args_list[0].args[0].get_header("Authorization") == "Bearer expired"
    assert responses.call_args_list[1].args[0].get_header("Authorization") == "Bearer refreshed"

# Never accept a valid-looking JSON object that silently omits source rows.
raw = [{"source": "Feuil1 - ligne 2", "cells": {"A": "Nom source"}},
       {"source": "Feuil1 - ligne 3", "cells": {"A": "Autre vin"}}]
sheet = {"name": "Feuil1", "rows": raw}
omitted = dict(valid, ignored={}, context="")
with patch.object(worker, "response_json", return_value=omitted) as model:
    try:
        worker.extract_batch("synthetic", "gpt-6-luna", sheet, raw, "")
        raise AssertionError("An omitted row was silently accepted")
    except ValueError as error:
        assert "Extraction incomplète" in str(error)
    assert model.call_count >= 2
complete = dict(valid, ignored={"Feuil1 - ligne 3": "En-tête de section"}, context="Région source")
with patch.object(worker, "response_json", return_value=complete):
    assert worker.extract_batch("synthetic", "gpt-6-luna", sheet, raw, "")["rows"] == valid["rows"]

# A spreadsheet grand total must be requalified, never accepted as an anonymous wine.
anonymous = dict(row, source=raw[1]["source"], rawLabel="", quantity="252")
first = {"rows": [dict(row), anonymous], "warnings": [], "ignored": {}, "context": ""}
repair = {"rows": [], "warnings": [], "ignored": {raw[1]["source"]: "Total de stock"}, "context": ""}
with patch.object(worker, "response_json", side_effect=[first, repair]) as model:
    result = worker.extract_batch("synthetic", "gpt-6-luna", sheet, raw, "")
    assert len(result["rows"]) == 1
    assert raw[1]["source"] in result["ignored"]
    assert model.call_count == 2
category_row = dict(row, rawLabel="Vin blanc", warnings=["Catégorie incertaine", "Millésime absent"])
with patch.object(worker, "response_json", return_value={"categories": {
    row["source"]: {"value": "Vins Blanc", "warnings": ["Millésime absent"]},
}}):
    worker.review_categories("synthetic", "gpt-6-luna", [category_row])
    assert category_row["category"] == "Vins Blanc"
    assert category_row["warnings"] == ["Millésime absent"]
region_row = dict(row, warnings=["Région absente", "Millésime absent"])
with patch.object(worker, "response_json", return_value={"regions": {
    row["source"]: {"value": "RHONE", "warnings": ["Millésime absent"]},
}}):
    worker.review_regions("synthetic", "gpt-6-luna", [region_row], [sheet])
    assert region_row["region"] == "RHONE"
    assert region_row["warnings"] == ["Millésime absent"]
# A partial region response must retry only omissions and preserve accepted rows.
region_rows = [dict(row, source="Feuil1 · ligne 1"), dict(row, source="Feuil1 · ligne 2")]
with patch.object(worker, "response_json", side_effect=[
    {"regions": {region_rows[0]["source"]: {"value": "RHONE", "warnings": []},
                 "source inventée": {"value": "FAUX", "warnings": []}}},
    {"regions": {region_rows[1]["source"]: {"value": "BORDEAUX", "warnings": []}}},
]) as model:
    assert worker.review_regions("synthetic", "gpt-6-luna", region_rows, [sheet]) == []
    retried = json.loads(model.call_args_list[1].args[3])["wines"]
    assert [item["source"] for item in retried] == [region_rows[1]["source"]]
    assert [item["region"] for item in region_rows] == ["RHONE", "BORDEAUX"]
for invalid in [{"regions": {}}, {"regions": {row["source"]: {"value": "RHONE", "warnings": "invalid"}}}]:
    untouched = copy.deepcopy(row)
    with patch.object(worker, "response_json", return_value=invalid) as model:
        assert worker.review_regions("synthetic", "gpt-6-luna", [untouched], [sheet])
        assert model.call_count == 2 and untouched == row
with patch.object(worker, "response_json", side_effect=RuntimeError("temporarily unavailable")):
    untouched = copy.deepcopy(row)
    assert worker.review_categories("synthetic", "gpt-6-luna", [untouched])
    assert untouched == row
transport = worker.read_workbook("fixture.csv", "Nom;Quantité\nVin de test;2\n".encode())
assert len(transport["sheets"][0]["rows"]) == 2
assert transport["sheets"][0]["rows"][1]["cells"]["A"] == "Vin de test"

# Hosted search runs outside JSON mode, retaining only URLs observed in tool events.
events = [
    {"type": "response.output_item.done", "item": {"type": "web_search_call", "action": {"sources": [
        {"url": "https://producer.example/wine", "title": "Producer"}, {"url": "javascript:alert(1)"}]}}},
    {"type": "response.output_text.delta", "delta": "Research with a citation, not JSON"},
]
def fake_web(request, **_kwargs):
    payload = json.loads(request.data)
    assert "text" not in payload and payload["tools"] == [{"type": "web_search"}]
    return io.BytesIO("".join("data: " + json.dumps(event) + "\n\n" for event in events).encode())
with patch.object(worker.urllib.request, "urlopen", side_effect=fake_web):
    searched = worker.response_json("synthetic", "gpt-6-luna", "Research", "Public identity", web_search=True)
    assert searched["_web_used"] and len(searched["_web_sources"]) == 1
    assert "research_text" in searched

identity_row = dict(row, rawLabel="Château Exemple", domaine="Château Exemple", quantity="2", vintage="2020",
                    purchasePrice="19.90", movementDate="2026-01-01", comment="PRIVATE-COMMENT")
protected = ("source", "rawLabel", "quantity", "vintage", "purchasePrice", "movementDate", "comment")
proposal = {"identities": [{"id": "0", "changes": {"appellation": "Appellation exacte"},
    "needs_web": True, "reason": "Producteur à confirmer"}]}
evidence = {"_web_used": True, "_web_sources": [{"url": "https://producer.example/wine", "title": "Producer"}], "research_text": "Exact wine"}
confirmed = {"matched": True, "changes": {"appellation": "Appellation exacte"}, "reason": "Fiche technique",
             "source_urls": ["https://producer.example/wine"]}
rows = [copy.deepcopy(identity_row), dict(identity_row, source="Autre ligne", quantity="7")]
before = copy.deepcopy(rows)
answers = iter([proposal, evidence, confirmed])
calls = []
def ask_identity(instructions, message, **kwargs):
    calls.append(kwargs)
    assert all(secret not in message for secret in ["PRIVATE-COMMENT", "19.90", "2026-01-01", "Autre ligne"])
    return copy.deepcopy(next(answers))
assert review_identities(rows, ask_identity, web_limit=1, log=lambda _: None) == []
assert len(calls) == 3 and calls[1]["web_search"] is True, "Duplicate identities must share one research request."
assert all(row["classification"]["status"] == "web" for row in rows)
assert all(before[i][key] == result[key] for i, result in enumerate(rows) for key in protected)
worker.validate_analysis({"rows": rows, "warnings": []})

for forged in [{"quantity": "999"}, {"vintage": "2025"}, {"comment": "changed"}]:
    bad = {"identities": [{"id": "0", "changes": forged, "needs_web": False, "reason": "invalid"}]}
    try:
        review_identities([copy.deepcopy(identity_row)], lambda *a, **k: bad, log=lambda _: None)
        raise AssertionError("A protected field was accepted")
    except ValueError:
        pass
forged_source = dict(confirmed, source_urls=["https://invented.example/wine"])
answers = iter([proposal, evidence, forged_source])
unchanged = copy.deepcopy(identity_row)
try:
    review_identities([unchanged], lambda *a, **k: copy.deepcopy(next(answers)), log=lambda _: None)
    raise AssertionError("A fabricated citation was accepted")
except ValueError:
    assert unchanged["appellation"] == identity_row["appellation"]
answers = iter([proposal])
limited = [copy.deepcopy(identity_row)]
assert review_identities(limited, lambda *a, **k: copy.deepcopy(next(answers)), web_limit=0, log=lambda _: None)
assert limited[0]["classification"]["status"] == "uncertain" and limited[0]["appellation"] == ""
for malformed in [{"rows": [], "warnings": []}, {"rows": [row] * 501, "warnings": []}, {"rows": [dict(row, quantity=2)], "warnings": []}, {"rows": [dict(row, unknownFields={"bad": 1})], "warnings": []}]:
    try:
        worker.validate_analysis(malformed)
        raise AssertionError("Malformed model output accepted")
    except ValueError:
        pass
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / "synthetic-auth.dat"
    with patch.object(worker, "credential_path", return_value=path):
        synthetic = {"access_token": "synthetic-token-never-used", "refresh_token": "synthetic-refresh", "expires_at": 0}
        worker.save_credentials(synthetic)
        assert worker.load_credentials() == synthetic
        if os.name == "nt":
            assert b"synthetic-token-never-used" not in path.read_bytes()
        else:
            assert path.stat().st_mode & 0o777 == 0o600
        worker.save_credentials(dict(synthetic, expires_at=999))
        assert worker.load_credentials()["expires_at"] == 999
        assert len(list(Path(folder).iterdir())) == 1
        for url in ["http://localhost.evil.invalid", "http://127.0.0.1.evil.invalid", "https://user:password@example.invalid", "http://example.invalid"]:
            with patch.dict(os.environ, {"CAVESTOCK_URL": url, "IMPORT_WORKER_TOKEN": "t" * 32}), patch.object(worker, "load_local_config"), patch.object(worker.sys, "argv", ["worker"]), patch.object(worker, "json_request") as network, contextlib.redirect_stderr(io.StringIO()):
                try:
                    worker.main()
                    raise AssertionError("Unsafe endpoint accepted")
                except SystemExit as error:
                    assert error.code == 2
                network.assert_not_called()
print("Worker security: JSON rejection, synthetic DPAPI round-trip, atomic replacement and unsafe URL rejection passed; no real credentials or network used.")
