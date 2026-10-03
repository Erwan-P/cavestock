import { redirect } from "next/navigation";
import { CellarApp } from "@/components/cellar-app";
import { getCurrentUser } from "@/lib/auth";
import { getCellarData } from "@/lib/cellar";
import "./cellar.css";
import "./menu-features.css";

export const metadata = { title: "Ma cave — CaveStock" };

export default async function SpacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");

  const data = await getCellarData(user.id);
  return <CellarApp firstName={user.firstName} lastName={user.lastName} email={user.email} initialData={data} />;
}
