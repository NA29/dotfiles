// Personal key actions that need more than one app command.
//   new-space   ask for the name first, then make the space (on the focused space's machine)
//   go-left|go-down|go-up|go-right
//               Ctrl+H/J/K/L, tmux/vim-tmux-navigator style: move to the pane that way;
//               when there is none (one pane, or at the edge), the key goes to the program
//               instead, so Ctrl+L still clears, Ctrl+K still kills the line, and so on.
//   toggle-transparency   flip "transparency.on" (Ctrl+A t does the same)
// Lives in a zero-height block in my-main, my-combined and na29-islands, so it works while the
// sidebar is hidden.
//
// It is also the settings writer. The my-settings panel (and Ctrl+A t) only change the shared
// "rice" object; this copy notices and writes the files:
//   rice.json             every personal setting (tracked in dotfiles; loaded at start)
//   layouts/na29-islands.json the look: background, transparency, gaps, corners, borders, accent,
//                         terminal font/size/padding, pane headers
//   keys.json             prefix key, Ctrl+H/J/K/L, Cmd+N, Cmd+,

import { View, div } from "gpui-kit";
import { appHome, focused, hc, nextCommand, openOverlay, readTextFile, run, setShared, shared, spaces, theme, writeTextFile } from "herdr";

const KEY = { left: "ctrl+h", down: "ctrl+j", up: "ctrl+k", right: "ctrl+l" };
const LAYOUT = "na29-islands";
const LOOK = ["transparency.", "background.", "look.", "terminal.", "panes."];
const KEYS = ["keys."];
// Fallbacks (Rosé Pine) when the theme gives no plain #rrggbb: islands take the theme's
// chrome, panes its background, each with the transparency sliders' alpha.
const CHROME = "#16141f";
const CARD = "#191724";
const hex6 = (c) => /^#[0-9a-f]{6}/i.test(c ?? "") ? c.slice(0, 7) : null;
// What of the theme the look depends on: a theme switch rewrites the islands and panes.
const themeSig = () => { const t = theme(); return `${t.chrome}|${t.background}`; };

// Same as my-settings' DEFAULTS (mods can't import from each other's folders): what a missing
// key means, so a partial rice.json or shared object never writes a half-empty look.
const DEFAULTS = {
  "activity.keep": 200,
  "activity.kinds": ["needs you", "finished", "started", "closed"],
  "activity.rows": 6,
  "background.dim": 0,
  "background.fit": "cover",
  "background.gradient": ["#342d40", "#162a37", 145],
  "background.image": "backgrounds/gwen-wallpaper.jpg",
  "background.kind": "image",
  "background.solid": "#08070c",
  "background.source": "~/Pictures/Images/Wallpapers/gwen-lol-4k-wallpaper-uhdpaper.com-762@5@l.jpg",
  "bar.agents": true, "bar.battery": true, "bar.clock24": true, "bar.cpu": true, "bar.date": true,
  "bar.memory": true, "bar.music": true, "bar.musicControls": true, "bar.time": true, "bar.wispr": true,
  "keys.hjkl": true, "keys.namedSpaces": true, "keys.prefix": "ctrl-a", "keys.repeatMs": 500, "keys.settingsPanel": true,
  "look.accent": null, "look.borders": true, "look.focusRing": true, "look.gap": 6, "look.radius": 10, "look.square": false,
  "panes.header": true,
  "ping.thumbsUp": true,
  "sidebar.activity": true, "sidebar.usage": true, "sidebar.agentView": "workspaces",
  "tabs.numbers": true,
  "terminal.font": null, "terminal.fontSize": null, "terminal.padding": 14,
  "transparency.cards": 100, "transparency.chrome": 80, "transparency.on": true, "transparency.panes": 100,
  "usage.claude": true, "usage.codex": true, "usage.mode": "recent",
  "wallpaper.folder": "~/Pictures/Images/Wallpapers",
};
const full = () => ({ ...DEFAULTS, ...(shared("rice") ?? {}) });

function newSpace() {
  const here = spaces().find((s) => s.id === focused()?.space);
  openOverlay({ mod: "my-prompt", kind: "dialog", width: 420, height: 210,
    props: { title: "New space", command: { name: "space.new", args: { machine: here?.machine ?? "" } } } });
}

function go(direction) {
  const before = focused();
  run("pane.go", { direction });
  const after = focused();
  // Nothing that way: hand the key to the program in the focused terminal.
  if (after?.pane === before?.pane && before?.terminal) hc(["keys", before.terminal, KEY[direction]]);
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const alpha = (pct) => Math.round((Math.max(0, Math.min(100, pct)) / 100) * 255).toString(16).padStart(2, "0");
const pick = (r, prefixes) => JSON.stringify(Object.keys(r).filter((k) => prefixes.some((p) => k.startsWith(p))).sort().map((k) => [k, r[k]]));

// The look, written into the layout tree.
function applyLook(root, r) {
  const on = r["transparency.on"] !== false;
  const t = theme(), chrome = hex6(t.chrome) ?? CHROME, card = hex6(t.background) ?? CARD;
  const chromePct = on ? r["transparency.chrome"] ?? 80 : 100;
  const panePct = on ? r["transparency.panes"] ?? 100 : 100;
  const gap = r["look.gap"] ?? 6;
  const radius = r["look.square"] ? 0 : r["look.radius"] ?? 10;
  const borders = r["look.borders"] !== false;
  const border = { width: 1, color: "border" };

  const kind = r["background.kind"] ?? "image";
  const [g1, g2, angle] = r["background.gradient"] ?? ["#342d40", "#162a37", 145];
  if (kind === "image" && r["background.image"]) root.background = { image: r["background.image"], fit: r["background.fit"] ?? "cover" };
  else if (kind === "gradient" || kind === "image") root.background = { gradient: [g1, g2], angle };
  else root.background = r["background.solid"] ?? "#08070c";

  // The gaps live on the "dim" layer (a see-through black row over the wallpaper that holds
  // everything): its colour darkens the wallpaper without touching the image.
  const frame = find(root, "dim") ?? root;
  frame.padding = gap;
  frame.gap = gap;
  if (frame !== root) {
    root.padding = 0;
    root.gap = 0;
    const dim = r["background.dim"] ?? 0;
    if (dim > 0) frame.background = "#000000" + alpha(dim); else delete frame.background;
  }
  // An accent you picked overrides the theme's; none (null) shows the theme's own.
  root.colors = { ...(root.colors ?? {}) };
  if (r["look.accent"]) root.colors.accent = r["look.accent"]; else delete root.colors.accent;
  if (!Object.keys(root.colors).length) delete root.colors;
  const pad = r["terminal.padding"] ?? 14;
  root.terminal_padding = [pad, Math.max(0, pad - 2)];
  if (r["terminal.font"]) root.font = r["terminal.font"]; else delete root.font;
  if (r["terminal.fontSize"]) root.font_size = r["terminal.fontSize"]; else delete root.font_size;

  for (const id of ["sidebar", "tabs", "status", "panel"]) {
    const n = find(root, id);
    if (!n) continue;
    n.background = chromePct >= 100 ? "chrome" : chrome + alpha(chromePct);
    n.radius = radius;
    if (borders) n.border = border; else delete n.border;
  }
  const body = find(root, "work-body");
  if (body) { body.padding = [gap, 0]; body.gap = gap; }

  // Sidebar sections (Workspaces, Activity, Usage) are inset cards on the sidebar island, with
  // the island's gap between them, so each reads as its own group and a long workspace list
  // ends at its card's edge instead of running into the next section.
  const lists = find(root, "sidebar-lists");
  if (lists) { lists.padding = [0, gap]; lists.gap = gap; }
  // A veil of the theme's text colour (6%): lighter than the island on any dark theme, where the
  // theme's card colour is nearly the island's own.
  const veil = (hex6(t.foreground) ?? "#e0def4") + "0f";
  for (const id of ["spaces", "activity", "usage"]) {
    const n = find(root, id);
    if (!n) continue;
    n.background = veil;
    n.radius = Math.max(0, radius - gap);   // nested corners: inner = outer − inset
  }

  const pane = find(root, "main")?.content?.pane;
  if (pane) {
    pane.radius = radius;
    pane.gap = gap;              // between split panes: same as between the islands
    if (borders) pane.border = border; else delete pane.border;
    if (r["look.focusRing"] !== false) pane.focus = { width: 1, color: "accent" };
    else if (borders) pane.focus = border; else delete pane.focus;
    if (r["panes.header"] === false) delete pane.header;
    else pane.header = { content: { mod: "sleek-pane" }, reveal: "always", height: 30, position: "top" };
    // See-through panes: the frame carries the tint and the terminal paints no background
    // of its own, so the header strip and the terminal are equally see-through.
    if (panePct < 100) { pane.background = card + alpha(panePct); root.terminal_opacity = 0; }
    else { pane.background = "background"; delete root.terminal_opacity; }
  }
  return root;
}

// The keys, written into keys.json.
function applyKeys(k, r) {
  k.global ??= {};
  k.terminal ??= {};
  const prefix = r["keys.prefix"] ?? "ctrl-a";
  for (const section of [k.global, k.terminal]) {
    for (const [key, action] of Object.entries(section)) if (action === "mod.open:tmux-prefix") delete section[key];
    if (prefix !== "off") section[prefix] = "mod.open:tmux-prefix";
    for (const [dir, key] of [["left", "ctrl-h"], ["down", "ctrl-j"], ["up", "ctrl-k"], ["right", "ctrl-l"]]) {
      if (r["keys.hjkl"] !== false) section[key] = `my-keys.go-${dir}`;
      else if (section[key] === `my-keys.go-${dir}`) delete section[key];
    }
  }
  if (prefix !== "off") k["mod:tmux-prefix"] = { [prefix]: "tmux-prefix.send-prefix" };
  else delete k["mod:tmux-prefix"];
  k.global["cmd-n"] = r["keys.namedSpaces"] !== false ? "my-keys.new-space" : "space.new";
  k.global["cmd-,"] = r["keys.settingsPanel"] !== false ? "mod.open:my-settings" : "app.settings";
  return k;
}

async function rewrite(path, change) {
  const before = await readTextFile(path);
  if (before == null) return;
  const after = JSON.stringify(change(JSON.parse(before)), null, 2) + "\n";
  if (after !== before) await writeTextFile(path, after, before);
}

export default class MyKeys extends View {
  init(_props, cx) {
    this.loaded = false;
    this.applied = null;
    this.writing = false;
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (command === "new-space") newSpace();
        else if (command.startsWith("go-")) go(command.slice(3));
        else if (command === "toggle-transparency") {
          const r = full();
          setShared("rice", { ...r, "transparency.on": r["transparency.on"] === false });
        }
      }
    });
    // rice.json is the truth at start (a fresh Mac gets it from dotfiles); shared state
    // carries changes live after that.
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${appHome()}/rice.json`);
        setShared("rice", { ...full(), ...(text ? JSON.parse(text) : {}) });
      } catch (e) { console.log(`my-keys: rice.json: ${e}`); }
      const r = full();
      this.applied = { look: pick(r, LOOK) + themeSig(), keys: pick(r, KEYS), all: JSON.stringify(r) + themeSig() };
      this.loaded = true;
      cx.notify();
    });
  }

  // Runs whenever shared state changes: write what moved.
  sync(cx) {
    if (!this.loaded || !shared("rice") || this.writing) return;
    const r = full();
    const now = { look: pick(r, LOOK) + themeSig(), keys: pick(r, KEYS), all: JSON.stringify(r) + themeSig() };
    if (now.all === this.applied.all) return;
    const was = this.applied;
    this.applied = now;
    this.writing = true;
    cx.spawn(async (cx) => {
      const home = appHome();
      try {
        if (now.look !== was.look) await rewrite(`${home}/layouts/${LAYOUT}.json`, (root) => applyLook(root, r));
        if (now.keys !== was.keys) await rewrite(`${home}/keys.json`, (k) => applyKeys(k, r));
        const text = JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b))), null, 2) + "\n";
        const before = await readTextFile(`${home}/rice.json`);
        if (before !== text) await writeTextFile(`${home}/rice.json`, text, before);
      } catch (e) { console.log(`my-keys: writing settings: ${e}`); }
      this.writing = false;
      cx.notify(); // a change that came in while writing gets its turn now
    });
  }

  render(cx) {
    this.sync(cx);
    return div();
  }
}
