import { redirect } from "next/navigation";

export default async function RegistrationPage() {
  redirect("/connexion?mode=inscription");
}
