"use client";

import { Search } from "lucide-react";
import type { CellarData } from "@/lib/cellar-types";
import { formatVintage } from "@/lib/wine-vintage";

const formatDate = (value: string) => new Date(value).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", year: "numeric" });
const formatTime = (value: string) => new Date(value).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

export function GlobalHistory({ data, query, onClear }: { data: CellarData; query: string; onClear: () => void }) {
  const terms = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const activeRecords = data.wines.flatMap((wine) => wine.movements.map((movement) => ({
    ...movement, wine, date: movement.movementDate ?? movement.createdAt,
    category: data.categories.find((category) => category.id === wine.categoryId)?.name ?? "Catégorie supprimée",
    deleted: false,
  })));
  const archivedRecords = data.archivedMovements.map((movement) => ({
    ...movement, wine: movement, date: movement.movementDate ?? movement.createdAt,
    category: movement.categoryName, deleted: true,
  }));
  const records = [...activeRecords, ...archivedRecords].sort((a, b) => {
    const aDate = a.movementDate ? `${a.movementDate}T12:00:00.000Z` : a.createdAt;
    const bDate = b.movementDate ? `${b.movementDate}T12:00:00.000Z` : b.createdAt;
    return bDate.localeCompare(aDate) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
  });
  const filtered = terms ? records.filter((record) => [formatDate(record.date), record.category, record.wine.region,
    record.wine.appellation, record.wine.domaine, formatVintage(record.wine.vintage), record.wine.cuvee, record.kind === "ENTRY" ? "entrée" : "sortie", record.quantity, record.deleted ? "vin supprimé" : ""]
    .join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").includes(terms)) : records;
  const days = Array.from(new Set(filtered.map((record) => formatDate(record.date))));

  return <section className="global-history" aria-labelledby="global-history-title"><h1 id="global-history-title">Historique des entrées et sorties</h1>
    <p className="global-history__subtitle">Tous les mouvements de votre cave, classés du plus récent au plus ancien.</p>
    {days.length ? days.map((day) => <div className="global-history__day" key={day}><h2>{day}</h2><div className="global-history__rows">
      {filtered.filter((record) => formatDate(record.date) === day).map((record) => <article className="global-history__row" key={record.id}>
        <time dateTime={record.date}>{record.movementDate ? "Date renseignée" : formatTime(record.createdAt)}</time><span className="global-history__category">{record.category}</span>
        <span className="global-history__wine">{[record.wine.region, record.wine.appellation, record.wine.domaine, formatVintage(record.wine.vintage), record.wine.cuvee].filter(Boolean).join(" · ")}{record.deleted && <small className="global-history__deleted">Vin supprimé</small>}</span>
        <strong className={record.kind === "ENTRY" ? "is-entry" : "is-exit"}>{record.kind === "ENTRY" ? "+" : "−"}{record.quantity} {record.quantity > 1 ? "bouteilles" : "bouteille"}<small>{record.kind === "ENTRY" ? "Entrée" : "Sortie"}</small></strong>
      </article>)}</div></div>) : <div className="global-history__empty"><Search size={24} /><p>{terms ? `Aucun mouvement ne correspond à « ${query} ».` : "Aucun mouvement enregistré pour le moment."}</p>
      {terms && <button type="button" onClick={onClear}>Effacer la recherche</button>}</div>}
  </section>;
}
