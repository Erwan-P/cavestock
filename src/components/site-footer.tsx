import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <Link href="/" className="brand brand--footer">CaveStock<span className="brand__dot">.</span></Link>
        <p>Votre cave, tout simplement.</p>
        <nav className="site-footer__links" aria-label="Informations légales">
          <Link href="/legal#mentions-legales">Mentions légales</Link>
          <Link href="/legal#confidentialite">Confidentialité</Link>
          <Link href="/legal#cookies">Cookies</Link>
          <Link href="/legal#conditions">Conditions d’utilisation</Link>
        </nav>
        <span>© {new Date().getFullYear()} CaveStock</span>
      </div>
    </footer>
  );
}
