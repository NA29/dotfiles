// Personal (my-workspaces): the Spaces list and the agents list in one. Each workspace
// is a btop/lazygit-style box: a flat 1px frame (neutral, or the workspace's color when
// it's the shown one) with its badge, name and git state set into the top edge on the
// left and its live agent counts on the right; its agents are listed inside. Built on
// my-spaces, so worktrees nest under their repo, machines group, the + asks for a name,
// right-click opens the space menu and dragging a box's top edge reorders.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, panes, run, openOverlay, exec, hc, theme, shared, setShared, watchFolder, window, layout, agents, terminals, settings, setAgentOrder, props, closeOverlay, home as homeDir, knownAgents } from "herdr";
import { div as sqDiv } from "gpui-kit";
import { shared as sqShared } from "herdr";
import { shellCount, withShellState } from "./shell-state.js";
import { VIEW_MODES, viewMode, orderAgents, attentionGroups } from "./agent-views.js";

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

// Personal: cards and pills follow the Cards transparency slider (my-settings).
const glass = (c) => {
  const r = shared("rice") ?? {};
  const p = r["transparency.on"] === false ? 100 : (r["transparency.cards"] ?? 100);
  return p >= 100 || !/^#[0-9a-f]{6}$/i.test(c) ? c : c + Math.round((p / 100) * 255).toString(16).padStart(2, "0");
};

// Personal: every + here asks for the new space's name first (my-prompt), instead of
// making one called after its folder.
function newSpace(args = {}) {
  openOverlay({ mod: "my-prompt", kind: "dialog", width: 420, height: 192, frame: "none",
    props: { title: "New space", command: { name: "space.new", args } } });
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar is either full or the rail, nothing between; the layout's limits keep it that way.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Back to full: same step as sleek-chrome's setRail (mods can't import across folders).
function expandRail() {
  const root = JSON.parse(JSON.stringify(layout()));
  const side = find(root, "sidebar"), row = find(root, "dim");
  if (!side || !row) return;
  setShared("sidebar.collapsed", false);
  side.size = { px: Math.max(232, shared("sidebar.width") ?? 268) };
  side.min = 232;
  side.max = 480;
  row.resizable = true;
  run("layout.set", { layout: root });
}

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
const rowHeight = ({ tree }) => (tree ? 28 : 30);
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

// What a stored color name looks like on an avatar (the same in every mod
// that draws space avatars): one strong color per hue, light and dark alike.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };

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
    ? tile.child(svg("mods/sleek-workspaces/home.svg").size(Math.round(size * 0.6)).text_color(ink))
    : tile.text_size(Math.round(size * 0.55)).font_bold().text_color(ink).child([...w.name][0]?.toUpperCase() ?? "?");
}

// Personal: Hyprland-style workspace numbers (Ctrl+1–9 jump by them). The number in Geist Mono
// and the workspace's own colour: bare for the others, on a filled tile for the shown one.
function numberBadge(t, w, i, size = 20) {
  const color = w.name === "~" ? t.ansi6 : (() => {
    const stored = (shared("space.colors") ?? {})[w.id];
    return !stored ? t.ansi6 : stored.startsWith("#") ? stored : (t[stored] ?? t.accent);
  })();
  return h_flex().size(size).flex_none().rounded(Math.round(size * 0.3)).items_center().justify_center()
    .font_family("Geist Mono").font_semibold().text_size(Math.round(size * 0.62))
    .when(w.active, (el) => el.bg(color).text_color(t.background))
    .when(!w.active, (el) => el.text_color(color))
    .child(String(i + 1));
}

// Personal: the workspace number as plain type (polybar/waybar style): zero-padded Geist Mono
// in the workspace's colour, full strength for the shown one, softened for the others.
// Personal: each agent's latest prompt, from the Activity log (newest run first), tidied for one line.
const cleanPrompt = (p) => String(p ?? "").replace(/<\/?pasted_content[^>]*>/g, " ").replace(/\[Image #\d+\]/g, " ").replace(/\s+/g, " ").trim().replace(/^[-–:]\s*/, "");
const latestPrompts = () => {
  const out = new Map();
  for (const r of shared("activity.runs") ?? []) {
    if (out.has(r.address) || /^\s*<hc>/.test(String(r.prompt ?? ""))) continue;
    const text = cleanPrompt(r.prompt);
    if (text) out.set(r.address, text);
  }
  return out;
};

// Personal: workspace numbers. Softer when not current on dark themes; on light themes the pale
// terminal colours are blended toward the text so they stay legible.
const numInk = (t, c, dim = false) => {
  if (parseInt(String(t.chrome).slice(1, 3), 16) <= 128) return dim ? tint(c, 0.8) : c;
  if (!/^#[0-9a-f]{6}/i.test(c)) return c;
  return "#" + [1, 3, 5].map((i) => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.55 + parseInt(String(t.foreground).slice(i, i + 2), 16) * 0.45).toString(16).padStart(2, "0")).join("");
};

function workspaceNumber(t, w, i) {
  const color = w.name === "~" ? t.ansi6 : (() => {
    const stored = (shared("space.colors") ?? {})[w.id];
    return !stored ? t.ansi6 : stored.startsWith("#") ? stored : (t[stored] ?? t.accent);
  })();
  return div().w(20).flex_none().font_family("Geist Mono").font_semibold().text_size(13)
    .text_color(numInk(t, color, !w.active)).child(String(i + 1).padStart(2, "0"));
}

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}


// ---- agents inside the boxes ------------------------------------------------------
// Font rule: words in Geist, numbers and code in Geist Mono (one family, designed together).
const MONO = () => "Geist Mono";
const SANS = "Geist";
const RANK = { blocked: 4, done: 3, working: 2, waiting: 1.5, idle: 1 };
function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
const cleanTitle = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}
// Blend two #rrggbb colors (a solid result, so cards stay opaque).
function mixHex(a, b, k) {
  if (!/^#[0-9a-f]{6}/i.test(a) || !/^#[0-9a-f]{6}/i.test(b)) return a;
  const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return "#" + [1, 3, 5].map((i) => Math.round(ch(a, i) * (1 - k) + ch(b, i) * k).toString(16).padStart(2, "0")).join("");
}
function spaceTone(t, s) {
  if (!s || s.name === "~") return t.ansi6;
  const stored = (shared("space.colors") ?? {})[s.id];
  return !stored ? t.ansi6 : stored.startsWith("#") ? stored : (t[stored] ?? t.accent);
}
// The agent's session name from the title it gives its terminal (Claude "◑ Name",
// OpenCode "OC | Name", Codex with terminal_title = thread-name). Titles that say
// nothing fall back to a tab you named, else null ("untitled").
function sessionName(a, cwdOf, tabOf) {
  const raw = cleanTitle(a.title).replace(/^(OC|CC|Codex)\s*[|:·-]\s*/i, "").trim();
  const low = raw.toLowerCase();
  const folder = (cwdOf.get(a.pane) ?? "").split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
  const said = [a.program?.name, a.program?.key, a.app].filter(Boolean).map((x) => x.toLowerCase());
  const generic = !raw || said.includes(low) || low === folder || low === a.address.split("/").pop() || /^[~/]/.test(raw) || raw.includes("@")
    || /^(claude( code)?|codex|open ?code|shell)$/.test(low) || /^new session\b/.test(low);
  if (!generic) return raw;
  const tab = tabOf.get(a.tab);
  return tab?.named ? tab.name : null;
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// Personal: concentric corners. Inner radius = outer radius - the padding between them.
const concentric = (outer, inset) => Math.max(0, outer - inset);
const ISLAND_R = () => (sqShared("rice") ?? {})["look.radius"] ?? 10;
const SECTION_R = () => concentric(ISLAND_R(), (sqShared("rice") ?? {})["look.gap"] ?? 6);
const CARD_R = () => SECTION_R();                  // cards sit straight on the island, one gap in
const ROW_R = () => SECTION_R();                   // rows sit straight on the island, one gap in

// Personal: surface levels. Blend the island colour toward the text colour, so a raised surface is
// visibly lighter on any dark theme (darker on a light one). The Cards slider still applies via glass().
const lift = (t, k) => {
  if (parseInt(String(t.chrome).slice(1, 3), 16) > 128) k *= 0.4;   // light themes: soft neutral steps, not stacked greys
  const a = String(t.chrome).slice(1, 7), b = String(t.foreground).slice(1, 7);
  const out = [0, 2, 4].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0"));
  return `#${out.join("")}`;
};

// Personal: selection strength. A wash that reads on dark looks heavy on white.
const selA = (t) => (parseInt(String(t.chrome).slice(1, 3), 16) > 128 ? 0.12 : 0.20);
export default class Spaces extends View {
  init(_props, cx) {
    // Which programs are agents, for panes that report no status (see render).
    this.agentKeys = new Set();
    cx.spawn(async (cx) => {
      try { this.agentKeys = new Set((await knownAgents()).map((a) => a.key)); cx.notify(); } catch {}
    });
    if (props()?.viewMenu || props()?.spaceMenu) {
      this.menuHandle = cx.focus_handle();
      this.menuHandle.focus();
      this.menuAt = Math.max(0, (props()?.items ?? []).findIndex((it) => it.active));
      return;
    }
    this.shellReadings = {};
    this.readingShells = false;
    this.refreshShells(cx);
    cx.timer.every(5000, cx => this.refreshShells(cx));
    this.jobs = []; // background shells, from shells.py
    this.refreshJobs(cx);
    cx.timer.every(5000, cx => this.refreshJobs(cx));
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.boxesFolded = new Set(JSON.parse(localStorage.getItem("boxes.folded") ?? "[]"));
    this.listFolded = localStorage.getItem("list.folded") === "1";
    // Each agent's last state and when it changed (ms), for "· 5m".
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    cx.timer.every(30000, (cx) => cx.notify());
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    // Simulate the batch so later indexes include earlier moves. An attempted
    // write can lose a sync conflict: allow the echo to settle before retrying.
    const order = sp.map(w => w.id);
    const target = out.map(r => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (this.ordering?.key !== key || this.orderingDue(Date.now())) {
      const moved = new Set();
      this.ordering = { key, at: Date.now(), machines: [] };
      for (let i = 0; i < out.length; i++) {
        const from = order.indexOf(out[i].w.id);
        if (from === i) continue;
        run("space.move", { id: out[i].w.id, index: i + 1 });
        moved.add(out[i].w.machine ?? null);
        order.splice(i, 0, order.splice(from, 1)[0]);
      }
      this.ordering.machines = [...moved];
    }
    return out.filter(r => this.shown.has(r.w.id));
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const draw = (r) => (collapsed ? this.compact(r, t) : this.row(r, t));
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.map(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(8).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(14).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(4).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); newSpace({ machine: m ?? "" }); }).child(svg("mods/workspace-chrome/plus.svg").size(12))))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.done : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(12).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(8).items_center().rounded(CARD_R())
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => newSpace({ machine: m ?? "" }))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      if (!collapsed && rebuilt) return [head];
      return [head, ...(folded ? [] : mine.length ? mine.map(draw) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // Only what's unusual, after the name: "herdr \u00b7 spike \u21912 \u21931". The repo or
  // branch goes when the name already says it (a worktree is named after its branch),
  // and master/main go: nearly every space is on one.
  gitTail(g, tree, name, t) {
    const raw = g.branch ?? "detached";
    const same = (a) => a.toLowerCase() === name.toLowerCase();
    const branch = same(raw) || raw === "master" || raw === "main" ? "" : raw;
    const repo = tree || same(g.name) ? "" : g.name;
    const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
    return h_flex()
      .flex_1()
      .min_w(0)
      .gap(6)
      .justify_end()
      .items_center()
      .text_size(12)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el.child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  refreshShells(cx) {
    if (this.readingShells) return;
    this.readingShells = true;
    cx.spawn(async (cx) => {
      try {
        const candidates = agents().filter(a => ['idle', 'done'].includes(a.status)
          && /claude/i.test(a.app ?? a.program?.key ?? ''));
        const next = {};
        await Promise.all(candidates.map(async a => {
          try {
            const screen = await hc(['read', a.address]);
            next[a.address] = { seq: a.seq, count: screen.code === 0 ? shellCount(screen.stdout) : 0, at: Date.now() };
          } catch {} // Missing terminals and failed reads clear their previous reading.
        }));
        this.shellReadings = next;
      } finally { this.readingShells = false; cx.notify(); }
    });
  }

  // Background shells on this machine, in any project (see shells.py).
  refreshJobs(cx) {
    if (this.readingJobs || window()?.active === false) return;
    this.readingJobs = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${homeDir()}/.config/herdr-app/mods/sleek-workspaces/shells.py`]);
        if (r.code === 0) this.jobs = JSON.parse(r.stdout);
      } catch {} finally { this.readingJobs = false; cx.notify(); }
    });
  }

  // Where each shell shows: under the agent that started it, or the agent working in its folder.
  // A shell with no terminal came from a session moved to the background, so a row that reports no
  // status (that session's viewer) goes first. Otherwise it sits at the end of the workspace.
  placeJobs(list, spaceOfTab) {
    const ps = panes().filter((p) => p.terminal);
    const agentOf = new Map(list.map((a) => [a.address, a]));
    const rank = (p) => { const a = agentOf.get(p.terminal); return !a ? 0 : a.seq === undefined ? 2 : 1; };
    const jobsOf = new Map(), looseJobs = new Map();
    const add = (map, key, job) => map.set(key, [...(map.get(key) ?? []), job]);
    for (const job of this.jobs ?? []) {
      const pane = ps.find((p) => p.terminal === job.terminal)
        ?? ps.filter((p) => p.cwd && p.cwd === job.cwd).sort((x, y) => rank(y) - rank(x))[0];
      if (!pane) continue;
      if (agentOf.has(pane.terminal)) add(jobsOf, pane.terminal, job);
      else if (spaceOfTab.has(pane.tab)) add(looseJobs, spaceOfTab.get(pane.tab).id, job);
    }
    return { jobsOf, looseJobs };
  }

  // Opens a shell's output, following it live, over the current tab.
  async peekJob(job) {
    // One viewer at a time: closing a peek can leave its tail running.
    for (const old of terminals()) if (old.labels?.["sleek.job-viewer"] && old.state === "live") hc(["kill", old.address]).catch(() => {});
    const r = await hc(["run", "--bg", "--no-parent", "--no-notify", "--rm", "--json", "--label", "sleek.job-viewer=1", "--", "tail", "-n", "200", "-f", job.log]);
    if (r.code !== 0) return;
    const terminal = JSON.parse(r.stdout).address;
    // The app learns about a new terminal a moment after it starts; peeking sooner fails.
    for (let i = 0; i < 30 && !terminals().some((x) => x.address === terminal); i++) await exec("sleep", ["0.1"]);
    run("terminal.peek", { terminal });
  }

  // One background shell: a quiet line like a sub-agent's, click to read its output.
  jobRow(t, job, ctx, workspace) {
    return h_flex().id(`job-${job.pid}`).h(24).flex_none().pl(workspace ? 29 : 59).pr(14).gap(8).items_center().rounded(ROW_R())
      .font_family(ctx.mono).text_size(11).text_color(t.muted)
      .when(Boolean(job.log), (el) => el.cursor_pointer().hover((h) => h.bg(t.hover)).tooltip(job.log).on_click(() => this.peekJob(job)))
      .child(div().flex_none().text_color(t.dim).child("↳"))
      .child(div().flex_1().min_w(0).truncate().child(job.label))
      .child(div().flex_none().text_color(t.dim).child(duration(job.age * 1000)));
  }

  // Stamps agents whose state changed (done and idle count as one).
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const st = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === st) continue;
      this.changed[a.address] = { s: st, at: now };
      dirty = true;
    }
    if (dirty) localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // The right end of a row's first line: the status when it matters, otherwise how long ago the
  // agent last changed. Flush right, so ages and marks share one edge. Attention rows don't repeat
  // their group's status.
  rowEnd(t, a, ctx, when, workspace = null) {
    if (a.status === "waiting") return h_flex().flex_none().gap(4).items_center()
      .font_family(SANS).text_size(11).text_color(t.muted)
      .tooltip(`Waiting for ${a.shells} background ${a.shells === 1 ? "shell" : "shells"}; resumes automatically`)
      .child(this.agentStatus(t, "waiting")).child(`${a.shells} ${a.shells === 1 ? "shell" : "shells"}`);
    const loud = !workspace?.quiet && (a.status === "working" || a.status === "blocked" || a.status === "done");
    const last = loud ? (a.status === "done" ? div().size(7).flex_none().rounded(4).bg(t.done) : this.agentStatus(t, a.status))
      : when ? div().flex_none().child(duration(ctx.now - when)) : null;
    return h_flex().flex_none().items_center().font_family(ctx.mono).text_size(11).text_color(!workspace && !a.focused ? t.dim : t.muted)
      .when(Boolean(last), (el) => el.child(last));
  }

  // The Workspaces view's second line: what you last asked this agent, across the full width.
  // With no prompt, or one that only repeats the title, the agent's folder says something instead.
  promptLine(t, a, ctx, machine, title) {
    const prompt = ctx.prompts.get(a.address);
    const useful = Boolean(prompt) && prompt.toLowerCase() !== title.toLowerCase();
    const cwd = ctx.cwdOf.get(a.pane) ?? "";
    const atHome = cwd === homeDir();
    const folder = atHome ? "Home" : (cwd.split("/").filter(Boolean).pop() ?? "");
    return h_flex().w_full().min_w(0).gap(6).items_center().font_family(SANS).text_size(11).text_color(a.focused ? t.muted : t.dim)
      .child(div().flex_shrink_1().min_w(0).truncate().when(!useful && Boolean(folder) && !atHome, (d) => d.font_family(ctx.mono)).child(useful ? prompt : folder || "No prompt yet"))
      .when(Boolean(machine), (el) => el.child(div().flex_none().child("·")).child(div().flex_none().font_family(ctx.mono).child(`@${machine}`)));
  }

  // The flat views' second line: which workspace this agent belongs to, by number and name.
  whereLine(t, a, ctx, workspace, machine) {
    return h_flex().w_full().min_w(0).gap(6).items_center().font_family(SANS).text_size(11).text_color(t.muted)
      .child(div().flex_none().font_family(ctx.mono).font_semibold().text_color(numInk(t, spaceTone(t, workspace), true)).child(String(workspace.num ?? "").padStart(2, "0")))
      .child(div().flex_shrink_1().min_w(0).truncate().child(workspace.name))
      .when(Boolean(machine), (el) => el.child(div().flex_none().child("·")).child(div().flex_none().font_family(ctx.mono).child(`@${machine}`)));
  }

  agentStatus(t, st) {
    if (st === "waiting") return div().size(7).mx(3).flex_none().rounded_full().bg(t.muted).loop("opacity", { from: 0.35, to: 0.8, period: 1800 });
    if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
    if (st === "blocked") return div().size(14).flex_none().rounded(3).bg(t.blocked + "26").text_size(11).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (st === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done);
    // Idle shows nothing (design rule): a ring on every quiet row is noise.
    return div().size(7).mx(3).flex_none();
  }

  // marked: show which agent is selected (only worth it with two or more in the box).
  agentRow(t, a, ctx, color = t.accent, marked = true, workspace = null) {
    // A session with no useful title of its own goes by its agent's name.
    const name = sessionName(a, ctx.cwdOf, ctx.tabOf) ?? a.program?.name ?? a.app ?? "Agent";
    const when = this.changed[a.address]?.at;
    const prog = (a.program?.name ?? a.app ?? "agent").toLowerCase();
    const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
    const quiet = a.status === "idle" && !a.focused;
    const pic = programIcon(a.program, 14, t.muted);
    const kids = ctx.all.filter((k) => k.parent === a.address && k.state === "live");
    const title = div().w_full().truncate().text_size(13).text_color(quiet ? t.muted : t.foreground).child(name);
    return [
      // Sleek: the shown agent gets a filled highlight (like the open half of a toggle).
      // Personal (card polish): the shown agent is the "you are here" selection (accent wash);
      // the meta line is words in Geist, the age in Geist Mono; the program is the icon, so its
      // name isn't repeated in lowercase underneath.
      h_flex().id(`ag-${a.address}`).h(42).flex_none().pl(workspace ? 14 : 33).pr(14).gap(workspace ? 12 : 10).items_center().rounded(ROW_R()).cursor_pointer()
        .when(Boolean(workspace), (el) => el.mb(2))
        .when(a.focused, (h) => h.bg(tint(t.accent, selA(t))))
        .when(!a.focused, (h) => h.hover((x) => x.bg(t.hover)))
        .on_click(() => run("pane.focus", a.pane ? { pane: a.pane } : { terminal: a.address }))
        .child(div().id(`ag-icon-${a.address}`).w(16).flex_none().flex().items_center().justify_center().tooltip(a.program?.name ?? prog)
          .when(Boolean(pic), (el) => el.child(pic)))
        .child(v_flex().flex_1().min_w(0).gap(2).justify_center().line_height(1.2)
          // Title and age share the first line, so the second runs the row's full width.
          .child(h_flex().w_full().min_w(0).gap(8).items_center()
            .child(div().flex_1().min_w(0).child(title))
            .child(this.rowEnd(t, a, ctx, when, workspace)))
          .child(workspace ? this.whereLine(t, a, ctx, workspace, machine) : this.promptLine(t, a, ctx, machine, name))),
      // Sub-agents an agent started: one quiet line each, click to peek.
      ...kids.map((k) => h_flex().id(`sub-${k.address}`).h(24).flex_none().pl(workspace ? 29 : 59).pr(14).gap(8).items_center().rounded(ROW_R())
        .font_family(ctx.mono).text_size(11).text_color(t.muted).cursor_pointer()
        .hover((el) => el.bg(t.hover))
        .on_click(() => run("terminal.peek", { terminal: k.address }))
        .child(div().flex_none().text_color(t.dim).child("↳"))
        .child(div().flex_1().min_w(0).truncate().font_family(SANS).child(k.name || k.template || k.program?.name || k.address))
        .child(h_flex().w(16).flex_none().justify_center().child(this.agentStatus(t, k.status === "error" ? "blocked" : k.status === "done" ? "idle" : k.status)))),
      ...(ctx.jobsOf.get(a.address) ?? []).map((job) => this.jobRow(t, job, ctx, workspace)),
    ];
  }

  // How many agents are in each state, most urgent first, each with the same mark the
  // rows use (a spinner, a red !, a filled dot; idle has no mark) so the edge and the rows agree.
  counts(t, mine) {
    const n = (st) => mine.filter((a) => a.status === st).length;
    const mark = (st) => st === "waiting" ? this.agentStatus(t, st) : st === "working" ? svg("mods/workspace-chrome/spinner.svg").size(10).flex_none().text_color(t.working).spin(900)
      : st === "blocked" ? div().flex_none().font_bold().text_color(t.blocked).child("!")
      : st === "done" ? div().size(6).flex_none().rounded(3).bg(t.done)
      : null;
    return ["blocked", "working", "waiting", "done", "idle"]
      .filter((st) => n(st) > 0)
      .map((st) => h_flex().flex_none().gap(4).items_center().when(st !== "idle", (el) => el.child(mark(st)))
        .child(div().text_color(st === "idle" ? t.dim : t.muted).child(String(n(st)))));
  }

  // Sleek experiment: each workspace is a soft card (pane background, no border). Its header row
  // is the handle: click to fold or open it (same as the chevron), drag onto another to reorder,
  // right-click for its menu. The shown workspace's card is a little brighter.
  row({ w, i, g, tree }, t) {
    const ctx = this.ctx;
    const on = w.active;
    const mine = ctx.bySpace.get(w.id) ?? [];
    const open = !this.boxesFolded.has(w.id);
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const rawBranch = g ? (g.branch ?? "detached") : null;
    const branch = rawBranch && rawBranch !== "main" && rawBranch !== "master" && rawBranch.toLowerCase() !== w.name.toLowerCase() ? rawBranch : null;

    const toggle = () => {
      open ? this.boxesFolded.add(w.id) : this.boxesFolded.delete(w.id);
      localStorage.setItem("boxes.folded", JSON.stringify([...this.boxesFolded]));
    };
    // Hovering the title lights the chevron and number, not the row: a filled heading would merge
    // with the highlighted agent row right below it, and the name is already full brightness.
    const hot = this.hotHead === w.id;
    // A tree, like an editor's explorer: the disclosure arrow leads, then the number and name.
    const fold = div().id(`fold-${w.id}`).flex_none().p(2).rounded(4).cursor_pointer()
        .when(hot, (el) => el.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => {
          // A press that ended outside the list would otherwise fold twice on this click.
          this.pressed = null;
          this.over = null;
          cx.stop_propagation();
        })
        .on_click((_e, cx) => {
          cx.stop_propagation();
          toggle();
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12));
    const head = h_flex().id(`space-${w.id}`).h(26).pl(12).pr(14).gap(6).items_center().rounded(ROW_R()).cursor_pointer()
      .text_color(t.dim)
      .on_hover((on, cx) => {
        this.hotHead = on ? w.id : this.hotHead === w.id ? null : this.hotHead;
        cx.notify();
      })
      .on_mouse_down("left", () => {
        this.pressed = w.id;
        this.over = w.id;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === w.id && from !== w.id) {
          const index = spaces().findIndex(s => s.id === w.id);
          if (index !== -1) run("space.move", { id: from, index: index + 1 });
        } else if (from === w.id) toggle();
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .when(Boolean(tree), (el) => el.child(div().text_color(t.dim).child("↳")))
      .child(fold)
      .child(div().w(20).flex_none().font_family(MONO()).text_size(11).font_semibold().text_color(w.active || hot ? t.foreground : t.dim).child(String(i + 1).padStart(2, "0")))
      // Workspace names are headings: semibold everywhere (agent titles stay regular); the shown one is bright.
      .child(div().flex_shrink_1().min_w(0).truncate().font_family(SANS).text_size(13)
        .font_semibold().text_color(t.foreground).child(w.name))
      .when(Boolean(branch), (el) => el.child(div().flex_shrink_1().min_w(0).max_w(90).truncate().font_family(ctx.mono).text_size(11).text_color(t.dim).child(`⎇ ${branch}`)))
      .when((g?.ahead ?? 0) > 0, (el) => el.child(div().font_family(ctx.mono).text_size(11).text_color(t.ansi2).child(`↑${g.ahead}`)))
      .when((g?.behind ?? 0) > 0, (el) => el.child(div().font_family(ctx.mono).text_size(11).text_color(t.ansi1).child(`↓${g.behind}`)))
      .child(div().flex_1())
      // Folded: every status with its count. Open: nothing, the rows right below say it.
      .when(!open, (el) => el.child(h_flex().flex_none().gap(8).items_center().font_family(ctx.mono).text_size(11).children(this.counts(t, mine))));

    const loose = (ctx.looseJobs.get(w.id) ?? []).map((job) => this.jobRow(t, job, ctx, null));
    const body = mine.length || loose.length
      ? v_flex().pt(2).gap(2).children([...mine.flatMap((a) => this.agentRow(t, a, ctx)), ...loose])
      : h_flex().id(`empty-${w.id}`).h(24).pl(59).pr(14).items_center().rounded(ROW_R()).cursor_pointer()
          .font_family(SANS).text_size(12).text_color(t.dim)
          .hover((el) => el.bg(t.hover).text_color(t.muted))
          .on_click(() => run("space.select", { id: w.id }))
          .child(`No agents · ${w.tabs.length} tab${w.tabs.length === 1 ? "" : "s"}`);

    // Cards use the terminal panes' own background, so the window has only two surface colors;
    // the shown workspace stands out by its filled badge and brighter name.
    // Personal (card separation): every card is a raised surface with a hairline edge and a
    // wider gap between cards than inside them, so each workspace reads as its own block and
    // the list reads apart from the "Workspaces" header. The shown one: accent wash + accent edge.
    // Personal (card polish): no glowing accent outline. Every card is the same quiet surface with
    // a neutral hairline; the shown one is a touch lighter and announced by its full-strength
    // number and bright name. Accent is kept for the focused agent row inside.
    return v_flex().relative().w_full().flex_none().mt(i === 0 && !tree ? 2 : tree ? 4 : 10)
      .when(Boolean(tree), (el) => el.ml(14))
      .when(this.pressed === w.id && this.over !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(8).right(8).h(2).rounded(1).bg(t.accent)
          .when(fromIndex < i, (line) => line.bottom(-4))
          .when(fromIndex > i, (line) => line.top(-4)),
      ))
      .child(head)
      .when(open, (el) => el.child(body));
  }

  // Narrow sidebar (rail): the workspace's badge, centred; the shown one sits on the same faint
  // accent tile as its card; a corner dot tells what its agents are doing.
  compact({ w, i }, t) {
    const dot = w.status === "blocked" ? t.blocked : w.status === "done" ? t.done : w.status === "working" ? t.working : w.status === "waiting" ? t.muted : null;
    return h_flex().id(`space-${w.id}`).relative().w_full().h(30).mb(2).flex_none().items_center().justify_center().rounded(ROW_R())
      .cursor_pointer().tooltip(w.name)
      .when(w.active, (el) => el.bg(tint(t.accent, selA(t))))
      .when(!w.active, (el) => el.hover((h) => h.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .on_mouse_down("right", () => this.menu(w))
      .child(div().font_family(MONO()).text_size(13).font_semibold().text_color(numInk(t, spaceTone(t, w), !w.active)).child(String(i + 1).padStart(2, "0")))
      .when(Boolean(dot), (el) => el.child(div().absolute().right(5).top(5).size(6).rounded_full().bg(dot)));
  }


  viewMenuButton(t, mode) {
    const title = VIEW_MODES.find(([id]) => id === mode)?.[1] ?? "Spaces";
    return div().id("agent-view-menu").size(20).flex_none().flex().items_center().justify_center().rounded(4)
      .cursor_pointer().text_color(t.dim).hover(el => el.bg(t.hover).text_color(t.foreground))
      .tooltip(`View: ${title} · change agent view`)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "sleek-workspaces", kind: "popup", width: 340, height: 252, frame: "none",
          props: { viewMenu: true } });
      })
      .child(svg("mods/sleek-workspaces/view.svg").size(14));
  }

  renderViewMenu() {
    const t = theme();
    const mode = viewMode((shared("rice") ?? {})["sidebar.agentView"]);
    const close = () => closeOverlay(props().overlay);
    const choose = id => {
      setShared("rice", { ...(shared("rice") ?? {}), "sidebar.agentView": id });
      close();
    };
    // Same language as Go to (my-goto): chrome panel, filled header with a mode block,
    // Raycast-style rows (icon tile, title, hint, keycap), keycap hints in the footer.
    const hints = ["Agents under each workspace", "One flat list with workspace names", "Needs you, ready, running, waiting for shells, idle"];
    const icons = ["mods/workspace-chrome/layers.svg", "mods/sleek-workspaces/agents.svg", "mods/sleek-workspaces/attention.svg"];
    const cap = text => div().flex_none().px(6).h(20).flex().items_center().rounded(4).bg(tint(t.foreground, 0.12))
      .font_family(MONO()).text_size(11).text_color(t.muted).child(text);
    const hint = (keys, label) => h_flex().gap(6).items_center().child(cap(keys)).child(label);
    const current = VIEW_MODES.find(([id]) => id === mode)?.[1] ?? "Spaces";
    return v_flex().id("agent-view-popup").w_full().track_focus(this.menuHandle).font_family(SANS)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { cx.stop_propagation(); close(); return; }
        const plain = !e.modifiers.control && !e.modifiers.alt && !e.modifiers.platform;
        const key = e.key_char ?? e.key;
        if (plain && ["1", "2", "3"].includes(key)) { cx.stop_propagation(); choose(VIEW_MODES[Number(key) - 1][0]); }
      })
      .child(v_flex().w_full().rounded(12).border_1().border_color(t.border).overflow_hidden()
        .bg(t.chrome).text_color(t.foreground).text_size(13).pt(5)
        // Header: a filled field with the lualine-style mode block, like Go to's search bar.
        .child(h_flex().h(46).flex_none().mx(5).px(14).gap(10).items_center().rounded(6).bg(tint(t.foreground, 0.06))
          .child(div().flex_none().h(22).px(8).flex().items_center().rounded(4).font_family(MONO()).text_size(11).font_bold()
            .bg(t.muted).text_color(t.background).child("VIEW"))
          .child(div().flex_1().min_w(0).truncate().font_semibold().child("Agent view"))
          .child(h_flex().flex_none().gap(6).items_center().text_size(11).text_color(t.dim).child(cap("esc")).child("Close")))
        // Rows
        .child(v_flex().my(4).gap(2).children(VIEW_MODES.map(([id, title], i) => {
          const on = mode === id;
          return h_flex().id(`agent-view-${id}`).h(48).flex_none().mx(5).px(10).gap(10).items_center().rounded(6).cursor_pointer()
            .when(on, el => el.bg(tint(t.accent, selA(t))))
            .when(!on, el => el.hover(s => s.bg(t.hover)))
            .on_click((_e, cx) => { cx.stop_propagation(); choose(id); })
            .child(div().size(24).flex_none().flex().items_center().justify_center().rounded(4).bg(tint(t.foreground, 0.05))
              .child(svg(icons[i]).size(14).text_color(on ? t.accent : t.muted)))
            .child(v_flex().flex_1().min_w(0).gap(2)
              .child(div().truncate().font_semibold().text_color(t.foreground).child(title))
              .child(div().truncate().text_size(11).text_color(t.dim).child(hints[i])))
            .when(on, el => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.accent)))
            .child(cap(String(i + 1)));
        })))
        // Footer: keys on the left, the current view on the right; no divider line.
        .child(h_flex().h(38).flex_none().px(15).gap(14).items_center().text_size(11).text_color(t.dim)
          .child(hint("1 2 3", "Choose"))
          .child(div().flex_1())
          .child(div().font_family(MONO()).child(`${current.toLowerCase()} · ${agents().length} agents`))));
  }

  // Agents and Attention: pick the workspace (the + makes new agents in the shown one). A dropdown,
  // because it's one choice from a list of any length with names of any width: one uniform line
  // showing the current workspace in full, and every workspace by name one click away.
  strip(t) {
    const list = this.ordered();
    const cur = list.find((r) => r.w.active) ?? list[0];
    if (!cur) return div();
    const items = list.map(({ w, i }) => ({ id: w.id, name: w.name, num: i + 1, tone: spaceTone(t, w), status: w.status, active: w.active }));
    return h_flex().id("ws-strip").flex_none().pb(6).mb(6).items_center()
      .border_b_1().border_color(tint(t.foreground, 0.08))
      .child(h_flex().id("ws-switch").flex_1().min_w(0).h(28).pl(14).pr(14).gap(8).items_center().rounded(ROW_R()).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "sleek-workspaces", kind: "popup", width: 260, height: Math.min(10 + items.length * 32, 344), frame: "none", props: { spaceMenu: true, items } });
        })
        .on_mouse_down("right", () => this.menu(cur.w))
        .child(workspaceNumber(t, cur.w, cur.i))
        .child(div().flex_1().min_w(0).truncate().font_family(SANS).text_size(13).font_semibold().text_color(t.foreground).child(cur.w.name))
        .child(svg("mods/workspace-chrome/chevron-down.svg").size(12).flex_none().text_color(t.muted)));
  }

  // The workspace dropdown. Numbers pick directly; j/k and Enter move and choose; Esc closes.
  renderSpaceMenu() {
    const t = theme();
    const items = props()?.items ?? [];
    const close = () => closeOverlay(props().overlay);
    const choose = (it) => { if (it) run("space.select", { id: it.id }); close(); };
    return v_flex().id("space-popup").w_full().track_focus(this.menuHandle).font_family(SANS)
      .on_key_down((e, cx) => {
        const key = e.key_char ?? e.key;
        const plain = !e.modifiers.control && !e.modifiers.alt && !e.modifiers.platform;
        if (e.key === "escape") { cx.stop_propagation(); close(); return; }
        if (!plain || !items.length) return;
        if (/^[1-9]$/.test(key)) { const it = items.find((x) => x.num === Number(key)); if (it) { cx.stop_propagation(); choose(it); } return; }
        if (key === "j" || e.key === "down") this.menuAt = (this.menuAt + 1) % items.length;
        else if (key === "k" || e.key === "up") this.menuAt = (this.menuAt + items.length - 1) % items.length;
        else if (e.key === "enter" || key === "l") { cx.stop_propagation(); choose(items[this.menuAt]); return; }
        else return;
        cx.stop_propagation(); cx.notify();
      })
      .child(v_flex().id("space-popup-list").w_full().max_h(344).rounded(12).border_1().border_color(t.border).overflow_y_scrollbar()
        .bg(t.chrome).text_color(t.foreground).text_size(13).py(4).gap(2)
        .children(items.map((it, i) => {
          const flag = it.status === "blocked" ? div().flex_none().text_size(11).font_bold().text_color(t.blocked).child("!")
            : it.status === "done" ? div().size(6).flex_none().rounded_full().bg(t.done) : null;
          return h_flex().id(`space-pick-${it.id}`).h(30).flex_none().mx(5).px(9).gap(8).items_center().rounded(6).cursor_pointer()
            .when(it.active, (el) => el.bg(tint(t.accent, selA(t))))
            .when(!it.active && i === this.menuAt, (el) => el.bg(t.hover))
            .when(!it.active, (el) => el.hover((s) => s.bg(t.hover)))
            .on_click((_e, cx) => { cx.stop_propagation(); choose(it); })
            .child(div().w(20).flex_none().font_family(MONO()).font_semibold().text_color(numInk(t, it.tone, !it.active)).child(String(it.num).padStart(2, "0")))
            .child(div().flex_1().min_w(0).truncate().text_color(it.active ? t.foreground : t.muted).when(it.active, (d) => d.font_semibold()).child(it.name))
            .when(Boolean(flag), (el) => el.child(flag))
            .when(it.active, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.accent)));
        })));
  }

  individuals(t, mode) {
    const ctx = this.ctx;
    const rows = ctx.visibleAgents;
    const nums = new Map(this.ordered().map(({ w, i }) => [w.id, i + 1]));
    const draw = a => this.agentRow(t, a, ctx, t.accent, true,
      { ...(ctx.spaceOf.get(a.space) ?? { id: a.space, name: a.space || "Workspace", machine: null }), num: nums.get(a.space), quiet: mode === "attention" });
    const children = [];
    if (mode === "attention") {
      for (const group of attentionGroups(rows)) {
        children.push(h_flex().id(`attention-${group.status}`).h(26).mt(children.length ? 16 : 0).px(14).gap(12).items_center().flex_none()
          .child(h_flex().w(16).flex_none().justify_center().when(group.status !== "idle", el => el.child(this.agentStatus(t, group.status))))
          .child(div().flex_1().min_w(0).truncate().font_family(SANS).text_size(13).font_semibold().text_color(t.foreground).child(group.title))
          .child(div().flex_none().font_family(MONO()).text_size(11).text_color(t.muted).child(String(group.agents.length))));
        children.push(...group.agents.flatMap(draw));
      }
    } else children.push(...rows.flatMap(draw));
    if (!rows.length) children.push(v_flex().px(14).py(14).gap(6)
      .child(div().font_family(SANS).text_size(12).text_color(t.muted).child("No agents running"))
      .child(div().font_family(SANS).text_size(11).text_color(t.dim).child("Your workspaces and shell tabs are still available.")));
    return children;
  }


  render() {
    if (props()?.viewMenu) return this.renderViewMenu();
    if (props()?.spaceMenu) return this.renderSpaceMenu();
    const t = theme();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);

    // Agents per workspace, most urgent first, then most recently changed.
    const now = Date.now();
    // agents() only has terminals that report a status. A pane running an agent that reports none
    // (Claude Code sends no status from a session moved to the background) still belongs in the
    // list; with nothing to go on, it reads as idle.
    const reporting = agents();
    const known = new Set(reporting.map((a) => a.address));
    const spaceOfTab = new Map(sp.flatMap((s) => (s.tabs ?? []).map((tab) => [tab.id, s])));
    const silent = panes()
      .filter((p) => p.terminal && p.status == null && this.agentKeys.has(p.program?.key) && !known.has(p.terminal) && spaceOfTab.has(p.tab))
      .map((p) => ({ address: p.terminal, pane: p.pane, tab: p.tab, space: spaceOfTab.get(p.tab).id, status: "idle", app: p.app, program: p.program, title: p.title, focused: p.focused, pinned: false }));
    const list = [...reporting, ...silent].map(a => withShellState(a, this.shellReadings?.[a.address]));
    for (const w of sp) {
      const mine = list.filter(a => a.space === w.id);
      if (mine.length) w.status = mine.reduce((best, a) => (RANK[a.status] ?? 0) > (RANK[best] ?? 0) ? a.status : best, "idle");
    }
    this.track(list, now);
    const order = new Map(sp.map((s, n) => [s.id, n]));
    const since = (a) => this.changed[a.address]?.at ?? 0;
    const sorted = [...list].sort((x, y) => (order.get(x.space) ?? 0) - (order.get(y.space) ?? 0)
      || (RANK[y.status] ?? 0) - (RANK[x.status] ?? 0) || since(y) - since(x));
    const bySpace = new Map();
    for (const a of sorted) bySpace.set(a.space, [...(bySpace.get(a.space) ?? []), a]);
    const mode = viewMode((shared("rice") ?? {})["sidebar.agentView"]);
    // Flat order is stable across status changes; attention order follows its visible groups.
    const visibleAgents = mode === "workspaces" ? sorted : orderAgents(list, mode);
    setAgentOrder(visibleAgents.map((a) => a.address));
    this.ctx = {
      ...this.placeJobs(list, spaceOfTab),
      now, bySpace, mono: MONO(), all: terminals(), visibleAgents, prompts: latestPrompts(),
      spaceOf: new Map(sp.map(s => [s.id, s])),
      cwdOf: new Map(panes().map((p) => [p.pane, p.cwd ?? ""])),
      tabOf: new Map(sp.flatMap((s) => s.tabs).map((tab) => [tab.id, tab])),
    };
    const needs = list.filter((a) => a.status === "blocked").length;
    const busy = list.filter((a) => a.status === "working").length;
    const plus = div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .tooltip("New space").on_click((_e, cx) => { cx.stop_propagation(); newSpace(); }).child(svg("mods/workspace-chrome/plus.svg").size(14));
    return v_flex().size_full().min_h(0).text_size(13)
      // Click the header to fold the whole list away (remembered).
      .child(h_flex().id("ws-head").h(34).pl(14).pr(8).gap(8).items_center().flex_none().font_family(MONO()).text_size(11)
        // Personal: a hairline under the section header so it reads apart from the cards.
        .when(!collapsed && !this.listFolded, el => el.mx(0).pl(14).pr(8))
        .when(!collapsed && !this.listFolded && mode === "workspaces", el => el.border_b_1().border_color(tint(t.foreground, 0.08)).mb(8))
        .when(!collapsed, el => el.cursor_pointer()
          .on_click((_e, cx) => {
            this.listFolded = !this.listFolded;
            localStorage.setItem("list.folded", this.listFolded ? "1" : "0");
            cx.notify();
          })
          .child(div().font_family(SANS).text_size(12).text_color(t.muted).font_semibold().child(mode === "workspaces" ? "Workspaces" : mode === "attention" ? "Attention" : "Agents"))
          .child(this.viewMenuButton(t, mode))
          .child(div().flex_1())
          .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`${needs} need you`)))
          .when(busy > 0, el => el.child(div().text_color(t.working).child(`${busy} busy`))))
        // Rail: a button to widen the sidebar again, above the +.
        .when(collapsed, el => el.flex_col().h(64).py(4).pl(0).pr(0).gap(2).justify_center()
          .child(div().id("rail-expand").size(26).flex_none().flex().items_center().justify_center().rounded(6)
            .text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground)).tooltip("Expand sidebar")
            .on_click(() => expandRail())
            .child(svg("mods/workspace-chrome/sidebar.svg").size(16))))
        .child(plus))
      .when(!collapsed && !this.listFolded && mode !== "workspaces", el => el.child(this.strip(t)))
      .child(v_flex().id(`agent-list-${mode}`).flex_1().min_h(0).pb(14).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(this.listFolded && !collapsed ? [] : (collapsed || mode === "workspaces") ? this.grouped(t, collapsed) : this.individuals(t, mode)));
  }
}
