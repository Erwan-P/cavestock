# Configuration des recommandations — Cloudflare Workers AI

Le site Next.js reste sur son hébergement actuel : pas de transfert de domaine ni de déploiement de Worker nécessaire. Appel REST privé depuis le serveur.

## Configuration

1. Créer un compte Cloudflare ou ouvrir https://dash.cloudflare.com/ ; rester sur **Workers Free**. Ne pas activer Workers Paid, ni crédits AI Gateway. Le plafond gratuit de 10 000 neurones/jour est partagé par le compte, pas par utilisateur.
2. Ouvrir **Workers AI**, puis **Use REST API**, puis **Create a Workers AI API Token**. Utiliser un jeton limité au compte concerné avec Workers AI Read et Edit, pas une Global API Key. Copier le Account ID et le jeton.
3. Remplir les lignes déjà ajoutées dans `.env.local` à la racine :

```dotenv
CLOUDFLARE_ACCOUNT_ID="identifiant_de_compte_32_caracteres_hexadecimaux"
CLOUDFLARE_API_TOKEN="jeton_prive_workers_ai"
```

Ne pas communiquer le jeton dans le chat ; le saisir directement dans ce fichier ignoré par Git. Aucun préfixe NEXT_PUBLIC_. Redémarrer le serveur après configuration. Les anciennes variables GEMINI ne sont plus utilisées ; elles peuvent être retirées et la clé Google révoquée si elle ne sert pas ailleurs.

4. Avant publication, reporter ces deux variables dans les variables privées **Production** du projet Vercel, puis redéployer. Vérifier auparavant que le compte Cloudflare est bien **Workers Free** : le code ne change pas d’abonnement et ne peut pas empêcher la facturation si le propriétaire passe ultérieurement le compte en Paid.
5. Réaliser un test réel avec un plat, un nom de vin et une demande ambiguë. Vérifier la qualité des réponses, l’usage en neurones et les erreurs de quota dans Cloudflare. Sans credentials, seule la recherche IA est indisponible ; le dé et le reste de la cave fonctionnent.

## Fonctionnement et limites

Modèle fixé côté serveur : `@cf/google/gemma-4-26b-a4b-it`, hébergé par Cloudflare, licence Apache 2.0. Aucun repli Gemini ou modèle payant. Réponse JSON validée côté serveur, identifiants obligatoirement issus de la cave, stock et propriété revérifiés. Délai fournisseur de 25 secondes, aucune relance automatique et aucune modification de stock par l’IA.

3 tentatives par compte et 100 au total par jour UTC. Les appels refusés après réservation comptent. Une cave vide ou une configuration absente/invalide ne consomme pas de tentative. Le plafond Cloudflare peut être atteint avant ces 100 tentatives : 10 000 neurones ne correspondent pas à un nombre fixe de recherches.

Au plus 120 références et environ 48 000 caractères de candidats, avec au plus 1 500 tokens de sortie. La sélection partielle est signalée. Aucun champ de coordonnées, prix, quantités ou commentaires de cave n’est envoyé automatiquement. La demande libre est transmise ; ne pas y saisir de données sensibles. Pas de recherche web ni de lien d’achat dans cette version.

Cloudflare indique ne pas entraîner ses modèles sur les contenus Workers AI et ne pas conserver les contenus d’inférence standard au-delà du traitement, sous exceptions précisées dans sa politique. Appels directs sans AI Gateway, sans stockage de réponse demandé ; pas de demandes/réponses dans les logs applicatifs.

## Vérifications

Après un build : `node scripts/qa-recommendations.mjs` lance un serveur de production local temporaire avec Cloudflare simulé, faux jeton et secret de session dédié. Aucun appel fournisseur réel. Authentification, origine, quotas concurrents/global, champs transmis, réponses invalides, stock changé et sélection partielle sont testés. Les fixtures sont supprimées en fin de test.

Les catégories supprimées (vins et mouvements liés inclus) ne sont pas restaurées par un retour du code Git. Aucun push ni déploiement autorisé pour le moment.

## Sources vérifiées le 4 novembre 2026

- https://developers.cloudflare.com/workers-ai/platform/pricing/
- https://developers.cloudflare.com/workers-ai/platform/data-usage/
- https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/
- https://www.cloudflare.com/service-specific-terms-developer-platform/
- https://ai.google.dev/gemma/apache_2
