#!/usr/bin/env python3
"""Build index.html from the lessons in lessons/*.md.

Usage:  python3 build.py            # writes index.html next to this file
        python3 build.py --open     # ...and opens it in the browser

Standard library only. Each lesson is a Markdown file with a small front matter block
(see README.md). The Markdown subset supported: ## headings, paragraphs, "- " lists,
``` code blocks, `inline code`, **bold**, [links](url).
"""

import html
import json
import re
import sys
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LESSONS_DIR = ROOT / "lessons"
OUT = ROOT / "index.html"


def parse_front_matter(text, path):
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    if not m:
        sys.exit(f"{path.name}: missing front matter (--- ... ---)")
    meta = {}
    for line in m.group(1).splitlines():
        if not line.strip():
            continue
        key, _, value = line.partition(":")
        value = value.strip()
        if value.startswith("[") and value.endswith("]"):
            meta[key.strip()] = [v.strip() for v in value[1:-1].split(",") if v.strip()]
        else:
            meta[key.strip()] = value.strip('"').replace('\\"', '"')
    for required in ("title", "date", "tags", "summary"):
        if required not in meta:
            sys.exit(f"{path.name}: front matter needs '{required}'")
    meta.setdefault("projects", [])
    return meta, m.group(2)


def inline(text):
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2">\1</a>', text)
    return text


def markdown(md):
    out, para, items, code = [], [], [], None

    def flush():
        nonlocal para, items
        if para:
            out.append(f"<p>{inline(' '.join(para))}</p>")
            para = []
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>")
            items = []

    for line in md.splitlines():
        if code is not None:
            if line.startswith("```"):
                out.append(f"<pre><code>{html.escape(chr(10).join(code))}</code></pre>")
                code = None
            else:
                code.append(line)
            continue
        if line.startswith("```"):
            flush()
            code = []
        elif line.startswith("## "):
            flush()
            heading = line[3:].strip()
            cls = {"Lesson": "lesson", "Spot it next time": "spot"}.get(heading, "")
            out.append(f'<h3 class="{cls}">{inline(heading)}</h3>')
        elif line.startswith("- "):
            if para:
                flush()
            items.append(line[2:])
        elif not line.strip():
            flush()
        elif items and line.startswith("  "):
            items[-1] += " " + line.strip()
        else:
            para.append(line.strip())
    flush()
    return "\n".join(out)


def load():
    lessons = []
    for path in sorted(LESSONS_DIR.glob("*.md")):
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"), path)
        lessons.append({**meta, "file": path.name, "html": markdown(body)})
    lessons.sort(key=lambda l: (l["date"], l["file"]), reverse=True)
    return lessons


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Engineering Notes</title>
<style>
:root{--bg:#f7f7f5;--surface:#fff;--text:#1d1f23;--muted:#5d6470;--border:#e3e5e8;--accent:#2563eb;--code:#f0f1f3;--chip:#eef0f3;--chip-on:#1d1f23;--chip-on-t:#fff;--lesson:#2563eb;--spot:#b45309}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#15171a;--surface:#1d2024;--text:#e6e8eb;--muted:#9aa2ad;--border:#2e3238;--accent:#7aa7ff;--code:#272b31;--chip:#2a2e34;--chip-on:#e6e8eb;--chip-on-t:#15171a;--lesson:#7aa7ff;--spot:#f2b25c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:880px;margin:0 auto;padding:36px 16px 80px}
h1{margin:0;font-size:1.9rem;letter-spacing:-.01em}
.sub{color:var(--muted);margin:2px 0 20px}
.tools{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
input[type=search]{flex:1;min-width:200px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit}
button{font:inherit;cursor:pointer;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;padding:8px 12px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px}
.chip{font-size:.8rem;padding:3px 10px;border-radius:999px;background:var(--chip);border:0}
.chip.on{background:var(--chip-on);color:var(--chip-on-t)}
.chip small{opacity:.65;margin-left:3px}
details{background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:12px}
summary{list-style:none;cursor:pointer;padding:14px 18px}
summary::-webkit-details-marker{display:none}
summary .t{font-weight:650;font-size:1.05rem}
summary .s{color:var(--muted);font-size:.93rem;margin-top:2px}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;font-size:.75rem;color:var(--muted)}
.meta span.tag{background:var(--chip);padding:1px 8px;border-radius:999px}
.body{padding:0 18px 16px;border-top:1px solid var(--border)}
.body h3{font-size:.78rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:16px 0 4px}
.body h3.lesson{color:var(--lesson)}.body h3.spot{color:var(--spot)}
.body h3.lesson+p,.body h3.lesson+ul{border-left:3px solid var(--lesson);padding-left:12px;font-weight:500}
.body h3.spot+p{border-left:3px solid var(--spot);padding-left:12px}
.body p{margin:4px 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86em;background:var(--code);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
pre{background:var(--code);padding:10px 12px;border-radius:6px;overflow-x:auto}pre code{padding:0;background:none}
a{color:var(--accent)}
.file{font-size:.75rem;color:var(--muted);margin-top:12px}
.empty{color:var(--muted);padding:24px 0}
</style>
</head>
<body>
<div class="wrap">
<h1>Engineering Notes</h1>
<p class="sub" id="count"></p>
<div class="tools">
  <input type="search" id="q" placeholder="Search lessons…" aria-label="Search lessons">
  <button id="review" title="Show 3 random lessons, opened">Review 3 random</button>
  <button id="toggle">Expand all</button>
</div>
<div class="chips" id="chips"></div>
<div id="list"></div>
</div>
<script>
const LESSONS = __DATA__;
const state = { q: "", tag: null, review: null };
const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function renderChips() {
  const counts = {};
  LESSONS.forEach((l) => l.tags.forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
  const tags = Object.keys(counts).sort();
  $("chips").innerHTML = ['<button class="chip' + (state.tag ? "" : " on") + '" data-tag="">all</button>']
    .concat(tags.map((t) => '<button class="chip' + (state.tag === t ? " on" : "") + '" data-tag="' + esc(t) + '">' + esc(t) + "<small>" + counts[t] + "</small></button>"))
    .join("");
}

function render() {
  const q = state.q.toLowerCase();
  let shown = state.review || LESSONS.filter((l) =>
    (!state.tag || l.tags.includes(state.tag)) &&
    (!q || (l.title + " " + l.summary + " " + l.tags.join(" ") + " " + l.html).toLowerCase().includes(q)));
  $("count").textContent = LESSONS.length + " lessons" + (shown.length !== LESSONS.length ? " · showing " + shown.length : "");
  $("list").innerHTML = shown.length ? shown.map((l) =>
    '<details' + (state.review ? " open" : "") + '><summary><div class="t">' + esc(l.title) + '</div><div class="s">' + esc(l.summary) +
    '</div><div class="meta"><span>' + esc(l.date) + "</span>" + l.projects.map((p) => "<span>· " + esc(p) + "</span>").join("") +
    l.tags.map((t) => '<span class="tag">' + esc(t) + "</span>").join("") + '</div></summary><div class="body">' + l.html +
    '<div class="file">lessons/' + esc(l.file) + "</div></div></details>").join("") : '<p class="empty">No lessons match.</p>';
  renderChips();
}

$("q").addEventListener("input", (e) => { state.q = e.target.value; state.review = null; render(); });
$("chips").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.tag = b.dataset.tag || null; state.review = null; render();
});
$("review").addEventListener("click", () => {
  state.review = [...LESSONS].sort(() => Math.random() - 0.5).slice(0, 3); state.tag = null; state.q = ""; $("q").value = ""; render();
});
$("toggle").addEventListener("click", () => {
  const all = [...document.querySelectorAll("details")]; const open = !all.every((d) => d.open);
  all.forEach((d) => (d.open = open)); $("toggle").textContent = open ? "Collapse all" : "Expand all";
});
render();
</script>
</body>
</html>
"""


def main():
    lessons = load()
    data = json.dumps(lessons, ensure_ascii=False).replace("</", "<\\/")
    OUT.write_text(PAGE.replace("__DATA__", data), encoding="utf-8")
    print(f"Built {OUT} ({len(lessons)} lessons)")
    if "--open" in sys.argv:
        webbrowser.open(OUT.as_uri())


if __name__ == "__main__":
    main()
