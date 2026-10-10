import unittest
import base64
from unittest.mock import patch

from import_worker import apply_reviews, harmonize_repeated_labels, parse_local, process_job


class ImportWorkerTest(unittest.TestCase):
    def test_existing_parser_is_used_and_unsupported_ai_values_are_rejected(self):
        content = ("Appellation;Domaine;Millésime;Quantité;Cuvée\n"
                   "Condrieu;Domaine Exemple;2022;2;Les Terrasses\n").encode("utf-8")
        analysis = parse_local(content, "test.csv")
        self.assertEqual(len(analysis["rows"]), 1)
        row = analysis["rows"][0]
        self.assertEqual(row["appellation"], "Condrieu")
        original_quantity = row["quantity"]
        apply_reviews(analysis["rows"], {"reviews": [{"source": row["source"], "fields": {
            "cuvee": "Les Terrasses", "appellation": "Pomerol", "quantity": "999"
        }, "warnings": []}]})
        self.assertEqual(row["appellation"], "Condrieu")
        self.assertEqual(row["quantity"], original_quantity)
        self.assertTrue(any("écartée" in warning for warning in row["warnings"]))

    def test_absent_source_is_flagged_for_manual_review(self):
        rows = [{"source": "ligne 1", "appellation": "", "domaine": "Domaine Exemple",
                 "cuvee": "", "category": "", "region": "", "comment": ""}]
        apply_reviews(rows, {"reviews": [{"source": "ligne 2", "fields": {"appellation": "Condrieu"}}]})
        self.assertEqual(rows[0]["appellation"], "")
        self.assertTrue(any("non obtenu" in warning for warning in rows[0]["warnings"]))

    def test_review_moves_misclassified_terms_without_losing_them(self):
        rows = [{"source": "Feuil1 - ligne 2", "appellation": "", "domaine": "Condrieu",
                 "cuvee": "Domaine Exemple", "category": "Vins Blanc", "region": "Rhône",
                 "comment": "Libellé source : Condrieu - Domaine Exemple", "warnings": []}]
        apply_reviews(rows, {"reviews": [{"source": rows[0]["source"], "fields": {
            "appellation": "Condrieu", "domaine": "Domaine Exemple", "cuvee": ""
        }, "warnings": []}]})
        self.assertEqual(rows[0]["appellation"], "Condrieu")
        self.assertEqual(rows[0]["domaine"], "Domaine Exemple")
        self.assertEqual(rows[0]["cuvee"], "")

    def test_repeated_label_uses_consensus_when_one_ai_batch_misses_it(self):
        label = "Libellé source : Saint-Estèphe- château Haut-Marbuzet"
        rows = [{"source": "ligne 21", "category": "Vins Rouge", "region": "BORDEAUX",
                 "appellation": "", "domaine": "Saint-Estèphe- château Haut-Marbuzet",
                 "cuvee": "", "comment": label, "warnings": ["Appellation non identifiable dans le libellé : à compléter."]},
                {"source": "ligne 22", "category": "Vins Rouge", "region": "BORDEAUX",
                 "appellation": "Saint-Estèphe", "domaine": "château Haut-Marbuzet",
                 "cuvee": "", "comment": label, "warnings": []}]
        harmonize_repeated_labels(rows)
        self.assertEqual(rows[0]["appellation"], "Saint-Estèphe")
        self.assertEqual(rows[0]["domaine"], "château Haut-Marbuzet")
        self.assertFalse(rows[0]["warnings"])

    def test_pipeline_submits_local_parser_result_after_ai_review(self):
        content = ("Appellation;Domaine;Millésime;Quantité\n"
                   "Condrieu;Domaine Exemple;2022;2\n").encode("utf-8")
        job = {"id": "qa-job", "fileName": "test.csv", "fileBase64": base64.b64encode(content).decode(),
               "lease": "a" * 64}
        submitted = []

        def fake_model(_model, _server, rows, _references):
            return {"reviews": [{"source": rows[0]["source"], "fields": {"appellation": "Pomerol"}, "warnings": []}]}

        def fake_request(_url, **kwargs):
            submitted.append(kwargs["payload"])
            return {"active": True} if kwargs.get("method") == "PATCH" else {"status": "READY"}

        with patch("import_worker.model_response", side_effect=fake_model), \
             patch("import_worker.request_json", side_effect=fake_request):
            process_job(job, site="https://example.invalid", token="x" * 32,
                        model="qa", server="http://127.0.0.1:1234", search_key="")
        self.assertEqual(len(submitted), 2)
        self.assertEqual(submitted[0]["lease"], job["lease"])
        self.assertTrue(submitted[1]["ok"])
        self.assertEqual(submitted[1]["analysis"]["rows"][0]["appellation"], "Condrieu")
        self.assertEqual(submitted[1]["analysis"]["rows"][0]["quantity"], "2")


if __name__ == "__main__":
    unittest.main()
