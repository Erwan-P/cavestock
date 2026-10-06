import { ResetPasswordForm } from "@/components/password-forms";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Nouveau mot de passe - CaveStock", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return <div className="auth-shell"><SiteHeader showLogin={false} /><ResetPasswordForm /><SiteFooter /></div>;
}
