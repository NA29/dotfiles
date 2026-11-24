# Engineering Notes

A knowledge base of engineering lessons: things that cost real time, surprised me, or that a senior engineer
would have known. One lesson per file in `lessons/`, organised by **topic** (tags), not by project.

## Read

```bash
python3 build.py --open
```

Builds `index.html` (not committed) and opens it: search, filter by tag, and **Review 3 random**.

## Add a lesson

Claude adds lessons with the `lesson` skill after fixing a non-obvious problem, or when asked ("note this",
"/lesson"). By hand: copy `TEMPLATE.md` to `lessons/YYYY-MM-DD-short-slug.md`, fill it in, run `python3 build.py`.

## Format

Front matter: `title`, `date`, `projects: [..]`, `tags: [..]`, `summary`. Body sections: `## Symptom`,
`## Cause`, `## Fix`, `## Lesson`, `## Spot it next time` (optional `## Concept`, `## Gotcha`,
`## Question` / `## Answer`). Tag `claude-slip` marks mistakes the assistant made.

## What's worth a lesson

- **Yes:** took more than ~15 minutes; misleading error; a concept I didn't know; a security trap; a mistake
  likely to repeat.
- **No:** typos, one-off project facts, things obvious from the docs.
- Seen again? Update the existing lesson (add the project), don't duplicate it.
