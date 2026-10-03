"use client";

import { FormEvent, useState } from "react";
import { ArrowRight } from "lucide-react";
import { ForgotPasswordForm } from "@/components/password-forms";

export function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNeedsVerification(false);
    setResendMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (body.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true);
        throw new Error(typeof body.error === "string" ? body.error : "Connexion impossible.");
      }
      window.location.assign("/espace");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connexion impossible.");
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true); setError(""); setResendMessage("");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Envoi impossible.");
      setResendMessage(body.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Envoi impossible.");
    } finally { setBusy(false); }
  }

  if (forgotPassword) return <ForgotPasswordForm initialEmail={email} onBack={() => setForgotPassword(false)} />;

  return (
    <div className="auth-card">
      <div className="auth-card__heading"><h2>Se connecter</h2><p>Retrouvez votre espace personnel et votre collection.</p></div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <div className="field"><label htmlFor="login-email">Adresse e-mail</label><input id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setNeedsVerification(false); }} placeholder="vous@exemple.fr" required /></div>
        <div className="field"><label htmlFor="login-password">Mot de passe</label><input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setNeedsVerification(false); }} placeholder="Votre mot de passe" required /></div>
        <button className="auth-form__back auth-form__forgot" type="button" disabled={busy} onClick={() => setForgotPassword(true)}>Mot de passe oublié ?</button>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        {resendMessage && <p className="auth-form__success" role="status">{resendMessage}</p>}
        {needsVerification && <button className="auth-form__resend" type="button" disabled={busy} onClick={() => void resend()}>Renvoyer le lien de validation</button>}
        <button className="button button--primary" type="submit" disabled={busy}>{busy ? "Connexion…" : "Accéder à ma cave"}<ArrowRight size={18} /></button>
      </form>
      <p className="auth-card__switch">Pas encore de compte ? <button type="button" onClick={onSwitch} disabled={busy}>Créer mon compte</button></p>
    </div>
  );
}
