"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Check, ChevronDown, Download, FileClock, House, LogOut, Mail, Minus, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, UserRound, Wine, X } from "lucide-react";
import { GlobalHistory } from "@/components/global-history";
import { ContactModal } from "@/components/contact-modal";
import { ProfileModal } from "@/components/profile-modal";
import { SiteFooter } from "@/components/site-footer";
import { TransferModal } from "@/components/transfer-modal";
import type { CellarCategory, CellarData, CellarWine } from "@/lib/cellar-types";
import { useDialogFocus } from "@/lib/use-dialog-focus";
import { formatVintage } from "@/lib/wine-vintage";

type WineDraft = {
  categoryId: string; region: string; appellation: string; domaine: string; vintage: number;
  quantity: number; cuvee: string; purchasePrice: string; movementDate: string; comment: string;
};
type Modal = { type: "add"; categoryId: string } | { type: "edit"; wineId: string } | { type: "category" } | null;
type SortField = "region" | "appellation" | "domaine" | "vintage" | "quantity" | "cuvee" | "purchasePrice";
type Sort = { field: SortField; direction: "asc" | "desc" };
const sortOptions: Array<{ value: SortField; label: string }> = [
  { value: "region", label: "Région" }, { value: "appellation", label: "Appellation" },
  { value: "domaine", label: "Domaine" }, { value: "vintage", label: "Millésime" },
  { value: "quantity", label: "Quantité" }, { value: "cuvee", label: "Cuvée" },
  { value: "purchasePrice", label: "Prix d'achat" },
];
const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function emptyDraft(categoryId: string, year: number): WineDraft {
  return { categoryId, region: "", appellation: "", domaine: "", vintage: year, quantity: 1, cuvee: "", purchasePrice: "", movementDate: "", comment: "" };
}
function draftFromWine(wine: CellarWine): WineDraft {
  return { categoryId: wine.categoryId, region: wine.region, appellation: wine.appellation, domaine: wine.domaine,
    vintage: wine.vintage, quantity: wine.quantity, cuvee: wine.cuvee ?? "", purchasePrice: wine.purchasePrice ?? "", movementDate: "", comment: wine.comment ?? "" };
}
function historyDate(movement: CellarWine["movements"][number]) {
  const date = movement.movementDate ? `${movement.movementDate}T12:00:00.000Z` : movement.createdAt;
  return new Date(date).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" });
}
function matchesSearch(wine: CellarWine, category: CellarCategory, query: string) {
  return [category.name, wine.region, wine.appellation, wine.domaine, formatVintage(wine.vintage), wine.quantity, wine.cuvee, wine.purchasePrice, wine.comment]
    .join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").includes(query);
}
function sortWines(wines: CellarWine[], sort: Sort) {
  return [...wines].sort((a, b) => {
    const av = a[sort.field]; const bv = b[sort.field];
    if (av == null || av === "") return bv == null || bv === "" ? 0 : 1;
    if (bv == null || bv === "") return -1;
    const comparison = ["vintage", "quantity", "purchasePrice"].includes(sort.field) ? Number(av) - Number(bv) : collator.compare(String(av), String(bv));
    return sort.direction === "asc" ? comparison : -comparison;
  });
}
function categoryWineName(category: CellarCategory) {
  if (category.name === "Champagnes") return "un champagne";
  if (category.name === "Vins Blanc") return "un vin blanc";
  if (category.name === "Vins Rouge") return "un vin rouge";
  if (category.name === "Vins Rosé") return "un vin rosé";
  return `dans « ${category.name} »`;
}

export function CellarApp({ firstName, lastName, email, initialData, view = "cellar" }: { firstName: string; lastName: string; email: string; initialData: CellarData; view?: "cellar" | "history" }) {
  const [data, setData] = useState(initialData);
  const [profileName, setProfileName] = useState({ firstName, lastName });
  const [query, setQuery] = useState("");
  const [sorts, setSorts] = useState<Record<string, Sort>>({});
  const [sortOpen, setSortOpen] = useState<string | null>(null);
  const [sortDraft, setSortDraft] = useState<Sort>({ field: "region", direction: "asc" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [featureModal, setFeatureModal] = useState<"import" | "export" | "profile" | "contact" | null>(null);
  const [draft, setDraft] = useState<WineDraft | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lastScroll = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(Boolean(modal) && !confirmDelete, dialogRef);
  useDialogFocus(confirmDelete, deleteDialogRef, () => { if (!busy) setConfirmDelete(false); });
  const activeWine = modal?.type === "edit" ? data.wines.find((wine) => wine.id === modal.wineId) : undefined;

  useEffect(() => {
    if (!sortOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || target.closest(".cellar-sort-wrap")?.getAttribute("data-category-id") !== sortOpen) setSortOpen(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [sortOpen]);
  useEffect(() => {
    function onScroll() {
      const current = window.scrollY;
      if (Math.abs(current - lastScroll.current) > 5) {
        setHeaderHidden(current > 105 && current > lastScroll.current);
        lastScroll.current = current;
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!modal && !featureModal) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [modal, featureModal]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (modal && !busy) closeModal();
      else if (!featureModal) { setMenuOpen(false); setSortOpen(null); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const normalizedQuery = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
  const groups = useMemo(() => data.categories.map((category) => ({
    category,
    wines: sortWines(data.wines.filter((wine) => wine.categoryId === category.id && (!normalizedQuery || matchesSearch(wine, category, normalizedQuery))),
      sorts[category.id] ?? { field: "region", direction: "asc" }),
  })).filter((group) => !normalizedQuery || group.wines.length > 0), [data, normalizedQuery, sorts]);
  function closeModal() {
    setModal(null); setDraft(null); setCategoryName(""); setConfirmDelete(false); setError("");
  }
  function openFeature(kind: "import" | "export" | "profile" | "contact") {
    setMenuOpen(false); setSortOpen(null); setFeatureModal(kind); setHeaderHidden(false);
  }
  function openAdd(categoryId: string) {
    setMenuOpen(false); setSortOpen(null); setDraft(emptyDraft(categoryId, data.stats.year)); setError("");
    setModal({ type: "add", categoryId }); setHeaderHidden(false);
  }
  function openEdit(wine: CellarWine) {
    setMenuOpen(false); setSortOpen(null); setDraft(draftFromWine(wine)); setError("");
    setConfirmDelete(false); setModal({ type: "edit", wineId: wine.id }); setHeaderHidden(false);
  }
  async function submitAction(payload: { action?: string; [key: string]: unknown }, method = "POST", id?: string) {
    const response = await fetch(`/api/cellar${id ? `?id=${encodeURIComponent(id)}` : ""}`, {
      method, credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: method === "DELETE" ? undefined : JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "L'opération a échoué.");
    setData(result.data); closeModal();
  }
  async function saveWine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !modal || busy) return;
    setBusy(true); setError("");
    try {
      await submitAction({ action: modal.type === "edit" ? "update-wine" : "create-wine",
        ...(modal.type === "edit" ? { id: modal.wineId } : {}), wine: { ...draft, purchasePrice: draft.purchasePrice || null, movementDate: draft.movementDate || null } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible d'enregistrer ce vin."); }
    finally { setBusy(false); }
  }
  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try { await submitAction({ action: "create-category", category: { name: categoryName } }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible d'ajouter la catégorie."); }
    finally { setBusy(false); }
  }
  async function deleteWine() {
    if (!activeWine || busy) return;
    setBusy(true); setError("");
    try { await submitAction({}, "DELETE", activeWine.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Impossible de supprimer ce vin."); }
    finally { setBusy(false); }
  }
  function updateDraft<K extends keyof WineDraft>(key: K, value: WineDraft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  const currentYear = data.stats.year;
  return <div className="cellar-shell">
    <header className={`cellar-header${headerHidden && !menuOpen && !modal && !featureModal ? " is-hidden" : ""}`}>
      <div className="cellar-menu-wrap">
        <button type="button" className="cellar-menu-trigger" aria-expanded={menuOpen} aria-controls="cellar-menu" onClick={() => { setMenuOpen(!menuOpen); setSortOpen(null); }}>
          <SlidersHorizontal size={23} strokeWidth={1.8} /><span>CaveStock de {profileName.firstName}</span><ChevronDown className={menuOpen ? "is-rotated" : ""} size={17} />
        </button>
        {menuOpen && <nav className="cellar-menu" id="cellar-menu" aria-label="Menu de la cave">
          <Link href={view === "history" ? "/espace" : "/espace/historique"} onClick={() => setMenuOpen(false)}>{view === "history" ? <House size={17} /> : <FileClock size={17} />} {view === "history" ? "Ma cave" : "Historique des entrées/sorties"}</Link>
          <button type="button" onClick={() => openFeature("import")}><Download size={17} /> Importer des données</button>
          <button type="button" onClick={() => openFeature("export")}><Upload size={17} /> Exporter des données</button>
          <button type="button" onClick={() => openFeature("profile")}><UserRound size={17} /> Profil</button>
          <button type="button" onClick={() => openFeature("contact")}><Mail size={17} /> Contact / Proposer une fonctionnalité</button>
          <form action="/api/auth/logout" method="post"><button type="submit"><LogOut size={17} /> Déconnexion</button></form>
        </nav>}
      </div>
      <div className="cellar-search"><Search size={24} strokeWidth={1.8} aria-hidden="true" />
        <input ref={searchRef} aria-label={view === "history" ? "Rechercher dans l'historique" : "Rechercher dans ma cave"} placeholder={view === "history" ? "Rechercher un mouvement, vin, date, ..." : "Rechercher un vin, domaine, ..."} value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" aria-label="Effacer la recherche" onClick={() => { setQuery(""); searchRef.current?.focus(); }}><X size={19} /></button>}
      </div>
    </header>

    <main className="cellar-main">
      {view === "history" ? <GlobalHistory data={data} query={query} onClear={() => setQuery("")} /> : <>
      {!normalizedQuery && <section className="cellar-stats" aria-labelledby="stats-title">
        <h1 id="stats-title">Statistiques</h1><p className="cellar-stats__period">Entrées et sorties du 1er janvier au 31 décembre {data.stats.year}</p>
        <div className="cellar-stats__grid">
          <div><Wine aria-hidden="true" /><h2>Total de bouteilles</h2><strong>{data.stats.totalBottles.toLocaleString("fr-FR")}</strong></div>
          <div><ArrowDownLeft aria-hidden="true" /><h2>Stock entrant</h2><strong>{data.stats.stockIn.toLocaleString("fr-FR")}</strong></div>
          <div><ArrowUpRight aria-hidden="true" /><h2>Stock sortant</h2><strong>{data.stats.stockOut.toLocaleString("fr-FR")}</strong></div>
          <div><CalendarDays aria-hidden="true" /><h2>Plus ancienne bouteille</h2><strong>{data.stats.oldestVintage ?? "-"}</strong></div>
        </div>
      </section>}

      {groups.length ? groups.map(({ category, wines }) => <section className="cellar-category" key={category.id} aria-label={category.name}>
        <div className="cellar-category__head">
          {!normalizedQuery ? <div className="cellar-sort-wrap" data-category-id={category.id}><button type="button" className="cellar-sort-trigger" aria-expanded={sortOpen === category.id} onClick={() => { const opening = sortOpen !== category.id; if (opening) setSortDraft(sorts[category.id] ?? { field: "region", direction: "asc" }); setSortOpen(opening ? category.id : null); setMenuOpen(false); }}>Trier par</button>
            {sortOpen === category.id && <div className="cellar-sort-menu"><label htmlFor={`sort-field-${category.id}`}>Critère</label>
              <select id={`sort-field-${category.id}`} value={sortDraft.field} onChange={(event) => setSortDraft((current) => ({ ...current, field: event.target.value as SortField }))}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <span className="cellar-sort-menu__label" id={`sort-direction-${category.id}`}>Ordre</span><div className="cellar-sort-directions" role="group" aria-labelledby={`sort-direction-${category.id}`}>
                <button type="button" className="cellar-sort-direction" aria-pressed={sortDraft.direction === "asc"} onClick={() => setSortDraft((current) => ({ ...current, direction: "asc" }))}>Croissant</button>
                <button type="button" className="cellar-sort-direction" aria-pressed={sortDraft.direction === "desc"} onClick={() => setSortDraft((current) => ({ ...current, direction: "desc" }))}>Décroissant</button>
              </div>
              <button type="button" className="cellar-sort-apply" onClick={() => { setSorts((current) => ({ ...current, [category.id]: sortDraft })); setSortOpen(null); }}>Appliquer</button></div>}</div> : <span />}
          <h2>{category.name}</h2><button type="button" className="cellar-pill cellar-pill--add" onClick={() => openAdd(category.id)}><Plus size={20} /> Ajouter</button>
        </div>
        {wines.length ? <div className="cellar-rows">{wines.map((wine) => <div className="cellar-row" key={wine.id}>
          <div className="cellar-row__text"><span>{wine.region}</span><i aria-hidden="true">|</i><span>{wine.appellation}</span><i aria-hidden="true">|</i><span>{wine.domaine}</span><i aria-hidden="true">|</i><span>{formatVintage(wine.vintage)}</span><i aria-hidden="true">|</i><strong>{wine.quantity} {wine.quantity > 1 ? "bouteilles" : "bouteille"}</strong>
            {wine.cuvee && <><i aria-hidden="true">|</i><span>{wine.cuvee}</span></>}{wine.purchasePrice && <><i aria-hidden="true">|</i><span>{Number(wine.purchasePrice).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</span></>}{wine.comment && <><i aria-hidden="true">|</i><span>{wine.comment}</span></>}</div>
          <button type="button" className="cellar-edit" aria-label={`Modifier ${wine.domaine}, ${wine.appellation} ${formatVintage(wine.vintage)}`} onClick={() => openEdit(wine)}><Pencil size={18} /></button>
        </div>)}</div> : <p className="cellar-category__empty">Aucun vin dans cette catégorie pour le moment.</p>}
      </section>) : <div className="cellar-no-results"><Search size={25} /><p>Aucun vin ne correspond à « {query} ».</p><button type="button" onClick={() => setQuery("")}>Effacer la recherche</button></div>}
      {!normalizedQuery && <button type="button" className="cellar-add-category" onClick={() => { setError(""); setCategoryName(""); setModal({ type: "category" }); setHeaderHidden(false); }}><Plus size={20} /> Ajouter une catégorie</button>}
      </>}
    </main>
    <SiteFooter />

    {(featureModal === "import" || featureModal === "export") && <TransferModal mode={featureModal} onClose={() => setFeatureModal(null)} onImported={(nextData) => { setData(nextData); setFeatureModal(null); }} />}
    {featureModal === "profile" && <ProfileModal firstName={profileName.firstName} lastName={profileName.lastName} email={email} onClose={() => setFeatureModal(null)} onUpdated={(nextFirst, nextLast) => setProfileName({ firstName: nextFirst, lastName: nextLast })} />}
    {featureModal === "contact" && <ContactModal firstName={profileName.firstName} lastName={profileName.lastName} email={email} onClose={() => setFeatureModal(null)} />}

    {modal && <div className="cellar-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { if (confirmDelete) setConfirmDelete(false); else closeModal(); } }}><div ref={dialogRef} tabIndex={-1} className={`cellar-dialog${modal.type === "category" ? " cellar-dialog--small" : ""}`} role="dialog" aria-modal={!confirmDelete} aria-hidden={confirmDelete} inert={confirmDelete} aria-labelledby="cellar-dialog-title">
      <button type="button" className="cellar-dialog__close" aria-label="Fermer" onClick={closeModal} disabled={busy}><X size={28} /></button>
      {modal.type === "category" ? <><h2 id="cellar-dialog-title">Ajouter une catégorie</h2><form onSubmit={saveCategory} className="cellar-category-form"><label htmlFor="category-name">Nom de la catégorie</label><input id="category-name" autoFocus required minLength={2} maxLength={100} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Ex. Vins doux" />{error && <p className="cellar-form-error" role="alert">{error}</p>}<button className="cellar-pill cellar-pill--save" disabled={busy} type="submit"><Plus size={18} /> {busy ? "Ajout..." : "Ajouter"}</button></form></> : draft && <>
        <h2 id="cellar-dialog-title">{modal.type === "add" ? `Ajouter ${categoryWineName(data.categories.find((category) => category.id === draft.categoryId) ?? data.categories[0])}` : `Modifier ${activeWine?.domaine ?? "ce vin"}`}</h2>
        <div className="cellar-dialog__content"><form id="cellar-wine-form" className="cellar-wine-form" onSubmit={saveWine}>
          <label><span>Région</span><input autoFocus required maxLength={150} placeholder="Région..." value={draft.region} onChange={(event) => updateDraft("region", event.target.value)} /></label>
          <label><span>Appellation</span><input required maxLength={150} placeholder="Appellation..." value={draft.appellation} onChange={(event) => updateDraft("appellation", event.target.value)} /></label>
          <label><span>Domaine</span><input required maxLength={150} placeholder="Domaine..." value={draft.domaine} onChange={(event) => updateDraft("domaine", event.target.value)} /></label>
          <div className="cellar-wine-form__inline"><label>Millésime<select value={draft.vintage} onChange={(event) => updateDraft("vintage", Number(event.target.value))}><option value={0}>0000 - Inconnu</option>{Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            {modal.type === "edit" && <label>Catégorie<select value={draft.categoryId} onChange={(event) => updateDraft("categoryId", event.target.value)}>{data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}</div>
          <div className="cellar-quantity"><span>Quantité</span><div><button type="button" aria-label="Diminuer la quantité" disabled={draft.quantity <= (modal.type === "add" ? 1 : 0)} onClick={() => updateDraft("quantity", Math.max(modal.type === "add" ? 1 : 0, draft.quantity - 1))}><Minus size={17} /></button><input aria-label="Quantité" type="number" min={modal.type === "add" ? 1 : 0} max={999999} step={1} required value={draft.quantity} onChange={(event) => updateDraft("quantity", event.target.value === "" ? 0 : Number(event.target.value))} /><button type="button" aria-label="Augmenter la quantité" disabled={draft.quantity >= 999999} onClick={() => updateDraft("quantity", Math.min(999999, draft.quantity + 1))}><Plus size={17} /></button></div></div>
          <label><span>Cuvée (optionnel)</span><input maxLength={150} placeholder="Cuvée (optionnel)..." value={draft.cuvee} onChange={(event) => updateDraft("cuvee", event.target.value)} /></label>
          <label><span>Prix d'achat par bouteille (optionnel, €)</span><input type="number" min="0" max="99999999.99" step="0.01" placeholder="Prix par bouteille (optionnel, €)..." value={draft.purchasePrice} onChange={(event) => updateDraft("purchasePrice", event.target.value)} /></label>
          <label className="cellar-date-field"><span>Date d'achat / du mouvement (optionnelle)</span><input className={!draft.movementDate ? "is-empty" : undefined} type="date" min="1900-01-01" max={new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())} value={draft.movementDate} onChange={(event) => updateDraft("movementDate", event.target.value)} /><small>{modal.type === "edit" ? "Si la quantité change, date du nouveau mouvement. Sinon, corrige la date de la dernière entrée. Sans date, la modification est datée d'aujourd'hui." : "Si elle est vide, la date d'ajout sera retenue."}</small></label>
          <label><span>Commentaire (optionnel)</span><textarea maxLength={2000} rows={2} placeholder="Commentaire (optionnel)..." value={draft.comment} onChange={(event) => updateDraft("comment", event.target.value)} /></label>
        </form>
        {modal.type === "edit" && <aside className="cellar-history"><h3>Historique</h3><div className="cellar-history__list">{activeWine?.movements.length ? activeWine.movements.map((movement) => <p key={movement.id}><time dateTime={movement.movementDate ?? movement.createdAt}>{historyDate(movement)}</time> - {movement.kind === "ENTRY" ? "Entrée" : "Sortie"} - {movement.quantity} {movement.quantity > 1 ? "bouteilles" : "bouteille"}</p>) : <p>Aucun mouvement enregistré.</p>}</div></aside>}</div>
        {error && <p className="cellar-form-error" role="alert">{error}</p>}
        <div className="cellar-dialog__actions">{modal.type === "edit" && <button type="button" className="cellar-pill cellar-pill--delete" onClick={() => { setError(""); setConfirmDelete(true); }} disabled={busy}><Trash2 size={17} /> Supprimer</button>}<button type="submit" form="cellar-wine-form" className="cellar-pill cellar-pill--save" disabled={busy}><Check size={18} /> {busy ? "Enregistrement..." : modal.type === "edit" ? "Modifier" : "Ajouter"}</button></div>
      </>}
    </div>{confirmDelete && <div className="cellar-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setConfirmDelete(false); }}><div ref={deleteDialogRef} tabIndex={-1} className="cellar-delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="cellar-delete-title" aria-describedby="cellar-delete-description"><h2 id="cellar-delete-title">Supprimer ce vin ?</h2><p id="cellar-delete-description">Le vin disparaîtra de votre cave. Ses entrées et sorties resteront visibles dans l’historique global. Pour seulement vider le stock, mettez sa quantité à 0.</p>{error && <p className="cellar-form-error" role="alert">{error}</p>}<div className="cellar-delete-confirm__actions"><button type="button" onClick={() => { setConfirmDelete(false); setError(""); }} disabled={busy}>Annuler</button><button type="button" className="cellar-delete-confirm__confirm" onClick={deleteWine} disabled={busy}>{busy ? "Suppression..." : "Oui, supprimer"}</button></div></div></div>}</div>}
  </div>;
}
