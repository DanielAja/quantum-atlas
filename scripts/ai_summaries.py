#!/usr/bin/env python3
"""OPTIONAL: add AI-written plain-language summaries with Claude.

Off by default. It only runs when the ANTHROPIC_API_KEY environment variable
(a GitHub Actions secret) is set; otherwise it exits straight away and the
site keeps using the rule-based summaries from update.py.

  pip install anthropic
  ANTHROPIC_API_KEY=... python3 scripts/ai_summaries.py [--max 40]

Settings (environment variables):
  AI_MODEL      model id, default claude-opus-5-5 (claude-haiku-5-5 is much cheaper)
  AI_MAX        papers per run, default 40 (newest first, each paper is done once)

Results are cached in cache/ai-summaries.json and picked up by update.py.
"""
import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARCHIVE = os.path.join(ROOT, "cache", "papers-archive.json")
AI_CACHE = os.path.join(ROOT, "cache", "ai-summaries.json")

SCHEMA = {
    "type": "object",
    "properties": {
        "tldr": {"type": "string", "description": "One sentence, under 30 words, no jargon."},
        "plain": {"type": "string", "description": "3-4 short sentences a curious teenager could follow."},
        "claims": {"type": "array", "items": {"type": "string"}, "description": "2-4 main claims, each one plain sentence."},
        "why": {"type": "string", "description": "One sentence on why it matters."},
    },
    "required": ["tldr", "plain", "claims", "why"],
    "additionalProperties": False,
}

PROMPT = """You explain brand-new physics papers to curious non-experts.
Write warmly and simply. Short sentences. Explain any technical word in a few plain words.
Stay faithful to the abstract: do not add results it does not state, and keep hedges ("suggest", "propose").

Title: {title}

Abstract: {abstract}"""


def main():
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        print("No ANTHROPIC_API_KEY set: skipping AI summaries (this is fine).")
        return
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=int(os.environ.get("AI_MAX", "40")))
    args = ap.parse_args()
    model = os.environ.get("AI_MODEL", "claude-opus-5-5")

    import anthropic  # only needed when the feature is on

    client = anthropic.Anthropic(api_key=key)
    try:
        papers = json.load(open(ARCHIVE))
    except FileNotFoundError:
        print("Run update.py first.")
        return
    try:
        cache = json.load(open(AI_CACHE))
    except (FileNotFoundError, json.JSONDecodeError):
        cache = {}
    todo = [p for p in sorted(papers, key=lambda p: p["published"], reverse=True) if p["id"] not in cache][: args.max]
    print(f"AI summaries: {len(todo)} papers with {model}")
    for p in todo:
        try:
            msg = client.messages.create(
                model=model,
                max_tokens=1500,
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[{"role": "user", "content": PROMPT.format(title=p["title"], abstract=p["abstract"])}],
            )
        except anthropic.RateLimitError:
            print("  rate limited; stopping for this run")
            break
        except anthropic.APIStatusError as e:
            print(f"  {p['id']}: API error {e.status_code}; skipping")
            continue
        except anthropic.APIConnectionError:
            print("  connection problem; stopping for this run")
            break
        if msg.stop_reason != "end_turn":
            print(f"  {p['id']}: stopped ({msg.stop_reason}); skipping")
            continue
        text = "".join(b.text for b in msg.content if b.type == "text")
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        data["model"] = model
        cache[p["id"]] = data
        print(f"  {p['id']} ok")
    os.makedirs(os.path.dirname(AI_CACHE), exist_ok=True)
    with open(AI_CACHE, "w") as f:
        json.dump(cache, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    sys.exit(main())
