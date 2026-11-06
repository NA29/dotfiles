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
import { appHome, focused, hc, nextCommand, openOverlay, readTextFile, run, setShared, shared, spaces, writeTextFile } from "herdr";

const KEY = { left: "ctrl+h", down: "ctrl+j", up: "ctrl+k", right: "ctrl+l" };
const LAYOUT = "na29-islands";
const LOOK = ["transparency.", "background.", "look.", "terminal.", "panes."];
const KEYS = ["keys."];
const CHROME = "#16141f";   // rose-pine chrome: islands' see-through color
const CARD = "#191724";     // rose-pine background: see-through panes

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
  "look.accent": "#c4a7e7", "look.borders": true, "look.focusRing": true, "look.gap": 6, "look.radius": 10,
  "panes.header": true,
  "sidebar.activity": true, "sidebar.usage": true,
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
  const chromePct = on ? r["transparency.chrome"] ?? 80 : 100;
  const panePct = on ? r["transparency.panes"] ?? 100 : 100;
  const gap = r["look.gap"] ?? 6;
  const radius = r["look.radius"] ?? 10;
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
  root.colors = { ...(root.colors ?? {}), accent: r["look.accent"] ?? "#c4a7e7" };
  const pad = r["terminal.padding"] ?? 14;
  root.terminal_padding = [pad, Math.max(0, pad - 2)];
  if (r["terminal.font"]) root.font = r["terminal.font"]; else delete root.font;
  if (r["terminal.fontSize"]) root.font_size = r["terminal.fontSize"]; else delete root.font_size;

  for (const id of ["sidebar", "tabs", "status"]) {
    const n = find(root, id);
    if (!n) continue;
    n.background = chromePct >= 100 ? "chrome" : CHROME + alpha(chromePct);
    n.radius = radius;
    if (borders) n.border = border; else delete n.border;
  }
  const body = find(root, "work-body");
  if (body) { body.padding = [gap, 0]; body.gap = gap; }

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
    if (panePct < 100) { pane.background = CARD + alpha(panePct); root.terminal_opacity = 0; }
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
      this.applied = { look: pick(r, LOOK), keys: pick(r, KEYS), all: JSON.stringify(r) };
      this.loaded = true;
      cx.notify();
    });
  }

  // Runs whenever shared state changes: write what moved.
  sync(cx) {
    if (!this.loaded || !shared("rice") || this.writing) return;
    const r = full();
    const now = { look: pick(r, LOOK), keys: pick(r, KEYS), all: JSON.stringify(r) };
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
