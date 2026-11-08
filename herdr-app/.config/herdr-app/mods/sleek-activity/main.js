// Personal: activity, one entry per RUN (a request from start to finish), not per state change.
//   Sidebar (this block): the latest runs ("21:01 ● Give balut recipe finished 3s"); folds to the latest.
//   Log (the same mod as a frameless dialog, props().log): today's summary (runs, agent time, how often
//   you were needed, which agents did the work), filters, search, and every run with your prompt;
//   Enter expands a run into the full prompt and the start of the agent's reply.
//   Keys, like Go to: j/k move, Enter expands, l opens the agent's tab, y copies the prompt,
//   gg/G, / searches (the "/" stays in the field; Backspace over it goes back), q or Esc leaves.
// Runs are recorded by the sidebar copy only, while Herdr is open, in shared "activity.runs".
// Prompts and replies come from the agents' hooks (./hook.py for Claude Code and Codex, the OpenCode
// plugin), which write ~/.cache/herdr-activity/<terminal>.jsonl; runs pick them up by time.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, terminals, spaces, panes, run, theme, layout, props, shared, setShared, openOverlay, closeOverlay, home, readTextFile, exec } from "herdr";
import { box, fit, tint, glass } from "./box.js";
import { div as sqDiv } from "gpui-kit";
import { shared as sqShared } from "herdr";

// Personal: the Square corners setting (rice "look.square") squares every corner drawn with
// .rounded*(n) (circles from .rounded_full stay round). Patched once on the shared element prototype.
{
  const p = Object.getPrototypeOf(sqDiv());
  for (const m of ["rounded", "rounded_t", "rounded_b", "rounded_l", "rounded_r", "rounded_tl", "rounded_tr", "rounded_bl", "rounded_br"]) {
    const key = `__square_${m}`;
    if (!p[key] && typeof p[m] === "function") {
      p[key] = p[m];
      p[m] = function (n) { return p[key].call(this, (sqShared("rice") ?? {})["look.square"] ? 0 : n); };
    }
  }
}

// Font rule: words in Geist, numbers and code in Geist Mono (one family, designed together).
const MONO = "Geist Mono";
const SANS = "Geist";
// Personal settings (my-settings panel): rows shown here, history kept, whether closed agents are logged.
const R = (k, d) => (shared("rice") ?? {})[k] ?? d;
const SIDEBAR_ROWS = () => R("activity.rows", 6);
const KEEP = () => R("activity.keep", 200);
const ROW = 24;
const STATES = ["needs you", "working", "finished", "closed"];
const OPEN = (r) => r.status === "working" || r.status === "needs you";

const cleanTitle = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/^(OC|CC|Codex)\s*[|:·-]\s*/i, "").trim();
// The agent's session name from its terminal title; generic titles ("claude", a folder, an address
// like "t21") fall back to the tab's name, else "program · tab N", and are marked generic so the
// log can show the prompt instead.
function nameOf(a, tab) {
  const raw = cleanTitle(a.title);
  const low = raw.toLowerCase();
  const generic = !raw || [a.program?.name, a.program?.key, a.app].filter(Boolean).map((x) => x.toLowerCase()).includes(low)
    || /^[~/]/.test(raw) || raw.includes("@") || /^(claude( code)?|codex|open ?code|shell)$/.test(low) || /^new session\b/.test(low)
    || /^t[0-9a-z]{1,4}$/i.test(raw);
  if (!generic) return { name: raw, generic: false };
  if (tab?.named) return { name: tab.name, generic: false };
  return { name: `${(a.program?.name ?? a.app ?? "agent").toLowerCase()}${tab ? ` · tab ${tab.index}` : ""}`, generic: true };
}
const clock = (ms) => new Date(ms).toTimeString().slice(0, 5);
function took(ms) {
  if (!ms || ms < 1000) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}
function dayOf(ms) {
  const d = new Date(ms), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}
function programIcon(r, size, color) {
  if (!r?.icon) return null;
  return r.tint ? svg(r.icon).size(size).flex_none().text_color(color) : image(r.icon).w(size).h(size).flex_none();
}
const firstLine = (s) => (s ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";

// Older builds kept one event per state change: turn them into runs once.
function runsFromEvents(events) {
  const out = [];
  for (const e of events ?? []) {
    // Old names could be just the terminal's address ("t21"): say what it was instead.
    const bare = !e.name || /^t[0-9a-z]{1,4}$/i.test(e.name) || /· untitled$/.test(e.name);
    const name = bare ? `${(e.program ?? e.app ?? "agent").toLowerCase()}${e.tab != null ? ` · tab ${e.tab}` : ""}` : e.name;
    const base = { id: `${e.address}-${e.at}`, address: e.address, pane: e.pane, name, generic: bare, app: e.app,
      program: e.program, icon: e.icon, tint: e.tint, space: e.space, tab: e.tab };
    if (e.kind === "finished") out.push({ ...base, start: e.at - (e.took ?? 0), end: e.at, took: e.took ?? null, status: "finished", needs: 0 });
    else if (e.kind === "needs you") out.push({ ...base, start: e.at, end: e.at, took: e.took ?? null, status: "finished", needs: 1 });
    else if (e.kind === "closed") out.push({ ...base, start: e.at, end: e.at, took: null, status: "closed", needs: 0 });
  }
  return out.sort((a, b) => b.start - a.start);
}

export default class Activity extends View {
  init(_props, cx) {
    // Any popup copy is the log (and never records): the sidebar block has no overlay.
    this.log = Boolean(props()?.log || props()?.overlay);
    this.open = localStorage.getItem("folded") !== "1";
    this.filter = "all";
    this.confirming = false;
    this.handle = cx.focus_handle();
    this.last = null; // address -> { status, info }
    this.at = 0; this.top = 0; this.expanded = null; this.listH = 480; this.pendingG = false; this.flash = null;
    this.query = ""; this.mode = "normal";
    if (!this.log) {
      if (!shared("activity.runs") && shared("activity.events")) setShared("activity.runs", runsFromEvents(shared("activity.events")).slice(0, KEEP()));
      cx.timer.every(3000, (cx) => this.enrich(cx));
    } else {
      this.input = InputState.new({ placeholder: "Press / to search prompts, replies and names" });
      this.input.on("change", (_e, cx) => {
        const v = this.input.value();
        if (v.startsWith("//")) { this.setField(v.slice(1)); return; }
        if (v.startsWith("/")) { this.mode = "insert"; this.query = v.slice(1); }
        else { this.mode = "normal"; this.query = ""; if (v !== "") this.input.set_value(""); this.handle.focus(); }
        this.at = 0; this.top = 0; this.expanded = null; cx.notify();
      });
      this.input.on("submit", (_e, cx) => { this.mode = "normal"; this.handle.focus(); cx.notify(); });
      this.input.on("focus", () => { if (!this.input.value().startsWith("/")) this.setField("/"); });
      this.handle.focus();
      cx.timer.after(400, () => (this.mode === "insert" ? this.input.focus() : this.handle.focus()));
    }
    cx.timer.every(60000, (cx) => cx.notify());
  }

  setField(text) {
    this.input.set_value(text);
    this.input.set_selected_range({ start: text.length, end: text.length });
  }

  runs() {
    return shared("activity.runs") ?? [];
  }

  save(runs) {
    setShared("activity.runs", runs.sort((a, b) => b.start - a.start).slice(0, KEEP()));
  }

  // State changes become runs: working opens one, needs you marks it, done/idle finishes it,
  // the agent going away closes it. Sidebar copy only.
  record(list, now) {
    const tabs = new Map(spaces().flatMap((s) => s.tabs.map((tab) => [tab.id, { space: s.name, tab }])));
    const cwd = new Map(panes().map((p) => [p.pane ?? p.id, p.cwd]));
    const current = new Map(list.map((a) => {
      const where = tabs.get(a.tab);
      const n = nameOf(a, where?.tab);
      return [a.address, { status: a.status, info: { ...n, pane: a.pane, app: a.app, program: a.program?.name, icon: a.program?.icon ?? null,
        tint: a.program?.tint ?? false, tile: a.program?.tile ?? null, space: where?.space ?? a.space_name, tab: where?.tab?.index ?? null, cwd: cwd.get(a.pane) ?? null } }];
    }));
    if (!this.last) { this.last = current; return; }
    const runs = this.runs().map((r) => ({ ...r }));
    let changed = false;
    const openRun = (address) => runs.find((r) => r.address === address && OPEN(r));
    const start = (address, info, status) => {
      runs.push({ id: `${address}-${now}`, address, ...info, start: now, end: null, took: null, status, needs: status === "needs you" ? 1 : 0, prompt: null, reply: null });
      changed = true;
    };
    for (const [address, cur] of current) {
      const before = this.last.get(address);
      const r = openRun(address);
      // Keep a live run's name and place fresh (a title often arrives after the first prompt).
      if (r && (r.name !== cur.info.name || r.space !== cur.info.space || r.tab !== cur.info.tab)) {
        Object.assign(r, { name: cur.info.name, generic: cur.info.generic, space: cur.info.space, tab: cur.info.tab }); changed = true;
      }
      if (before?.status === cur.status) continue;
      if (cur.status === "working") {
        if (!r) start(address, cur.info, "working");
        else if (r.status !== "working") { r.status = "working"; changed = true; }
      } else if (cur.status === "blocked") {
        if (!r) start(address, cur.info, "needs you");
        else { r.status = "needs you"; r.needs = (r.needs ?? 0) + 1; changed = true; }
      } else if ((cur.status === "done" || cur.status === "idle") && r) {
        Object.assign(r, { status: "finished", end: now, took: now - r.start }); changed = true;
      }
    }
    for (const [address, before] of this.last) {
      if (current.has(address)) continue;
      const r = openRun(address);
      if (r) { Object.assign(r, { status: "closed", end: now, took: now - r.start }); changed = true; }
      else if (R("activity.kinds", ["closed"]).includes("closed")) {
        runs.push({ id: `${address}-${now}`, address, ...before.info, start: now, end: now, took: null, status: "closed", needs: 0, prompt: null, reply: null });
        changed = true;
      }
    }
    this.last = current;
    if (changed) this.save(runs);
  }

  // Attach prompts and replies from the hooks' files: a prompt from just before the run started
  // (but after the previous run on that terminal ended) up to its end; the last reply up to a minute
  // after it ended. Runs stop looking two minutes after they end.
  enrich(cx) {
    const now = Date.now();
    const runs = this.runs();
    const wanted = runs.filter((r) => r.status !== "closed" || r.prompt == null).filter((r) => !r.checked && (OPEN(r) || now - (r.end ?? now) < 120000));
    if (!wanted.length) return;
    cx.spawn(async (cx) => {
      const files = {};
      const read = async (name) => {
        if (files[name] === undefined) {
          try {
            const text = await readTextFile(`${home()}/.cache/herdr-activity/${name}.jsonl`);
            files[name] = (text ?? "").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
          } catch { files[name] = []; }
        }
        return files[name];
      };
      const next = this.runs().map((r) => ({ ...r }));
      let changed = false;
      for (const r of next) {
        if (!wanted.some((w) => w.id === r.id)) continue;
        let recs = r.address.includes("/") ? [] : await read(r.address);
        // Codex can run its hooks outside the terminal's environment: match by folder instead.
        if (!recs.length && r.app === "codex" && r.cwd) recs = (await read("unmatched")).filter((x) => x.agent === "codex" && x.cwd === r.cwd);
        const prev = next.filter((o) => o.address === r.address && o.start < r.start && o.end).reduce((m, o) => Math.max(m, o.end), 0);
        const end = r.end ?? now;
        const prompt = recs.filter((x) => x.kind === "prompt" && x.at >= Math.max(r.start - 120000, prev) && x.at <= end).pop();
        const reply = recs.filter((x) => x.kind === "reply" && x.at >= r.start && x.at <= end + 60000).pop();
        if (prompt && prompt.text !== r.prompt) { r.prompt = prompt.text; changed = true; }
        if (reply && reply.text !== r.reply) { r.reply = reply.text; changed = true; }
        if (!OPEN(r) && now - end >= 120000) { r.checked = true; changed = true; }
      }
      if (changed) this.save(next);
    });
  }

  // What a run looks like as a title: its session name, or the prompt's first line when the name says nothing.
  titleOf(r) {
    return r.generic && r.prompt ? firstLine(r.prompt) : r.name;
  }

  mark(t, status) {
    if (status === "needs you") return div().w(8).flex_none().font_bold().text_color(t.blocked).child("!");
    if (status === "finished") return div().size(6).mx(1).flex_none().rounded(3).bg(t.done);
    if (status === "working") return svg("mods/workspace-chrome/spinner.svg").size(9).flex_none().text_color(t.working).spin(900);
    return div().w(8).flex_none().text_color(t.dim).child("×");
  }

  tone(t, status) {
    return status === "needs you" ? t.blocked : status === "finished" ? t.done : status === "working" ? t.working : t.dim;
  }

  pill(t, status) {
    const c = this.tone(t, status);
    return div().flex_none().h(17).px(7).flex().items_center().rounded(9).font_family(SANS).text_size(10.5)
      .bg(tint(c, 0.14)).text_color(c).child(status);
  }

  openLog() {
    openOverlay({ mod: "sleek-activity", kind: "dialog", width: 760, height: 0.84, frame: "none", props: { log: true } });
  }

  // ---- the sidebar block ------------------------------------------------------------
  // Narrow sidebar: the latest few runs as a mark and the time; click opens the log.
  rail(t) {
    const shown = this.runs().slice(0, 3);
    fit(layout, run, "activity", 8 + 8 + Math.max(1, shown.length) * 22 + 4);
    return v_flex().id("root").size_full().min_h(0).px(6).pt(8).font_family(MONO).text_size(10.5)
      .on_size_change((size, cx) => { if ((size.width < 140) !== this.narrow) { this.narrow = size.width < 140; cx.notify(); } })
      .child(v_flex().id("act-rail").w_full().py(4).rounded(10).bg(glass(t.background)).cursor_pointer().tooltip("Activity: open the log")
        .hover((h) => h.bg(tint(t.foreground, 0.04)))
        .on_click(() => this.openLog())
        .children(shown.length ? shown.map((r, i) => h_flex().id(`rail-act-${i}`).h(22).gap(5).items_center().justify_center()
          .child(this.mark(t, r.status))
          .child(div().text_color(t.dim).child(clock(r.start))))
          : [div().h(22).flex().items_center().justify_center().text_color(t.dim).child("—")]));
  }

  sidebar(t) {
    if (this.narrow) return this.rail(t);
    const all = this.runs();
    const live = new Set(agents().map((a) => a.address));
    const shown = all.slice(0, SIDEBAR_ROWS());
    const toggle = (_e, cx) => {
      this.open = !this.open;
      localStorage.setItem("folded", this.open ? "0" : "1");
      cx.notify();
    };
    fit(layout, run, "activity", 34 + (this.open ? 2 + Math.max(1, shown.length) * ROW + (all.length ? 28 : 0) + 8 : 0));
    const latest = all[0];
    const footer = h_flex().id("act-all").h(26).mt(2).mx(4).px(8).gap(6).items_center().justify_center().cursor_pointer()
      .rounded(6).text_color(t.dim)
      .hover((h) => h.bg(tint(t.foreground, 0.05)).text_color(t.foreground))
      .on_click(() => this.openLog())
      .child(div().font_family(SANS).child(`view all ${all.length} run${all.length === 1 ? "" : "s"}`))
      .child(div().child("›"));
    const rows = shown.length
      ? shown.map((r, i) => h_flex().id(`act-${i}`).h(ROW).mx(4).px(6).gap(8).items_center().rounded(6)
          .when(live.has(r.address), (el) => el.cursor_pointer().hover((h) => h.bg(tint(t.foreground, 0.05)))
            .on_click(() => run("pane.focus", { pane: r.pane })))
          .child(div().flex_none().text_color(t.dim).child(clock(r.start)))
          .child(h_flex().w(10).flex_none().justify_center().child(this.mark(t, r.status)))
          .child(div().flex_1().min_w(0).truncate().font_family(SANS).text_size(12)
            .text_color(live.has(r.address) ? t.foreground : t.muted).child(this.titleOf(r)))
          .child(this.pill(t, r.status))
          .when(Boolean(took(r.took)), (el) => el.child(div().flex_none().text_color(t.dim).child(took(r.took)))))
      : [div().h(ROW).px(10).flex().items_center().font_family(SANS).text_color(t.dim).child("quiet so far")];
    return v_flex().id("root").size_full().min_h(0).font_family(MONO).text_size(11)
      .on_size_change((size, cx) => { if ((size.width < 140) !== this.narrow) { this.narrow = size.width < 140; cx.notify(); } })
      .child(box(t, {
        id: "activity", title: "activity", open: this.open, onToggle: toggle,
        extra: [],
        summary: latest ? [h_flex().min_w(0).gap(5).items_center()
          .child(this.mark(t, latest.status))
          .child(div().min_w(0).max_w(110).truncate().font_family(SANS).text_color(t.muted).child(this.titleOf(latest)))
          .child(this.pill(t, latest.status))] : [],
        body: v_flex().children(rows).when(all.length > 0, (el) => el.child(footer)),
      }));
  }

  // ---- the full log (dialog) ----------------------------------------------------------
  cap(t, text) {
    return div().flex_none().px(6).h(20).flex().items_center().rounded(5).bg(tint(t.foreground, 0.07))
      .font_family(MONO).text_size(10.5).text_color(t.muted).child(text);
  }

  // y: copy the selected run's prompt, and say what happened (a green or red pill in the footer).
  copy(text, cx) {
    const show = (ok, message) => {
      this.flash = { ok, message };
      const id = (this.flashId = (this.flashId ?? 0) + 1);
      cx.notify();
      cx.timer.after(ok ? 1800 : 3200, (cx) => { if (this.flashId === id) { this.flash = null; cx.notify(); } });
    };
    if (!text) return show(false, "No prompt recorded for this run");
    cx.spawn(async (cx) => {
      let ok = false;
      try { ok = (await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "sh", text])).code === 0; } catch {}
      const n = text.length;
      this.flash = ok ? { ok, message: `Prompt copied · ${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} characters` } : { ok, message: "Couldn't copy: pbcopy failed" };
      const id = (this.flashId = (this.flashId ?? 0) + 1);
      cx.notify();
      cx.timer.after(ok ? 1800 : 3200, (cx) => { if (this.flashId === id) { this.flash = null; cx.notify(); } });
    });
  }

  // Today at a glance: runs, agent time, how often you were needed, and who did the work.
  summary(t, all) {
    const today = new Date().toDateString();
    const runs = all.filter((r) => new Date(r.start).toDateString() === today && r.status !== "closed" || (new Date(r.start).toDateString() === today && r.took));
    const spent = (r) => r.took ?? (OPEN(r) ? Date.now() - r.start : 0);
    const total = runs.reduce((s, r) => s + spent(r), 0);
    const needs = runs.reduce((s, r) => s + (r.needs ?? 0), 0);
    const by = new Map();
    for (const r of runs) {
      const k = (r.program ?? r.app ?? "agent").toLowerCase();
      const cur = by.get(k) ?? { ms: 0, n: 0, tile: r.tile };
      cur.ms += spent(r); cur.n += 1; by.set(k, cur);
    }
    const palette = [t.ansi3, t.ansi4, t.ansi6, t.ansi5, t.ansi2, t.ansi1];
    const share = [...by.entries()].sort((a, b) => b[1].ms - a[1].ms).map(([k, v], i) => ({ k, ...v, color: palette[i % palette.length] }));
    const stat = (value, label, color = t.foreground) => v_flex().flex_1().min_w(0).gap(2).px(14).py(10).rounded(10).bg(t.background)
      .child(div().font_family(MONO).text_size(18).font_semibold().text_color(color).child(value))
      .child(div().font_family(SANS).text_size(11.5).text_color(t.dim).child(label));
    return v_flex().gap(8)
      .child(h_flex().gap(8)
        .child(stat(String(runs.length), runs.length === 1 ? "run today" : "runs today"))
        .child(stat(took(total) || "0s", "agent time"))
        .child(stat(String(needs), needs === 1 ? "time you were needed" : "times you were needed", needs ? t.blocked : t.foreground)))
      .when(share.length > 0 && total > 0, (el) => el.child(v_flex().gap(6).px(14).py(10).rounded(10).bg(t.background)
        .child(h_flex().w_full().h(6).rounded(3).overflow_hidden().gap(2)
          .children(share.map((s) => div().h_full().rounded(3).bg(s.color).w(`${Math.max(3, (s.ms / total) * 100)}%`))))
        .child(h_flex().gap(14).flex_wrap().font_family(SANS).text_size(11.5).text_color(t.muted)
          .children(share.map((s) => h_flex().gap(6).items_center()
            .child(div().size(7).rounded(4).bg(s.color))
            .child(s.k)
            .child(div().font_family(MONO).text_color(t.dim).child(`${Math.round((s.ms / total) * 100)}% · ${s.n}`)))))));
  }

  entry(t, r, i, selected, expanded, live) {
    const here = live.has(r.address);
    const pic = programIcon(r, 15, t.muted);
    const title = this.titleOf(r);
    const prompt = r.prompt && !(r.generic && title === firstLine(r.prompt)) ? firstLine(r.prompt) : r.prompt ? null : null;
    const block = (label, text, lines) => {
      const all = (text ?? "").split("\n");
      const cut = all.slice(0, lines).join("\n");
      return v_flex().gap(4)
        .child(div().font_family(SANS).text_size(11).font_semibold().text_color(t.dim).child(label))
        .child(div().w_full().font_family(SANS).text_size(12.5).text_color(t.foreground)
          .child(cut.length > 1400 ? cut.slice(0, 1400) + "…" : all.length > lines ? cut + "\n…" : cut));
    };
    return v_flex().id(`run-${r.id}`).w_full().px(10).py(8).gap(4).rounded(8).cursor_pointer()
      .when(selected, (el) => el.bg(tint(t.accent, 0.14)))
      .when(!selected, (el) => el.hover((h) => h.bg(tint(t.foreground, 0.04))))
      .on_click((_e, cx) => { this.expanded = this.expanded === i ? null : i; this.at = i; cx.notify(); })
      .child(h_flex().gap(10).items_center()
        .child(div().w(38).flex_none().font_family(MONO).text_size(11.5).text_color(t.dim).child(clock(r.start)))
        .child(h_flex().w(10).flex_none().justify_center().child(this.mark(t, r.status)))
        .child(div().w(16).flex_none().flex().justify_center().when(Boolean(pic), (el) => el.child(pic)))
        .child(div().flex_shrink_1().min_w(0).truncate().font_family(SANS).text_size(13)
          .text_color(here ? t.foreground : t.muted).child(title))
        .when(Boolean(r.space), (el) => el.child(h_flex().flex_shrink_1().min_w(0).gap(4).items_center().font_family(SANS).text_size(11.5).text_color(t.dim)
          .child(div().flex_none().child("·"))
          .child(div().min_w(0).truncate().font_semibold().child(r.space))
          .when(r.tab != null, (x) => x.child(div().flex_none().font_family(MONO).child(`› ${r.tab}`)))))
        .child(div().flex_1())
        .when((r.needs ?? 0) > 0 && r.status !== "needs you", (el) => el.child(div().flex_none().font_family(MONO).text_size(10.5).text_color(t.blocked).child(`!${r.needs}`)))
        .child(this.pill(t, r.status))
        .child(div().w(44).flex_none().text_right().font_family(MONO).text_size(11.5).text_color(t.dim)
          .child(took(r.took ?? (OPEN(r) ? Date.now() - r.start : 0)))))
      .when(!expanded && Boolean(prompt), (el) => el.child(h_flex().pl(84).gap(6).min_w(0)
        .child(div().flex_none().font_family(MONO).text_size(11.5).text_color(t.accent).child("›"))
        .child(div().flex_1().min_w(0).truncate().font_family(SANS).text_size(12).text_color(t.muted).child(prompt))))
      .when(expanded, (el) => el.child(v_flex().ml(84).mt(4).gap(12).p(12).rounded(8).bg(t.background)
        .child(r.prompt ? block("You", r.prompt, 10) : div().font_family(SANS).text_size(12).text_color(t.dim).child("No prompt recorded for this run."))
        .when(Boolean(r.reply), (x) => x.child(block("Reply", r.reply, 12)))
        .child(h_flex().gap(14).items_center().font_family(SANS).text_size(11).text_color(t.dim)
          .when(here, (x) => x.child(h_flex().gap(5).items_center().child(this.cap(t, "l")).child("open tab")))
          .when(Boolean(r.prompt), (x) => x.child(h_flex().gap(5).items_center().child(this.cap(t, "y")).child("copy prompt")))
          .child(div().font_family(MONO).child(`${(r.program ?? r.app ?? "agent").toLowerCase()}${r.end ? ` · ${clock(r.start)}–${clock(r.end)}` : ""}`)))));
  }

  logView(t) {
    const all = this.runs();
    const live = new Set(agents().map((a) => a.address));
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = all
      .filter((r) => this.filter === "all" || r.status === this.filter || (this.filter === "needs you" && (r.needs ?? 0) > 0))
      .filter((r) => !words.length || words.every((w) => [r.name, r.prompt ?? "", r.reply ?? "", r.space ?? "", r.program ?? ""].join(" ").toLowerCase().includes(w)));
    const count = (k) => (k === "all" ? all.length : all.filter((r) => r.status === k || (k === "needs you" && (r.needs ?? 0) > 0)).length);
    const close = () => closeOverlay(props().overlay);
    this.at = Math.max(0, Math.min(this.at, list.length - 1));

    // A window of entries that keeps the selected one in view (an expanded entry counts as several).
    const per = 50;
    const vis = Math.max(3, Math.floor(this.listH / per));
    const cost = (i) => (i === this.expanded ? 6 : list[i]?.prompt ? 1.25 : 1);
    const span = () => { let s = 0; for (let i = this.top; i <= this.at; i++) s += cost(i); return s; };
    if (this.scrolled) {
      // The wheel moved the view: keep the view (never past the last full page) and pull the
      // selection into it only if it went out of sight, like a normal scrolling list.
      this.scrolled = false;
      let lastTop = Math.max(0, list.length - 1), tail = list.length ? cost(lastTop) : 0;
      while (lastTop > 0 && tail + cost(lastTop - 1) <= vis) { lastTop--; tail += cost(lastTop); }
      this.top = Math.max(0, Math.min(this.top, lastTop));
      if (this.at < this.top) this.at = this.top;
      while (this.at > this.top && span() > vis) this.at--;
    } else {
      // The keys moved the selection: move the view to keep it in sight.
      if (this.at < this.top) this.top = this.at;
      while (this.top < this.at && span() > vis) this.top++;
    }
    let total = 0, before = 0;
    for (let i = 0; i < list.length; i++) { total += cost(i); if (i < this.top) before += cost(i); }
    const bar = total > vis ? (() => {
      const h = Math.max(24, this.listH * vis / total);
      return { h, top: (this.listH - h) * Math.min(1, before / (total - vis)) };
    })() : null;
    const shown = [];
    let used = 0;
    for (let i = this.top; i < list.length && used < vis + 1; i++) { shown.push(i); used += cost(i); }

    const move = (d, cx) => { if (!list.length) return; this.at = Math.max(0, Math.min(list.length - 1, this.at + d)); this.expanded = null; cx.notify(); };
    const sel = list[this.at];

    const chip = (k) => {
      const on = this.filter === k;
      return h_flex().id(`flt-${k}`).h(26).px(10).gap(6).items_center().rounded(8).cursor_pointer().font_family(SANS).text_size(12)
        .bg(on ? tint(t.accent, 0.16) : t.background).text_color(on ? t.foreground : t.muted)
        .hover((h) => h.text_color(t.foreground))
        .on_click((_e, cx) => { this.filter = k; this.at = 0; this.top = 0; this.expanded = null; cx.notify(); })
        .when(k !== "all", (el) => el.child(this.mark(t, k)))
        .child(k)
        .child(div().font_family(MONO).text_size(11).text_color(t.dim).child(String(count(k))));
    };

    const items = [];
    let day = null;
    for (const i of shown) {
      const r = list[i];
      const d = dayOf(r.start);
      if (d !== day) {
        day = d;
        items.push(div().h(24).px(10).pt(4).flex().items_center().font_family(SANS).text_size(11.5).font_semibold().text_color(t.dim).child(d));
      }
      items.push(this.entry(t, r, i, i === this.at, i === this.expanded, live));
    }

    return v_flex().id("act-log").size_full().track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key, m = e.modifiers, ctrl = m.control;
        const plain = !ctrl && !m.alt && !m.platform;
        const ch = plain ? (e.key_char ?? (k.length === 1 ? (m.shift ? k.toUpperCase() : k) : "")) : "";
        if (this.confirming) {
          if (k === "enter") this.clearNow();
          else if (k === "escape") this.confirming = false;
          else return;
          cx.notify();
          return cx.stop_propagation();
        }
        const pendingG = this.pendingG;
        this.pendingG = false;
        if (k === "escape") return close();
        if (this.mode === "insert") {
          if (k === "down" || (ctrl && k === "n")) move(1, cx);
          else if (k === "up" || (ctrl && k === "p")) move(-1, cx);
          else return;
          return cx.stop_propagation();
        }
        if (ch === "q") return close();
        if (ch === "/") { this.mode = "insert"; this.setField("/"); this.input.focus(); cx.notify(); }
        else if (k === "down" || ch === "j" || (ctrl && k === "n")) move(1, cx);
        else if (k === "up" || ch === "k" || (ctrl && k === "p")) move(-1, cx);
        else if (k === "enter" || ch === " ") { this.expanded = this.expanded === this.at ? null : this.at; cx.notify(); }
        else if (ch === "l") { if (sel && live.has(sel.address)) { close(); run("pane.focus", { pane: sel.pane }); } }
        else if (ch === "y") this.copy(sel?.prompt, cx);
        else if (ch === "g") { if (pendingG) { this.at = 0; this.top = 0; this.expanded = null; cx.notify(); } else this.pendingG = true; }
        else if (ch === "G") { this.at = Math.max(0, list.length - 1); this.expanded = null; cx.notify(); }
        else if (ctrl && k === "d") move(Math.max(1, Math.floor(vis / 2)), cx);
        else if (ctrl && k === "u") move(-Math.max(1, Math.floor(vis / 2)), cx);
        else return;
        cx.stop_propagation();
      })
      .child(v_flex().size_full().rounded(14).border_1().border_color(t.border).shadow_lg().overflow_hidden()
        .bg(t.chrome).text_color(t.foreground).p(8).gap(8)
        // Header: the mode block (lualine-style, like Go to), the search field, clear.
        .child(h_flex().h(46).flex_none().px(12).gap(10).items_center().rounded(10).bg(t.background)
          .child(div().flex_none().h(22).px(8).flex().items_center().rounded(6).font_family(MONO).text_size(10.5).font_bold()
            .bg(this.mode === "insert" ? t.accent : t.ansi4).text_color(t.background).child(this.mode === "insert" ? "SEARCH" : "ACTIVITY"))
          .child(svg("mods/workspace-chrome/search.svg").size(15).flex_none().text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(14).text_color(t.foreground))
          .child(div().id("act-clear").flex_none().h(24).px(9).flex().items_center().rounded(6).font_family(SANS).text_size(12)
            .bg(tint(t.foreground, 0.06)).text_color(t.muted).cursor_pointer()
            .when(all.length === 0, (el) => el.opacity(0.4))
            .hover((h) => h.bg(tint(t.blocked, 0.16)).text_color(t.blocked))
            .on_click((_e, cx) => { if (all.length) { this.confirming = true; this.handle.focus(); cx.notify(); } })
            .child("clear")))
        .child(this.summary(t, all))
        .child(h_flex().gap(6).flex_wrap().children(["all", ...STATES].map(chip)))
        .child(this.confirming ? this.confirmPanel(t, all.length)
          : v_flex().id("act-log-list").flex_1().min_h(0).overflow_hidden().gap(2)
            .relative()
            // Room for the position marker, so it sits beside the entries instead of over them.
            .when(Boolean(bar), (el) => el.pr(12))
            .on_size_change((size, cx) => { if (Math.abs(size.height - this.listH) > 4) { this.listH = size.height; cx.notify(); } })
            // Scrolls the view, not the selection. A trackpad sends many small events per swipe:
            // move one entry per row's height of travel (a mouse wheel: one entry per line).
            .on_scroll_wheel((e, cx) => {
              if (e.touch_phase === "started") this.wheel = 0;
              const lines = e.delta_lines?.y;
              const d = lines ? lines * per : e.delta.y;
              if ((this.wheel ?? 0) * d < 0) this.wheel = 0; // direction changed
              this.wheel = (this.wheel ?? 0) + d;
              const steps = Math.trunc(this.wheel / per);
              if (!steps) return;
              this.wheel -= steps * per;
              this.top = Math.max(0, Math.min(list.length - 1, this.top - steps));
              this.scrolled = true;
              cx.notify();
            })
            .children(items.length ? items : [div().py(24).px(12).font_family(SANS).text_color(t.dim)
              .child(words.length ? `Nothing matches “${this.query}”` : this.filter === "all" ? "Nothing yet: runs show up here as your agents work." : `No "${this.filter}" runs yet.`)])
            // A slim position marker when the log is longer than the view, as in Go to. Sized and
            // placed by entries (an expanded one counts as several), since the log moves by entry.
            .when(Boolean(bar), (el) => el.child(div().absolute().right(3).w(3).rounded(2).bg(tint(t.foreground, 0.15))
              .h(bar.h).top(bar.top))))
        // Footer: the keys, like Go to's.
        .child(h_flex().h(30).flex_none().px(8).gap(14).items_center().font_family(SANS).text_size(11).text_color(t.dim)
          .when(this.mode === "normal", (el) => el
            .child(h_flex().gap(5).items_center().child(this.cap(t, "j k")).child("move"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "↵")).child("expand"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "l")).child("open tab"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "y")).child("copy prompt"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "/")).child("search"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "q")).child("quit")))
          .when(this.mode === "insert", (el) => el
            .child(h_flex().gap(5).items_center().child(this.cap(t, "↑↓")).child("move"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "↵")).child("done"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "⌫")).child("delete / to stop searching")))
          .child(div().flex_1())
          .when(Boolean(this.flash), (el) => el.child(h_flex().flex_none().h(22).px(9).gap(6).items_center().rounded(11)
            .bg(tint(this.flash.ok ? t.done : t.blocked, 0.16)).text_color(this.flash.ok ? t.done : t.blocked).font_family(SANS).text_size(11.5)
            .child(div().font_bold().child(this.flash.ok ? "✓" : "!"))
            .child(this.flash.message)))
          .child(div().font_family(MONO).child(`${list.length} of ${all.length} · ${KEEP()} kept`))));
  }

  clearNow() {
    setShared("activity.runs", []);
    setShared("activity.events", []);
    this.confirming = false;
  }

  // "Clear activity history?" in place of the list, so nothing is lost by a stray click.
  confirmPanel(t, n) {
    const button = (id, label, danger, onClick) => h_flex().id(id).h(28).px(14).items_center().rounded(8).cursor_pointer().font_family(SANS)
      .when(danger, (el) => el.bg(t.blocked).text_color(t.background).font_semibold())
      .when(!danger, (el) => el.bg(tint(t.foreground, 0.06)).text_color(t.muted).hover((h) => h.text_color(t.foreground)))
      .on_click((_e, cx) => { onClick(); cx.notify(); })
      .child(label);
    return v_flex().flex_1().min_h(0).items_center().justify_center()
      .child(v_flex().w(400).p(18).gap(10).rounded(10).bg(t.background)
        .child(h_flex().gap(8).items_center()
          .child(div().font_bold().text_color(t.blocked).child("!"))
          .child(div().font_family(SANS).font_semibold().text_size(13).child("Clear the activity history?")))
        .child(div().font_family(SANS).text_size(12.5).text_color(t.muted)
          .child(`This deletes all ${n} run${n === 1 ? "" : "s"}, with their prompts and replies, from the log and the sidebar. It can't be undone.`))
        .child(h_flex().pt(6).gap(8).justify_end().items_center()
          .child(div().font_family(MONO).text_size(11).text_color(t.dim).mr(4).child("esc · ↵"))
          .child(button("act-cancel", "Cancel", false, () => { this.confirming = false; }))
          .child(button("act-confirm", "Clear", true, () => this.clearNow()))));
  }

  render() {
    const t = theme();
    if (this.log) return this.logView(t);
    this.record(agents(), Date.now());
    if (R("sidebar.activity", true) === false) { fit(layout, run, "activity", 0); return div(); }
    return this.sidebar(t);
  }
}
