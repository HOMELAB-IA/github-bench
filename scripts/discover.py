#!/usr/bin/env python3
"""Generate review-only GitHub repository candidates for the catalog."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


CATEGORIES = {
    "ai": ["topic:claude-code", "topic:agent-skills", "topic:mcp-server", "topic:ai-tools"],
    "home-assistant": ["topic:home-assistant", "home-assistant in:description"],
    "french-tech": ["topic:france", "topic:french"],
}
GROWTH_TOPICS = ["topic:claude-code", "topic:agent-skills", "topic:mcp-server", "topic:ai-tools"]
GROWTH_WINDOW_DAYS = 90


def build_queries(category: str, topic: str = "", today: date | None = None) -> list[str]:
    if category == "tools-growth":
        cutoff = (today or date.today()) - timedelta(days=GROWTH_WINDOW_DAYS)
        base_queries = build_queries("ai", topic) if topic.strip() else GROWTH_TOPICS
        return [f"{query} created:>={cutoff.isoformat()} stars:>50" for query in base_queries]
    if topic.strip():
        cleaned_topic = topic.strip()
        parsed_topic = urlparse(cleaned_topic)
        if parsed_topic.scheme == "https" and parsed_topic.netloc == "github.com":
            parts = [part for part in parsed_topic.path.split("/") if part]
            if len(parts) >= 2:
                return [f"repo:{parts[0]}/{parts[1]}"]
        if re.search(r"\b(?:topic|language|repo|stars|pushed|created):", cleaned_topic):
            return [cleaned_topic]

        terms = [term.strip() for term in re.split(r"\s+(?:and|et)\s+|[,;|]", cleaned_topic, flags=re.IGNORECASE) if term.strip()]
        queries: list[str] = []
        for term in terms:
            normalized = term.casefold().replace("-", " ")
            if "claude" in normalized and "code" in normalized:
                queries.append("topic:claude-code")
            if "skill" in normalized:
                queries.append("topic:agent-skills")
            if "tool" in normalized:
                queries.append("topic:ai-tools")
            if "mcp" in normalized:
                queries.append("topic:mcp-server")
            if "home assistant" in normalized:
                queries.append("topic:home-assistant")
            if not any(term in normalized for term in ("claude", "skill", "tool", "mcp", "home assistant")):
                queries.append(f'"{term}" in:name,description,readme')
        return list(dict.fromkeys(queries))
    if category == "trending":
        cutoff = (today or date.today()) - timedelta(days=14)
        return [f"stars:>50 pushed:>={cutoff.isoformat()}"]
    if category == "all":
        return CATEGORIES["ai"] + CATEGORIES["home-assistant"] + build_queries("trending", today=today)
    if category not in CATEGORIES:
        raise ValueError(f"Unknown category: {category}")
    return CATEGORIES[category]


def search_repositories(query: str, token: str = "") -> list[dict]:
    url = "https://api.github.com/search/repositories?" + urlencode({
        "q": query,
        "sort": "updated" if "pushed:" in query else "stars",
        "order": "desc",
        "per_page": 100,
    })
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "github-bench-discovery",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(url, headers=headers)
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API returned HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"GitHub API request failed: {error.reason}") from error
    items = payload.get("items")
    if not isinstance(items, list):
        raise RuntimeError("GitHub API response did not contain an items list.")
    return items


def normalize_repository(
    repository: dict,
    query: str,
    discovered_at: str,
    today: date | None = None,
    growth_window_days: int | None = None,
) -> dict:
    license_info = repository.get("license") or {}
    normalized = {
        "repository": repository.get("full_name", ""),
        "url": repository.get("html_url", ""),
        "description": repository.get("description") or "",
        "language": repository.get("language"),
        "topics": repository.get("topics") or [],
        "stars": repository.get("stargazers_count", 0),
        "forks": repository.get("forks_count", 0),
        "createdAt": repository.get("created_at"),
        "license": license_info.get("spdx_id"),
        "pushedAt": repository.get("pushed_at"),
        "archived": bool(repository.get("archived")),
        "sourceQuery": query,
        "discoveredAt": discovered_at,
        "reviewStatus": "needs-review",
    }
    if growth_window_days is not None:
        created_at = repository.get("created_at")
        try:
            created_date = date.fromisoformat(created_at[:10])
        except (TypeError, ValueError):
            return normalized
        age_days = max(((today or date.today()) - created_date).days, 1)
        normalized["ageDays"] = age_days
        normalized["growthStarsPerDay"] = round(normalized["stars"] / age_days, 1)
        normalized["growthMethod"] = "stars since creation / days since creation"
        normalized["growthWindowDays"] = growth_window_days
    return normalized


def discover(category: str, topic: str, limit: int, token: str, today: date | None = None) -> dict:
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")
    if category not in ("all", "trending", "tools-growth") and category not in CATEGORIES:
        raise ValueError(f"Unknown category: {category}")
    discovered_at = datetime.now(timezone.utc).isoformat()
    discovered_by_query: list[list[dict]] = []
    for query in build_queries(category, topic, today):
        query_candidates: list[dict] = []
        for repository in search_repositories(query, token):
            full_name = repository.get("full_name")
            if not full_name or repository.get("fork") or repository.get("archived"):
                continue
            query_candidates.append(normalize_repository(
                repository,
                query,
                discovered_at,
                today=today,
                growth_window_days=GROWTH_WINDOW_DAYS if category == "tools-growth" else None,
            ))
            if len(query_candidates) >= limit:
                break
        discovered_by_query.append(query_candidates)

    candidates: list[dict] = []
    seen: set[str] = set()
    for offset in range(limit):
        for query_candidates in discovered_by_query:
            if offset >= len(query_candidates):
                continue
            candidate = query_candidates[offset]
            if candidate["repository"] in seen:
                continue
            seen.add(candidate["repository"])
            candidates.append(candidate)
            if len(candidates) >= limit:
                break
        if len(candidates) >= limit:
            break
    if category == "tools-growth":
        candidates.sort(key=lambda candidate: candidate.get("growthStarsPerDay", 0), reverse=True)
    return {
        "schemaVersion": 1,
        "generatedAt": discovered_at,
        "category": category,
        "topic": topic.strip() or None,
        "reviewRequired": True,
        "candidates": candidates,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--category",
        choices=("all", "ai", "home-assistant", "trending", "tools-growth", "french-tech"),
        required=True,
    )
    parser.add_argument("--topic", default="", help="Optional free-text topic for a focused GitHub search.")
    parser.add_argument("--limit", type=int, default=20, help="Maximum number of unique candidates (1-100).")
    parser.add_argument("--output", type=Path, required=True, help="Path for the review-only JSON output.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        results = discover(args.category, args.topic, args.limit, os.environ.get("GITHUB_TOKEN", ""))
    except (RuntimeError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(results['candidates'])} review-only candidates to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
