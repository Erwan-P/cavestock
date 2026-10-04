"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Trash2, X } from "lucide-react";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type Props = { firstName: string; lastName: string; email: string; onClose: () => void; onUpdated: (firstName: string, lastName: string) => void };

export function ProfileModal({ firstName, lastName, email, onClose, onUpdated }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(lastName);
  const [nextEmail, setNextEmail] = useState(email);
  const [changePassword, setChangePassword] = useState("");
  const [notice, setNotice] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  useDialogFocus(true, dialogRef, () => { if (!busy) onClose(); });

  useEffect(() => {
    let active = true;
    void fetch("/api/profile", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json();
      if (active) { setPendingEmail(result.pendingEmail ?? null); setRetryAfterSeconds(result.retryAfterSeconds ?? 0); }
    }).catch(() => { /* Le serveur vérifiera l'état lors de l'envoi. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setRetryAfterSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ firstName: first, lastName: last, email: nextEmail, password: changePassword }) });
      const result = await response.json();
      if (result.pendingEmail) setPendingEmail(result.pendingEmail);
      if (typeof result.retryAfterSeconds === "number") setRetryAfterSeconds(result.retryAfterSeconds);
      if (!response.ok) throw new Error(result.error ?? "Impossible de modifier le profil.");
      onUpdated(result.profile.firstName, result.profile.lastName);
      if (result.pendingEmail) { setNotice(result.message); setChangePassword(""); }
      else onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Modification impossible."); }
    finally { setBusy(false); }
  }

  async function resendVerification() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/profile/verification", { method: "POST" });
      const result = await response.json();
      if (typeof result.retryAfterSeconds === "number") setRetryAfterSeconds(result.retryAfterSeconds);
      if (!response.ok) throw new Error(result.error ?? "Renvoi impossible.");
      setPendingEmail(result.pendingEmail);
      setNotice(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Renvoi impossible."); }
    finally { setBusy(false); }
  }

  async function cancelVerification() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/profile/verification", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Annulation impossible.");
      setPendingEmail(null); setNextEmail(email); setChangePassword("");
      setNotice(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Annulation impossible."); }
    finally { setBusy(false); }
  }

  async function removeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (confirmation !== "SUPPRIMER") return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/profile", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, confirmation }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Suppression impossible.");
      window.location.assign("/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Suppression impossible."); setBusy(false); }
  }

  return <div className="cellar-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className="cellar-dialog cellar-dialog--small profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <button type="button" className="cellar-dialog__close" aria-label="Fermer" onClick={onClose} disabled={busy}><X size={26} /></button>
      <h2 id="profile-title">Mon profil</h2>
      <form className="profile-form" onSubmit={save}><label>Prénom<input value={first} onChange={(event) => setFirst(event.target.value)} minLength={1} maxLength={100} required /></label>
        <label>Nom<input value={last} onChange={(event) => setLast(event.target.value)} minLength={1} maxLength={100} required /></label>
        <label>Adresse e-mail<input type="email" value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} maxLength={191} required /></label>
        {pendingEmail && <div className="profile-email-pending"><p>Validation en attente pour <strong>{pendingEmail}</strong>.</p>
          <div className="profile-email-pending__actions"><button type="button" onClick={() => void resendVerification()} disabled={busy || retryAfterSeconds > 0}>Renvoyer le lien{retryAfterSeconds > 0 ? ` (${retryAfterSeconds} s)` : ""}</button>
            <button type="button" onClick={() => void cancelVerification()} disabled={busy}>Annuler la demande</button></div></div>}
        {nextEmail.trim().toLowerCase() !== email && <p className="profile-form__hint">La nouvelle adresse sera utilisée après validation du lien reçu par e-mail.</p>}
        {nextEmail.trim().toLowerCase() !== email && <label>Mot de passe actuel pour changer d’adresse e-mail<input type="password" value={changePassword} onChange={(event) => setChangePassword(event.target.value)} autoComplete="current-password" required /></label>}
        <button className="cellar-pill cellar-pill--save" type="submit" disabled={busy}><Check size={17} /> Enregistrer</button></form>
      {notice && <p className="profile-notice" role="status">{notice}</p>}
      <div className="profile-danger"><h3>Supprimer mon compte</h3><p>Cette action est irréversible : votre compte, tous vos vins, catégories et mouvements seront supprimés de la base de données.</p>
        {!confirming ? <button type="button" className="profile-danger__open" onClick={() => { setConfirming(true); setError(""); }}><Trash2 size={17} /> Supprimer mon compte</button>
          : <form onSubmit={removeAccount}><p>Pour confirmer, saisissez <strong>SUPPRIMER</strong> puis votre mot de passe.</p>
            <label>Confirmation<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" required /></label>
            <label>Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
            <div className="profile-danger__actions"><button type="button" onClick={() => { setConfirming(false); setPassword(""); setConfirmation(""); }}>Annuler</button>
              <button type="submit" className="profile-danger__delete" disabled={busy || confirmation !== "SUPPRIMER" || !password}>{busy ? "Suppression…" : "Supprimer définitivement"}</button></div></form>}</div>
      {error && <p className="cellar-form-error" role="alert">{error}</p>}
    </section>
  </div>;
}
