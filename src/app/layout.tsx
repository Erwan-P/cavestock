import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaveStock — Votre cave, enfin organisée",
  description:
    "Fini les tableaux Excel pour suivre votre cave. Retrouvez vos vins, vos quantités et l'historique de chaque vin au même endroit.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
