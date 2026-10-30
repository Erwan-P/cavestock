# Audit avant publication du dépôt

## Actualisation du 30 octobre 2026

Le contrôle du verrou npm a signalé de nouveaux avis de sécurité pour Next.js
et Zod. Next.js a été mis à jour de `16.3.8` vers `16.4.3`, et Zod de
`4.6.5` vers `4.6.7`. Après mise à jour, `npm audit --json --ignore-scripts`
ne signale aucune vulnérabilité connue pour ce verrou. Les résultats datés
du 16 octobre ci-dessous décrivent l'audit initial.

Les réglages des previews Vercel restent à contrôler dans le tableau de bord.
Un dépôt public autorise la lecture et les forks ; il ne donne aucun droit
d'écriture aux visiteurs. Une pull request externe reste une proposition à
examiner avant fusion ou approbation de son déploiement.

Audit réalisé le 16 octobre 2026, à partir du commit `07c9e0d` et des
correctifs livrés avec ce document. Le changement de visibilité du dépôt
n'a pas été effectué pendant cet audit.

## Périmètre et méthode

- Inventaire des 113 fichiers suivis au début de l'audit et examen des ajouts.
- Recherches de secrets dans les 187 versions de fichiers accessibles depuis
  toutes les branches Git récupérées, y compris les fichiers supprimés.
- Comparaison avec les secrets locaux et recherches de formats de clés,
  jetons, mots de passe hachés, certificats et URL de bases de données.
  Aucune valeur secrète n'est reproduite dans ce rapport.
- Revue des chemins d'authentification, autorisation, validation, stockage,
  import/export, e-mail, rétention, rendu HTML et configuration du déploiement.
- Examen des deux branches GitHub, des 13 journaux d'exécution Actions
  disponibles et des listes d'artefacts associées. Aucun artefact ni release,
  issue ou pull request n'était présent. Wiki, Pages et Discussions désactivés.
- Vérification du verrou npm auprès du registre d'avis de sécurité.
- Contrôles HTTP sans authentification sur la production et lecture des
  métadonnées PostgreSQL de sécurité, sans consultation des données clients.
- Build de production et tests fonctionnels sur une base locale isolée,
  avec e-mails factices capturés localement et sans appel à ChatGPT.

## Résultats

### Secrets et données publiables

Aucun secret réel ni fichier de données clients n'a été détecté dans les
fichiers et l'historique examinés. Les fichiers `.env`, les sauvegardes,
les données locales et les identifiants OAuth sont exclus de Git. Les URL
de bases présentes dans les exemples désignent des bases locales ou utilisent
des valeurs explicitement fictives.

Aucune correspondance avec les secrets locaux n'a été détectée dans les
19 fichiers produits pour le navigateur par le build contrôlé. L'image PNG
publique ne contient pas de bloc de métadonnées textuelles ou EXIF.

Les workflows examinés utilisent des identifiants de test fictifs et un
jeton GitHub limité à la lecture. Aucune clé correspondant aux formats
recherchés n'a été détectée dans les journaux Actions disponibles.

### Accès au site et à la base

Les parcours privés utilisent une session signée et révocable, associée à
un compte validé. Les routes de données examinées restreignent les opérations
au propriétaire ; les requêtes SQL variables utilisent des paramètres.
Les modifications vérifient l'origine et les valeurs sont validées côté
serveur. Les textes utilisateurs examinés sont rendus par React sans insertion
HTML brute. L'export traite les textes commençant par un signe de formule.

La production répondait 401 aux accès anonymes à la cave, au profil, aux
imports, au worker et au cron. `/espace` redirigeait vers la connexion.
Les chemins `.env`, `.git/config` et du script Python répondaient 404.
Les en-têtes CSP, HSTS et `X-Content-Type-Options: nosniff` étaient présents
sur la page publique.

Les 12 tables publiques PostgreSQL, métadonnées Prisma comprises, ont RLS
activé et aucune politique d'accès publique. La protection des imports était
déjà active en production mais manquait dans les migrations du dépôt.
La nouvelle migration a été appliquée puis vérifiée : aucun droit de table
ne reste accordé directement aux rôles `anon` et `authenticated` sur les
tables applicatives. Le rôle Prisma conserve son accès serveur.

## Correctifs réalisés

- Next.js `16.3.6` vers `16.3.8`, Sharp `0.35.4` vers `0.35.5` et
  source-map-js vers `1.2.2`. Après mise à jour : zéro vulnérabilité connue
  signalée par `npm audit` pour le verrou contrôlé.
- Migration reproductible pour les protections privées et retrait des droits
  inutiles, y compris TRUNCATE, que RLS ne contrôle pas.
- Limitation des vérifications de mot de passe lors du changement d'e-mail.
- Contrôle exact du nom d'hôte pour l'exception HTTP locale du worker.
- Écriture atomique des identifiants du worker : DPAPI sous Windows,
  permissions privées dès la création du fichier sur Unix.
- Information de confidentialité alignée sur le stockage temporaire des
  imports et leur transmission à OpenAI.
- Mise à jour des tests du menu pour les demandes d'import différées,
  ajout de leur cycle de traitement à la régression et sortie en échec fiable
  du programme de test. Ajout de contrôles du worker avec jetons factices.
- Ajout de `LICENSE`, de sa référence npm et d'un avertissement de
  réutilisation dans le README ; exclusions Git supplémentaires.

## Vérifications exécutées

- `npm run build` : réussi avec Next.js 16.3.8 et contrôle TypeScript.
- Régression isolée : 50 contrôles de récupération/profil/contact, cave et
  isolation des comptes, menu, 15 scénarios de formats d'import, validation
  e-mail et cycle des imports différés avec bail, quota et confirmation unique.
- Tests de nettoyage des anciens aperçus et des dates de rétention : réussis.
- Worker : rejet de JSON invalides, sauvegarde/lecture de jetons factices,
  chiffrement DPAPI sous Windows, remplacement atomique et rejet d'URL non sûres.
- Migrations : installation des sept migrations sur une base neuve ; test
  des droits avec rôles publics simulés ; déploiement de l'unique migration
  nouvelle sur Supabase et contrôle des métadonnées après application.
- `git diff --check` : réussi avant publication du commit.

Les essais PostgreSQL ont utilisé une base locale distincte de Supabase.
Le serveur de cette base a été arrêté après les contrôles.

## Points à connaître avant de rendre le dépôt public

1. **Identité Git** : l'adresse e-mail de l'auteur figure dans les anciens
   commits. Elle deviendra consultable. Elle n'a pas été retirée de l'historique.
2. **Vercel** : les variables privées et les règles d'approbation des previews
   n'ont pas été inspectées dans le tableau de bord. Vérifier que les previews
   de contributions externes n'utilisent pas la base ou les secrets de production,
   et conserver leur approbation manuelle.
3. **Droits** : `LICENSE` autorise consultation et étude personnelle, mais pas
   la réutilisation ou la republication du site sans accord écrit. Il s'agit
   d'une licence restrictive de code source consultable, pas d'une licence
   open source OSI. Les droits de GitHub et les forks autorisés par ses
   conditions restent applicables. Les éléments tiers gardent leurs licences.
   Ce texte sur mesure n'a pas fait l'objet d'une validation juridique externe.
4. **Limites** : cet audit ne constitue pas un test d'intrusion exhaustif,
   une preuve d'absence de vulnérabilité, un examen de tous les réglages des
   prestataires ou une certification des droits sur chaque élément graphique.
   La qualité réelle d'extraction ChatGPT et la délivrabilité réelle des e-mails
   ne sont pas établies par les tests avec résultats et courriels factices.

## Références

- [Conditions GitHub, licences du contenu](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#d-user-generated-content)
- [Définition open source de l'OSI](https://opensource.org/osd)
- [Protection PostgreSQL avec RLS chez Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Stockage des identifiants ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
