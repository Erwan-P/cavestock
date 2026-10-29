"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Check, Download, FileSpreadsheet, X } from "lucide-react";
import type { CellarData } from "@/lib/cellar-types";
import { cleanImportedRow } from "@/lib/clean-import-row";
import { importRowErrors, type ImportField, type ImportRow } from "@/lib/import-types";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type Usage = { used: number; limit: number; remaining: number; resetsAt: string };
type ImportJob = { id: string; fileName: string; status: "PENDING" | "PROCESSING" | "READY" | "FAILED" | "IMPORTED"; error: string | null; createdAt: string };
type Mode = "import" | "export";
type Props = { mode: Mode; onClose: () => void; onImported: (data: CellarData) => void };
type Editable = ImportField;
const fields: Array<{ key: Editable; label: string; width?: number }> = [
  { key: "category", label: "Catégorie", width: 130 }, { key: "region", label: "Région", width: 130 },
  { key: "appellation", label: "Appellation", width: 140 }, { key: "domaine", label: "Domaine / vin", width: 140 },
  { key: "vintage", label: "Millésime", width: 90 }, { key: "quantity", label: "Quantité", width: 85 },
  { key: "cuvee", label: "Cuvée", width: 120 }, { key: "purchasePrice", label: "Prix / bouteille (€)", width: 90 },
  { key: "movementDate", label: "Date d'achat / mouvement", width: 140 },
  { key: "comment", label: "Commentaire", width: 250 },
];

async function errorMessage(response: Response) {
  const result = await response.json().catch(() => ({}));
  return typeof result.error === "string" ? result.error : "L'opération a échoué.";
}

function valid(row: ImportRow) {
  return Object.keys(importRowErrors(row)).length === 0;
}

function IdentificationNotes({ row }: { row: ImportRow }) {
  const identification = row.classification;
  if (!identification || identification.status === "file") return null;
  const title = identification.status === "uncertain" ? "Identification à vérifier"
    : identification.status === "web" ? "Identification et sources" : "Propositions de l'IA";
  return <div className="transfer-row-notes">
    <details><summary>{title}</summary><p>{identification.reason}</p>
      {identification.changes.map((change) => <p key={change.field}>
        {fields.find((field) => field.key === change.field)?.label} : {change.value || "à compléter"}
        {change.before && <> (avant : {change.before})</>}
        {row[change.field] !== change.value && <> - valeur modifiée dans l&apos;aperçu</>}
      </p>)}
    </details>
    {identification.sources.map((source) => <p key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title || "Consulter la source"}</a></p>)}
  </div>;
}

export function TransferModal({ mode, onClose, onImported }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [fileName, setFileName] = useState("");
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [activeJobId, setActiveJobId] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useDialogFocus(true, dialogRef, () => { if (!busy) onClose(); });

  useEffect(() => {
    let active = true;
    fetch("/api/cellar/transfer-usage", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (active) setUsage(mode === "import" ? data.imports : data.exports);
    }).catch(() => { if (active) setError("Impossible de vérifier le quota."); });
    return () => { active = false; };
  }, [mode]);

  useEffect(() => {
    if (mode !== "import") return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/cellar/import/jobs", { cache: "no-store" });
        if (response.ok && active) setJobs((await response.json() as { jobs: ImportJob[] }).jobs);
      } catch { /* The next poll retries. */ }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [mode]);

  function updateRow(index: number, key: Editable, value: string) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  }

  const queued = jobs.filter((job) => ["PENDING", "PROCESSING", "READY"].includes(job.status)).length;
  const canUpload = Boolean(usage && usage.remaining > queued);

  async function submitFile(file: File) {
    if (busy || !canUpload) return;
    setFileName(file.name);
    setBusy(true); setError(""); setRows([]); setWarnings([]);
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/cellar/import/jobs", { method: "POST", body });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json() as { jobId: string };
      setActiveJobId(result.jobId);
      setJobs((current) => [{ id: result.jobId, fileName: file.name, status: "PENDING", error: null, createdAt: new Date().toISOString() }, ...current]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Envoi impossible."); }
    finally { setBusy(false); }
  }

  async function openJob(job: ImportJob) {
    if (busy || job.status !== "READY") return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/cellar/import/jobs/${encodeURIComponent(job.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json() as { analysis: { rows: ImportRow[]; warnings: string[] } };
      if (!result.analysis?.rows?.length) throw new Error("L'aperçu est indisponible.");
      setFileName(job.fileName); setActiveJobId(job.id);
      setWarnings(result.analysis.warnings ?? []);
      const cleanRows = result.analysis.rows.map(cleanImportedRow);
      setRows(cleanRows);
      setSelected(new Set(result.analysis.rows.map((_, index) => index)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Aperçu impossible."); }
    finally { setBusy(false); }
  }

  async function deleteJob(job: ImportJob) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/cellar/import/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorMessage(response));
      setJobs((current) => current.filter((item) => item.id !== job.id));
      if (activeJobId === job.id) { setActiveJobId(""); setRows([]); setWarnings([]); setFileName(""); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Suppression impossible."); }
    finally { setBusy(false); }
  }

  async function importRows() {
    const picked = rows.filter((_, index) => selected.has(index));
    if (!activeJobId || !picked.length || picked.some((row) => !valid(row)) || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/cellar/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: activeJobId, rows: picked }) });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = await response.json() as { data: CellarData; message: string };
      onImported(result.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Import impossible."); }
    finally { setBusy(false); }
  }

  async function exportData() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/cellar/export", { method: "POST" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `cavestock-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setUsage((current) => current ? { ...current, used: current.used + 1, remaining: Math.max(0, current.remaining - 1) } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export impossible."); }
    finally { setBusy(false); }
  }

  const picked = rows.filter((_, index) => selected.has(index));
  const invalid = picked.filter((row) => !valid(row)).length;
  return <div className="cellar-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className={`cellar-dialog transfer-dialog${mode === "export" || !rows.length ? " transfer-dialog--short" : ""}`} role="dialog" aria-modal="true" aria-labelledby="transfer-title">
      <button type="button" className="cellar-dialog__close" aria-label="Fermer" onClick={onClose} disabled={busy}><X size={26} /></button>
      <h2 id="transfer-title">{mode === "import" ? "Importer mes vins" : "Exporter ma cave"}</h2>
      {(mode === "export" || rows.length > 0) && <p className="transfer-intro">{mode === "import"
        ? "Vérifiez et corrigez l'aperçu avant de confirmer l'ajout à votre cave."
        : "Téléchargez un classeur Excel avec un onglet par catégorie et un onglet pour l'historique des mouvements."}</p>}
      {usage && <p className="transfer-quota">{usage.remaining} {mode === "import" ? `import${usage.remaining > 1 ? "s" : ""}` : `export${usage.remaining > 1 ? "s" : ""}`} restant{usage.remaining > 1 ? "s" : ""} ce mois-ci (limite : {usage.limit}). Réinitialisation le {new Date(usage.resetsAt).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}.</p>}
      {mode === "import" ? <>
        <p className="transfer-hint">Déposez le fichier : il sera transmis à ChatGPT (OpenAI) pour préparer l'aperçu dès qu'un opérateur sera disponible. Vous recevrez un e-mail quand il sera prêt. Aucun vin n'est ajouté avant votre confirmation.</p>
        <div className="transfer-upload" onDragOver={(event) => { event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const selectedFile = event.dataTransfer.files[0]; if (selectedFile && !busy && canUpload) void submitFile(selectedFile); }}>
          <FileSpreadsheet size={27} aria-hidden="true" />
          <input id="transfer-file" className="transfer-file-input" type="file" accept=".xls,.xlsx,.csv,.tsv" disabled={busy || !canUpload} onChange={(event: ChangeEvent<HTMLInputElement>) => { const selectedFile = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (selectedFile) void submitFile(selectedFile); }} />
          <label htmlFor="transfer-file" className="transfer-file-button">Choisir un fichier</label>
          <span>.xls, .xlsx, .csv ou .tsv · 2 Mo maximum</span>
          {fileName && <p className="transfer-filename">Fichier : {fileName}</p>}
        </div>
        {jobs.length > 0 && <div className="transfer-jobs"><h3>Mes demandes d'import</h3><ul>{jobs.map((job) => <li key={job.id}>
          <span><strong>{job.fileName}</strong> - {job.status === "PENDING" ? "En attente du traitement" : job.status === "PROCESSING" ? "Analyse en cours" : job.status === "READY" ? "Prêt à vérifier" : job.status === "IMPORTED" ? "Import confirmé" : "Analyse échouée : supprimez la demande, puis redéposez le fichier"}</span>
          {job.status === "READY" && <button type="button" onClick={() => void openJob(job)} disabled={busy}>Voir l'aperçu</button>}
          {["PENDING", "PROCESSING", "READY", "FAILED"].includes(job.status) && <button type="button" onClick={() => void deleteJob(job)} disabled={busy} aria-label={`Supprimer ${job.fileName}`}>Supprimer</button>}
        </li>)}</ul></div>}
        {rows.length > 0 && <><div className="transfer-summary"><strong>{rows.length} ligne{rows.length > 1 ? "s" : ""} détectée{rows.length > 1 ? "s" : ""}</strong><span>{picked.length} sélectionnée{picked.length > 1 ? "s" : ""} · {invalid} à corriger</span>
          <button type="button" onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((_, index) => index)))}>{selected.size === rows.length ? "Tout désélectionner" : "Tout sélectionner"}</button></div>
          {warnings.length > 0 && <ul className="transfer-warnings">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <p className="transfer-hint">Les catégories absentes seront créées. Les vins déjà présents recevront les quantités importées. Le millésime est obligatoire : renseignez une année ou 0000 s'il est inconnu. La date d'achat est facultative ; sans date, le mouvement sera daté du jour de l'import. Les champs signalés doivent être corrigés, ou la ligne désélectionnée. Faites défiler le tableau horizontalement pour voir tous les champs.</p>
          <div className="transfer-table-scroll"><table className="transfer-table"><thead><tr><th scope="col">Importer</th><th scope="col">Source</th>{fields.map((field) => <th scope="col" key={field.key}>{field.label}</th>)}</tr></thead><tbody>
            {rows.map((row, index) => { const errors = importRowErrors(row); return <tr key={`${row.source}-${index}`} className={selected.has(index) && !valid(row) ? "is-invalid" : ""}>
              <td><input type="checkbox" aria-label={`Importer ${row.source}`} checked={selected.has(index)} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} /></td>
              <td>{row.source}{Boolean(row.rawLabel || Object.keys(row.unknownFields ?? {}).length) && <details className="transfer-row-notes"><summary>Données du fichier</summary>{row.rawLabel && <p>Libellé : {row.rawLabel}</p>}{Object.entries(row.unknownFields ?? {}).map(([name, value]) => <p key={name}>{name} : {value}</p>)}</details>}{Boolean(row.warnings?.length) && <details className="transfer-row-notes"><summary>À vérifier</summary>{row.warnings!.map((warning, note) => <p key={note}>{warning}</p>)}</details>}<IdentificationNotes row={row} /></td>{fields.map((field) => <td key={field.key}><input aria-label={`${field.label}, ${row.source}`} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `import-error-${index}-${field.key}` : undefined} type={field.key === "movementDate" ? "date" : "text"} placeholder={field.key === "vintage" ? "Année / 0000" : undefined} style={{ width: field.width }} value={row[field.key]} onChange={(event) => updateRow(index, field.key, event.target.value)} />{errors[field.key] && <small id={`import-error-${index}-${field.key}`} className="transfer-field-error">{errors[field.key]}</small>}</td>)}
            </tr>; })}</tbody></table></div>
          <div className="transfer-actions"><button type="button" className="cellar-pill cellar-pill--save" onClick={importRows} disabled={!activeJobId || !picked.length || Boolean(invalid) || busy || usage?.remaining === 0}><Check size={17} /> {busy ? "Import en cours…" : `Confirmer ${picked.length} vin${picked.length > 1 ? "s" : ""}`}</button></div></>}
      </> : <div className="transfer-actions"><button type="button" className="cellar-pill cellar-pill--save" onClick={exportData} disabled={busy || usage?.remaining === 0}><Download size={17} /> {busy ? "Préparation…" : "Télécharger le fichier Excel"}</button></div>}
      {error && <p className="cellar-form-error" role="alert">{error}</p>}
    </section>
  </div>;
}
