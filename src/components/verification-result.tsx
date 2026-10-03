"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export function VerificationResult({ token }: { token: string }) {
  const started = useRef(false);
  const [state, setState] = useState<{ status: "loading" | "success" | "error"; message: string }>({ status: "loading", message: "Validation en cours…" });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ status: "error", message: "Le lien de validation est incomplet." });
      return;
    }
    void (async () => {
      try {
        const response = await fetch("/api/auth/verify", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }),
        });
        const body = await response.json();
        setState({ status: response.ok ? "success" : "error", message: response.ok ? body.message : body.error ?? "Validation impossible." });
        if (response.ok) window.history.replaceState(null, "", "/verification");
      } catch {
        setState({ status: "error", message: "La validation a échoué. Réessayez dans un instant." });
      }
    })();
  }, [token]);

  return <main className="verification-main container"><section className="auth-card" aria-live="polite">
    <h1>{state.status === "success" ? "Adresse validée" : state.status === "error" ? "Validation impossible" : "Validation de votre adresse"}</h1>
    <p>{state.message}</p>
    {state.status !== "loading" && <Link className="button button--primary" href="/connexion">Aller à la connexion</Link>}
  </section></main>;
}
