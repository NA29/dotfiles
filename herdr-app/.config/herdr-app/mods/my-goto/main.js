// Personal Go to screen (replaces the shipped picker in my-main): cmd-p, the sidebar's
// search icon, and Ctrl+A g.
//   Needs you   tabs whose agents are blocked or finished, first
//   Spaces      every space (Enter on its header goes there) and its tabs, with agents
//   Actions     new tab/space, rename, settings, sidebar; shortcuts read from keys.json
// Vim-style modes, set by the field itself: a leading "/" means search (insert) mode.
// Normal (on open, empty field): j/k move, l or Enter opens, h jumps up to the space, gg/G
// top/bottom, ⌃D/⌃U half a page, x closes the selected tab, q leaves, / starts a search.
// Insert ("/…" in the field): type to filter (every word must match), ↑/↓ or ⌃N/⌃P move,
// Enter opens; Backspace over the "/" goes back to normal. Esc always leaves.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, spaces, panes, run, hc, theme, keys, props, closeOverlay, openOverlay, shared, setShared, home } from "herdr";

// Personal: a tab's label. A name you gave it wins; else what's in it: the agent's session
// name (from its terminal title), else the program running ("nvim"), else the shell's
// folder. Herdr's own name for an unnamed tab is just its number.
function tabLabel(tab, ps, homeDir) {
  if (tab.named) return tab.name;
  const mine = ps.filter((p) => p.tab === tab.id && p.terminal);
  const lead = mine.find((p) => p.program?.agent) ?? mine.find((p) => p.focused) ?? mine[0];
  if (!lead) return tab.name;
  const base = (dir) => !dir ? "" : dir === homeDir ? "~" : dir.split("/").filter(Boolean).pop() ?? dir;
  // An agent, or any program with a telling title (an agent that doesn't report status
  // still titles its terminal: "◐ Herdr config migration", "OC | Fix login").
  if (!lead.program?.shell) {
    const raw = (lead.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/^(OC|CC|Codex)\s*[|:·-]\s*/i, "").trim();
    const low = raw.toLowerCase();
    const said = [lead.program?.name, lead.program?.key, lead.app].filter(Boolean).map((x) => x.toLowerCase());
    const generic = !raw || said.includes(low) || low === base(lead.cwd).toLowerCase() || /^[~/]/.test(raw) || raw.includes("@")
      || /^(claude( code)?|codex|open ?code|shell)$/.test(low) || /^new session\b/.test(low);
    if (!generic) return raw;
    if (lead.program?.name && lead.program.name !== "program") return lead.program.name;
  }
  return base(lead.cwd) || tab.name;
}


// How opaque the panel is (0–1); matches tmux-prefix.
const PANEL_ALPHA = 1;
const SIZE = { section: 30, space: 40, tab: 36, action: 36 };

function translucent(color, alpha) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return color + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

// Space colors, the same way the sidebar picks them (shared "space.colors").
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const PROJECT_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
function spaceColors() {
  const ids = new Set(spaces().map((p) => p.id));
  const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = PROJECT_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}
function spaceColor(t, p) {
  if (p.name === "~") return t.dim;
  const c = spaceColors()[p.id] ?? PROJECT_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

// Personal: space badges. Theme colors (a stored name like "ansi6" is read from the
// theme, so Rosé Pine shows love/gold/rose/pine/foam/iris), a soft tinted tile with a
// colored letter, filled solid for the shown space; the home space (~) gets a house.
function tint(color, alpha) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color + Math.round(alpha * 255).toString(16).padStart(2, "0") : color;
}
function avatar(t, w, size = 20) {
  const home = w.name === "~";
  const stored = (shared("space.colors") ?? {})[w.id];
  const color = home ? t.ansi6 : !stored ? t.ansi6 : stored.startsWith("#") ? stored : (t[stored] ?? t.accent);
  const ink = w.active ? t.background : color;
  const tile = h_flex().size(size).flex_none().rounded(Math.round(size * 0.3)).items_center().justify_center()
    .when(w.active, (el) => el.bg(color))
    .when(!w.active, (el) => el.bg(tint(color, 0.16)).border_1().border_color(tint(color, 0.38)));
  return home
    ? tile.child(svg("mods/my-spaces/home.svg").size(Math.round(size * 0.6)).text_color(ink))
    : tile.text_size(Math.round(size * 0.55)).font_bold().text_color(ink).child([...w.name][0]?.toUpperCase() ?? "?");
}

// Workspace numbers, like the sidebar (Ctrl+1–9 jump by them): the number in Geist Mono and the
// workspace's colour, on a filled tile for the shown one.
function numberBadge(t, w, size = 22) {
  const n = spaces().findIndex((x) => x.id === w.id) + 1;
  // The sidebar's lookup: a stored theme colour name read from the theme (Rosé Pine hues).
  const stored = (shared("space.colors") ?? {})[w.id];
  const color = w.name === "~" || !stored ? t.ansi6 : stored.startsWith("#") ? stored : (t[stored] ?? t.accent);
  return h_flex().size(size).flex_none().rounded(Math.round(size * 0.3)).items_center().justify_center()
    .font_family("Geist Mono").font_semibold().text_size(Math.round(size * 0.6))
    .when(w.active, (el) => el.bg(color).text_color(t.background))
    .when(!w.active, (el) => el.text_color(color))
    .child(String(n || "·"));
}

// The same, as plain type (polybar/waybar style): zero-padded, the workspace's colour,
// softened for workspaces other than the shown one.
function workspaceNumber(t, w) {
  const n = spaces().findIndex((x) => x.id === w.id) + 1;
  const stored = (shared("space.colors") ?? {})[w.id];
  const color = w.name === "~" || !stored ? t.ansi6 : stored.startsWith("#") ? stored : (t[stored] ?? t.accent);
  return div().w(22).flex_none().flex().justify_center().font_family("Geist Mono").font_semibold().text_size(13)
    .text_color(w.active ? color : tint(color, 0.55)).child(String(n || 0).padStart(2, "0"));
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// "cmd-shift-p" -> "⌘⇧P", for the shortcut hints.
const MOD = { cmd: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧", fn: "fn" };
const KEY = { enter: "↵", escape: "esc", backspace: "⌫", tab: "⇥", space: "␣", left: "←", right: "→", up: "↑", down: "↓" };
function keycap(binding) {
  if (!binding || binding.includes(" ")) return null;
  const parts = binding.split("-");
  const key = parts.pop() || "-";
  return parts.map((m) => MOD[m] ?? m).join("") + (KEY[key] ?? key.toUpperCase());
}
function shortcut(action) {
  const k = keys().find((k) => k.section === "global" && k.action === action);
  return keycap(k?.keys);
}

function prompt(title, command, value) {
  openOverlay({ mod: "my-prompt", kind: "dialog", width: 420, height: 210, props: { title, value, command } });
}

export default class GoTo extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = null;
    this.follow = true;
    this.listMax = 460;
    this.machines = [];
    this.scroll = 0;
    this.handle = cx.focus_handle();
    this.mode = "normal";
    this.pendingG = false;
    this.input = InputState.new({ placeholder: "Press / to search spaces, tabs, agents and actions" });
    this.input.on("change", (_e, cx) => {
      const v = this.input.value();
      // The / key can land in the field on top of the one put there: keep one.
      if (v.startsWith("//")) { this.setField(v.slice(1)); return; }
      if (v.startsWith("/")) { this.mode = "insert"; this.filter = v.slice(1); }
      else {
        // The "/" is gone (Backspace): back to normal, empty field, keys to the list.
        this.mode = "normal"; this.filter = "";
        if (v !== "") this.input.set_value("");
        this.handle.focus();
      }
      this.at = 0; this.follow = true; cx.notify();
    });
    this.input.on("submit", () => this.go(this.picked()));
    // A click in the field starts a search too.
    this.input.on("focus", () => { if (!this.input.value().startsWith("/")) this.setField("/"); });
    this.handle.focus();
    cx.timer.after(600, () => (this.mode === "insert" ? this.input.focus() : this.handle.focus()));
    cx.spawn(async (cx) => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => m.state === "connected" && !m.temporary).map((m) => m.name);
      } catch {}
      cx.notify();
    });
  }

  close() {
    closeOverlay(props().overlay);
  }

  // Set the field's text with the cursor at the end.
  setField(text) {
    this.input.set_value(text);
    this.input.set_selected_range({ start: text.length, end: text.length });
  }

  picked() {
    return this.rows().filter((r) => r.kind !== "section")[this.at ?? 0];
  }

  rows() {
    const words = this.filter.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (...parts) => !words.length || words.every((w) => parts.join(" ").toLowerCase().includes(w));
    const all = agents();
    const active = spaces().find((s) => s.active);
    const out = [];

    const ps = panes(), homeDir = home();
    const tabRow = (s, tab, withSpace) => {
      const mine = all.filter((a) => a.tab === tab.id);
      const label = tabLabel(tab, ps, homeDir);
      const panes = ps.filter((p) => p.tab === tab.id && p.terminal);
      const agentPane = panes.find((p) => p.program?.agent);
      const program = agentPane?.program ?? panes.find((p) => p.focused)?.program ?? panes[0]?.program;
      const what = agentPane ? "agent" : program?.shell || !program ? "terminal" : "program";
      return { kind: "tab", s, tab, mine, withSpace, label, what, program,
        text: [s.name, s.branch ?? "", s.machine ?? "", tab.name, label, ...mine.map((a) => `${a.program?.name ?? ""} ${a.title ?? ""}`)] };
    };

    if (!words.length) {
      const urgent = spaces().flatMap((s) => s.tabs.filter((t) => t.status === "blocked" || t.status === "done").map((t) => tabRow(s, t, true)));
      urgent.sort((a, b) => (b.tab.status === "blocked") - (a.tab.status === "blocked"));
      if (urgent.length) out.push({ kind: "section", label: "Needs you" }, ...urgent);
    }

    const spaceRows = [];
    for (const s of spaces()) {
      const tabs = s.tabs.map((t) => tabRow(s, t, false)).filter((r) => hit(...r.text));
      const spaceHit = hit(s.name, s.branch ?? "", s.machine ?? "");
      if (!tabs.length && !spaceHit) continue;
      const shownTabs = tabs.length ? tabs : s.tabs.map((t) => tabRow(s, t, false));
      shownTabs.forEach((r, i) => { r.last = i === shownTabs.length - 1; });
      spaceRows.push({ kind: "space", s, text: [s.name], hasTabs: shownTabs.length > 0 }, ...shownTabs);
    }
    if (spaceRows.length) out.push({ kind: "section", label: "Spaces" }, ...spaceRows);

    const actions = [
      { label: "New tab", icon: "plus", hint: shortcut("tab.new"), go: () => run("tab.new") },
      { label: "New space…", icon: "folder-plus", hint: shortcut("my-keys.new-space"), go: () => prompt("New space", { name: "space.new", args: { machine: active?.machine ?? "" } }) },
      ...this.machines.map((m) => ({ label: `New space on ${m}…`, icon: "folder-plus", go: () => prompt(`New space on ${m}`, { name: "space.new", args: { machine: m } }) })),
      { label: "Rename this tab…", icon: "square-pen", hint: shortcut("tab.rename"), go: () => {
        const tab = active?.tabs.find((t) => t.active);
        if (tab) prompt("Rename tab", { name: "tab.rename", args: { id: tab.id } }, tab.named ? tab.name : "");
      } },
      { label: "Rename this space…", icon: "square-pen", hint: shortcut("space.rename"), go: () => {
        if (active) prompt("Rename space", { name: "space.rename", args: { id: active.id } }, active.named ? active.name : "");
      } },
      { label: "Toggle sidebar", icon: "sidebar", hint: shortcut("layout.toggle:sidebar"), go: () => run("layout.toggle", { id: "sidebar" }) },
      { label: "Settings", icon: "settings", hint: shortcut("app.settings"), go: () => run("app.settings") },
    ].filter((a) => hit(a.label, "action"));
    if (actions.length) out.push({ kind: "section", label: "Actions" }, ...actions.map((a) => ({ kind: "action", ...a })));
    return out;
  }

  go(r) {
    if (!r) return;
    this.close();
    if (r.kind === "tab") run("tab.select", { id: r.tab.id });
    else if (r.kind === "space") run("space.select", { id: r.s.id });
    else if (r.kind === "action") r.go();
  }

  glyph(t, st) {
    if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
    if (st === "blocked") return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (st === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done);
    if (st === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none();
  }

  // The leading icon of a tab row: what the tab is. Agents show their status as a corner dot.
  kindIcon(t, r) {
    const st = r.tab.status;
    const dot = st === "blocked" ? t.blocked : st === "done" ? t.done : st === "working" ? t.working : st === "idle" ? t.dim : null;
    const pic = r.what === "terminal"
      ? svg("mods/workspace-chrome/terminal.svg").size(14).text_color(t.dim)
      : icon(r.program, 15, t.muted) ?? svg("mods/workspace-chrome/square.svg").size(12).text_color(t.dim);
    // Bare, like the sidebar's agent rows (status sits at the row's right edge).
    return div().size(18).flex_none().flex().items_center().justify_center().child(pic);
  }

  // A keycap: a soft filled pill in the mono font.
  cap(t, text) {
    return div().flex_none().px(6).h(20).flex().items_center().rounded(5).bg(tint(t.foreground, 0.07))
      .font_family("Geist Mono").text_size(10.5).text_color(t.muted).child(text);
  }

  pill(t, text, color) {
    return div().flex_none().h(18).px(7).flex().items_center().rounded(9).bg(tint(color, 0.14)).text_size(10.5).text_color(color).child(text);
  }

  // Sleek rows (Raycast-style): roomy, a soft filled highlight for the selection.
  row(t, r, on) {
    if (r.kind === "section") {
      return h_flex().h(SIZE.section).px(14).pt(10).items_center().text_size(11).font_semibold()
        .text_color(r.label === "Needs you" ? t.blocked : t.dim).child(r.label);
    }
    // The cursor row: a soft accent wash (like the active tab pill and the current workspace card).
    const base = (id, h) => h_flex().id(id).relative().h(h).mx(8).px(10).gap(10).items_center().rounded(8).cursor_pointer()
      .when(on, (el) => el.bg(tint(t.accent, 0.14))).when(!on, (el) => el.hover((s) => s.bg(tint(t.foreground, 0.04))))
      .on_click(() => this.go(r));
    // Tree guides (like eza --tree): a faint line down from the space's badge to each tab.
    const GUIDE = 21, guide = tint(t.foreground, 0.16);
    if (r.kind === "space") {
      const s = r.s;
      return base(`gt-space-${s.id}`, SIZE.space)
        .when(Boolean(r.hasTabs), (el) => el.child(div().absolute().left(GUIDE).top(29).w(1).h(SIZE.space - 29).bg(guide)))
        .child((spaceColors(), workspaceNumber(t, s)))
        // Workspace names are headings: semibold everywhere; the shown one is bright.
        .child(div().min_w(0).truncate().text_size(13.5).font_semibold().text_color(s.active ? t.foreground : t.muted).child(s.name))
        .when(Boolean(s.branch), (el) => el.child(div().min_w(0).truncate().font_family("Geist Mono").text_size(11).text_color(t.dim).child(`⎇ ${s.branch}`)))
        .when(Boolean(s.machine), (el) => el.child(div().text_size(11).text_color(t.dim).child(`@${s.machine}`)))
        .child(div().flex_1())
        .child(div().flex_none().h(18).px(7).flex().items_center().rounded(9).bg(tint(t.foreground, 0.06))
          .font_family("Geist Mono").text_size(10.5).text_color(t.dim).child(`${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`));
    }
    if (r.kind === "tab") {
      const { s, tab, mine } = r;
      const here = s.active && tab.active;
      const hint = s.active && tab.index <= 9 ? shortcut(`tab.select:${tab.index}`) : null;
      const who = mine.slice(0, 3);
      return base(`gt-tab-${tab.id}`, SIZE.tab)
        .when(!r.withSpace, (el) => el.pl(40)
          .child(div().absolute().left(GUIDE).top(0).w(1).h(r.last ? SIZE.tab / 2 : SIZE.tab).bg(guide))
          .child(div().absolute().left(GUIDE).top(SIZE.tab / 2).w(11).h(1).bg(guide)))
        // What it is, first: the agent's logo (status dot on its corner), a terminal icon, or the program's.
        .child(this.kindIcon(t, r))
        .when(r.withSpace, (el) => el.child(div().flex_none().max_w(140).truncate().font_semibold().text_color(t.dim).child(`${s.name} ›`)))
        .child(div().min_w(0).truncate().text_color(here ? t.foreground : t.muted).when(here, (d) => d.font_semibold()).child(r.label))
        .child(div().flex_1())
        // A tag naming it: the agent ("claude code"), "terminal", or the program; +N when a tab has more agents.
        .child(div().flex_none().h(18).px(7).flex().items_center().rounded(9).font_family("Geist Mono").text_size(10.5)
          // Rose, not the accent: purple stays reserved for "you are here".
          .when(r.what === "agent", (el) => el.bg(tint(t.ansi6, 0.13)).text_color(t.ansi6))
          .when(r.what !== "agent", (el) => el.bg(tint(t.foreground, 0.06)).text_color(t.dim))
          .child(r.what === "agent" ? (r.program?.name ?? "agent").toLowerCase() : r.what === "terminal" ? "terminal" : (r.program?.name ?? "program").toLowerCase()))
        .when(mine.length > 1, (el) => el.child(div().font_family("Geist Mono").text_size(10.5).text_color(t.dim).child(`+${mine.length - 1}`)))
        .when(tab.panes > 1, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`${tab.panes} panes`)))
        .when(Boolean(hint), (el) => el.child(this.cap(t, hint)))
        // Status at the right edge, the sidebar's marks: spinner, red !, foam dot; idle says nothing.
        .child(div().w(12).flex_none().flex().items_center().justify_center()
          .when(tab.status === "working", (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(11).text_color(t.working).spin(900)))
          .when(tab.status === "blocked", (el) => el.child(div().font_bold().text_color(t.blocked).child("!")))
          .when(tab.status === "done", (el) => el.child(div().size(6).rounded(3).bg(t.done))));
    }
    return base(`gt-act-${r.label}`, SIZE.action)
      .child(div().size(24).flex_none().flex().items_center().justify_center().rounded(6).bg(tint(t.foreground, 0.05))
        .child(svg(`mods/workspace-chrome/${r.icon ?? "plus"}.svg`).size(13).text_color(on ? t.foreground : t.muted)))
      .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(r.label))
      .when(Boolean(r.hint), (el) => el.child(this.cap(t, r.hint)));
  }

  render() {
    const t = theme();
    const rows = this.rows();
    const pickable = rows.filter((r) => r.kind !== "section");
    // Opens on where you are.
    if (this.at === null) this.at = Math.max(0, pickable.findIndex((r) => r.kind === "tab" && !r.withSpace && r.s.active && r.tab.active));
    this.at = Math.max(0, Math.min(this.at, pickable.length - 1));
    const sel = pickable[this.at];
    // One strip of rows at fixed y; the view scrolls only as far as it takes to keep
    // the selected row on screen (the shipped picker's way).
    const tops = [];
    let y = 0;
    for (const r of rows) { tops.push(y); y += SIZE[r.kind]; }
    const total = y;
    const listH = Math.max(SIZE.tab, Math.min(total, this.listMax));
    const maxScroll = Math.max(0, total - listH);
    const si = rows.indexOf(sel);
    if (this.follow && si >= 0) {
      this.follow = false;
      // Keep a section title above the first row of its section in view too.
      const top = si > 0 && rows[si - 1].kind === "section" ? tops[si - 1] : tops[si];
      if (top < this.scroll) this.scroll = top;
      if (tops[si] + SIZE[sel.kind] > this.scroll + listH) this.scroll = tops[si] + SIZE[sel.kind] - listH;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const shown = rows.map((r, i) => i).filter((i) => tops[i] + SIZE[rows[i].kind] > this.scroll && tops[i] < this.scroll + listH);

    const move = (d, cx) => {
      if (!pickable.length) return;
      this.at = (this.at + d + pickable.length) % pickable.length;
      this.follow = true;
      cx.notify();
    };

    return v_flex().id("my-goto").size_full().track_focus(this.handle)
      .on_size_change((size, cx) => {
        // Room for the list: the overlay's height minus the search bar and footer.
        const max = Math.max(160, Math.floor(size.height - 120));
        if (max !== this.listMax) { this.listMax = max; cx.notify(); }
      })
      .on_key_down((e, cx) => {
        const k = e.key;
        const m = e.modifiers;
        const ctrl = m.control;
        const plain = !ctrl && !m.alt && !m.platform;
        const ch = plain ? (e.key_char ?? (k.length === 1 ? (m.shift ? k.toUpperCase() : k) : "")) : "";
        const half = Math.max(1, Math.floor(listH / SIZE.tab / 2));
        const pendingG = this.pendingG;
        this.pendingG = false;
        if (k === "escape") return this.close();
        if (this.mode === "insert") {
          if (k === "down" || (ctrl && k === "n")) move(1, cx);
          else if (k === "up" || (ctrl && k === "p")) move(-1, cx);
          else return;
          return cx.stop_propagation();
        }
        if (ch === "q") return this.close();
        if (ch === "/") { this.mode = "insert"; this.setField("/"); this.input.focus(); cx.notify(); }
        else if (k === "down" || ch === "j" || (ctrl && k === "n")) move(1, cx);
        else if (k === "up" || ch === "k" || (ctrl && k === "p")) move(-1, cx);
        else if (k === "enter" || ch === "l") this.go(sel);
        else if (ch === "h") {
          // Up to the space this tab belongs to; from a space, the space before it.
          for (let i = (this.at ?? 0) - 1; i >= 0; i--) if (pickable[i].kind === "space") { this.at = i; this.follow = true; cx.notify(); break; }
        }
        else if (ch === "g") { if (pendingG) { this.at = 0; this.follow = true; cx.notify(); } else this.pendingG = true; }
        else if (ch === "G") { this.at = Math.max(0, pickable.length - 1); this.follow = true; cx.notify(); }
        else if (ctrl && k === "d") { this.at = Math.min(pickable.length - 1, (this.at ?? 0) + half); this.follow = true; cx.notify(); }
        else if (ctrl && k === "u") { this.at = Math.max(0, (this.at ?? 0) - half); this.follow = true; cx.notify(); }
        else if (ch === "x") { if (sel?.kind === "tab") { this.close(); run("tab.close", { id: sel.tab.id }); } }
        else return;
        cx.stop_propagation();
      })
      .child(v_flex().w_full().rounded(14).border_1().border_color(t.border).shadow_lg().overflow_hidden()
        .bg(t.chrome).text_color(t.foreground).text_size(13).pt(8)
        // Search: a filled field, like the sidebar's cards.
        .child(h_flex().h(46).flex_none().mx(8).px(14).gap(10).items_center().rounded(10).bg(t.background)
          // The mode, like vim's: neutral in normal, accent while typing.
          // lualine-style mode block: solid, uppercase; pine for NORMAL, the accent for INSERT.
          .child(div().flex_none().h(22).px(8).flex().items_center().rounded(6).font_family("Geist Mono").text_size(10.5).font_bold()
            .bg(this.mode === "insert" ? t.accent : t.ansi4).text_color(t.background)
            .child(this.mode.toUpperCase()))
          .child(svg("mods/workspace-chrome/search.svg").size(16).flex_none().text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(15).text_color(t.foreground))
          .child(h_flex().flex_none().gap(5).items_center().text_size(11).text_color(t.dim)
            .when(this.mode === "normal", (el) => el.child(this.cap(t, "/")).child("search"))
            .when(this.mode === "insert", (el) => el.child(this.cap(t, "esc")).child("close"))))
        // List
        .child(rows.length
          ? div().id("my-goto-list").relative().w_full().h(listH).my(4).overflow_hidden()
              .on_scroll_wheel((e, cx) => {
                this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
                cx.notify();
              })
              .children(shown.map((i) => div().absolute().left(0).right(0).top(tops[i] - this.scroll).h(SIZE[rows[i].kind])
                .child(this.row(t, rows[i], rows[i] === sel))))
              // A slim position marker when the list is longer than the view.
              .when(maxScroll > 0, (el) => el.child(div().absolute().right(3).w(3).rounded(2).bg(tint(t.foreground, 0.15))
                .h(Math.max(24, listH * listH / total)).top((listH - Math.max(24, listH * listH / total)) * (this.scroll / maxScroll))))
          : div().px(16).py(18).text_color(t.dim).child(`Nothing matches “${this.filter}”`))
        // Footer: keys on the left, counts on the right; no divider line.
        .child(h_flex().h(38).flex_none().px(16).gap(14).items_center().text_size(11).text_color(t.dim)
          .when(this.mode === "normal", (el) => el
            .child(h_flex().gap(5).items_center().child(this.cap(t, "j k")).child("move"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "l")).child("open"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "h")).child("space"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "x")).child("close tab"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "q")).child("quit")))
          .when(this.mode === "insert", (el) => el
            .child(h_flex().gap(5).items_center().child(this.cap(t, "↑↓")).child("move"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "↵")).child("open"))
            .child(h_flex().gap(5).items_center().child(this.cap(t, "⌫")).child("delete / for normal mode")))
          .child(div().flex_1())
          .child(div().font_family("Geist Mono").child(`${pickable.filter((r) => r.kind === "tab" && !r.withSpace).length} tabs · ${spaces().length} spaces`))));
  }
}
