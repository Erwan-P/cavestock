import { LoginLinkMark } from "./loading-mark";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SiteHeader({ variant = "public", showLogin = true }: { variant?: "public" | "private"; showLogin?: boolean }) {
  return (
    <header className={`site-header site-header--${variant}`}>
      <div className={`site-header__inner${variant === "private" ? " container" : ""}`}>
        <Link className="brand" href="/" aria-label="CaveStock, accueil">
          <span className="brand__mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>CaveStock</span>
        </Link>
        {(variant === "private" || showLogin) && (
          <div className="site-header__actions">
            {variant === "public" ? (
              <Link className="public-login" href="/connexion">Connexion <LoginLinkMark /></Link>
            ) : (
              <><Link className="header-login" href="/connexion">Se connecter</Link><Link className="button button--small button--light" href="/inscription">Créer mon compte <ArrowUpRight size={16} strokeWidth={1.8} /></Link></>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
