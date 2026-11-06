"""Activity hook: saves your prompts and the agent's final replies for the Activity log.

Called by the agents' own hooks (plain Python, standard library only):
  Claude Code  ~/.claude/settings.json  UserPromptSubmit -> hook.py claude prompt
                                        Stop             -> hook.py claude reply
  Codex        ~/.codex/hooks.json      UserPromptSubmit -> hook.py codex prompt
                                        Stop             -> hook.py codex reply
(OpenCode writes the same records from its plugin, ~/.config/opencode/herdr-app-status.js.)

Reads the hook's JSON on stdin and appends one line to
~/.cache/herdr-activity/<HC_TERMINAL_ID>.jsonl (or unmatched.jsonl when the agent runs
outside a Herdr terminal's environment; the log then matches it by folder and time):
  {"at": ms, "agent": "claude", "kind": "prompt" | "reply", "text": "...", "cwd": "...", "terminal": "t1b"}
Prints nothing and always exits 0, so it can never get in an agent's way.
"""
import json
import os
import sys
import time

MAX = {"prompt": 4000, "reply": 3000}
KEEP = 60  # lines per file


def last_reply_from_transcript(path):
    """The last assistant text in a Claude Code or Codex transcript (JSON lines)."""
    try:
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 400_000))
            lines = f.read().decode("utf-8", "replace").splitlines()
    except OSError:
        return None
    for line in reversed(lines):
        try:
            d = json.loads(line)
        except ValueError:
            continue
        # Claude Code: {"type": "assistant", "message": {"content": [{"type": "text", "text": ...}]}}
        if d.get("type") == "assistant":
            parts = (d.get("message") or {}).get("content") or []
            text = "\n".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text").strip()
            if text:
                return text
        # Codex: {"type": "event_msg", "payload": {"type": "agent_message", "message": ...}}
        p = d.get("payload") or {}
        if d.get("type") == "event_msg" and p.get("type") == "agent_message" and p.get("message"):
            return str(p["message"]).strip()
        # Codex: {"type": "response_item", "payload": {"role": "assistant", "content": [{"type": "output_text", ...}]}}
        if d.get("type") == "response_item" and p.get("role") == "assistant":
            text = "\n".join(c.get("text", "") for c in p.get("content") or [] if isinstance(c, dict)).strip()
            if text:
                return text
    return None


def main():
    agent, kind = sys.argv[1], sys.argv[2]
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        data = {}
    if kind == "prompt":
        text = data.get("prompt") or data.get("user_prompt")
    else:
        text = data.get("last_assistant_message") or data.get("last-assistant-message")
        if not text and data.get("transcript_path"):
            text = last_reply_from_transcript(data["transcript_path"])
    if not text or not str(text).strip():
        return
    text = str(text).strip()[: MAX[kind]]

    terminal = os.environ.get("HC_TERMINAL_ID") or None
    folder = os.path.expanduser("~/.cache/herdr-activity")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{terminal}.jsonl" if terminal else "unmatched.jsonl")
    record = {"at": int(time.time() * 1000), "agent": agent, "kind": kind, "text": text,
              "cwd": data.get("cwd") or os.getcwd(), "terminal": terminal, "session": data.get("session_id")}
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()[-(KEEP - 1):]
    except OSError:
        lines = []
    lines.append(json.dumps(record, ensure_ascii=False))
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    os.replace(tmp, path)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
    sys.exit(0)
