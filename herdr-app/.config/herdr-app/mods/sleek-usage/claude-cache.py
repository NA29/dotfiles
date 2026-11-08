"""Keep status-line allowance snapshots per window, including observed timestamps."""
import fcntl
import json
import os
from pathlib import Path
import sys
import tempfile
import time


def update(payload, path, now=None):
    now = time.time() if now is None else now
    limits = payload.get('rate_limits')
    if not isinstance(limits, dict):
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with (path.parent / 'claude.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            old = json.loads(path.read_text())
        except (OSError, ValueError):
            old = {'at': 0, 'rate_limits': {}}
        merged = dict(old.get('rate_limits') or {})
        for key, value in list(merged.items()):
            if isinstance(value, dict) and 'observed_at' not in value:
                merged[key] = {**value, 'observed_at': old.get('at', 0)}
        for key, value in limits.items():
            if isinstance(value, dict) and any(value.get(field) is not None for field in ['used_percentage','used_percent','utilization']):
                merged[key] = {**value, 'observed_at': now}
        with tempfile.NamedTemporaryFile('w', dir=path.parent, prefix='.claude-', delete=False) as stream:
            json.dump({'at': now, 'rate_limits': merged}, stream, separators=(',', ':'))
        os.replace(stream.name, path)


if __name__ == '__main__':
    try:
        update(json.load(sys.stdin), Path.home()/'.cache/agent-usage/claude.json')
    except (ValueError, OSError, TypeError):
        pass  # Status-line rendering must continue if caching is unavailable.
