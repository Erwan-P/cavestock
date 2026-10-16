import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("worker", "scripts/import_worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
row = {field: "" for field in ["category", "region", "appellation", "domaine", "vintage", "quantity", "cuvee", "purchasePrice", "movementDate", "comment"]}
row["source"] = "Feuil1 - ligne 2"
valid = {"rows": [row], "warnings": []}
worker.validate_analysis(valid)
for malformed in [{"rows": [], "warnings": []}, {"rows": [row] * 501, "warnings": []}, {"rows": [dict(row, quantity=2)], "warnings": []}, {"rows": [dict(row, unknownFields={"bad": 1})], "warnings": []}]:
    try:
        worker.validate_analysis(malformed)
        raise AssertionError("Malformed model output accepted")
    except ValueError:
        pass
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / "synthetic-auth.dat"
    with patch.object(worker, "credential_path", return_value=path):
        synthetic = {"access_token": "synthetic-token-never-used", "refresh_token": "synthetic-refresh", "expires_at": 0}
        worker.save_credentials(synthetic)
        assert worker.load_credentials() == synthetic
        if os.name == "nt":
            assert b"synthetic-token-never-used" not in path.read_bytes()
        else:
            assert path.stat().st_mode & 0o777 == 0o600
        worker.save_credentials(dict(synthetic, expires_at=999))
        assert worker.load_credentials()["expires_at"] == 999
        assert len(list(Path(folder).iterdir())) == 1
        for url in ["http://localhost.evil.invalid", "http://127.0.0.1.evil.invalid", "https://user:password@example.invalid", "http://example.invalid"]:
            with patch.dict(os.environ, {"CAVESTOCK_URL": url, "IMPORT_WORKER_TOKEN": "t" * 32}), patch.object(worker, "load_local_config"), patch.object(worker.sys, "argv", ["worker"]), patch.object(worker, "json_request") as network, contextlib.redirect_stderr(io.StringIO()):
                try:
                    worker.main()
                    raise AssertionError("Unsafe endpoint accepted")
                except SystemExit as error:
                    assert error.code == 2
                network.assert_not_called()
print("Worker security: JSON rejection, synthetic DPAPI round-trip, atomic replacement and unsafe URL rejection passed; no real credentials or network used.")
