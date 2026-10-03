import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BottleWine,
  ChartNoAxesCombined,
  Clock3,
  FileUp,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wine,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const dynamic = "force-dynamic";

const features = [
  {
    number: "01",
    icon: <BottleWine size={25} strokeWidth={1.5} />,
    title: "Chaque bouteille à sa place",
    description:
      "Rouges, blancs, champagnes et vos propres catégories : retrouvez toute votre collection dans une vue claire.",
  },
  {
    number: "02",
    icon: <ChartNoAxesCombined size={25} strokeWidth={1.5} />,
    title: "Un stock toujours juste",
    description:
      "Enregistrez vos entrées et vos sorties. Vos quantités évoluent avec vous, sans calcul à refaire.",
  },
  {
    number: "03",
    icon: <Search size={25} strokeWidth={1.5} />,
    title: "Le bon vin, en un instant",
    description:
      "Recherchez un domaine, une appellation ou un millésime et retrouvez le parcours de chaque vin.",
  },
  {
    number: "04",
    icon: <FileUp size={25} strokeWidth={1.5} />,
    title: "Votre ancienne cave, sans repartir de zéro",
    description:
      "Importez votre fichier Excel ou CSV, vérifiez l’aperçu puis retrouvez vos bouteilles dans CaveStock.",
  },
];

export default function Home() {
  return (
    <>
      <div className="landing-shell">
        <SiteHeader />
        <main>
          <section className="hero container" aria-labelledby="hero-title">
            <div className="hero__copy">
              <h1 id="hero-title">Votre cave.<br /><em>Enfin organisée.</em></h1>
              <p className="hero__lead">
                Fini les tableaux Excel et les bouteilles qu&apos;on oublie.
                Gardez vos vins, vos quantités et leur histoire au même endroit.
              </p>
              <div className="hero__actions">
                <Link className="button button--primary" href="/connexion?mode=inscription">
                  Commencer ma cave <ArrowUpRight size={19} strokeWidth={1.8} />
                </Link>
                <a className="text-link" href="#fonctionnalites">Découvrir le service <ArrowRight size={18} /></a>
              </div>
            </div>

            <div className="hero__visual" aria-label="Aperçu de la gestion de cave CaveStock">
              <div className="hero__halo" />
              <div className="preview-card">
                <div className="preview-card__header">
                  <div className="preview-card__brand"><span className="preview-card__brand-icon"><Wine size={16} /></span> Ma cave</div>
                  <span className="preview-card__dots"><i /><i /><i /></span>
                </div>
                <div className="preview-card__intro"><span>Bonjour, Alex</span><span className="preview-card__date">Votre collection en un regard</span></div>
                <div className="preview-card__stats">
                  <div><span>Bouteilles en cave</span><strong>128</strong><small>Une belle collection</small></div>
                  <div><span>Entrées cette année</span><strong>24 <ArrowDownRight size={19} /></strong><small>À découvrir bientôt</small></div>
                </div>
                <div className="preview-card__section-heading"><strong>Mes vins</strong><span><SlidersHorizontal size={13} /> Trier</span></div>
                <div className="preview-card__row"><span className="preview-card__wine-icon preview-card__wine-icon--red"><Wine size={17} /></span><span><strong>Côtes du Rhône</strong><small>Domaine des Roches · 2021</small></span><b>6</b></div>
                <div className="preview-card__row"><span className="preview-card__wine-icon preview-card__wine-icon--gold"><Wine size={17} /></span><span><strong>Chablis</strong><small>Domaine de la Côte · 2022</small></span><b>12</b></div>
                <div className="preview-card__row"><span className="preview-card__wine-icon preview-card__wine-icon--rose"><Wine size={17} /></span><span><strong>Champagne brut</strong><small>Maison Belle Étoile · 2020</small></span><b>3</b></div>
                <span className="preview-card__add"><Plus size={14} /> Ajouter un vin</span>
              </div>
              <div className="floating-note floating-note--top"><span><Sparkles size={18} /></span><strong>Tout est à sa place</strong><small>Vos vins, réunis au même endroit</small></div>
              <div className="floating-note floating-note--bottom"><span><Clock3 size={19} /></span><strong>L&apos;historique, sans effort</strong><small>Chaque entrée et sortie suivie</small></div>
            </div>
          </section>

          <section className="features-section" id="fonctionnalites">
            <div className="container">
              <div className="section-heading"><h2>Le plaisir de collectionner.<br /><em>La simplicité de gérer.</em></h2></div>
              <div className="feature-grid">{features.map((feature) => <article className="feature-card" key={feature.number}><span className="feature-card__number">{feature.number}</span><span className="feature-card__icon">{feature.icon}</span><h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
            </div>
          </section>
          <section className="closing-section"><div className="container closing-section__inner"><h2>Vos vins ont une histoire.<br /><em>Gardez-en la trace.</em></h2><p>Une façon plus agréable de connaître votre collection et de choisir la prochaine bouteille à ouvrir.</p><Link className="button button--light button--large" href="/connexion?mode=inscription">Créer mon compte <ArrowUpRight size={20} /></Link></div></section>
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
