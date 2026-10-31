"""A stand-in for Anthropic's Messages API, for testing without spending money.

It answers POST /v1/messages with the real streaming event format, so the
server's own SDK code runs unchanged. Each request is saved to LAST_REQUEST
(path from the MOCK_LOG env var) so tests can check what was sent.

  python server/tests/mock_anthropic.py 8790
"""

import json
import os
import sys
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOG = os.environ.get("MOCK_LOG", "mock-requests.jsonl")
TODAY = date.today().isoformat()

REPLIES = {
    "fever": "Sorry she's unwell. Small sips of water, and check her temperature again in an hour.\n\n```json\n"
             + json.dumps({"entries": [{"date": TODAY, "type": "symptom", "what": "Fever 38.4", "details": "since evening"},
                                       {"type": "care", "what": "Paracetamol 5 ml", "details": "crocin"}], "schedules": []}) + "\n```",
    "attached": "This is a prescription and a discharge summary. I've offered to keep both.\n\n```json\n"
             + json.dumps({"entries": [], "schedules": [], "documents": [
                 {"file": 1, "title": "Cough syrup prescription", "date": TODAY, "brief": "Dr Mehta: dry cough, syrup at night for 5 days."},
                 {"file": 2, "title": "Discharge summary", "date": TODAY, "brief": "Chest infection; nebuliser at home for 5 days."}]}) + "\n```",
    "default": "Lovely to hear.\n\n```json\n" + json.dumps({"entries": [{"type": "health", "what": "well"}]}) + "\n```",
}


def notes_reply(prompt: str) -> str:
    import re
    nums = [int(n) for n in re.findall(r"^\[(\d+)\]", prompt, re.M)]
    return json.dumps({"now": [{"text": "Divisha was unwell for a day and is settling.", "see": nums[:2] or [1]}],
                       "working": [{"text": "Paracetamol settled the fever.", "see": nums[-1:] or [1]}], "tryNext": [], "moments": []})


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        record = {"path": self.path, "beta": self.headers.get("anthropic-beta"), "key": self.headers.get("x-api-key"),
                  "auth": self.headers.get("authorization"), "headers": sorted(self.headers.keys()), "body": body}
        with open(LOG, "a") as f:
            f.write(json.dumps(record) + "\n")
        if os.environ.get("MOCK_REJECT_FALLBACKS") and "fallbacks" in body:
            msg = json.dumps({"type": "error", "error": {"type": "invalid_request_error", "message": "fallbacks: not available for this organization"}}).encode()
            self.send_response(400)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return
        last = body["messages"][-1]["content"]
        text = last if isinstance(last, str) else next(b["text"] for b in last if b["type"] == "text")
        if body.get("system"):
            reply = notes_reply(text)
        elif "[Attached" in text:
            reply = REPLIES["attached"]
        elif "fever" in text.split("Parent's message:")[-1].lower():
            reply = REPLIES["fever"]
        else:
            reply = REPLIES["default"]

        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()

        def send(event, data):
            self.wfile.write(f"event: {event}\ndata: {json.dumps(data)}\n\n".encode())
            self.wfile.flush()

        send("message_start", {"type": "message_start", "message": {"id": "msg_test", "type": "message", "role": "assistant", "model": body["model"],
             "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 100, "output_tokens": 1}}})
        send("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}})
        for i in range(0, len(reply), 40):
            send("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": reply[i:i + 40]}})
        send("content_block_stop", {"type": "content_block_stop", "index": 0})
        send("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 50}})
        send("message_stop", {"type": "message_stop"})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
