# Déploiement de CaveStock

Le code utilise PostgreSQL et Prisma 6.19.3. La base MySQL est une ancienne source de migration ; ne pas brancher la production dessus.

## 1. Supabase

1. Ouvrir le dashboard Supabase, puis **New project** dans l'organisation personnelle.
2. Nom : **cavestock**. Choisir une région de l'Union européenne proche des utilisateurs (Paris si disponible, sinon Francfort).
3. Générer un mot de passe de base et le conserver dans un gestionnaire de mots de passe. Ne pas le coller dans un chat ni le publier dans Git.
4. Dans **Connect**, copier deux connexions : **Transaction pooler**, port **6543**, pour l'application Vercel ; **Session pooler**, port **5432**, pour Prisma Migrate. Le mode Session fonctionne aussi sur les réseaux IPv4.
5. Remplacer le mot de passe dans les URL et encoder ses caractères spéciaux. Le nom d'utilisateur du pooler comprend la référence du projet : reprendre exactement la valeur fournie par Supabase.
6. Dans **Settings > Data API** (ou API Settings), désactiver la Data API : ce projet utilise ses propres sessions et Prisma côté serveur, pas Supabase Auth ni le client JavaScript public. Les migrations activent aussi RLS sur les tables, sans politique publique.

Exemples à adapter aux valeurs copiées, jamais des URL à utiliser telles quelles :

```ini
DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@HOST.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=5&sslmode=require"
DIRECT_URL="postgresql://postgres.PROJECT_REF:PASSWORD@HOST.pooler.supabase.com:5432/postgres?sslmode=require"
```

Prisma doit utiliser un rôle propriétaire des tables ou avec BYPASSRLS ; les rôles publics anon/authenticated ne conviennent pas. Garder ces identifiants exclusivement côté serveur. Documentation : [Prisma avec Supabase](https://supabase.com/docs/guides/database/prisma).

## 2. Appliquer le schéma et copier la base locale

Ne pas déployer l'application sur la nouvelle base avant d'avoir fini cette étape.

1. Dans un fichier local **.env.production.local** (déjà ignoré par Git), enregistrer uniquement les `DATABASE_URL` et `DIRECT_URL` Supabase.
2. Depuis le dossier du projet, appliquer les migrations :

```powershell
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate deploy
```

3. Arrêter le serveur local pour figer les données. Laisser le PostgreSQL local en marche.
4. Ajouter dans **.env** une variable `MIGRATION_TARGET_URL` contenant la connexion Supabase **Session pooler**. Garder `DATABASE_URL` sur la base locale pour qu'elle reste la source.
5. Faire le contrôle, puis la copie :

```powershell
npm run db:copy-postgres
npm run db:copy-postgres -- --apply
```

L'outil exige une cible vide, garde les mêmes identifiants, sauvegarde la source dans `backups/`, compare toutes les valeurs copiées et annule la transaction si une différence apparaît. Il conserve comptes, mots de passe hachés, catégories, vins, mouvements, quotas et validations d'adresse en attente. Il ne copie pas les sessions, CAPTCHA ni les liens de réinitialisation : chaque utilisateur se reconnecte. Les liens envoyés avant le changement d'URL peuvent nécessiter un renvoi.

Ne pas utiliser `prisma migrate reset` sur les données réelles. Ne pas recopier l'ancien MySQL après de nouvelles saisies sur PostgreSQL. Ne jamais commiter les sauvegardes : elles contiennent des données personnelles et des hachages de mots de passe.

## 3. Vercel

1. Ouvrir Vercel, **Add New > Project**, puis importer le dépôt GitHub **Erwan-P/cavestock**. Autoriser l'intégration GitHub à accéder au dépôt privé si nécessaire.
2. Framework : **Next.js** ; dossier racine : **./** ; Node.js : **24.x** ; commande de build : **npm run build** ; installation : **npm ci**.
3. Dans **Environment Variables**, renseigner les valeurs pour **Production**. Ne pas utiliser la base de production pour des previews de branches non approuvées.

| Variable | Valeur |
| --- | --- |
| DATABASE_URL | Transaction pooler Supabase, port 6543, pgbouncer=true |
| DIRECT_URL | Session pooler Supabase, port 5432 |
| AUTH_SECRET | Nouveau secret aléatoire d'au moins 32 caractères |
| BREVO_API_KEY | Clé Brevo CaveStock existante |
| BREVO_SENDER_EMAIL | cavestock-contact@googlegroups.com, déjà vérifiée chez Brevo |
| CAVESTOCK_CONTACT_EMAIL | cavestock-contact@googlegroups.com |
| CAVESTOCK_SITE_URL | URL publique exacte en HTTPS, sans chemin |
| IMPORT_WORKER_TOKEN | Secret aléatoire d'au moins 32 caractères, identique sur le laptop |
| CAVESTOCK_IMPORT_ADMIN_EMAIL | Adresse qui reçoit les dépôts de fichiers à traiter |
| TRUSTED_CLIENT_IP_HEADER | x-forwarded-for, pour un déploiement directement derrière Vercel |

Ne pas copier MYSQL_SOURCE_URL, MIGRATION_TARGET_URL ou CAVESTOCK_MAIL_TEST_URL sur Vercel. Ne préfixer aucun secret par NEXT_PUBLIC_.

Pour l'import différé, ouvrir **Vercel > projet CaveStock > Settings > Environment Variables**, ajouter `IMPORT_WORKER_TOKEN` et `CAVESTOCK_IMPORT_ADMIN_EMAIL` à l'environnement **Production**, puis enregistrer. Générer le jeton sur le laptop avec `python -c "import secrets; print(secrets.token_urlsafe(48))"` et conserver exactement la même valeur dans l'environnement du script local ; ne jamais l'ajouter au dépôt. L'adresse admin doit pouvoir recevoir les messages envoyés par Brevo. Après toute modification des variables Vercel, redéployer le site. Le laptop n'a pas besoin de `DATABASE_URL` Supabase ; son seul accès au site est ce jeton.

4. Choisir le nom de projet et vérifier l'URL proposée par Vercel. Utiliser cette URL HTTPS dans `CAVESTOCK_SITE_URL`. Un domaine personnel n'est pas requis ; une URL `.vercel.app` convient.
5. Déployer. Si l'URL n'était pas connue à l'étape précédente, la renseigner dans Settings > Environment Variables puis faire **Redeploy**. Toute modification des variables exige un nouveau déploiement.
6. Les migrations sont une étape séparée : le build ne modifie pas la base. À chaque changement de schéma, appliquer `prisma migrate deploy` sur la bonne cible avant l'application qui l'exige.
   La migration `20261010000000_async_import_jobs` doit donc être appliquée avant la publication du nouveau parcours d'import.
7. Vérifier la région des fonctions et la rapprocher de la base si le plan le permet.

Références : [Node.js 24 sur Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [en-têtes de confiance](https://vercel.com/docs/headers/request-headers).

## 4. Vérification en ligne

Avec un compte de test :

- Inscription, réception réelle du mail et validation sur l'URL HTTPS.
- Refus de connexion avant validation.
- Mot de passe oublié, réception du lien, changement, refus de réutilisation du lien et déconnexion des anciennes sessions.
- Ajouter, modifier, supprimer un vin ; vérifier dates, quantités et historique.
- Importer un fichier de test et exporter le résultat ; vérifier les quotas.
- Envoyer un message depuis Contact et vérifier sa réception dans le Google Group/la boîte destinataire.
- Supprimer uniquement le compte de test après les vérifications.

Les tests locaux capturent les messages : ils valident le parcours mais pas la délivrabilité réelle Brevo.

## 5. Informations légales à fournir

Le site est gratuit, sans entreprise ni bureau professionnel. Les zones entre crochets de `src/app/legal/page.tsx` sont les informations à finaliser :

- Identité/contact du responsable du traitement et choix d'identification de l'éditeur.
- Coordonnées de l'hébergeur retenu et région Supabase.
- Conservation des comptes inactifs/non validés, des demandes de contact, des journaux et des sauvegardes.
- Localisation des prestataires et garanties en cas de transferts hors EEE.

L'article 1-1 II de la LCEN prévoit une modalité d'identification par l'hébergeur pour l'éditeur non professionnel souhaitant préserver son anonymat, à condition de lui avoir communiqué les informations exigées. Cela ne dispense pas d'informer les utilisateurs sur le responsable du traitement de leurs données. Confirmer la solution retenue avant de remplacer les crochets ; ne pas inventer d'adresse de bureau.

Références : [LCEN, article 1-1](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000049568614/2026-03-24), [informations RGPD, CNIL](https://www.cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence).

Configurer et tester une restauration de sauvegarde selon le plan Supabase choisi. L'export Excel personnel ne remplace pas une sauvegarde de la base complète.
