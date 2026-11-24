---
name: lesson
description: Record an engineering lesson in Nathan's knowledge base, quiz him on past lessons, or set up a new knowledge base on a machine. Use after fixing a non-obvious problem (misleading error, a concept he didn't know, a security trap, a time sink, a mistake Claude made), when the user says "note this", "remember this", "add a lesson", "/lesson", asks to review lessons, or runs "/lesson init". Not for trivial typos or one-off project facts.
---

# Lesson: engineering knowledge base

Modes: **add** (default), **review** (argument `review`, or the user asks to be quizzed), **init** (argument
`init`, or the knowledge base doesn't exist on this machine yet).

## 0. Find this machine's knowledge base (every mode)

```bash
NOTES="$(cat ~/.config/lesson/notes-dir 2>/dev/null || echo "$HOME/Developer/engineering-notes")"
NOTES="${NOTES/#\~/$HOME}"; [ -d "$NOTES/lessons" ] && echo "ok: $NOTES" || echo "missing: $NOTES"
```

- `~/.config/lesson/notes-dir` is machine-local (not in dotfiles): a single line with the path. Each machine can
  point to a different knowledge base, e.g. a personal one at home and a separate one for an internship/job.
- **Missing:** don't create anything silently. Tell the user the knowledge base isn't set up on this machine and
  offer **init**. If they decline, show the lesson in chat so it isn't lost.
- Knowledge bases are separate on purpose. **Never copy lessons between them** (e.g. work → personal) unless the
  user explicitly asks, and then strip anything company-specific.

## Init

1. Ask where it should live (suggest `~/Developer/engineering-notes`, or e.g. `~/Developer/<company>-engineering-notes`
   on a work machine) and whether there's a Git remote yet (the user creates the empty repo under the right
   account themselves).
2. Create it from the scaffold that ships with this skill:
   ```bash
   SK=~/.claude/skills/lesson/scaffold; mkdir -p "$NOTES/lessons"
   cp "$SK/build.py" "$SK/TEMPLATE.md" "$SK/README.md" "$NOTES/"; cp "$SK/gitignore" "$NOTES/.gitignore"
   touch "$NOTES/lessons/.gitkeep"; mkdir -p ~/.config/lesson; echo "$NOTES" > ~/.config/lesson/notes-dir
   cd "$NOTES" && git init -q -b main && python3 build.py && git add -A && git commit -q -m "Start engineering notes"
   ```
3. If they gave a remote: `git remote add origin <url> && git push -u origin main`. Git uses whatever account is
   signed in on this machine. If the push is refused, tell them which account needs access rather than switching
   accounts yourself.

## Add

1. **Decide it's worth it.** It must have cost real time, been surprising or misleading, taught a concept,
   been a security trap, or be a mistake likely to repeat (including Claude's own). Otherwise skip it and say
   why in one line.
2. **Search for an existing lesson first**: `grep -ril "<keywords>" "$NOTES/lessons"` (try 2–3 keywords: the error
   text, the tool, the concept).
   - **Found:** update that file instead of creating a duplicate. Add the current project to `projects:` if
     missing, and add a short dated line under `## Fix` or a new `## Seen again` section with what was
     different this time.
   - **Not found:** create a new file.
3. **New file:** `"$NOTES/lessons/YYYY-MM-DD-<short-kebab-slug>.md"`, following `"$NOTES/TEMPLATE.md"`:
   - `title`: the general lesson, not the project symptom ("HSTS preload forces HTTPS on the whole domain",
     not "StudyCrew link broken").
   - `tags`: 2–4 lowercase topic tags. Reuse existing ones (`grep -h '^tags:' "$NOTES"/lessons/*.md | sort | uniq -c`).
     Add `claude-slip` when the mistake was Claude's.
   - `projects`: the current project's name.
   - Sections: `## Symptom`, `## Cause` (including how it was found), `## Fix` (concrete commands/files),
     `## Lesson` (one general rule), `## Spot it next time` (the signal to recognise it). Optional
     `## Concept` / `## Gotcha` / `## Question` + `## Answer`.
   - Concrete details (real error text, commands, paths) are fine as long as the knowledge base's repo is private
     and belongs to the same owner as the information (a work knowledge base may contain work details; a personal
     one must not contain an employer's). **Never** include secrets: passwords, tokens, private keys, connection
     strings with passwords.
   - Plain, short sentences. Explain the "why" so it makes sense months later.
4. **Rebuild and save:**
   ```bash
   cd "$NOTES" && python3 build.py && git add -A && git commit -q -m "Lesson: <title>"
   git remote get-url origin >/dev/null 2>&1 && git push -q
   ```
   Commit without any Claude co-author / "Generated with" lines. No remote: the commit stays local, which is fine.
5. **Tell the user in one or two lines**: the lesson title and whether it was new or an update. Don't paste the
   whole lesson.

Several lessons from one session can be added together in one commit.

## Review

1. Pick 3 lessons at random from `"$NOTES/lessons"`, favouring older ones and ones with more `projects`
   (repeated pain).
2. For each, ask the user the **Spot it next time** situation as a question ("You see X. What's going on and
   what do you check first?"). Wait for their answer, then reveal the lesson's Cause and Lesson and say what
   they got right or missed.
3. Offer to open the page: `python3 "$NOTES/build.py" --open`.
