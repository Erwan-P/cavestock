"use client";

import { useRef, useState, type FormEvent } from "react";
import { Send, X } from "lucide-react";
import { useDialogFocus } from "@/lib/use-dialog-focus";

type Props = { firstName: string; lastName: string; email: string; onClose: () => void };

export function ContactModal({ firstName, lastName, email, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  useDialogFocus(true, dialogRef, () => { if (!busy) onClose(); });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/contact", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Envoi impossible.");
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Envoi impossible.");
    } finally { setBusy(false); }
  }

  return <div className="cellar-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={dialogRef} tabIndex={-1} className="cellar-dialog cellar-dialog--small contact-dialog" role="dialog" aria-modal="true" aria-labelledby="contact-title">
      <button type="button" className="cellar-dialog__close" aria-label="Fermer" onClick={onClose} disabled={busy}><X size={26} /></button>
      <h2 id="contact-title">Contact / Proposer une fonctionnalité</h2>
      {sent ? <div className="contact-success" role="status"><p>Votre message a été envoyé.</p><button type="button" className="cellar-pill cellar-pill--save" onClick={onClose}>Fermer</button></div>
        : <form className="contact-form" onSubmit={(event) => void submit(event)}>
          <div className="contact-form__names">
            <label>Prénom<input value={firstName} disabled readOnly /></label>
            <label>Nom<input value={lastName} disabled readOnly /></label>
          </div>
          <label>Adresse e-mail<input type="email" value={email} disabled readOnly /></label>
          <p>Pour modifier ces informations, utilisez la rubrique Profil.</p>
          <label>Votre message<textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={5000} rows={7} placeholder="Écrivez votre message ou votre idée…" required /></label>
          {error && <p className="cellar-form-error" role="alert">{error}</p>}
          <button type="submit" className="cellar-pill cellar-pill--save" disabled={busy}><Send size={17} /> {busy ? "Envoi…" : "Envoyer"}</button>
        </form>}
    </section>
  </div>;
}
