import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const apply = process.argv.includes("--apply");
const sourceEngine = process.argv.includes("--source=postgres") ? "postgres" : "mysql";
if (sourceEngine === "mysql" && !process.env.MYSQL_SOURCE_URL?.startsWith("mysql://")) throw new Error("MYSQL_SOURCE_URL doit désigner la base MySQL source.");
if (sourceEngine === "postgres" && !process.env.MIGRATION_TARGET_URL) throw new Error("MIGRATION_TARGET_URL est requis pour copier PostgreSQL vers Supabase.");
const targetUrl = process.env.MIGRATION_TARGET_URL || process.env.DIRECT_URL;
if (!targetUrl || !/^postgres(?:ql)?:\/\//.test(targetUrl)) throw new Error("DIRECT_URL ou MIGRATION_TARGET_URL PostgreSQL requis.");
const SourceClient = sourceEngine === "mysql" ? (await import("../src/generated/mysql/index.js")).PrismaClient : PrismaClient;
const source = new SourceClient({ datasourceUrl: sourceEngine === "mysql" ? process.env.MYSQL_SOURCE_URL : process.env.DATABASE_URL });
const target = new PrismaClient({ datasourceUrl: targetUrl });
const models = ["user", "category", "wine", "stockMovement", "dataTransfer", "emailVerificationToken"];
const allTargetModels = [...models, "passwordResetToken", "session", "captchaChallenge", "requestRateLimit"];
function plain(rows) { return JSON.parse(JSON.stringify(rows)); }
function canonical(rows) {
  return JSON.stringify(plain(rows).sort((a, b) => a.id.localeCompare(b.id)).map(row =>
    Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)))));
}
try {
  const snapshot = await source.$transaction(async (tx) => {
    const result = {};
    for (const model of models) result[model] = plain(await tx[model].findMany({ orderBy: { id: "asc" } }));
    return result;
  }, { isolationLevel: "RepeatableRead", timeout: 120_000 });
  const counts = Object.fromEntries(models.map(model => [model, snapshot[model].length]));
  console.log(`Source ${sourceEngine} (lignes uniquement) :`, counts);
  if (!apply) {
    console.log("Aucune écriture. Arrêtez les écritures de l'application source puis relancez avec --apply.");
  } else {
    // Sauvegarde locale sensible (hachages de mots de passe), exclue de Git.
    const directory = resolve("backups");
    await mkdir(directory, { recursive: true });
    const file = resolve(directory, `${sourceEngine}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(file, JSON.stringify({ format: 1, createdAt: new Date().toISOString(), tables: snapshot }), { flag: "wx", mode: 0o600 });
    await target.$transaction(async (tx) => {
      // Sérialise les exécutions de cet outil et exige une cible vide.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(731904227)`;
      for (const model of allTargetModels) {
        if (await tx[model].count()) throw new Error(`La cible contient déjà des données (${model}). Rien n'a été importé.`);
      }
      for (const model of models) {
        const rows = snapshot[model];
        for (let offset = 0; offset < rows.length; offset += 200) {
          await tx[model].createMany({ data: rows.slice(offset, offset + 200) });
        }
      }
      for (const model of models) {
        assert.equal(canonical(await tx[model].findMany()), canonical(snapshot[model]), `Différence de données : ${model}`);
      }
    }, { timeout: 120_000, maxWait: 10_000 });
    console.log("Migration validée : toutes les valeurs copiées sont identiques à la source.");
    console.log("Sauvegarde :", file);
    console.log("Les sessions/CAPTCHA/liens de réinitialisation ne sont pas transférés. Reconnectez-vous. La base source est inchangée.");
  }
} catch (error) {
  console.error("Migration interrompue :", error?.name, error?.code || "", error?.message?.startsWith("La cible") ? error.message : "Vérifiez la connexion, les migrations et les contraintes. Aucune donnée de la source n'a été modifiée.");
  process.exitCode = 1;
} finally { await Promise.all([source.$disconnect(), target.$disconnect()]); }
