"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, RotateCw } from "lucide-react";

type Registration = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  captchaAnswer: string;
};

const initialForm: Registration = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  captchaAnswer: "",
};

async function responseMessage(response: Response) {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : "Une erreur s'est produite. Réessayez.";
}

export function RegisterForm({ active, onSwitch }: { active: boolean; onSwitch: () => void }) {
  const [form, setForm] = useState<Registration>(initialForm);
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(field: keyof Registration, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function refreshCaptcha() {
    setCaptchaVersion((version) => version + 1);
    update("captchaAnswer", "");
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setSuccess(true);
      setBusy(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "L'inscription a échoué.");
      refreshCaptcha();
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <div className="auth-card__heading"><h2>{success ? "Vérifiez votre adresse" : "Créer mon compte"}</h2></div>
      {success ? <div className="auth-confirmation" role="status">
        <p>Un lien de validation a été envoyé à <strong>{form.email}</strong>.</p>
        <p>Cliquez sur ce lien pour activer votre compte, puis connectez-vous à votre cave.</p>
        <button className="button button--primary" type="button" onClick={onSwitch}>Aller à la connexion <ArrowRight size={18} /></button>
      </div> : <>
      <form className="auth-form" onSubmit={(event) => void register(event)}>
        <div className="auth-form__row">
          <div className="field"><label htmlFor="first-name">Prénom</label><input id="first-name" name="given-name" autoComplete="given-name" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} placeholder="Votre prénom" maxLength={100} required /></div>
          <div className="field"><label htmlFor="last-name">Nom</label><input id="last-name" name="family-name" autoComplete="family-name" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} placeholder="Votre nom" maxLength={100} required /></div>
        </div>
        <div className="field"><label htmlFor="register-email">Adresse e-mail</label><input id="register-email" type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="vous@exemple.fr" maxLength={191} pattern="[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)+" title="Saisissez une adresse du type nom@domaine.fr" required /></div>
        <div className="field"><label htmlFor="register-password">Mot de passe</label><input id="register-password" type="password" autoComplete="new-password" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="10 caractères minimum" minLength={10} maxLength={72} required /></div>
        <div className="captcha-field">
          <label htmlFor="captcha-answer">Recopiez les caractères de l&apos;image</label>
          <div className="captcha-field__challenge">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {active && <img src={`/api/auth/captcha?v=${captchaVersion}`} width="230" height="70" alt="Code CAPTCHA à recopier" />}
            <button type="button" onClick={refreshCaptcha} aria-label="Afficher un autre CAPTCHA" title="Changer l'image"><RotateCw size={20} /></button>
          </div>
          <input id="captcha-answer" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={form.captchaAnswer} onChange={(event) => update("captchaAnswer", event.target.value.toUpperCase().slice(0, 5))} maxLength={5} placeholder="5 caractères" required />
        </div>
        {error && <p className="auth-form__error" role="alert">{error}</p>}
        <p className="auth-form__privacy">Vos données servent à créer votre compte. <Link href="/legal#confidentialite">Confidentialité</Link></p>
        <button className="button button--primary" type="submit" disabled={busy}>{busy ? "Création du compte…" : "Créer mon compte"}<ArrowRight size={18} /></button>
      </form>
      <p className="auth-card__switch">Déjà un compte ? <button type="button" onClick={onSwitch} disabled={busy}>Se connecter</button></p>
      </>}
    </div>
  );
}
