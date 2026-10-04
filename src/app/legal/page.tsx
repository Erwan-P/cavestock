import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Informations légales — CaveStock" };
const sections = [
  { id: "mentions-legales", label: "Mentions légales" },
  { id: "confidentialite", label: "Confidentialité" },
  { id: "cookies", label: "Cookies" },
  { id: "conditions", label: "Conditions d’utilisation" },
];

export default function LegalPage() {
  return <div className="legal-shell"><SiteHeader /><main className="legal-main container">
    <div className="legal-intro">
      <h1>Informations<br /><em>légales.</em></h1>
      <p>CaveStock est un service gratuit de gestion de cave, publié à titre personnel par un développeur indépendant.</p>
      <div className="legal-warning" role="note">Les informations entre crochets restent à compléter avant l’ouverture publique. Dernière mise à jour : 3 octobre 2026.</div>
    </div>
    <div className="legal-layout">
      <nav className="legal-nav" aria-label="Sommaire des informations légales">{sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.label}</a>)}</nav>
      <div className="legal-content">
        <section id="mentions-legales" className="legal-section">
          <span className="legal-section__number">01</span><h2>Mentions légales</h2>
          <p>Ce site est édité par une personne physique, à titre non professionnel. Il ne propose ni abonnement, ni achat, ni prestation payante.</p>
          <dl>
            <div><dt>Éditeur et responsable de publication</dt><dd>[Prénom et nom de l’éditeur, ou identification non professionnelle à finaliser selon l’article 1-1 II de la LCEN]</dd></div>
            <div><dt>Correspondance</dt><dd>[Coordonnées de correspondance et modalités d’identification à confirmer ; aucun bureau professionnel requis]</dd></div>
            <div><dt>Contact</dt><dd><a href="mailto:cavestock-contact@googlegroups.com">cavestock-contact@googlegroups.com</a></dd></div>
            <div><dt>Hébergement du site</dt><dd>Vercel — [raison sociale exacte, adresse postale et numéro de téléphone de l’hébergeur à confirmer pour le compte utilisé]</dd></div>
            <div><dt>Hébergement de la base</dt><dd>Supabase — [entité contractante et région du projet à confirmer lors du déploiement]</dd></div>
          </dl>
          <p>Le code, les textes et les éléments graphiques restent soumis aux droits de leurs auteurs et aux licences des composants utilisés. La gratuité du service ne vaut pas autorisation générale de reproduction.</p>
        </section>
        <section id="confidentialite" className="legal-section">
          <span className="legal-section__number">02</span><h2>Confidentialité</h2>
          <p>Le responsable du traitement est [prénom et nom, coordonnées de contact du responsable]. Il peut être joint à l’adresse de contact ci-dessus.</p>
          <h3>Données et usages</h3>
          <p>Le compte comprend le prénom, le nom, l’adresse e-mail et un mot de passe haché. La cave contient les catégories, les vins, leurs quantités, prix, commentaires et mouvements. Les messages de contact comprennent les coordonnées du compte et le message saisi.</p>
          <p>La gestion du compte, de la cave et des demandes d’assistance repose sur la fourniture du service demandé. La sécurité, les sessions et la limitation des abus reposent sur l’intérêt légitime à protéger le site et ses utilisateurs. Aucune prospection commerciale n’est prévue.</p>
          <p>Les fichiers importés sont analysés pour préparer l’aperçu. Le fichier d’origine n’est pas conservé par l’application ; seules les données confirmées sont ajoutées à la cave.</p>
          <h3>Destinataires et hébergement</h3>
          <p>Les données sont accessibles à l’utilisateur concerné et, lorsque nécessaire pour l’exploitation ou l’assistance, à l’éditeur et à ses prestataires : Vercel pour le site, Supabase pour la base, Brevo pour les e-mails techniques et Google Groups pour l’acheminement des messages de contact. Les données ne sont ni vendues ni utilisées pour de la publicité ciblée.</p>
          <p>[Régions de stockage, éventuels transferts hors de l’Espace économique européen et garanties contractuelles à confirmer selon les configurations retenues.]</p>
          <h3>Conservation</h3>
          <p>Les données de la cave sont conservées pendant l’utilisation du compte. Sa suppression depuis le profil efface les données de la base active. [Politique des comptes inactifs ou non validés à définir.] [Durée de conservation des sauvegardes et délai de disparition des données supprimées à préciser.]</p>
          <p>Les liens de validation sont valables 24 heures ; ceux de réinitialisation du mot de passe, 30 minutes. Les sessions expirent après 7 jours et les CAPTCHA après 5 minutes. [Fréquence de purge des jetons expirés et durée de conservation des journaux techniques à confirmer.] Les messages de contact sont conservés [durée à définir après clôture de la demande].</p>
          <h3>Vos droits</h3>
          <p>Vous pouvez demander l’accès, la rectification, l’effacement, la limitation ou, selon le traitement, la portabilité de vos données et vous opposer aux traitements fondés sur l’intérêt légitime. Écrivez à l’adresse de contact ; les demandes sont traitées dans les délais applicables. Vous pouvez également saisir la <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noreferrer">CNIL</a>.</p>
          <p>Le profil permet de modifier certaines coordonnées et de supprimer le compte. L’export Excel permet de récupérer la cave ; son quota n’empêche pas une demande d’accès à vos données par contact.</p>
        </section>
        <section id="cookies" className="legal-section">
          <span className="legal-section__number">03</span><h2>Cookies</h2>
          <p>Deux cookies techniques permettent le fonctionnement du compte :</p>
          <ul><li><strong>cavestock_session</strong> : maintien de la connexion, 7 jours maximum ; supprimé à la déconnexion.</li><li><strong>cavestock_captcha</strong> : identification du défi anti-robot, 5 minutes maximum.</li></ul>
          <p>Aucun cookie publicitaire ni outil d’analyse d’audience n’est intégré à cette version. Vous pouvez effacer les cookies depuis votre navigateur ; vous devrez alors vous reconnecter.</p>
        </section>
        <section id="conditions" className="legal-section">
          <span className="legal-section__number">04</span><h2>Conditions d’utilisation</h2>
          <p>CaveStock est entièrement gratuit. Il n’existe aucun abonnement, paiement ou engagement d’achat ; aucune condition générale de vente n’est applicable au service actuel.</p>
          <p>L’utilisateur conserve des identifiants confidentiels et renseigne des informations qu’il est autorisé à utiliser. Les contenus illicites, l’accès aux comptes d’autrui et les tentatives de perturbation du service sont interdits.</p>
          <p>La cave est un outil de suivi personnel. L’utilisateur vérifie les données saisies et l’aperçu des imports. Le service autorise actuellement 3 imports et 3 exports par mois calendaire, en heure de Paris.</p>
          <p>Le service peut être interrompu pour maintenance ou en cas d’incident. L’éditeur s’efforce de corriger les problèmes signalés, sans promettre une disponibilité permanente. Conservez une copie de vos données importantes. Ces dispositions n’excluent pas les responsabilités qui ne peuvent être écartées par la loi.</p>
          <p>Vous pouvez arrêter d’utiliser le service et supprimer votre compte depuis le profil. En cas de modification importante de ces conditions ou d’arrêt prévu du service, les utilisateurs seront informés par le site ou par e-mail.</p>
          <p>Pour toute question ou difficulté, contactez l’éditeur à <a href="mailto:cavestock-contact@googlegroups.com">cavestock-contact@googlegroups.com</a>.</p>
        </section>
      </div>
    </div>
  </main><SiteFooter /></div>;
}
