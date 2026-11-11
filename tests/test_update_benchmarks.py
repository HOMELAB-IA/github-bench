import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import update_benchmarks


def model(model_id, name, intelligence, coding=None, prompt="0.000002", tools=True):
    return {
        "id": model_id,
        "name": name,
        "context_length": 128000,
        "top_provider": {"context_length": 100000},
        "pricing": {"prompt": prompt, "completion": "0.00001"},
        "supported_parameters": ["tools"] if tools else [],
        "benchmarks": {
            "artificial_analysis": {
                "intelligence_index": intelligence,
                "coding_index": coding,
                "agentic_index": None,
            }
        },
    }


class BenchmarkSnapshotTests(unittest.TestCase):
    def test_selects_best_scored_model_per_provider_and_keeps_missing_metrics_null(self):
        payload = {
            "data": [
                model("alpha/old", "Alpha: Older", 40),
                model("alpha/new", "Alpha: Newer", 50, coding=70),
                model("alpha/new:batch", "Alpha: Newer batch", 99),
                model("beta/model", "Beta: Model", 42, prompt="0.000001", tools=False),
                model("gamma/unscored", "Gamma: Unscored", None),
            ]
        }
        timestamp = datetime(2026, 11, 11, tzinfo=timezone.utc)

        snapshot = update_benchmarks.build_snapshot(payload, generated_at=timestamp)

        self.assertEqual([entry["id"] for entry in snapshot["models"]], ["alpha/new", "beta/model"])
        self.assertEqual(snapshot["models"][0]["indices"]["coding"], 70)
        self.assertIsNone(snapshot["models"][0]["indices"]["agentic"])
        self.assertEqual(snapshot["models"][0]["inputPricePerMillionUsd"], 2.0)
        self.assertFalse(snapshot["models"][1]["toolCallingSupported"])
        self.assertEqual(snapshot["generatedAt"], "2026-11-11T00:00:00Z")

    def test_rejects_empty_or_invalid_snapshots(self):
        with self.assertRaisesRegex(RuntimeError, "No models"):
            update_benchmarks.build_snapshot({"data": []})
        with self.assertRaisesRegex(ValueError, "between 1 and 100"):
            update_benchmarks.build_snapshot({"data": []}, limit=101)


if __name__ == "__main__":
    unittest.main()
