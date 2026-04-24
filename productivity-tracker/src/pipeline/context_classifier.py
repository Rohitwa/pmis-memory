"""
Context classifier — produces a summary + full text description for a
completed segment.

Primary path: OpenAI gpt-4o-mini synthesis. Falls back to deterministic
template if OpenAI is unreachable or returns empty. Ollama path removed.

No SC/CTX/ANC classification — memory structure forms at nightly consolidation.
"""

import json
import logging
import os
from collections import Counter

import httpx

from src.pipeline.prompts import SEGMENT_SYNTHESIS_PROMPT

logger = logging.getLogger("tracker.context_classifier")


# Medium classification: app-name substring → category. Checked in order;
# first match wins. Keep lowercase; classifier lowercases app name once.
_MEDIUM_RULES: list[tuple[tuple[str, ...], str]] = [
    (("chrome", "safari", "firefox", "arc", "brave", "edge"), "browser"),
    (("terminal", "iterm", "warp", "alacritty", "kitty"), "terminal"),
    (("code", "cursor", "xcode", "idea", "pycharm", "webstorm",
      "vim", "emacs", "zed", "rubymine", "goland", "clion"), "ide"),
    (("slack", "discord", "teams", "telegram", "whatsapp",
      "messages", "signal", "zoom"), "chat"),
    (("word", "excel", "powerpoint", "keynote", "numbers", "pages",
      "notion", "docs", "sheets", "obsidian", "bear"), "office"),
]


class ContextClassifier:
    """Classifies work segments. Default deterministic; LLM behind a flag."""

    def __init__(self, config: dict):
        openai_config = config.get("openai", {})
        self.openai_model = openai_config.get("text_model", "gpt-4o-mini")
        self.openai_timeout = openai_config.get("timeout", 45)
        self.openai_max_tokens = openai_config.get("max_tokens_text", 500)
        # Track B legacy flag retained but hardwired to True (OpenAI-only).
        # If the OpenAI call fails we fall back to _deterministic_synthesis.
        self.use_llm = True

    async def classify_segment(
        self,
        segment_id: str,
        frame_results: list[dict],
        window_info: dict,
        agent_active: bool,
    ) -> dict:
        """
        Produce summary + full text for a completed segment.

        Args:
            segment_id: Target segment ID
            frame_results: List of frame extraction dicts from Context2
            window_info: Window info from the segment
            agent_active: Whether an agent was detected during this segment

        Returns:
            dict with short_title, detailed_summary, full_text, worker, medium
        """
        duration = len(frame_results) * 10  # ~10s per frame

        frame_summaries = []
        for fr in frame_results[:20]:
            frame_summaries.append({
                "frame": fr.get("target_frame_number", "?"),
                "task": fr.get("detailed_summary", fr.get("raw_text", "")[:200]),
                "worker": fr.get("worker_type", "human"),
            })

        prompt = SEGMENT_SYNTHESIS_PROMPT.format(
            segment_id=segment_id,
            duration=duration,
            window_name=window_info.get("title", "Unknown"),
            platform=window_info.get("app_name", "Unknown"),
            agent_active="Yes" if agent_active else "No",
            frame_jsons=json.dumps(frame_summaries, indent=2),
        )

        text = await self._call_openai(prompt)
        if text is not None:
            return self._parse_result(text, agent_active)

        logger.warning("OpenAI text call failed; falling back to deterministic synthesis")
        return self._deterministic_synthesis(frame_results, window_info, agent_active)

    async def _call_openai(self, prompt: str) -> str | None:
        """Call OpenAI chat completion for segment text. Returns None to trigger fallback."""
        if not os.getenv("OPENAI_API_KEY"):
            logger.info("OPENAI_API_KEY not set — skipping OpenAI text")
            return None

        try:
            from openai import AsyncOpenAI
        except ImportError:
            logger.warning("openai package not installed — skipping")
            return None

        try:
            client = AsyncOpenAI(timeout=self.openai_timeout)
            response = await client.chat.completions.create(
                model=self.openai_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=self.openai_max_tokens,
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.warning(f"OpenAI text call failed ({self.openai_model}): {e}")
            return None

    def _parse_result(self, text: str, agent_active: bool) -> dict:
        """Parse JSON from model response."""
        try:
            text = text.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()

            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                text = text[start:end]

            result = json.loads(text)

            if "detailed_summary" not in result:
                result["detailed_summary"] = result.get("summary", "Activity segment")
            if "full_text" not in result:
                result["full_text"] = result.get("detailed_summary", "")
            if "worker" not in result:
                result["worker"] = "agent" if agent_active else "human"
            if "medium" not in result:
                result["medium"] = "other"
            if "short_title" not in result or not result.get("short_title"):
                # Fall back to a truncated detailed_summary so the review UI
                # always has something human-readable to show.
                result["short_title"] = (result["detailed_summary"] or "")[:80]

            return result

        except (json.JSONDecodeError, KeyError, TypeError):
            return {
                "short_title": (text[:80] if text else "Activity"),
                "detailed_summary": text[:200] if text else "Activity segment",
                "full_text": text[:500] if text else "",
                "worker": "agent" if agent_active else "human",
                "medium": "other",
            }

    def _deterministic_synthesis(
        self,
        frame_results: list[dict],
        window_info: dict,
        agent_active: bool,
    ) -> dict:
        """Build the segment result from frame data without any LLM call.

        - worker: majority vote over frame.worker_type (per-frame classification
          already done by the tracker using keyboard/mouse activity), with
          agent_active as the fallback when no frames carry worker_type.
        - medium: rule-based mapping from window_info.app_name to one of
          {browser, terminal, ide, chat, office, other}.
        - tasks: deduped by lowercased 80-char prefix to collapse near-identical
          frame extractions.
        - short_title: the most-frequent task (or window title if no tasks).
        - detailed_summary: window title + top-3 unique tasks, joined.
        - full_text: deduped raw_text concatenation, budget-capped.
        """
        # Worker: per-frame worker_type majority, else agent_active flag.
        workers = [f.get("worker_type") for f in frame_results if f.get("worker_type")]
        if workers:
            worker = Counter(workers).most_common(1)[0][0]
        else:
            worker = "agent" if agent_active else "human"

        # Medium: rule-based app-name mapping.
        medium = _classify_medium(window_info.get("app_name", ""))

        # Task dedup keyed on first-80-chars lowercased.
        tasks_raw = [
            (f.get("detailed_summary") or f.get("task") or "").strip()
            for f in frame_results
        ]
        tasks_raw = [t for t in tasks_raw if t]
        task_counts = Counter(t.lower()[:80] for t in tasks_raw)

        seen: set[str] = set()
        unique_tasks: list[str] = []
        for t in tasks_raw:
            key = t.lower()[:80]
            if key not in seen:
                seen.add(key)
                unique_tasks.append(t)

        window_title = (window_info.get("title") or "Unknown").strip()

        # Short title: most-frequent task (representative form), else window.
        if task_counts:
            top_key = task_counts.most_common(1)[0][0]
            short_title = next(
                (t for t in unique_tasks if t.lower().startswith(top_key[:40])),
                unique_tasks[0],
            )[:80]
        else:
            short_title = (window_title or "Activity")[:80]

        # Detailed summary: window + top-3 unique tasks.
        if unique_tasks:
            top3 = "; ".join(unique_tasks[:3])
            detailed_summary = f"{window_title} — {top3}"[:400]
        else:
            detailed_summary = f"Activity in {window_title}"[:400]

        # Full text: deduped raw_text across frames, budget-capped.
        texts_seen: set[str] = set()
        unique_texts: list[str] = []
        for f in frame_results:
            t = (f.get("raw_text") or "").strip()
            if not t:
                continue
            key = t[:120]
            if key in texts_seen:
                continue
            texts_seen.add(key)
            unique_texts.append(t)
        full_text = " | ".join(unique_texts)[:2000] or detailed_summary

        return {
            "short_title": short_title,
            "detailed_summary": detailed_summary,
            "full_text": full_text,
            "worker": worker,
            "medium": medium,
        }


def _classify_medium(app_name: str) -> str:
    """Map window app_name to one of: browser, terminal, ide, chat, office, other."""
    app = (app_name or "").lower()
    if not app:
        return "other"
    for keywords, category in _MEDIUM_RULES:
        if any(k in app for k in keywords):
            return category
    return "other"
