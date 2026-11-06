# Prints Codex's latest rate-limit snapshot as JSON: {"at": <epoch s>, "rate_limits": {...}}.
# Codex writes one into its session log after each turn; read the newest logs from the end.
import glob, json, os, sys

def find(node):
    if isinstance(node, dict):
        if "rate_limits" in node and isinstance(node["rate_limits"], dict):
            return node["rate_limits"]
        for v in node.values():
            r = find(v)
            if r: return r
    elif isinstance(node, list):
        for v in node:
            r = find(v)
            if r: return r
    return None

files = sorted(glob.glob(os.path.expanduser("~/.codex/sessions/*/*/*/rollout-*.jsonl")), key=os.path.getmtime, reverse=True)[:5]
for f in files:
    with open(f, "rb") as h:
        h.seek(0, 2)
        size = h.tell()
        h.seek(max(0, size - 800_000))
        lines = h.read().decode("utf-8", "replace").splitlines()
    for line in reversed(lines):
        if '"rate_limits"' not in line:
            continue
        try:
            rl = find(json.loads(line))
        except Exception:
            continue
        if rl and (rl.get("primary") or rl.get("secondary")):
            print(json.dumps({"at": int(os.path.getmtime(f)), "rate_limits": rl}))
            sys.exit(0)
