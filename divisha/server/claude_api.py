"""claude_api.py — the only place the server talks to Claude.

The app sends the same conversation it sends on claude.ai: a list of
user/assistant turns, plus up to five pictures with the newest message. This
streams Claude's reply back as text, piece by piece.

Model: Claude Opus 5.5. Effort is low for chat replies and medium for the
Time-based analysis notes (the app asks for those as JSON). If a safety check
declines a request, the API retries it on another model by itself
(server-side fallback, "default" mode).
"""

from __future__ import annotations

import base64
import logging
import os
from typing import AsyncIterator

import anthropic

log = logging.getLogger("divisha.claude")

MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5-5")
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGES = 5
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_PROMPT_BYTES = 262144

JSON_NOTE = "Your reply will be read by a program. Reply with only the JSON value that was asked for."

_client: anthropic.AsyncAnthropic | None = None


def configured() -> bool:
    """True when the server has an Anthropic API key (its value is never shown)."""
    return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())


def client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(max_retries=2, timeout=300.0)   # key from ANTHROPIC_API_KEY
    return _client


class ClaudeError(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def build_messages(turns: list[dict], images: list[dict]) -> list[dict]:
    """Merge same-role turns, start and end on the parent, and put pictures with the last message."""
    merged: list[dict] = []
    for t in turns:
        role, text = t.get("role"), str(t.get("content") or "").strip()
        if role not in ("user", "assistant") or not text:
            continue
        if merged and merged[-1]["role"] == role:
            merged[-1]["content"] += "\n\n" + text
        else:
            merged.append({"role": role, "content": text})
    while merged and merged[0]["role"] != "user":
        merged.pop(0)
    while merged and merged[-1]["role"] != "user":
        merged.pop()
    if not merged:
        raise ClaudeError("invalid_request", "nothing to send")
    if sum(len(m["content"].encode()) for m in merged) > MAX_PROMPT_BYTES:
        raise ClaudeError("prompt_too_large")

    if images:
        if len(images) > MAX_IMAGES:
            raise ClaudeError("image_rejected", f"at most {MAX_IMAGES} pictures")
        blocks = []
        for img in images:
            media_type, data = img.get("type"), img.get("data") or ""
            if media_type not in IMAGE_TYPES:
                raise ClaudeError("image_rejected", "pictures must be JPEG, PNG, WebP or GIF")
            try:
                raw = base64.b64decode(data, validate=True)
            except ValueError:
                raise ClaudeError("image_rejected", "picture data isn't valid")
            if len(raw) > MAX_IMAGE_BYTES:
                raise ClaudeError("image_rejected", "a picture is too large")
            blocks.append({"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}})
        last = merged[-1]
        last["content"] = [*blocks, {"type": "text", "text": last["content"]}]
    return merged


async def _stream(messages: list[dict], as_json: bool, with_fallback: bool) -> AsyncIterator[dict]:
    extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"} if with_fallback else {}
    async with client().beta.messages.stream(
        model=MODEL,
        max_tokens=16000,
        output_config={"effort": "medium" if as_json else "low"},
        **({"system": JSON_NOTE} if as_json else {}),
        messages=messages,
        **extra,
    ) as stream:
        async for piece in stream.text_stream:
            yield {"text": piece}
        final = await stream.get_final_message()
    if final.stop_reason == "refusal":
        raise ClaudeError("refused", "Claude declined this request")
    yield {"done": True, "truncated": final.stop_reason == "max_tokens"}


async def stream_reply(turns: list[dict], images: list[dict], *, as_json: bool) -> AsyncIterator[dict]:
    """Yields {"text": piece} while Claude writes, then {"done": True, "truncated": bool}.
    Every failure is logged (see `fly logs`) and raised as a ClaudeError the app understands."""
    if not configured():
        log.error("Claude call refused: ANTHROPIC_API_KEY is not set on the server")
        raise ClaudeError("sampling_disabled", "the server has no Anthropic API key yet")
    messages = build_messages(turns, images)
    with_fallback, sent_any = True, False
    while True:
        try:
            async for piece in _stream(messages, as_json, with_fallback):
                sent_any = sent_any or "text" in piece
                yield piece
            return
        except ClaudeError as e:
            log.warning("Claude call ended: %s (%s)", e.code, e)
            raise
        except anthropic.BadRequestError as e:
            # If this key can't use the refusal fallback, try once without it.
            if with_fallback and not sent_any and "fallback" in str(e).lower():
                log.warning("Fallback option rejected, retrying without it: %s", e)
                with_fallback = False
                continue
            log.error("Claude call rejected (400): %s", e)
            raise ClaudeError("prompt_too_large" if "too long" in str(e).lower() else "invalid_request", str(e))
        except anthropic.AuthenticationError as e:
            log.error("Claude call refused: the API key is wrong or deleted (401): %s", e)
            raise ClaudeError("sampling_disabled", "the server's Anthropic API key is wrong or was deleted")
        except anthropic.PermissionDeniedError as e:
            log.error("Claude call refused: this key can't use %s (403): %s", MODEL, e)
            raise ClaudeError("sampling_disabled", f"the server's API key can't use {MODEL}")
        except anthropic.NotFoundError as e:
            log.error("Claude call failed: model %s not found for this key (404): %s", MODEL, e)
            raise ClaudeError("sampling_disabled", f"model {MODEL} isn't available to this API key")
        except anthropic.RateLimitError as e:
            log.warning("Claude rate limited (429): %s", e)
            raise ClaudeError("rate_limited")
        except anthropic.APIStatusError as e:
            log.error("Claude API error %s: %s", e.status_code, e)
            raise ClaudeError("upstream_error", f"Anthropic API error {e.status_code}")
        except anthropic.APIConnectionError as e:
            log.error("Couldn't reach the Anthropic API: %s", e)
            raise ClaudeError("upstream_error", "couldn't reach the Anthropic API")
        except Exception as e:                                       # anything else: logged with its traceback
            log.exception("Unexpected error calling Claude")
            raise ClaudeError("upstream_error", f"unexpected error: {type(e).__name__}")
