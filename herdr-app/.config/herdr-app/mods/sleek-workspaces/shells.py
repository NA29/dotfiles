#!/usr/bin/env python3
"""Background shells for the sidebar: what's still running that an agent or terminal started.

Prints a JSON list, one entry per job:
  {"pid", "terminal", "session", "cwd", "age", "label", "log"}

A job is found by what it inherited, so it's found even when detached (no parent, no terminal):
  HC_TERMINAL_ID         started from a Herdr terminal
  CLAUDE_CODE_SESSION_ID started by Claude Code, including a session moved to the background
Environment values are read in memory and only those two ever leave this script.

Stdlib only: Herdr's exec finds the system python3.
"""
import json
import os
import re
import subprocess

MIN_AGE = 5  # seconds: skips the short commands agents run all the time
NOISE = re.compile(r"(^|[/\s_-])(mcp|caffeinate)([/\s_-]|$)|shells\.py|hook\.py|extract\.py", re.I)
SHELLS = {"sh", "bash", "zsh", "fish", "dash"}
# How Claude Code runs a command. macOS hides the environment of its own binaries (zsh, sleep), so
# these are recognised by shape; the real command is what's eval'd.
WRAPPER = re.compile(r"\.claude/shell-snapshots/.*? eval '((?:[^']|'\\'')*)'")


def run(*argv):
    return subprocess.run(argv, capture_output=True, text=True, errors="replace", timeout=8).stdout


def seconds(etime):
    days, _, clock = etime.rpartition("-")
    parts = [int(x) for x in clock.split(":")]
    while len(parts) < 3:
        parts.insert(0, 0)
    return int(days or 0) * 86400 + parts[0] * 3600 + parts[1] * 60 + parts[2]


def processes():
    found = {}
    for line in run("ps", "-axww", "-o", "pid=,ppid=,stat=,etime=,command=").splitlines():
        fields = line.split(None, 4)
        if len(fields) == 5:
            found[int(fields[0])] = {"ppid": int(fields[1]), "stat": fields[2], "age": seconds(fields[3]), "cmd": fields[4]}
    return found


def origins():
    """pid -> (terminal, session), for processes that inherited either."""
    found = {}
    for line in run("ps", "axeww", "-o", "pid=,command=").splitlines():
        pid = re.match(r"\s*(\d+) ", line)
        if not pid:
            continue
        terminal = re.search(r" HC_TERMINAL_ID=(\S+)", line)
        session = re.search(r" CLAUDE_CODE_SESSION_ID=(\S+)", line)
        if terminal or session:
            found[int(pid.group(1))] = (terminal and terminal.group(1), session and session.group(1))
    return found


def label(pid, procs):
    """Claude's command, or a shell script's own line (agent.sh opencode M1), or the command."""
    wrapped = WRAPPER.search(procs[pid]["cmd"])
    if wrapped:
        return wrapped.group(1).replace("'\\''", "'")[:80]
    parent = procs.get(procs[pid]["ppid"])
    if parent:
        words = parent["cmd"].split()
        if len(words) > 1 and os.path.basename(words[0]).lstrip("-") in SHELLS and not words[1].startswith("-"):
            return " ".join([os.path.basename(words[1]), *words[2:]])[:80]
    words = procs[pid]["cmd"].split()
    return " ".join([os.path.basename(words[0]), *words[1:]])[:80]


def outputs(pids):
    """pid -> the regular file its stdout goes to."""
    if not pids:
        return {}
    found, pid = {}, None
    for line in run("lsof", "-a", "-d", "1", "-p", ",".join(map(str, pids)), "-Fpn").splitlines():
        if line.startswith("p"):
            pid = int(line[1:])
        elif line.startswith("n") and line[1:].startswith("/") and not line[1:].startswith("/dev/"):
            found[pid] = line[1:]
    return found


def working_dirs(pids):
    if not pids:
        return {}
    found, pid = {}, None
    for line in run("lsof", "-a", "-d", "cwd", "-p", ",".join(map(str, pids)), "-Fpn").splitlines():
        if line.startswith("p"):
            pid = int(line[1:])
        elif line.startswith("n"):
            found[pid] = line[1:]
    return found


def main():
    procs = processes()
    origin = origins()
    me = os.getpid()
    # Foreground programs are on screen already: the agent itself, a build you're watching. Claude's
    # commands share its foreground group, so those stay in and are judged by their output below.
    wrappers = {p for p, info in procs.items() if WRAPPER.search(info["cmd"])}
    for p in wrappers:
        origin[p] = origin.get(procs[p]["ppid"], (None, None))
    tracked = {p for p in origin if p in procs and p != me and ("+" not in procs[p]["stat"] or origin[p][1])} | wrappers
    # The top of each job: its parent isn't part of a tracked job.
    tops = [
        p for p in tracked
        if procs[p]["ppid"] not in tracked and procs[p]["age"] >= MIN_AGE and not NOISE.search(procs[p]["cmd"])
    ]
    children = {}
    for p, info in procs.items():
        children.setdefault(info["ppid"], []).append(p)

    def family(root):
        seen, stack = [], [root]
        while stack:
            p = stack.pop()
            seen.append(p)
            stack.extend(children.get(p, []))
        return seen

    families = {top: family(top) for top in tops}
    logs = outputs(sorted({p for fam in families.values() for p in fam}))
    dirs = working_dirs(tops)
    jobs = []
    for top in tops:
        # The fullest output in the job: a wrapper's own stdout is often empty.
        files = [logs[p] for p in families[top] if p in logs]
        def size(path):
            try:
                return os.path.getsize(path)
            except OSError:
                return -1
        log = max(files, key=size) if files else None
        # An agent's foreground commands write to a pipe; its background shells write to tasks/.
        if ("+" in procs[top]["stat"] and not log) or (top in wrappers and "/tasks/" not in (log or "")):
            continue
        terminal, session = origin[top]
        jobs.append({
            "pid": top, "terminal": terminal, "session": session, "cwd": dirs.get(top),
            "age": procs[top]["age"], "label": label(top, procs), "log": log,
        })
    # A shell that only launched a detached job sits there empty beside it: the job says it all.
    def launcher(job):
        return job["pid"] in wrappers and os.path.getsize(job["log"]) == 0 and any(
            other["pid"] not in wrappers and other["cwd"] == job["cwd"] and abs(other["age"] - job["age"]) <= 3
            for other in jobs
        )
    jobs = [job for job in jobs if not launcher(job)]
    jobs.sort(key=lambda j: j["age"])
    print(json.dumps(jobs))


if __name__ == "__main__":
    main()
