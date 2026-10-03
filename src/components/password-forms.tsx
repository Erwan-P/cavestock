"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export function ForgotPasswordForm({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "L'envoi a échoué.");
      setMessage(body.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "L'envoi a échoué."); }
    finally { setBusy(false); }
  }
  return <div className="auth-card">
    <div className="auth-card__heading"><h2>Mot de passe oublié</h2><p>Recevez un lien par e-mail pour choisir un nouveau mot de passe.</p></div>
    {message ? <p className="auth-form__success" role="status">{message}</p> : <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <div className="field"><label htmlFor="forgot-email">Adresse e-mail</label><input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={191} placeholder="vous@exemple.fr" required /></div>
      {error && <p className="auth-form__error" role="alert">{error}</p>}
      <button className="button button--primary" disabled={busy} type="submit">{busy ? "Envoi…" : "Recevoir le lien"}<ArrowRight size={18} /></button>
    </form>}
    <p className="auth-card__switch"><button type="button" disabled={busy} onClick={onBack}><ArrowLeft size={14} /> Retour à la connexion</button></p>
  </div>;
}

export function ResetPasswordForm() {
  const initialized = useRef(false);
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = window.location.hash.slice(1);
    setToken(/^[A-Za-z0-9_-]{43}$/.test(value) ? value : "");
    window.history.replaceState(null, "", window.location.pathname);
    setReady(true);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Le changement a échoué.");
      setMessage(body.message); setPassword(""); setToken("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Le changement a échoué."); }
    finally { setBusy(false); }
  }
  return <main className="verification-main container"><section className="auth-card password-card">
    <h1>{message ? "Mot de passe modifié" : "Nouveau mot de passe"}</h1>
    {!ready ? <p>Chargement…</p> : message ? <><p role="status">{message}</p><Link className="button button--primary" href="/connexion">Se connecter<ArrowRight size={18} /></Link></> :
      !token ? <><p role="alert">Ce lien est incomplet. Demandez un nouveau lien depuis « Mot de passe oublié ».</p><Link className="button button--primary" href="/connexion">Aller à la connexion</Link></> :
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <div className="field"><label htmlFor="new-password">Nouveau mot de passe</label><input id="new-password" type="password" autoComplete="new-password" minLength={10} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="10 caractères minimum" required /></div>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        <button className="button button--primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Changer mon mot de passe"}<ArrowRight size={18} /></button>
        <Link className="auth-form__back" href="/connexion">Retour à la connexion</Link>
      </form>}
  </section></main>;
}
