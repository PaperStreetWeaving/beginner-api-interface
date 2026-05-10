"""
Serverless endpoint that proxies chat requests to the Claude API.

Runs on Vercel's Python runtime. Streams the model's response back to the
browser using Server-Sent Events (SSE) so messages appear as they're written.

Required environment variable:
  ANTHROPIC_API_KEY  — get one at console.anthropic.com

The browser sends a POST with JSON like:
  {
    "model":        "claude-sonnet-4-6",
    "system":       "You are a helpful assistant.",
    "messages":     [{"role": "user", "content": [...]}],
    "useWebSearch": false,
    "maxTokens":    4096
  }
"""

from http.server import BaseHTTPRequestHandler
import json
import os

import anthropic

DEFAULT_MODEL = "claude-sonnet-4-6"
DEFAULT_MAX_TOKENS = 4096


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or b"{}")
        except Exception as e:
            return self._json_error(400, f"Invalid JSON body: {e}")

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            return self._json_error(
                500,
                "ANTHROPIC_API_KEY is not set. Add it in Vercel → Settings → "
                "Environment Variables, then redeploy.",
            )

        kwargs = {
            "model": data.get("model") or DEFAULT_MODEL,
            "max_tokens": int(data.get("maxTokens") or DEFAULT_MAX_TOKENS),
            "messages": data.get("messages") or [],
        }
        system = data.get("system")
        if system:
            kwargs["system"] = system
        if data.get("useWebSearch"):
            kwargs["tools"] = [{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 5,
            }]

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self._cors()
        self.end_headers()

        try:
            client = anthropic.Anthropic(api_key=api_key)
            with client.messages.stream(**kwargs) as stream:
                for event in stream:
                    self._handle_event(event)
                final = stream.get_final_message()
                self._sse({
                    "type": "done",
                    "stop_reason": final.stop_reason,
                    "usage": {
                        "input_tokens": final.usage.input_tokens,
                        "output_tokens": final.usage.output_tokens,
                    },
                })
        except anthropic.APIStatusError as e:
            self._sse({"type": "error", "error": f"{e.status_code}: {e.message}"})
        except Exception as e:
            self._sse({"type": "error", "error": str(e)})

    def _handle_event(self, event):
        t = getattr(event, "type", None)
        if t == "content_block_start":
            block = event.content_block
            if getattr(block, "type", None) == "server_tool_use":
                query = ""
                if isinstance(getattr(block, "input", None), dict):
                    query = block.input.get("query", "")
                self._sse({"type": "tool_use", "name": block.name, "query": query})
        elif t == "content_block_delta":
            delta = event.delta
            if getattr(delta, "type", None) == "text_delta":
                self._sse({"type": "text", "text": delta.text})

    def _sse(self, payload):
        try:
            self.wfile.write(f"data: {json.dumps(payload)}\n\n".encode())
            self.wfile.flush()
        except Exception:
            pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json_error(self, code, message):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.end_headers()
        self.wfile.write(json.dumps({"error": message}).encode())
