import { VerificationResult } from "@/components/verification-result";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = { title: "Valider mon adresse - CaveStock", robots: { index: false, follow: false } };

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <div className="auth-shell"><SiteHeader showLogin={false} /><VerificationResult token={typeof token === "string" ? token : ""} /><SiteFooter /></div>;
}
