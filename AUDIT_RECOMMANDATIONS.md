> Mise à jour Cloudflare (4 novembre 2026) : le fournisseur a été remplacé depuis cette revue initiale Gemini. Le blocage de facturation décrit ci-dessous concerne l’ancienne configuration. Configuration actuelle et étapes de validation : RECOMMANDATIONS_DEV.md. Le build de production, TypeScript, les tests de fournisseur Cloudflare simulé et les tests des catégories ont été rejoués avec succès après ce remplacement ; un test réel Cloudflare reste requis avec un compte Workers Free et ses credentials. Aucun push.

# Revue avant publication — 4 novembre 2026

Périmètre : recommandations repas/vins, dé aléatoire, gestion/suppression/ordre des catégories, menu contextuel des vins, surbrillance temporaire et styles partagés. Revue du diff et des nouvelles routes, vérifications sur la base locale avec comptes temporaires, build de production et contrôle navigateur. Aucun déploiement ni test de la base de production.

## Verdict

Aucune faille bloquante ni régression reproduite dans ce périmètre après correction. La publication de l’IA en France/EEE reste suspendue à une configuration Google appropriée : les conditions Gemini consultées le 4 novembre 2026 réservent cette mise à disposition aux Paid Services, donc à un projet associé à une facturation active. Le plafond applicatif ne garantit pas une facture nulle. Source : https://ai.google.dev/gemini-api/terms, sections Use Restrictions et Paid Services.

## Corrections pendant la revue

- Une cave vide consommait une tentative avant de refuser la recherche. Vérification du stock déplacée avant la réservation du quota ; configuration du modèle vérifiée avant réservation également.
- Une réponse Google dont le JSON ou le schéma était invalide était parfois classée comme erreur de saisie. Elle renvoie maintenant une erreur fournisseur 502, sans détailler sa réponse. Les éventuelles parties marquées `thought` sont exclues du JSON utile.
- La page de confidentialité et la documentation de configuration décrivent désormais Google Gemini, les champs transmis et les conditions de mise à disposition en EEE.
- Bulle IA : « Recherche avec l’IA : plat ou vin. Max 3/jour. » Bouton de cave passé de 94 à 128 px de hauteur et élargi de 8 px par son espacement intérieur ; pas de chevauchement du tonneau au cadrage bureau contrôlé.

## Sécurité et cohérence

- Authentification et vérification d’origine sur les nouvelles mutations. Identifiants de catégorie contrôlés contre ceux du compte ; ordre complet sans doublons exigé. Suppression et réorganisation dans une transaction sérialisable. La suppression de catégorie efface volontairement ses vins et leurs mouvements liés après confirmation ; un retour du code ne restaure pas ces données.
- L’IA reçoit uniquement la demande et au plus 120 références descriptives en stock. Aucun champ de coordonnées du compte, de prix, de quantité ou de commentaire n’est ajouté automatiquement. La demande libre peut cependant contenir ce que l’utilisateur saisit ; la confidentialité le précise.
- La clé Google reste côté serveur. Scan des 18 fichiers JavaScript du build client : aucune occurrence des valeurs locales de GEMINI_API_KEY, AUTH_SECRET ou DATABASE_URL. Seul `.env.example` est suivi par Git ; les vins d’essai et sauvegardes restent dans la base locale / le dossier ignoré `tmp`.
- Réponses IA affichées en texte React, sans HTML injecté ni exécution de commandes. Les wineId doivent appartenir aux candidats ; propriété et stock revérifiés après la réponse. Aucun outil web/achat ni écriture de stock n’est accessible au modèle.
- Quotas persistés en base : 3 tentatives par compte et 100 pour le site par jour UTC. Test de 5 appels simultanés : 3 acceptés, 2 refusés ; plafond global également testé. Un échec après réservation peut consommer une tentative. Le quota Google peut être inférieur au quota applicatif.
- Les catégories par défaut sont créées à l’inscription, plus à chaque lecture : une catégorie supprimée ne réapparaît pas. Les anciens comptes vides restent utilisables via « Ajouter une catégorie ». Aucun changement du schéma SQL.

## Vérifications exécutées

- `npm run typecheck` et `node node_modules/next/dist/bin/next build` : succès.
- `scripts/qa-cellar.mjs` : accès, catégories, doublons/cuvées, stock, statistiques, historique, isolation, concurrence et suppression.
- `scripts/qa-menu.mjs` : import CSV/XLSX, aperçu sans écriture, fusion, commentaires, export/historique, quotas, profil et cascade.
- `scripts/qa-discovery.mjs` : refus intercompte et origine étrangère, ordre valide/invalide, suppression de vins/mouvements, persistance de suppression des catégories par défaut et de la dernière catégorie.
- `scripts/qa-recommendations.mjs` : build de production servi localement, Google simulé exclusivement dans le processus QA, secret de session dédié et comptes temporaires nettoyés. Authentification, origine, cave vide sans quota, demande invalide, quotas concurrents et global, minimisation des champs, 125 vins réduits à 120 avec indication de sélection partielle, identifiant étranger refusé, stock épuisé pendant l’appel retiré, JSON/schéma fournisseur invalides et quota Google. Aucun appel Google réel pour ces tests.
- `npm audit --omit=dev` : 0 vulnérabilité connue signalée au moment du contrôle. Cela ne prouve pas l’absence de toute vulnérabilité.
- `git diff --check` : succès.
- Navigateur : réponse Google réelle et titre vers le bon vin contrôlés avant cette revue ; menu contextuel, clic gauche sans contour, surbrillance retirée après 15 secondes, flèches dans les deux sens, cave immersive, couleurs et défilement des résultats contrôlés. Nouveau quota dans la bulle et bouton agrandi contrôlés pendant la revue.

## Limites restantes

Les suggestions restent probabilistes et peuvent être mauvaises. Une grande cave est échantillonnée, avec indication dans les résultats. Le fournisseur peut refuser ou ralentir un appel ; délai maximal applicatif de 25 secondes pour l’appel Google. Les tests ne constituent pas une garantie d’absence de bugs, un audit complet des anciennes fonctions ou une validation mobile exhaustive. Les e-mails réels et la configuration Vercel/Google de production n’ont pas été testés pendant cette revue.

La modification locale antérieure de `src/lib/request.ts` a été lue pour comprendre les tests : son exception est limitée au développement et aux hôtes loopback. Elle n’a pas été changée pendant cette revue. Aucun push effectué.


## Test réel Cloudflare après configuration

Appels effectués via la route du serveur de développement avec un compte temporaire et trois références publiques. Le premier passage a révélé un dépassement de 25 secondes pour vin → plat. Ajout de `chat_template_kwargs.enable_thinking=false` ; nouveau passage : plat → vins HTTP 200 en 3,9 s ; Riesling → trois plats HTTP 200 en 4,3 s ; vin absent → demande de précision sans proposition HTTP 200 en 1,2 s. Les identifiants proposés appartiennent au compte de test. Compte temporaire supprimé ; quota personnel du compte utilisateur non consommé, quota global et allocation Cloudflare utilisés par les tests. TypeScript et diff-check passent après correction. Le statut Workers Free du compte et les variables Vercel restent à vérifier avant déploiement. Aucun push.
