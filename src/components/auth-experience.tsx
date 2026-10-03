"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AuthStory } from "@/components/auth-story";
import { LoginForm } from "@/components/login-form";
import { RegisterForm } from "@/components/register-form";

type Mode = "login" | "register";

export function AuthExperience({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [height, setHeight] = useState<number | null>(null);
  const loginFace = useRef<HTMLDivElement>(null);
  const registerFace = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const face = mode === "login" ? loginFace.current : registerFace.current;
    if (!face) return;
    const measure = () => setHeight(face.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(face);
    return () => observer.disconnect();
  }, [mode]);

  useEffect(() => {
    const syncFromHistory = () => setMode(new URLSearchParams(window.location.search).get("mode") === "inscription" ? "register" : "login");
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    window.history.pushState(null, "", next === "register" ? "/connexion?mode=inscription" : "/connexion");
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  return (
    <main className="auth-main container">
      <div className="auth-story-stage" aria-live="polite">
        <div className={`auth-story-stage__panel${mode === "login" ? " is-active" : ""}`} aria-hidden={mode !== "login"}>
          <AuthStory isLogin />
        </div>
        <div className={`auth-story-stage__panel${mode === "register" ? " is-active" : ""}`} aria-hidden={mode !== "register"}>
          <AuthStory />
        </div>
      </div>
      <div className="auth-flip" data-mode={mode} style={height === null ? undefined : { height }}>
        <div className="auth-flip__card">
          <div className="auth-flip__face auth-flip__face--login" ref={loginFace} aria-hidden={mode !== "login"} inert={mode !== "login"}>
            <LoginForm onSwitch={() => switchMode("register")} />
          </div>
          <div className="auth-flip__face auth-flip__face--register" ref={registerFace} aria-hidden={mode !== "register"} inert={mode !== "register"}>
            <RegisterForm active={mode === "register"} onSwitch={() => switchMode("login")} />
          </div>
        </div>
      </div>
    </main>
  );
}
