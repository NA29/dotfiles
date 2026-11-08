#!/usr/bin/env python3
"""What a Claude Code session has in its context: instruction files (CLAUDE.md and friends) and
skills (listed = name + description only; loaded = its full instructions were read in).

Usage: extract.py <terminal address, e.g. t4k>
Finds the terminal's Claude session through the Activity hook's log
(~/.cache/herdr-activity/<terminal>.jsonl), then reads that session's transcript.
Prints one JSON object. Stdlib only (Herdr's exec finds the system python3).
"""
import glob, json, os, re, sys

HOME = os.path.expanduser("~")

def session_for(terminal):
    path = os.path.join(HOME, ".cache", "herdr-activity", re.sub(r"[^A-Za-z0-9_-]", "", terminal) + ".jsonl")
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        return None, None
    for line in reversed(lines):
        try:
            o = json.loads(line)
        except ValueError:
            continue
        if o.get("agent") == "claude" and o.get("session"):
            return o["session"], o.get("cwd")
    return None, None

def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text")
    return ""

def main():
    terminal = sys.argv[1] if len(sys.argv) > 1 else ""
    session, cwd = session_for(terminal)
    if not session:
        print(json.dumps({"error": "no-session"})); return
    found = glob.glob(os.path.join(HOME, ".claude", "projects", "*", session + ".jsonl"))
    if not found:
        print(json.dumps({"error": "no-transcript", "session": session})); return
    transcript = found[0]

    files = {}          # path -> {path, type, chars, lines, preview}
    listed = {}         # skill name -> description
    order = []
    loaded = {}         # skill name -> how (tool / slash)
    title = None
    with open(transcript, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            # Cheap filters first: the transcript also holds multi-megabyte request blobs.
            if '"attachment"' in line:
                try:
                    o = json.loads(line)
                except ValueError:
                    continue
                a = o.get("attachment") or {}
                kind = a.get("type")
                if kind == "skill_listing":
                    names = a.get("names") or []
                    descs = {}
                    for row in (a.get("content") or "").splitlines():
                        m = re.match(r"^- (\S+?): (.*)$", row)
                        if m:
                            descs[m.group(1)] = m.group(2)
                    for n in names or descs.keys():
                        if n not in listed:
                            order.append(n)
                        listed[n] = descs.get(n, listed.get(n, ""))
                entries = a.get("files") if isinstance(a.get("files"), list) else (
                    [a] if a.get("path") and isinstance(a.get("content"), str) else [])
                for f in entries:
                    p, body = f.get("path"), f.get("content")
                    if not p or not isinstance(body, str):
                        continue
                    files[p] = {"path": p, "type": f.get("type") or kind or "", "chars": len(body),
                                "lines": body.count("\n") + 1, "preview": body[:6000]}
            elif '"custom-title"' in line:
                try:
                    title = json.loads(line).get("customTitle") or title
                except ValueError:
                    pass
            elif '"Skill"' in line or "<command-name>" in line:
                try:
                    o = json.loads(line)
                except ValueError:
                    continue
                msg = o.get("message") or {}
                content = msg.get("content")
                if o.get("type") == "assistant" and isinstance(content, list):
                    for c in content:
                        if isinstance(c, dict) and c.get("type") == "tool_use" and c.get("name") == "Skill":
                            s = (c.get("input") or {}).get("skill")
                            if s:
                                loaded[s] = "Claude"
                elif o.get("type") == "user":
                    for m in re.finditer(r"<command-name>/?([^<\s]+)</command-name>", text_of(content)):
                        loaded.setdefault(m.group(1), "you")

    home = lambda p: p.replace(HOME, "~", 1)
    skills = [{"name": n, "description": listed.get(n, ""), "loaded": loaded.get(n)} for n in order]
    skills += [{"name": n, "description": "", "loaded": how} for n, how in loaded.items() if n not in listed]
    print(json.dumps({
        "session": session, "title": title, "cwd": home(cwd or ""), "transcript": transcript,
        "files": [dict(f, path=home(f["path"])) for f in files.values()],
        "skills": [s for s in skills if s["name"] in listed or s["loaded"]],
    }))

main()
