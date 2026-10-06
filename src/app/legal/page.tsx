import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";
export const metadata = { title: "Informations légales - CaveStock" };
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
    </div>
    <div className="legal-layout">
      <nav className="legal-nav" aria-label="Sommaire des informations légales">{sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.label}</a>)}</nav>
      <div className="legal-content">
        <section id="mentions-legales" className="legal-section">
          <span className="legal-section__number">01</span><h2>Mentions légales</h2>
          <p>Ce site est édité par une personne physique, à titre non professionnel. Il ne propose ni abonnement, ni achat, ni prestation payante.</p>
          <dl>
            <div><dt>Éditeur et responsable de publication</dt><dd>Éditeur non professionnel. Son identité a été communiquée à l’hébergeur conformément à l’article 1-1 II de la loi pour la confiance dans l’économie numérique (LCEN).</dd></div>
            <div><dt>Contact</dt><dd><a href="mailto:cavestock-contact@googlegroups.com">cavestock-contact@googlegroups.com</a></dd></div>
            <div><dt>Hébergement du site</dt><dd>Vercel Inc., 440 N Barranca Avenue #4133, Covina, CA 91723, États-Unis</dd></div>
            <div><dt>Hébergement de la base</dt><dd>Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapore 049513 ; région du projet : Paris</dd></div>
          </dl>
          <p>Le code, les textes et les éléments graphiques restent soumis aux droits de leurs auteurs et aux licences des composants utilisés. La gratuité du service ne vaut pas autorisation générale de reproduction.</p>
        </section>
        <section id="confidentialite" className="legal-section">
          <span className="legal-section__number">02</span><h2>Confidentialité</h2>
          <p>Le responsable du traitement est Erwan P - cavestock-contact@googlegroups.com. Il peut être joint à l’adresse de contact ci-dessus.</p>
          <h3>Données et usages</h3>
          <p>Le compte comprend le prénom, le nom, l’adresse e-mail et un mot de passe haché. La cave contient les catégories, les vins, leurs quantités, prix, commentaires et mouvements. Les messages de contact comprennent les coordonnées du compte et le message saisi.</p>
          <p>La gestion du compte, de la cave et des demandes d’assistance repose sur la fourniture du service demandé. La sécurité, les sessions et la limitation des abus reposent sur l’intérêt légitime à protéger le site et ses utilisateurs. Aucune prospection commerciale n’est prévue.</p>
          <p>Les fichiers importés sont analysés pour préparer l’aperçu. Le fichier d’origine n’est pas conservé par l’application ; seules les données confirmées sont ajoutées à la cave.</p>
          <h3>Destinataires et hébergement</h3>
          <p>Les données sont accessibles à l’utilisateur concerné et, lorsque nécessaire pour l’exploitation ou l’assistance, à l’éditeur et à ses prestataires : Vercel pour le site, Supabase pour la base, Brevo pour les e-mails techniques et Google Groups pour l’acheminement des messages de contact. Les données ne sont ni vendues ni utilisées pour de la publicité ciblée.</p>
          <p>La base de données principale est hébergée à Paris, en France. Les e-mails, messages de contact, requêtes et données techniques nécessaires au fonctionnement du service peuvent être traités par les prestataires cités ci-dessus et leurs sous-traitants hors de l’Espace économique européen, notamment aux États-Unis ou à Singapour. Les garanties applicables à ces transferts dépendent du prestataire et du service concerné ; elles peuvent notamment reposer sur des clauses contractuelles types ou une décision d’adéquation. Pour obtenir des précisions sur un traitement, contactez l’éditeur.</p>
          <h3>Conservation</h3>
          <p>Les données du compte et de la cave sont conservées tant que le compte est maintenu. Une suppression demandée depuis le profil efface le compte et ses données liées de la base active. Les comptes créés mais jamais validés sont supprimés automatiquement deux mois après leur création ; leur adresse e-mail peut ensuite être utilisée pour une nouvelle inscription.</p>
          <p>Après un an sans connexion, l’utilisateur et l’éditeur sont avertis par e-mail. Une suppression est envisagée six mois après cet avertissement si aucune nouvelle connexion n’a lieu. Un rappel est envoyé environ une semaine avant cette échéance. Toute connexion annule l’échéance et relance le décompte. La suppression d’un compte validé n’est jamais automatique : l’éditeur vérifie la dernière connexion et procède, le cas échéant, à la suppression manuellement.</p>
          <p>La suppression efface les données de la base active, mais des copies techniques peuvent subsister temporairement dans les sauvegardes de l’hébergeur selon sa politique de conservation. CaveStock ne peut pas garantir leur disparition immédiate. Les messages déjà envoyés par e-mail et les journaux techniques ne sont pas supprimés par la suppression du compte.</p>
          <p>Les liens de validation sont valables 24 heures ; ceux de réinitialisation du mot de passe, 30 minutes. Les sessions expirent après 7 jours et les CAPTCHA après 5 minutes. Une tâche quotidienne purge les comptes non validés arrivés à échéance et les jetons, sessions, défis CAPTCHA et compteurs anti-abus expirés. Les journaux techniques sont conservés selon les durées appliquées par chaque prestataire ; sur leurs offres gratuites, Vercel rend les journaux d’exécution accessibles pendant une heure et Supabase les journaux du projet pendant un jour. Les messages de contact reçus par l’éditeur sont supprimés dans les douze mois suivant la clôture de la demande, sauf nécessité liée à un litige ou à une obligation légale.</p>
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
