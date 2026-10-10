import assert from "node:assert/strict";
import { cleanImportedRow } from "../src/lib/clean-import-row.ts";

const base = { source: "Feuil1 · ligne 2", category: "Vins Rouge", region: "Bordeaux",
  appellation: "", domaine: "", vintage: "", quantity: "1", cuvee: "",
  purchasePrice: "", movementDate: "", comment: "", warnings: [] };

const bordeaux = cleanImportedRow({ ...base, source: "Vin rouge · ligne 21",
  domaine: "Saint-Estèphe- château Haut-Marbuzet", comment: "Libellé source : Saint-Estèphe- château Haut-Marbuzet",
  baseComment: "Libellé source : Saint-Estèphe- château Haut-Marbuzet",
  warnings: ["Appellation non identifiable dans le libellé : à compléter."] });
assert.equal(bordeaux.appellation, "Saint-Estèphe");
assert.equal(bordeaux.domaine, "château Haut-Marbuzet");
assert.equal(bordeaux.comment, "");
assert.deepEqual(bordeaux.warnings, []);

const champagne = cleanImportedRow({ ...base, category: "Champagnes", appellation: "Champagne",
  domaine: "Fay-Berjot", cuvee: "Millésime 2013",
  comment: "Libellé source : Fay-Berjot - Millésime 2013", baseComment: "Libellé source : Fay-Berjot - Millésime 2013",
  warnings: ["Millésime à renseigner : année sur 4 chiffres, ou 0000 si inconnu."] });
assert.equal(champagne.vintage, "2013");
assert.equal(champagne.cuvee, "Millésime 2013");
assert.equal(champagne.comment, "");
assert.deepEqual(champagne.warnings, []);

const trueComment = cleanImportedRow({ ...base, appellation: "Pomerol", domaine: "Château QA",
  comment: "À boire en 2028 · Libellé source : Pomerol - Château QA · Casier : A4",
  baseComment: "À boire en 2028 · Libellé source : Pomerol - Château QA", unknownFields: { Casier: "A4" } });
assert.equal(trueComment.comment, "À boire en 2028");
assert.equal(trueComment.unknownFields.Casier, "A4");
assert.equal(trueComment.rawLabel, "Pomerol - Château QA");

console.log("OK : les anciens aperçus gardent les vrais commentaires et corrigent les deux exemples signalés.");
