"""Read the latest actual Codex rate-limit event; never expose session text."""
import datetime
import glob
import json
import os


def find(node):
    if isinstance(node, dict):
        limits = node.get('rate_limits')
        if isinstance(limits, dict) and (limits.get('primary') or limits.get('secondary')):
            return limits
        for value in node.values():
            result = find(value)
            if result:
                return result
    elif isinstance(node, list):
        for value in node:
            result = find(value)
            if result:
                return result
    return None


def latest_snapshot(paths):
    newest = None
    for path in paths:
        try:
            modified = os.path.getmtime(path)
            with open(path, 'rb') as stream:
                stream.seek(0, 2)
                stream.seek(max(0, stream.tell() - 800_000))
                lines = stream.read().decode('utf-8', 'replace').splitlines()
            for line in reversed(lines):
                if '"rate_limits"' not in line:
                    continue
                try:
                    event = json.loads(line)
                except (ValueError, TypeError):
                    continue
                limits = find(event)
                if not limits:
                    continue
                try:
                    timestamp = datetime.datetime.fromisoformat(event['timestamp'].replace('Z', '+00:00')).timestamp()
                    source = 'event'
                except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
                    timestamp, source = modified, 'file'
                snapshot = {'at': int(timestamp), 'at_source': source, 'rate_limits': limits}
                if newest is None or snapshot['at'] > newest['at']:
                    newest = snapshot
                break
        except OSError:
            continue
    return newest


if __name__ == '__main__':
    paths = sorted(glob.glob(os.path.expanduser('~/.codex/sessions/*/*/*/rollout-*.jsonl')),
                   key=lambda p: os.path.getmtime(p) if os.path.exists(p) else 0, reverse=True)[:5]
    snapshot = latest_snapshot(paths)
    if snapshot:
        print(json.dumps(snapshot))
