# CaveStock

Vitrine publique, connexion et espace personnel de gestion de cave.

## Droits de réutilisation

Le code est publié pour consultation et étude, sous la [licence CaveStock](LICENSE).
Il ne s'agit pas d'une licence open source : reprendre, déployer ou republier le
site, même modifié et même gratuitement, nécessite l'accord écrit préalable de
l'auteur. Les fonctions de GitHub, notamment les forks, restent soumises aux
conditions de GitHub. Les dépendances tierces conservent leurs propres licences.

## Démarrage local

1. Utiliser Node.js 24 et installer les dépendances avec `npm ci`.
2. Démarrer PostgreSQL local avec `npm run db:local` (Prisma Postgres local, sans Docker), ou utiliser une base PostgreSQL dédiée.
3. Copier `.env.example` en `.env` et remplir `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET` et les variables Brevo ci-dessous. Adapter le port à celui affiché par Prisma si nécessaire. Ne jamais publier ce fichier.
4. Appliquer les migrations avec `npm run db:deploy`.
5. Démarrer avec `npm run dev -- --port 3100`, puis ouvrir `http://localhost:3100`.

`AUTH_SECRET` doit contenir au moins 32 caractères aléatoires.

Les sessions sont conservées en base et révoquées lors de la déconnexion. La migration des sessions déconnecte les comptes déjà connectés une seule fois. En production, placer l'application derrière HTTPS. Pour une limite par adresse IP, définir `TRUSTED_CLIENT_IP_HEADER` uniquement si le proxy efface l'en-tête envoyé par le visiteur puis le réécrit avec l'adresse observée ; sinon, la limite globale reste active.

## Inscription

Le CAPTCHA est généré par le site. Son défi temporaire expire après 5 minutes et n'enregistre aucune donnée de compte. Après validation, le mot de passe est haché et un compte en attente est créé. Un lien de validation valable 24 heures est envoyé par Brevo. Tant que l'adresse n'est pas validée, la connexion et les sessions sont refusées. Le lien peut être renvoyé depuis la connexion avec le mot de passe du compte. Les comptes existants avant cette migration conservent leur accès.

### Configuration Brevo

Dans `.env` en local, puis dans les variables d'environnement Vercel au déploiement, définir `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `CAVESTOCK_CONTACT_EMAIL` et `CAVESTOCK_SITE_URL`. La clé reste côté serveur : ne pas utiliser le préfixe `NEXT_PUBLIC_`. `CAVESTOCK_SITE_URL` doit être l'URL publique exacte en HTTPS en production ; elle détermine le domaine du lien de validation. Redémarrer le serveur après modification de `.env`.

Sans domaine personnel, créer une adresse réelle distincte pour CaveStock (par exemple chez Gmail), puis l'ajouter et la vérifier dans Brevo sous Paramètres > Expéditeurs, domaines et IP > Expéditeurs. Mettre cette adresse d'origine dans `BREVO_SENDER_EMAIL`, pas l'adresse `...brevosend.com` vue par les destinataires : Brevo génère cette dernière automatiquement lorsque le domaine n'est pas authentifié. Le nom visible envoyé par l'application reste « CaveStock ». Le compte Brevo peut être commun avec la pâtisserie, mais les deux projets utilisent des adresses d'origine distinctes. Quand CaveStock aura son propre domaine, authentifier ce domaine dans Brevo et remplacer l'expéditeur configuré. Pour recevoir les messages du formulaire, configurer `CAVESTOCK_CONTACT_EMAIL` ; si c'est un Google Group, autoriser la réception depuis l'extérieur.

La connexion et l'inscription partagent la page `/connexion` ; le mode inscription est accessible par `/connexion?mode=inscription`. L'ancienne URL `/inscription` redirige vers ce mode.

### Mot de passe oublié

Le lien « Mot de passe oublié ? » ouvre le formulaire d'envoi sur la page de connexion. La réponse reste identique pour une adresse connue ou inconnue. Brevo reçoit la demande après la réponse HTTP via `after` de Next.js. Le lien expire après 30 minutes ; seul son hachage est conservé en base. Le jeton est dans le fragment du lien et retiré de l'adresse du navigateur après lecture.

Le changement révoque toutes les sessions et tous les liens de récupération du compte. Il annule aussi un changement d'adresse en attente. Un compte non encore validé devient validé, puisque le lien prouve la possession de l'adresse. Aucun utilisateur n'est connecté automatiquement après le changement.

`npm run test:password -- --regression` démarre un serveur de test sur 3101 et capture les mails localement, sans en envoyer à Brevo. Arrêter le serveur de développement avant ce test. Le test couvre notamment l'expiration, l'usage unique, la concurrence, la révocation, les pannes d'envoi et les autres parcours de la cave.

## Espace cave

Chaque compte possède ses propres catégories et vins. Les catégories initiales sont Vins Blanc, Vins Rouge, Vins Rosé et Champagnes ; l'utilisateur peut en ajouter. Recherche et tri sont appliqués dans les catégories. Les formulaires permettent d'ajouter un vin, de modifier ses informations ou sa catégorie, de changer sa quantité et de consulter son historique.

Chaque création et augmentation de quantité produit une entrée ; chaque diminution produit une sortie. Une quantité de zéro conserve la fiche et son historique. Une suppression confirmée efface la fiche et ses mouvements. Les statistiques d'entrées et sorties couvrent l'année civile en heure de Paris, du 1er janvier au 31 décembre. La bouteille la plus ancienne concerne le stock actuellement positif.

Un ajout correspondant au même vin est fusionné avec sa fiche et compté comme une entrée. L'identité repose sur catégorie, région, appellation, domaine et millésime. La cuvée distingue des vins seulement si elle est renseignée ; si plusieurs cuvées correspondent à une saisie sans cuvée, le site demande de préciser plutôt que de fusionner arbitrairement.

Le menu propose l'import, l'export, l'historique global, le profil, le contact et la déconnexion. L'historique global est sur `/espace/historique` ; il reprend le menu et la recherche et regroupe les mouvements par jour. Le contact ouvre un formulaire prérempli avec les coordonnées du compte, non modifiables dans cette fenêtre. Le message est envoyé par Brevo à `CAVESTOCK_CONTACT_EMAIL`, avec l'adresse de l'utilisateur en « Répondre à ».

L'import accepte `.xls`, `.xlsx`, `.csv` et `.tsv` (2 Mo, 500 vins maximum). Les fichiers Excel, CSV et TSV sont traités comme fichiers d'entrée par l'API Responses. OpenAI indique que son traitement de tableurs analyse jusqu'aux 1 000 premières lignes de chaque onglet ; découpez les classeurs plus grands. La mise en forme visuelle du classeur peut compter pour certaines quantités : vérifiez ces valeurs dans l'aperçu avant confirmation.

Le dépôt enregistre le fichier en base dans une demande en attente et envoie un mail à l'opérateur. Le script local `scripts/import_worker.py` récupère le fichier et le transmet directement à ChatGPT via l'API Responses autorisée par le compte ChatGPT de l'opérateur. ChatGPT lit le classeur et produit le JSON complet de l'aperçu CaveStock ; aucun parseur local ni modèle local n'intervient dans le traitement. Le fichier est donc transmis à OpenAI pour analyse. Si l'IA échoue ou renvoie un résultat qui ne respecte pas le format du site, la demande passe en échec et peut être supprimée puis redéposée. Lorsque l'analyse aboutit, le site envoie un mail à l'utilisateur et affiche l'aperçu à corriger. Aucun vin n'est ajouté avant sa confirmation.

L'aperçu reste modifiable. Les champs obligatoires manquants bloquent la confirmation des lignes sélectionnées. Un millésime absent n'est jamais remplacé automatiquement ; l'utilisateur doit saisir une année ou explicitement `0000` (inconnu). Cette valeur est également disponible dans les formulaires, affichée sur quatre chiffres et exclue du calcul de la bouteille la plus ancienne. Les dates d'achat complètes sont reprises pour les mouvements ; les dates textuelles partielles restent dans les commentaires. Sans date, le mouvement prend la date d'import. L'import confirmé est atomique ; les doublons augmentent le stock existant et enregistrent une entrée. Chaque compte dispose de 3 imports par mois calendaire, heure de Paris ; les demandes en attente réservent une place dans ce quota.

### Lancer le worker d'import

Installer Python 3.11+ sur le laptop. Configurer `CAVESTOCK_URL` (adresse HTTPS du site) et `IMPORT_WORKER_TOKEN` (la même valeur que sur Vercel). Le script lit automatiquement ces valeurs dans `.env.import-worker`, fichier local ignoré par Git ; les variables déjà définies dans l'environnement priment. Autoriser le compte avec `python scripts/import_worker.py --chatgpt-login`, puis lancer `python scripts/import_worker.py` pour traiter une demande ou `python scripts/import_worker.py --poll 60` pour surveiller la file toutes les 60 secondes tant que le laptop est allumé. Le compte ChatGPT doit autoriser l'usage de son forfait dans cette application locale. Les identifiants OAuth sont conservés localement et chiffrés par Windows DPAPI. Le worker utilise `gpt-6-luna` par défaut et échoue clairement s'il n'est pas disponible sur le compte ; `CHATGPT_MODEL` permet de choisir un autre modèle explicitement, sans bascule automatique. Le worker n'a pas besoin des identifiants Supabase : il échange avec le site au moyen d'un jeton dédié.

Contenu du fichier local `.env.import-worker` :

```text
CAVESTOCK_URL=https://cavestock.vercel.app
IMPORT_WORKER_TOKEN=secret-identique-a-la-variable-vercel
# Facultatif : remplacer le modèle par défaut gpt-6-luna
```

```powershell
python scripts/import_worker.py
```

L'export produit un classeur `.xlsx` avec un onglet par catégorie et un onglet Historique. Il est limité à 3 exports par mois calendaire, heure de Paris. Les données d'authentification ne sont jamais incluses. Le profil permet de modifier prénom et nom, et de demander le changement d'adresse e-mail après saisie du mot de passe. L'adresse actuelle reste active jusqu'à la validation de la nouvelle. La suppression définitive du compte, de ses vins, catégories et mouvements demande confirmation et mot de passe.

Pour vérifier les parcours de données sur le serveur local, lancer `npm run test:cellar`, `npm run test:menu`, `npm run test:import` et `npm run test:email`. Ces scripts créent puis suppriment uniquement leurs comptes temporaires. Le test d'import vérifie aussi les nouveaux formats, les blocs, les stocks visuels, les dates et les millésimes inconnus ; un chemin de classeur familial peut lui être fourni pour une analyse sans import de ses données. Un petit CSV d'essai se trouve dans `scripts/fixtures/import-demo.csv`. Le test e-mail vérifie les droits et les jetons localement ; il n'envoie pas de vrai message Brevo.

Les classeurs XLSX sont contrôlés avant lecture : au plus 100 fichiers internes et 12 Mo décompressés.

## Informations légales

Le footer public renvoie à `/legal` (mentions légales, confidentialité, cookies et conditions d'utilisation). Le service est gratuit, édité à titre personnel et sans offre payante. Les informations restant à confirmer sont entre crochets. Voir `DEPLOYMENT.md` pour les précisions concernant l'identification d'un éditeur non professionnel.

## PostgreSQL et Supabase

Le schéma et les migrations actifs utilisent PostgreSQL. Les anciennes migrations MySQL restent dans `prisma/legacy/mysql` comme archive. Les requêtes de verrouillage et la reprise des transactions concurrentes ont été adaptées.

Pour une nouvelle migration MySQL : renseigner `MYSQL_SOURCE_URL`, lancer `npm run db:mysql-client`, puis `npm run db:import-mysql` pour le diagnostic. Arrêter les écritures sur la source et utiliser `npm run db:import-mysql -- --apply` pour copier vers une cible vide déjà migrée. L'outil sauvegarde les données dans `backups/`, contrôle toutes les valeurs dans une transaction et laisse la source intacte.

Pour transférer la base PostgreSQL locale vers Supabase : appliquer d'abord les migrations sur Supabase puis renseigner `MIGRATION_TARGET_URL` et lancer `npm run db:copy-postgres -- --apply`. Ne pas relancer la copie depuis l'ancien MySQL si la cave a changé depuis la bascule. Les sessions et liens de réinitialisation ne sont pas transférés.

Les étapes de déploiement, les variables Vercel et les contrôles avant ouverture sont dans [DEPLOYMENT.md](DEPLOYMENT.md).
