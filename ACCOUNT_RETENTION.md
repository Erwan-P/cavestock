# Gestion des comptes inactifs

La tâche quotidienne `/api/cron/account-retention` est appelée par Vercel à 09:00 UTC. Elle est protégée par `CRON_SECRET`, à définir dans les variables d'environnement de Vercel. Elle supprime automatiquement les comptes **jamais validés** créés il y a au moins deux mois, ainsi que les jetons et défis expirés. Elle ne supprime **jamais** les comptes validés.

Pour un compte validé, la dernière connexion est inscrite dans `User.lastLoginAt`. Après un an sans connexion, un premier e-mail est envoyé à l'utilisateur et à `CAVESTOCK_CONTACT_EMAIL`. La date de suppression envisagée (`inactivityDueAt`) est fixée six mois après ce premier envoi. Un rappel est adressé aux deux destinataires environ sept jours avant. Toute nouvelle connexion efface l'échéance et les marqueurs d'alerte.

## Suppression manuelle dans Supabase

Après l'échéance, ouvrir le SQL Editor de Supabase et exécuter **uniquement cette consultation** :

```sql
SELECT "id", "email", "lastLoginAt", "inactivityNoticeAt", "inactivityDueAt"
FROM "User"
WHERE "verifiedAt" IS NOT NULL
  AND "inactivityDueAt" IS NOT NULL
  AND "inactivityDueAt" <= now()
ORDER BY "inactivityDueAt";
```

Vérifier individuellement que le compte est toujours présent et que son échéance n'a pas été annulée par une connexion. Si la suppression est décidée, supprimer **la ligne exacte de ce compte** dans le Table Editor Supabase. Les relations Prisma en cascade effacent les catégories, vins, mouvements, sessions, transferts et jetons associés de la base active. Ne jamais supprimer un compte à partir d'un ancien e-mail : la base actuelle fait foi.

Une suppression de la base active ne purge pas les éventuelles sauvegardes techniques Supabase, les journaux des prestataires ni les messages déjà transmis par e-mail. Un ancien fichier de sauvegarde MySQL existe aussi dans le dossier local `backups` : le vérifier et le traiter séparément avant d'affirmer qu'aucune copie historique ne subsiste.

## Mise en production

1. Appliquer la migration Prisma `20261006000000_account_retention` à Supabase **avant** de déployer le code qui lit les nouveaux champs.
2. Définir `CRON_SECRET` (chaîne aléatoire d'au moins 16 caractères) dans Vercel, avec `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `CAVESTOCK_CONTACT_EMAIL` et `CAVESTOCK_SITE_URL` déjà requis.
3. Vérifier dans Vercel > Settings > Cron Jobs que la tâche apparaît, puis contrôler son premier résultat. Un échec d'envoi est signalé par une réponse 503 et doit être corrigé.
