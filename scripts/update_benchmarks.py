#!/usr/bin/env python3
"""Refresh the static LLM benchmark snapshot from OpenRouter's public catalog."""

from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


MODELS_URL = "https://openrouter.ai/api/v1/models"
BENCHMARK_URL = "https://artificialanalysis.ai/leaderboards/models"
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "site" / "data" / "llm-benchmarks.json"
METRIC_KEYS = {
    "intelligence": "intelligence_index",
    "coding": "coding_index",
    "agentic": "agentic_index",
}


def fetch_models() -> dict:
    request = Request(MODELS_URL, headers={
        "Accept": "application/json",
        "User-Agent": "github-bench/1.0",
    })
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenRouter returned HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"OpenRouter request failed: {error.reason}") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise RuntimeError("OpenRouter response did not contain a model list.")
    return payload


def finite_number(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number >= 0 else None


def normalize_model(model: dict) -> dict | None:
    model_id = model.get("id")
    if not isinstance(model_id, str) or "/" not in model_id:
        return None
    metrics = (model.get("benchmarks") or {}).get("artificial_analysis") or {}
    intelligence = finite_number(metrics.get("intelligence_index"))
    if intelligence is None:
        return None

    provider, _, _ = model_id.partition("/")
    raw_name = model.get("name") or model_id
    provider_name, separator, display_name = raw_name.partition(": ")
    if not separator:
        provider_name = provider.replace("-", " ").title()
        display_name = raw_name
    pricing = model.get("pricing") or {}
    top_provider = model.get("top_provider") or {}
    context_tokens = finite_number(top_provider.get("context_length")) or finite_number(model.get("context_length"))
    return {
        "id": model_id,
        "name": display_name,
        "provider": provider,
        "providerName": provider_name,
        "url": f"https://openrouter.ai/{model_id}",
        "indices": {
            key: finite_number(metrics.get(source_key))
            for key, source_key in METRIC_KEYS.items()
        },
        "contextTokens": context_tokens,
        "inputPricePerMillionUsd": finite_number(pricing.get("prompt")) * 1_000_000
            if finite_number(pricing.get("prompt")) is not None else None,
        "outputPricePerMillionUsd": finite_number(pricing.get("completion")) * 1_000_000
            if finite_number(pricing.get("completion")) is not None else None,
        "toolCallingSupported": "tools" in (model.get("supported_parameters") or []),
    }


def build_snapshot(payload: dict, generated_at: datetime | None = None, limit: int = 16) -> dict:
    if limit < 1 or limit > 100:
        raise ValueError("limit must be between 1 and 100")
    entries = payload.get("data")
    if not isinstance(entries, list):
        raise RuntimeError("OpenRouter response did not contain a model list.")

    best_by_provider: dict[str, dict] = {}
    for model in entries:
        if not isinstance(model, dict):
            continue
        model_id = model.get("id", "")
        if model_id.rsplit("/", 1)[-1].endswith((":batch", ":free")):
            continue
        candidate = normalize_model(model)
        if candidate is None:
            continue
        previous = best_by_provider.get(candidate["provider"])
        if previous is None or candidate["indices"]["intelligence"] > previous["indices"]["intelligence"]:
            best_by_provider[candidate["provider"]] = candidate

    selected = sorted(
        best_by_provider.values(),
        key=lambda model: model["indices"]["intelligence"],
        reverse=True,
    )[:limit]
    if not selected:
        raise RuntimeError("No models with an Artificial Analysis intelligence index were found.")

    timestamp = (generated_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    return {
        "schemaVersion": 1,
        "generatedAt": timestamp.isoformat().replace("+00:00", "Z"),
        "modelCount": len(selected),
        "benchmarkSource": {
            "name": "Artificial Analysis",
            "url": BENCHMARK_URL,
            "via": "OpenRouter model metadata",
            "catalogUrl": MODELS_URL,
        },
        "models": selected,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=16, help="Maximum number of providers to include (1-100).")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output JSON path.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        snapshot = build_snapshot(fetch_models(), limit=args.limit)
    except (RuntimeError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {snapshot['modelCount']} providers to {args.output} ({snapshot['generatedAt']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
