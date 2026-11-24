---
name: lesson
description: Record an engineering lesson in Nathan's knowledge base (~/Developer/engineering-notes) or quiz him on past lessons. Use after fixing a non-obvious problem (misleading error, a concept he didn't know, a security trap, a time sink, a mistake Claude made), when the user says "note this", "remember this", "add a lesson", "/lesson", or asks to review lessons. Not for trivial typos or one-off project facts.
---

# Lesson: Nathan's engineering knowledge base

Knowledge base: `~/Developer/engineering-notes` (private GitHub repo `NA29/engineering-notes`). One Markdown file per
lesson in `lessons/`, rendered to `index.html` by `build.py`. Read `~/Developer/engineering-notes/README.md` once if
anything below is unclear.

Modes: **add** (default) and **review** (when the argument is `review` or the user asks to be quizzed).

## Add

1. **Decide it's worth it.** It must have cost real time, been surprising or misleading, taught a concept,
   been a security trap, or be a mistake likely to repeat (including Claude's own). Otherwise skip it and say
   why in one line.
2. **Search for an existing lesson first**: `grep -ril "<keywords>" ~/Developer/engineering-notes/lessons` (try 2–3
   keywords: the error text, the tool, the concept).
   - **Found:** update that file instead of creating a duplicate. Add the current project to `projects:` if
     missing, and add a short dated line under `## Fix` or a new `## Seen again` section with what was
     different this time.
   - **Not found:** create a new file.
3. **New file:** `~/Developer/engineering-notes/lessons/YYYY-MM-DD-<short-kebab-slug>.md`, following
   `~/Developer/engineering-notes/TEMPLATE.md`:
   - `title`: the general lesson, not the project symptom ("HSTS preload forces HTTPS on the whole domain",
     not "StudyCrew link broken").
   - `tags`: 2–4 lowercase topic tags. Reuse existing ones (`grep -h '^tags:' lessons/*.md | sort | uniq -c`).
     Add `claude-slip` when the mistake was Claude's.
   - `projects`: the current project's name.
   - Sections: `## Symptom`, `## Cause` (including how it was found), `## Fix` (concrete commands/files),
     `## Lesson` (one general rule), `## Spot it next time` (the signal to recognise it). Optional
     `## Concept` / `## Gotcha` / `## Question` + `## Answer`.
   - Concrete is good (real error text, commands, paths): the repo is private. **Never** include secrets:
     passwords, tokens, private keys, connection strings with passwords.
   - Plain, short sentences. Explain the "why" so it makes sense months later.
4. **Rebuild and publish:**
   ```bash
   cd ~/Developer/engineering-notes && python3 build.py && git add -A && git commit -q -m "Lesson: <title>" && git push -q
   ```
   Commit without any Claude co-author / "Generated with" lines.
5. **Tell the user in one or two lines**: the lesson title and whether it was new or an update. Don't paste the
   whole lesson.

Several lessons from one session can be added together in one commit.

## Review

1. Pick 3 lessons at random, favouring older ones and ones with more `projects` (repeated pain):
   `ls ~/Developer/engineering-notes/lessons`.
2. For each, ask the user the **Spot it next time** situation as a question ("You see X. What's going on and
   what do you check first?"). Wait for their answer, then reveal the lesson's Cause and Lesson and say what
   they got right or missed.
3. Offer to open the page: `python3 ~/Developer/engineering-notes/build.py --open`.
