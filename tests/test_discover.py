import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import discover


class DiscoveryTests(unittest.TestCase):
    def test_build_queries_supports_categories_and_custom_topic(self):
        self.assertIn("topic:claude-code", discover.build_queries("ai"))
        self.assertIn("topic:ai-tools", discover.build_queries("ai"))
        self.assertIn("topic:home-assistant", discover.build_queries("home-assistant"))
        self.assertEqual(
            discover.build_queries("trending", today=date(2026, 11, 11)),
            ["stars:>50 pushed:>=2026-10-28"],
        )
        self.assertEqual(
            discover.build_queries("ai", "  local voice assistant  "),
            ['"local voice assistant" in:name,description,readme'],
        )
        self.assertEqual(
            discover.build_queries("ai", "Claude Code skills et MCP"),
            ["topic:claude-code", "topic:agent-skills", "topic:mcp-server"],
        )
        self.assertEqual(
            discover.build_queries("ai", "OpenAI coding tools"),
            ["topic:ai-tools"],
        )
        self.assertEqual(
            discover.build_queries("ai", "https://github.com/owner/repository"),
            ["repo:owner/repository"],
        )
        self.assertEqual(
            discover.build_queries("french-tech"),
            ["topic:france", "topic:french"],
        )
        self.assertEqual(
            discover.build_queries("tools-growth", today=date(2026, 11, 11)),
            [
                "topic:claude-code created:>=2026-08-13 stars:>50",
                "topic:agent-skills created:>=2026-08-13 stars:>50",
                "topic:mcp-server created:>=2026-08-13 stars:>50",
                "topic:ai-tools created:>=2026-08-13 stars:>50",
            ],
        )

    def test_candidates_are_deduplicated_and_never_receive_editorial_scores(self):
        repository = {
            "full_name": "example/project",
            "html_url": "https://github.com/example/project",
            "description": "A test project",
            "topics": ["mcp"],
            "stargazers_count": 42,
            "forks_count": 3,
            "license": {"spdx_id": "MIT"},
            "pushed_at": "2026-11-10T12:00:00Z",
        }
        with patch.object(discover, "search_repositories", return_value=[repository]) as search:
            result = discover.discover("ai", "", 10, "token")

        self.assertEqual(len(result["candidates"]), 1)
        self.assertEqual(search.call_count, len(discover.build_queries("ai")))
        candidate = result["candidates"][0]
        self.assertEqual(candidate["reviewStatus"], "needs-review")
        self.assertNotIn("score", candidate)
        self.assertNotIn("image", candidate)

    def test_growth_candidates_are_ranked_by_stars_per_day(self):
        def result(name, stars, created_at):
            return {
                "full_name": name,
                "html_url": f"https://github.com/{name}",
                "stargazers_count": stars,
                "created_at": created_at,
            }

        repositories = [
            result("example/older", 500, "2026-09-01T00:00:00Z"),
            result("example/newer", 100, "2026-11-01T00:00:00Z"),
        ]
        with patch.object(discover, "search_repositories", return_value=repositories):
            result_set = discover.discover("tools-growth", "", 2, "", today=date(2026, 11, 11))

        candidates = result_set["candidates"]
        self.assertEqual([item["repository"] for item in candidates], ["example/newer", "example/older"])
        self.assertEqual(candidates[0]["growthStarsPerDay"], 10)
        self.assertEqual(candidates[0]["ageDays"], 10)
        self.assertEqual(candidates[0]["growthWindowDays"], 90)
        self.assertEqual(candidates[0]["reviewStatus"], "needs-review")

    def test_multi_topic_search_interleaves_results_and_deduplicates(self):
        def result(name):
            return {"full_name": name, "html_url": f"https://github.com/{name}"}

        def search_for_query(query, _token):
            return [result("example/shared"), result(f"example/{query.split(':')[-1]}")]

        with patch.object(discover, "search_repositories", side_effect=search_for_query):
            results = discover.discover("ai", "Claude Code et MCP", 3, "")

        self.assertEqual(len(results["candidates"]), 3)
        self.assertEqual(results["candidates"][0]["repository"], "example/shared")
        self.assertEqual(results["candidates"][1]["sourceQuery"], "topic:claude-code")
        self.assertEqual(results["candidates"][2]["sourceQuery"], "topic:mcp-server")

    def test_invalid_limit_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "between 1 and 100"):
            discover.discover("ai", "", 101, "")


if __name__ == "__main__":
    unittest.main()
