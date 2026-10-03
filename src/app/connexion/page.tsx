import { redirect } from "next/navigation";
import { AuthExperience } from "@/components/auth-experience";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Connexion ou inscription — CaveStock" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  if (await getCurrentUser()) redirect("/espace");
  const { mode } = await searchParams;
  return <div className="auth-shell"><SiteHeader showLogin={false} /><AuthExperience initialMode={mode === "inscription" ? "register" : "login"} /><SiteFooter /></div>;
}
