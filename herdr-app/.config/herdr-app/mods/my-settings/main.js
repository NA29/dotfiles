// Personal settings panel (Cmd+, · Ctrl+A s · the sidebar's Settings button).
// Everything personal in one place: look, wallpaper, sidebar, bars, terminal, sounds, keys.
//
// Where each setting goes:
//   shared "rice" (+ rice.json)  personal settings. The my-keys copy writes them out: the look
//                                into layouts/na29-islands.json, keys into keys.json, all of it into
//                                rice.json. The sidebar and bar mods read their own keys live.
//   settings.json                Herdr's own: sounds, zoom, ligatures, contrast, appearance…
//   layout commands              sizes (sidebar width, bar heights) and shown/hidden sections.
// Herdr's built-in Settings is one click away (bottom of the nav) for updates, machines, etc.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Slider, SliderTrack, SliderIndicator, SliderThumb, SliderState } from "gpui-base";
import {
  theme, themes, run, props, closeOverlay, shared, setShared, settings, layout, layouts, fonts,
  exec, appHome, home, readTextFile, writeTextFile, playSound, pickFolder, updates,
} from "herdr";
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

const MONO = "Geist Mono";
const SANS = "Geist";
const ICON = (name) => `mods/my-settings/${name}.svg`;

// Today's setup: what Reset goes back to, and what a missing key means.
const DEFAULTS = {
  "activity.keep": 200,
  "activity.kinds": ["needs you", "finished", "started", "closed"],
  "activity.rows": 6,
  "background.dim": 0,
  "background.fit": "cover",
  "background.gradient": ["#342d40", "#162a37", 145],
  "background.image": "backgrounds/gwen-wallpaper.jpg",
  "background.kind": "image",
  "background.on": true,
  "background.solid": "#08070c",
  "background.source": "~/Pictures/Images/Wallpapers/gwen-lol-4k-wallpaper-uhdpaper.com-762@5@l.jpg",
  "bar.agents": true, "bar.battery": true, "bar.clock24": true, "bar.cpu": true, "bar.date": true,
  "bar.memory": true, "bar.music": true, "bar.musicControls": true, "bar.time": true, "bar.wispr": true,
  "keys.hjkl": true, "keys.namedSpaces": true, "keys.prefix": "ctrl-a", "keys.repeatMs": 500, "keys.settingsPanel": true,
  "look.accent": null, "look.borders": true, "look.focusRing": true, "look.gap": 6, "look.radius": 10, "look.square": false, "look.style": "shell",
  "panes.header": true,
  "ping.thumbsUp": true,
  "sidebar.activity": true, "sidebar.usage": true, "sidebar.agentView": "workspaces",
  "tabs.numbers": true,
  "terminal.font": null, "terminal.fontSize": null, "terminal.padding": 14,
  "transparency.cards": 100, "transparency.chrome": 80, "transparency.on": true, "transparency.panes": 100,
  "usage.claude": true, "usage.codex": true, "usage.mode": "recent",
  "wallpaper.folder": "~/Pictures/Images/Wallpapers",
};

const SECTIONS = [
  ["look", "Appearance", "palette", "Transparency, colours, corners and spacing"],
  ["wallpaper", "Wallpaper", "image", "What shows behind everything"],
  ["sidebar", "Sidebar", "sidebar", "Width, sections, activity and usage"],
  ["bars", "Bars", "bars", "Tab strip, pane headers and the status bar"],
  ["terminal", "Terminal", "terminal", "Font, size, padding and text rendering"],
  ["sounds", "Sounds", "volume", "The pings when an agent finishes or needs you"],
  ["keys", "Keys", "keyboard", "Prefix key and personal shortcuts"],
  ["general", "General", "settings", "Layout, zoom, privacy and maintenance"],
];

// Accents come from the current theme: its own accent ("Theme", the default), then its
// colours. Dim wallpaper gradients/solids sit well behind dark islands.
const ACCENT_SLOTS = [["Red", "ansi9"], ["Green", "ansi10"], ["Yellow", "ansi11"], ["Blue", "ansi12"], ["Magenta", "ansi13"], ["Cyan", "ansi14"]];
// Theme names as people know them; anything else is title-cased from its file name.
const THEME_NAMES = { "atom-one-dark": "One Dark", "github-light": "GitHub Light", "rose-pine-dawn": "Rosé Pine Dawn", "rose-pine": "Rosé Pine", "rose-pine-moon": "Rosé Pine Moon",
  "catppuccin-mocha": "Catppuccin Mocha", "catppuccin-macchiato": "Catppuccin Macchiato", "catppuccin-frappe": "Catppuccin Frappé",
  "tokyo-night": "Tokyo Night", "tokyo-night-storm": "Tokyo Night Storm", "github-dark": "GitHub Dark" };
const themeName = (n) => THEME_NAMES[n] ?? n.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
const GRADIENTS = [
  ["Dusk", ["#342d40", "#162a37", 145]], ["Rose", ["#3d2a3a", "#17151f", 150]],
  ["Pine", ["#1b3440", "#131120", 160]], ["Gold", ["#3a3024", "#16141f", 150]],
  ["Iris", ["#2e2848", "#121019", 170]], ["Love", ["#3d2330", "#141019", 150]],
  ["Dawn", ["#4a3d55", "#26303d", 140]], ["Night", ["#1f1d2e", "#0b0a10", 180]],
];
const SOLIDS = [["Abyss", "#08070c"], ["Deep", "#0f0e16"], ["Canvas", "#15131e"], ["Base", "#191724"], ["Surface", "#1f1d2e"], ["Overlay", "#26233a"]];
const BAR_MODULES = [["bar.cpu", "CPU"], ["bar.memory", "Memory"], ["bar.battery", "Battery"], ["bar.music", "Now playing"],
  ["bar.musicControls", "Media controls"], ["bar.wispr", "Wispr Flow"], ["bar.agents", "Agent activity"], ["bar.date", "Date"], ["bar.time", "Time"]];
const KINDS = [["needs you", "Needs you"], ["finished", "Finished"], ["started", "Started"], ["closed", "Closed"]];
const MONO_FONT = /mono|nerd|menlo|monaco|consol|courier|hack|iosevka|fira ?code|source code|victor|cascadia|plex mono|\binput\b/i;

const tint = (c, a) => /^#[0-9a-f]{6}$/i.test(c) ? c + Math.round(a * 255).toString(16).padStart(2, "0") : c;
// a..b blended by f (0..1), for the gradient swatches (.bg() takes colours only).
const mix = (a, b, f) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - f) + parseInt(b.slice(i, i + 2), 16) * f)
  .toString(16).padStart(2, "0")).join("");
// A python3 that has Pillow: Herdr's PATH can find the system python first, which doesn't.
let PY = null;
async function pillowPython() {
  if (PY) return PY;
  for (const p of ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "python3"]) {
    try { if ((await exec(p, ["-I", "-c", "import PIL"])).code === 0) return (PY = p); } catch {}
  }
  return (PY = "python3");
}

const cfg = () => ({ ...DEFAULTS, ...(shared("rice") ?? {}) });
const set = (patch) => setShared("rice", { ...(shared("rice") ?? DEFAULTS), ...patch });
const expand = (p) => (p?.startsWith("~/") ? home() + p.slice(1) : p);
const tilde = (p) => (p?.startsWith(home() + "/") ? "~" + p.slice(home().length) : p);
const rel = (p) => (p?.startsWith(appHome() + "/") ? p.slice(appHome().length + 1) : p);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pretty = (f) => f.replace(/\.[^.]+$/, "").replace(/^macos-/, "").replace(/[_-]+/g, " ");

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Personal: selection strength. A wash that reads on dark looks heavy on white.
const selA = (t) => (parseInt(String(t.chrome).slice(1, 3), 16) > 128 ? 0.12 : 0.20);
export default class MySettings extends View {
  init(_props, cx) {
    this.section = props()?.section ?? localStorage.getItem("section") ?? "look";
    this.walls = null;        // [{src, thumb, name}] once listed
    this.wallBusy = null;     // src being copied in
    this.soundList = { app: [], system: [] };
    this.soundBusy = null;
    this.confirmReset = false;
    this.message = null;

    const c = cfg(), s = settings(), root = layout();
    const px = (id, d) => find(root, id)?.size?.px ?? d;
    this.sl = {};
    this.scale = {};
    // Herdr's SliderState checks a min above 100 against its default max before applying the
    // given max (and aborts), so wide ranges are kept in units of `scale`.
    const mk = (name, min, max, step, value, release, scale = 1) => {
      const [lo, hi, st0] = [min / scale, max / scale, step / scale];
      const st = SliderState.new({ max: hi, min: lo, step: st0, value: Math.max(lo, Math.min(hi, (Number(value) || min) / scale)) });
      st.on("change", (_v, cx) => cx.notify());
      st.on("release", (v, cx) => { release(Math.round(v * scale * 100) / 100, cx); cx.notify(); });
      this.sl[name] = st;
      this.scale[name] = scale;
    };
    mk("chrome", 30, 100, 1, c["transparency.chrome"], (v) => set({ "transparency.chrome": v, "transparency.on": true }));
    mk("panes", 30, 100, 1, c["transparency.panes"], (v) => set({ "transparency.panes": v, "transparency.on": true }));
    mk("cards", 30, 100, 1, c["transparency.cards"], (v) => set({ "transparency.cards": v, "transparency.on": true }));
    mk("dim", 0, 85, 1, c["background.dim"], (v) => set({ "background.dim": v }));
    mk("gap", 0, 24, 1, c["look.gap"], (v) => set({ "look.gap": v }));
    mk("radius", 0, 20, 1, c["look.radius"], (v) => set({ "look.radius": v }));
    mk("padding", 0, 32, 1, c["terminal.padding"], (v) => set({ "terminal.padding": v }));
    mk("fontSize", 10, 24, 0.5, c["terminal.fontSize"] ?? 14, (v) => set({ "terminal.fontSize": v }));
    mk("contrast", 1, 7, 0.1, s.minimum_contrast ?? 1, (v, cx) => this.saveSettings(cx, (o) => { o.minimum_contrast = Math.round(v * 10) / 10; }));
    mk("zoom", 0.75, 2, 0.05, s.zoom ?? 1, (v, cx) => this.saveSettings(cx, (o) => { o.zoom = Math.round(v * 100) / 100; }));
    mk("sidebarW", 200, 420, 2, px("sidebar", 268), (v) => { setShared("sidebar.width", v); run("layout.resize", { id: "sidebar", px: v }); }, 4);
    mk("tabsH", 32, 52, 1, px("tabs", 40), (v) => run("layout.resize", { id: "tabs", px: v }));
    mk("statusH", 26, 44, 1, px("status", 32), (v) => run("layout.resize", { id: "status", px: v }));
    mk("rows", 2, 12, 1, c["activity.rows"], (v) => set({ "activity.rows": v }));
    mk("repeat", 200, 1500, 50, c["keys.repeatMs"], (v) => set({ "keys.repeatMs": v }), 50);

    this.loadWalls(cx);
    this.loadSounds(cx);
  }

  // ---- data ---------------------------------------------------------------------------
  loadWalls(cx) {
    this.walls = null;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(await pillowPython(), ["-I", `${appHome()}/mods/my-settings/wallpaper.py`, "thumbs",
          expand(cfg()["wallpaper.folder"]), `${appHome()}/backgrounds/.thumbs`]);
        this.walls = r.code === 0 ? JSON.parse(r.stdout || "[]") : [];
        if (r.code !== 0) this.message = `Couldn't read the wallpaper folder: ${r.stderr.trim().split("\n").pop()}`;
      } catch (e) { this.walls = []; this.message = `Couldn't read the wallpaper folder (${e})`; }
      cx.notify();
    });
  }

  useWall(w, cx) {
    if (this.wallBusy) return;
    this.wallBusy = w.src;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(await pillowPython(), ["-I", `${appHome()}/mods/my-settings/wallpaper.py`, "use", w.src, `${appHome()}/backgrounds`]);
        if (r.code === 0) set({ "background.kind": "image", "background.image": rel(r.stdout.trim()), "background.source": tilde(w.src) });
        else this.message = `Couldn't use that image: ${r.stderr.trim().split("\n").pop()}`;
      } catch (e) { this.message = `Couldn't use that image (${e})`; }
      this.wallBusy = null;
      cx.notify();
    });
  }

  loadSounds(cx) {
    cx.spawn(async (cx) => {
      const ls = async (dir) => {
        try { const r = await exec("ls", [dir]); return r.code === 0 ? r.stdout.split("\n").filter(Boolean) : []; } catch { return []; }
      };
      this.soundList.app = (await ls(`${appHome()}/sounds`)).filter((f) => /\.mp3$/i.test(f) && !f.startsWith("macos-"))
        .map((f) => ({ name: pretty(f), path: `sounds/${f}` }));
      this.soundList.system = (await ls("/System/Library/Sounds")).filter((f) => /\.aiff$/i.test(f))
        .map((f) => ({ name: pretty(f), src: `/System/Library/Sounds/${f}`, path: `sounds/macos-${f.replace(/\.aiff$/i, "").toLowerCase()}.mp3` }));
      cx.notify();
    });
  }

  preview(item, cx) {
    if (item.src) cx.spawn(async () => { try { await exec("afplay", [item.src]); } catch {} });
    else playSound(item.path ?? "done");
  }

  // Herdr plays MP3s: a macOS sound is converted once (ffmpeg) into sounds/.
  pickSound(which, item, cx) {
    cx.spawn(async (cx) => {
      if (item?.src) {
        this.soundBusy = item.src; cx.notify();
        try {
          const dst = `${appHome()}/${item.path}`;
          const have = (await exec("test", ["-f", dst])).code === 0;
          if (!have) {
            const r = await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", item.src, "-codec:a", "libmp3lame", "-q:a", "2", dst]);
            if (r.code !== 0) throw new Error(r.stderr.trim() || "ffmpeg failed");
          }
        } catch (e) { this.message = `Couldn't convert ${item.name} (${e.message ?? e}). Is ffmpeg installed?`; this.soundBusy = null; cx.notify(); return; }
        this.soundBusy = null;
      }
      this.saveSettings(cx, (o) => {
        o.sounds = { ...(o.sounds ?? {}) };
        if (item) o.sounds[which] = item.path; else delete o.sounds[which];
      });
    });
  }

  saveSettings(cx, mutate) {
    cx.spawn(async (cx) => {
      try {
        const path = `${appHome()}/settings.json`;
        const before = await readTextFile(path);
        const o = before ? JSON.parse(before) : {};
        mutate(o);
        const after = JSON.stringify(o, null, 2) + "\n";
        if (after !== before) await writeTextFile(path, after, before);
      } catch (e) { this.message = `Couldn't save settings.json (${e})`; }
      cx.notify();
    });
  }

  // ---- controls -----------------------------------------------------------------------
  toggle(id, on, action) {
    const t = theme();
    return h_flex().id(id).w(36).h(20).flex_none().px(2).items_center().rounded(10).cursor_pointer()
      .bg(on ? t.accent : tint(t.foreground, 0.18)).when(on, (el) => el.justify_end())
      .on_click((_e, cx) => { action(!on, cx); cx.notify(); })
      .child(div().size(16).rounded(8).bg(on ? t.chrome : t.muted));
  }

  seg(id, options, current, pick) {
    const t = theme();
    return h_flex().flex_none().p(3).gap(2).rounded(6).bg(tint(t.foreground, 0.06)).children(options.map(([value, label], i) => {
      const on = same(value, current);
      return div().id(`${id}-${i}`).h(24).px(10).flex().items_center().rounded(3).font_family(SANS).text_size(12).cursor_pointer()
        .when(on, (el) => el.bg(tint(t.accent, selA(t))).text_color(t.foreground))
        .when(!on, (el) => el.text_color(t.muted).hover((h) => h.text_color(t.foreground)))
        .on_click((_e, cx) => { pick(value, cx); cx.notify(); })
        .child(label);
    }));
  }

  slider(name, fmt, dim = false) {
    const t = theme(), st = this.sl[name];
    return h_flex().flex_none().gap(12).items_center().when(dim, (el) => el.opacity(0.45))
      .child(Slider.new(st).w(190).child(
        SliderTrack.new(st).flex().items_center().h(20).w_full().cursor_pointer().child(
          SliderIndicator.new(st).relative().w_full().h(4).rounded(2).bg(tint(t.foreground, 0.12))
            .range_style((fill) => fill.rounded(2).bg(t.accent))
            .child(SliderThumb.new(st).size(14).rounded(7).bg(t.foreground).border_2().border_color(t.accent).ml(-7).mt(-5)))))
      .child(div().w(52).text_right().font_family(MONO).text_size(12).text_color(t.foreground).child(fmt(st.value() * this.scale[name])));
  }

  chip(id, label, on, action) {
    const t = theme();
    return h_flex().id(id).h(28).px(10).gap(6).flex_none().items_center().rounded(6).border_1().cursor_pointer()
      .font_family(SANS).text_size(12)
      .when(on, (el) => el.bg(tint(t.accent, selA(t))).border_color(tint(t.accent, 0.45)).text_color(t.foreground))
      .when(!on, (el) => el.border_color(t.border).text_color(t.muted).hover((h) => h.text_color(t.foreground).border_color(t.input ?? t.muted)))
      .on_click((_e, cx) => { action(!on, cx); cx.notify(); })
      .child(on ? svg(ICON("check")).size(12).text_color(t.accent) : div().size(12))
      .child(label);
  }

  button(id, label, icon, action, tone = null) {
    const t = theme();
    const color = tone ?? t.foreground;
    return h_flex().id(id).h(28).px(10).gap(8).flex_none().items_center().rounded(6).cursor_pointer()
      .bg(tint(t.foreground, 0.06)).font_family(SANS).text_size(12).text_color(color)
      .hover((h) => h.bg(tint(t.foreground, 0.11)))
      .on_click((_e, cx) => { action(cx); cx.notify(); })
      .when(Boolean(icon), (el) => el.child(svg(ICON(icon)).size(14).text_color(color)))
      .child(label);
  }

  // A labelled row: what it is (and a hint) on the left, the control on the right.
  row(label, hint, control) {
    const t = theme();
    return h_flex().w_full().min_h(48).px(14).py(9).gap(16).items_center()
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().font_family(SANS).text_size(13).text_color(t.foreground).child(label))
        .when(Boolean(hint), (el) => el.child(div().font_family(SANS).text_size(12).text_color(t.dim).child(hint))))
      .when(Boolean(control), (el) => el.child(control));
  }

  // A titled card of rows, with hairlines between them.
  group(title, rows, aside = null) {
    const t = theme();
    const list = rows.filter(Boolean);
    return v_flex().w_full().gap(8)
      .child(h_flex().px(4).items_center()
        .child(div().flex_1().font_family(SANS).text_size(12).font_semibold().text_color(t.muted).child(title))
        .when(Boolean(aside), (el) => el.child(aside)))
      .child(v_flex().w_full().rounded(6).bg(tint(t.foreground, 0.06)).overflow_hidden()
        .children(list.map((r, i) => i ? div().w_full().border_t(1).border_color(tint(t.foreground, 0.05)).child(r) : r)));
  }

  // A free-form block inside a group card (grids, lists).
  pad(el) {
    return div().w_full().p(12).child(el);
  }

  // ---- sections -----------------------------------------------------------------------
  look(t, c, s) {
    const on = c["transparency.on"];
    const pct = (v) => `${Math.round(v)}%`;
    const px = (v) => `${Math.round(v)}px`;
    const themeNow = layout()?.theme;
    const current = typeof themeNow === "object" ? (settings().dark === false ? themeNow?.light : themeNow?.dark) : themeNow;
    const shownThemes = themes().filter((th) => th.name !== "win98").sort((a, b) => Number(a.light) - Number(b.light));
    // The chosen theme of each kind: one is used in dark mode, the other in light mode.
    const themeChip = (th) => {
      const sel = th.name === (typeof themeNow === "object" ? (th.light ? themeNow?.light : themeNow?.dark) : themeNow);
      const dots = [th.colors.background, th.colors.accent, th.colors.ansi1, th.colors.ansi2, th.colors.ansi4].filter(Boolean);
      return h_flex().id(`theme-${th.name}`).h(32).px(10).gap(8).items_center().rounded(6).border_1().cursor_pointer()
        .border_color(sel ? t.accent : t.border).when(sel, (el) => el.bg(tint(t.accent, selA(t))))
        .hover((h) => h.border_color(sel ? t.accent : t.muted))
        // A new theme brings its own accent (a picked one would clash with it).
        .on_click((_e, cx) => {
          run("app.theme", { name: th.name }); set({ "look.accent": null });
          // A light theme only shows in light mode (and a dark one in dark): follow the pick.
          if (th.light === (settings().dark !== false)) this.saveSettings(cx, (o) => { o.appearance = th.light ? "light" : "dark"; });
          cx.notify();
        })
        .child(h_flex().gap(4).children(dots.map((d) => div().size(9).rounded(5).bg(d).border_1().border_color(tint("#ffffff", 0.12)))))
        .child(div().font_family(SANS).text_size(12).text_color(sel ? t.foreground : t.muted).child(themeName(th.name)));
    };
    return [
      this.group("Style", [
        this.row("Window style", "Focused: only the terminal is a raised panel. Islands: every section is its own panel.",
          this.seg("style", [["shell", "Focused"], ["islands", "Islands"]], c["look.style"], (v) => {
            set({ "look.style": v });
            run("layout.resize", { id: "status", px: v === "islands" ? 34 : 26 });
            run("layout.resize", { id: "sidebar-footer", px: v === "islands" ? 40 : 26 });
            run("layout.resize", { id: "tabs", px: v === "islands" ? 40 : 36 });
            run("layout.resize", { id: "brand", px: v === "islands" ? 46 : 42 });
          })),
      ]),

      this.group("Transparency", [
        this.row("See-through", "Let the wallpaper show through the sidebar, bars and panes. Ctrl+A t flips it.",
          this.toggle("tr-on", on, (v) => set({ "transparency.on": v }))),
        this.row("Frame", "The sidebar, tab strip and status bar.", this.slider("chrome", pct, !on)),
        this.row("Cards", "Raised surfaces such as workspace rows, panel cards and pills.", this.slider("cards", pct, !on)),
        this.row("Panes", "Terminals and their title strips. Below 100% the wallpaper shows behind your text.", this.slider("panes", pct, !on)),
      ]),

      this.group("Colour", [
        this.row("Accent", "Marks where you are: the focused pane, the current tab and space. The first is the theme's own.",
          h_flex().gap(8).children((() => {
            const own = themes().find((th) => th.name === current)?.colors ?? t;
            const picked = c["look.accent"]?.toLowerCase() ?? null;
            const seen = new Set();
            const list = [["Theme", own.accent, null], ...ACCENT_SLOTS.map(([name, slot]) => [name, own[slot], own[slot]])]
              .filter(([, hex]) => /^#[0-9a-f]{6}/i.test(hex ?? "") && !seen.has(hex.slice(0, 7).toLowerCase()) && seen.add(hex.slice(0, 7).toLowerCase()));
            return list.map(([name, hex, value]) => {
              const sel = value === null ? !picked : picked === value.slice(0, 7).toLowerCase();
              return div().id(`acc-${name}`).size(24).rounded(12).cursor_pointer().bg(hex.slice(0, 7)).tooltip(name === "Theme" ? "The theme's accent" : name)
                .border_2().border_color(sel ? t.foreground : "#00000000")
                .on_click((_e, cx) => { set({ "look.accent": value ? value.slice(0, 7) : null }); cx.notify(); });
            });
          })())),
        this.row("Dark themes", null, null),
        this.pad(h_flex().flex_wrap().gap(8).children(shownThemes.filter((th) => !th.light).map(themeChip))),
        this.row("Light themes", null, null),
        this.pad(h_flex().flex_wrap().gap(8).children(shownThemes.filter((th) => th.light).map(themeChip))),
        this.row("Appearance", "Dark always, light always, or follow macOS.",
          this.seg("appearance", [["dark", "Dark"], ["light", "Light"], [null, "System"]], s.appearance ?? null,
            (v, cx) => this.saveSettings(cx, (o) => { if (v) o.appearance = v; else delete o.appearance; }))),
      ]),
      this.group("Shape", [
        this.row("Square corners", "Everything square: islands, panes, cards, pills and menus.", this.toggle("square", c["look.square"], (v) => set({ "look.square": v }))),
        this.row("Corners", "Roundness of the islands and panes (when not square).", this.slider("radius", px)),
        this.row("Gaps", "Space around and between the panels; more shows more wallpaper.", this.slider("gap", px)),
        this.row("Borders", "A hairline around each panel and pane.", this.toggle("borders", c["look.borders"], (v) => set({ "look.borders": v }))),
        this.row("Focus ring", "Outline the focused pane in the accent colour.", this.toggle("focus", c["look.focusRing"], (v) => set({ "look.focusRing": v }))),
      ]),
    ];
  }

  wallpaper(t, c) {
    const useWall = c["background.on"] !== false;
    const master = this.group("Wallpaper", [
      this.row("Use a wallpaper", "Off: the window background comes from your theme.", this.toggle("wall-on", useWall, (v) => set({ "background.on": v }))),
    ]);
    if (!useWall) return [master];
    const kind = c["background.kind"];
    const src = expand(c["background.source"]);
    const tile = (id, w, h, sel, body, action, tip) => div().id(id).w(w).h(h).flex_none().rounded(6).p(2).cursor_pointer().tooltip(tip)
      .border_2().border_color(sel ? t.accent : "#00000000").hover((x) => x.border_color(sel ? t.accent : t.input ?? t.muted))
      .on_click((_e, cx) => { action(cx); cx.notify(); }).child(body);
    const walls = this.walls;
    const grid = walls == null
      ? div().py(24).w_full().flex().justify_center().font_family(SANS).text_size(12).text_color(t.dim).child("Making previews…")
      : !walls.length
        ? div().py(24).w_full().flex().justify_center().font_family(SANS).text_size(12).text_color(t.dim).child("No images in this folder.")
        : h_flex().flex_wrap().gap(8).children(walls.map((w, i) => tile(`wall-${i}`, 184, 106, kind === "image" && w.src === src,
          div().size_full().rounded(2).overflow_hidden().relative()
            .child(image(rel(w.thumb)).w(176).h(98))
            .when(this.wallBusy === w.src, (el) => el.child(div().absolute().inset_0().flex().items_center().justify_center()
              .bg(tint("#000000", 0.55)).font_family(SANS).text_size(12).text_color("#ffffff").child("Applying…"))),
          (cx) => this.useWall(w, cx), w.name)));
    return [
      master,
      this.group("Image", [
        this.row("Folder", tilde(expand(c["wallpaper.folder"])),
          h_flex().gap(6)
            .child(this.button("wall-open", "Open", "folder", () => exec("open", [expand(c["wallpaper.folder"])])))
            .child(this.button("wall-change", "Change…", null, (cx) => cx.spawn(async (cx) => {
              const dir = await pickFolder({ prompt: "Use folder" });
              if (dir) { set({ "wallpaper.folder": tilde(dir) }); this.loadWalls(cx); }
              cx.notify();
            })))
            .child(this.button("wall-reload", "Refresh", "reset", (cx) => this.loadWalls(cx)))),
        this.row("Dim", "Darkens the wallpaper (and gradients) behind everything.", this.slider("dim", (v) => `${Math.round(v)}%`)),
        this.row("Fit", "Fill crops the image to the window; Fit shows all of it.",
          this.seg("fit", [["cover", "Fill"], ["contain", "Fit"]], c["background.fit"], (v) => set({ "background.fit": v }))),
        this.pad(grid),
      ], kind === "image" ? div().font_family(SANS).text_size(11).text_color(t.accent).child("In use") : null),
      this.group("Gradient", [
        this.pad(h_flex().flex_wrap().gap(8).children(GRADIENTS.map(([name, g]) => tile(`grad-${name}`, 140, 70,
          kind === "gradient" && same(g, c["background.gradient"]),
          div().size_full().rounded(2).overflow_hidden().relative()
            .child(h_flex().absolute().inset_0().children(Array.from({ length: 16 }, (_, i) => div().flex_1().h_full().bg(mix(g[0], g[1], i / 15)))))
            .child(div().absolute().left(8).bottom(6).font_family(SANS).text_size(11).text_color(tint("#ffffff", 0.75)).child(name)),
          () => set({ "background.kind": "gradient", "background.gradient": g }), name)))),
      ], kind === "gradient" ? div().font_family(SANS).text_size(11).text_color(t.accent).child("In use") : null),
      this.group("Solid colour", [
        this.pad(h_flex().flex_wrap().gap(8).children(SOLIDS.map(([name, hex]) => tile(`solid-${name}`, 90, 56,
          kind === "solid" && c["background.solid"] === hex,
          div().size_full().rounded(2).p(6).flex().items_end().bg(hex).border_1().border_color(t.border)
            .font_family(SANS).text_size(11).text_color(t.dim).child(name),
          () => set({ "background.kind": "solid", "background.solid": hex }), hex)))),
      ], kind === "solid" ? div().font_family(SANS).text_size(11).text_color(t.accent).child("In use") : null),
    ];
  }

  sidebar(t, c) {
    const px = (v) => `${Math.round(v)}px`;
    const kinds = c["activity.kinds"] ?? [];
    const showSection = (key, id) => (v) => { set({ [key]: v }); run(v ? "layout.show" : "layout.hide", { id }); };
    return [
      this.group("Layout", [
        this.row("Width", "Cmd+B or the sidebar button folds it to a rail.", this.slider("sidebarW", px)),
        this.row("Agent view", "Grouped by workspace, one flat list, or grouped by what needs you.",
          this.seg("agent-view", [["workspaces", "Spaces"], ["agents", "Agents"], ["attention", "Attention"]], c["sidebar.agentView"], (v) => set({ "sidebar.agentView": v }))),
        this.row("Activity", "Recent agent events, under the workspaces.", this.toggle("sec-activity", c["sidebar.activity"], showSection("sidebar.activity", "activity"))),
        this.row("Usage", "5-hour and 7-day limits for Claude Code and Codex.", this.toggle("sec-usage", c["sidebar.usage"], showSection("sidebar.usage", "usage"))),
      ]),
      this.group("Activity", [
        this.row("Rows in the sidebar", "The full log is one click away.", this.slider("rows", (v) => String(Math.round(v)))),
        this.row("History kept", "Older runs drop off the log.",
          this.seg("keep", [[100, "100"], [200, "200"], [500, "500"], [1000, "1,000"]], c["activity.keep"], (v) => set({ "activity.keep": v }))),
        this.row("Log closed agents", "Also list agents that closed while idle (not mid-run).",
          this.toggle("kind-closed", kinds.includes("closed"), (v) => set({ "activity.kinds": v ? [...new Set([...kinds, "closed"])] : kinds.filter((x) => x !== "closed") }))),
      ]),
      this.group("Usage", [
        this.row("Claude Code", null, this.toggle("use-claude", c["usage.claude"], (v) => set({ "usage.claude": v }))),
        this.row("Codex", null, this.toggle("use-codex", c["usage.codex"], (v) => set({ "usage.codex": v }))),
        this.row("Show", "Only while one is running, if used this week, or always.",
          this.seg("use-mode", [["live", "Running"], ["recent", "This week"], ["always", "Always"]], c["usage.mode"], (v) => set({ "usage.mode": v }))),
      ]),
    ];
  }

  bars(t, c) {
    const px = (v) => `${Math.round(v)}px`;
    const panels = shared("workspace.panels") ?? ["files", "changes"];
    const panel = (id) => (v) => setShared("workspace.panels", v ? [...new Set([...panels, id])] : panels.filter((p) => p !== id));
    return [
      this.group("Tab strip", [
        this.row("Height", null, this.slider("tabsH", px)),
        this.row("Tab numbers", "The small number before each tab (Cmd+1–9 go by it).", this.toggle("tab-num", c["tabs.numbers"], (v) => set({ "tabs.numbers": v }))),
        this.row("Files button", null, this.toggle("tab-files", panels.includes("files"), panel("files"))),
        this.row("Changes button", null, this.toggle("tab-changes", panels.includes("changes"), panel("changes"))),
      ]),
      this.group("Panes", [
        this.row("Pane header", "The title strip on each pane, with split, zoom and close.", this.toggle("pane-head", c["panes.header"], (v) => set({ "panes.header": v }))),
      ]),
      this.group("Status bar", [
        this.row("Height", null, this.slider("statusH", px)),
        this.row("Clock", null, this.seg("clock", [[true, "24-hour"], [false, "12-hour"]], c["bar.clock24"], (v) => set({ "bar.clock24": v }))),
        this.pad(v_flex().gap(8)
          .child(div().font_family(SANS).text_size(12).text_color(t.dim).child("Show"))
          .child(h_flex().flex_wrap().gap(6).children(BAR_MODULES.map(([k, label]) => this.chip(`bar-${k}`, label, c[k], (v) => set({ [k]: v })))))),
      ]),
    ];
  }

  terminal(t, c, s) {
    const all = [...new Set(["JetBrains Mono", "Geist Mono", ...fonts().filter((f) => MONO_FONT.test(f))])].sort((a, b) => a.localeCompare(b));
    const current = c["terminal.font"];
    const fontRow = (name, value, i) => {
      const sel = (current ?? null) === value;
      return h_flex().id(`font-${i}`).w_full().h(32).px(10).gap(10).items_center().rounded(4).cursor_pointer()
        .when(sel, (el) => el.bg(tint(t.accent, selA(t)))).when(!sel, (el) => el.hover((h) => h.bg(t.hover)))
        .on_click((_e, cx) => { set({ "terminal.font": value }); cx.notify(); })
        .child(div().w(14).flex_none().when(sel, (el) => el.child(svg(ICON("check")).size(14).text_color(t.accent))))
        .child(div().w(200).flex_none().truncate().font_family(SANS).text_size(13).text_color(sel ? t.foreground : t.muted).child(name))
        .child(div().flex_1().min_w(0).truncate().font_family(value ?? "JetBrains Mono").text_size(13).text_color(t.foreground).child("fn main() { 0O 1lI => {} }"));
    };
    return [
      this.group("Font", [
        this.pad(v_flex().id("font-list").w_full().h(196).overflow_y_scrollbar()
          .child(fontRow("Default (JetBrains Mono)", null, "default"))
          .children(all.map((f, i) => fontRow(f, f, i)))),
        this.row("Size", "Before zoom.", this.slider("fontSize", (v) => `${v}px`)),
        this.row("Padding", "Space between the pane edge and the text.", this.slider("padding", (v) => `${Math.round(v)}px`)),
        this.row("Ligatures", "Join -> => != and friends into single glyphs.",
          this.toggle("ligatures", s.font_ligatures === true, (v, cx) => this.saveSettings(cx, (o) => { o.font_ligatures = v; }))),
      ]),
      this.group("Rendering", [
        this.row("Minimum contrast", "Lifts text that's too close to its background (1 = off).", this.slider("contrast", (v) => (Math.round(v * 10) / 10).toFixed(1))),
        this.row("Scrollbars", "A slim scroll thumb when a pane has scrollback.",
          this.toggle("scrollbars", s.pane_scrollbars !== false, (v, cx) => this.saveSettings(cx, (o) => { o.pane_scrollbars = v; }))),
      ]),
      this.group("Input", [
        this.row("Option as Alt", "For Alt shortcuts in the shell; Auto keeps accents on non-US layouts.",
          this.seg("opt", [["auto", "Auto"], ["on", "On"], ["off", "Off"], ["left", "Left"], ["right", "Right"]], s.option_as_alt ?? "auto",
            (v, cx) => this.saveSettings(cx, (o) => { o.option_as_alt = v; }))),
        this.row("Programs can copy", "Let terminal programs write your clipboard (OSC 52).",
          this.toggle("clip", s.clipboard_write !== false, (v, cx) => this.saveSettings(cx, (o) => { o.clipboard_write = v; }))),
      ]),
    ];
  }

  sounds(t, s, c) {
    const snd = s.sounds ?? {};
    const list = (which) => {
      const cur = snd[which] ?? null;
      const item = (id, name, it, sub) => {
        const sel = (it?.path ?? null) === cur;
        const busy = it?.src && this.soundBusy === it.src;
        return h_flex().id(`${which}-${id}`).w_full().h(30).px(8).gap(8).items_center().rounded(4).cursor_pointer()
          .when(sel, (el) => el.bg(tint(t.accent, selA(t)))).when(!sel, (el) => el.hover((h) => h.bg(t.hover)))
          .on_click((_e, cx) => { this.pickSound(which, it, cx); cx.notify(); })
          .child(div().id(`${which}-${id}-play`).size(22).flex_none().flex().items_center().justify_center().rounded(4)
            .text_color(t.dim).hover((h) => h.bg(t.hover).text_color(t.foreground)).tooltip("Preview")
            .on_click((_e, cx) => { cx.stop_propagation(); this.preview(it ?? { path: which }, cx); })
            .child(svg(ICON("play")).size(10)))
          .child(div().flex_1().min_w(0).truncate().font_family(SANS).text_size(13).text_color(sel ? t.foreground : t.muted).child(busy ? "Converting…" : name))
          .when(Boolean(sub), (el) => el.child(div().flex_none().font_family(SANS).text_size(11).text_color(t.dim).child(sub)))
          .when(sel, (el) => el.child(svg(ICON("check")).size(14).flex_none().text_color(t.accent)));
      };
      return v_flex().id(`snd-${which}`).flex_1().min_w(0).h(300).overflow_y_scrollbar().gap(1)
        .child(item("default", "Herdr default", null, "built in"))
        .children(this.soundList.app.map((it, i) => item(`a${i}`, it.name, it, "yours")))
        .children(this.soundList.system.map((it, i) => item(`s${i}`, it.name, it, "macOS")));
    };
    const head = (label) => div().px(8).pb(4).font_family(SANS).text_size(12).text_color(t.dim).child(label);
    return [
      this.group("Alerts", [
        this.row("Play sounds", "When an agent finishes while you're elsewhere, or needs you.",
          this.toggle("snd-on", snd.enabled !== false, (v, cx) => this.saveSettings(cx, (o) => { o.sounds = { ...(o.sounds ?? {}), enabled: v }; }))),
        this.row("Thumbs-up", "Pop the thumbs-up beside an agent's note when it finishes or needs you.",
          this.toggle("ping-thumbs", c["ping.thumbsUp"], (v) => set({ "ping.thumbsUp": v }))),
        this.pad(h_flex().w_full().gap(12).items_start()
          .child(v_flex().flex_1().min_w(0).child(head("Agent finished")).child(list("done")))
          .child(div().w(1).h(320).bg(t.border))
          .child(v_flex().flex_1().min_w(0).child(head("Agent needs you")).child(list("blocked")))),
        this.row("Your sounds", "MP3s in ~/.config/herdr-app/sounds show up here.",
          h_flex().gap(6)
            .child(this.button("snd-folder", "Open folder", "folder", () => exec("open", [`${appHome()}/sounds`])))
            .child(this.button("snd-reload", "Refresh", "reset", (cx) => this.loadSounds(cx)))),
      ]),
    ];
  }

  keys(t, c) {
    const cap = (k) => div().flex_none().min_w(22).h(20).px(6).flex().items_center().justify_center().rounded(4)
      .bg(tint(t.foreground, 0.12)).font_family(MONO).text_size(11).text_color(t.muted).child(k);
    const P = { "ctrl-a": "⌃A", "ctrl-b": "⌃B", "ctrl-space": "⌃␣" }[c["keys.prefix"]];
    const tip = (keysText, what) => h_flex().h(28).gap(10).items_center()
      .child(h_flex().w(96).flex_none().gap(4).children(keysText.map(cap)))
      .child(div().font_family(SANS).text_size(13).text_color(t.muted).child(what));
    return [
      this.group("Prefix", [
        this.row("Prefix key", "Opens the tmux-style key menu. Press it twice to send it to the program.",
          this.seg("prefix", [["ctrl-a", "⌃A"], ["ctrl-b", "⌃B"], ["ctrl-space", "⌃Space"], ["off", "Off"]], c["keys.prefix"], (v) => set({ "keys.prefix": v }))),
        this.row("Repeat window", "After J/K, how long more presses keep repeating without the prefix.", this.slider("repeat", (v) => `${Math.round(v)}ms`)),
      ]),
      this.group("Shortcuts", [
        this.row("Ctrl+H/J/K/L", "Move between panes; at an edge the key goes to the program.",
          this.toggle("hjkl", c["keys.hjkl"], (v) => set({ "keys.hjkl": v }))),
        this.row("Cmd+N asks for a name", "Off: new spaces get an automatic name.",
          this.toggle("named", c["keys.namedSpaces"], (v) => set({ "keys.namedSpaces": v }))),
        this.row("Cmd+, opens this panel", "Off: it opens Herdr's own settings.",
          this.toggle("cmd-comma", c["keys.settingsPanel"], (v) => set({ "keys.settingsPanel": v }))),
      ]),
      this.group("Good to know", [
        this.pad(v_flex()
          .when(Boolean(P), (el) => el.child(tip([P, "t"], "Toggle transparency")).child(tip([P, "s"], "These settings")).child(tip([P, "a"], "Activity log")).child(tip([P, "?"], "Every prefix key")))
          .child(tip(["⌘P"], "Go to a space, tab or agent"))
          .child(tip(["⌘B"], "Fold the sidebar"))),
        this.row("All keys", "Herdr's key list, from keys.json.", this.button("all-keys", "Show keys", "keyboard", () => { this.close(); run("app.help"); })),
      ]),
    ];
  }

  general(t, s) {
    const shown = shared("layout");
    const up = updates();
    return [
      this.group("Window", [
        this.row("Layout", "Cmd+Shift+L cycles them.",
          this.seg("layout", layouts().filter((n) => n.startsWith("my-") || n === "na29-islands").map((n) => { const s = n.replace(/^(my-|na29-)/, ""); return [n, s.charAt(0).toUpperCase() + s.slice(1)]; }), shown, (v) => run("layout.switch", { name: v }))),
        this.row("Zoom", "Scales everything; Cmd+= and Cmd+- too.", this.slider("zoom", (v) => `${Math.round(v * 100)}%`)),
      ]),
      this.group("Herdr", [
        this.row("Updates", up?.app?.ready ? "An update is downloaded and ready." : "Herdr updates itself in the background.",
          up?.app?.ready ? this.button("update", "Restart to update", "reset", () => run("app.update"), t.done) : this.button("check", "Check now", "reset", () => run("app.check_updates"))),
        this.row("Anonymous usage data", "Daily counts only, never content or names.",
          this.toggle("telemetry", s.telemetry !== false, (v, cx) => this.saveSettings(cx, (o) => { o.telemetry = v; }))),
        this.row("Herdr settings", "Machines, updates and everything built in.", this.button("herdr", "Open", "external", () => { this.close(); run("app.settings"); })),
      ]),
      this.group("Files", [
        this.row("Config folder", "~/.config/herdr-app: layouts, mods, keys, rice.json.",
          h_flex().gap(6)
            .child(this.button("cfg-open", "Open", "folder", () => exec("open", [appHome()])))
            .child(this.button("cfg-rice", "Edit rice.json", null, () => exec("open", ["-t", `${appHome()}/rice.json`])))),
        this.row("Reset", "Back to the setup as it was saved in your dotfiles (look, bars, keys).",
          this.confirmReset
            ? h_flex().gap(6)
              .child(this.button("reset-no", "Cancel", null, () => { this.confirmReset = false; }))
              .child(this.button("reset-yes", "Reset everything", "reset", () => { setShared("rice", { ...DEFAULTS }); this.confirmReset = false; this.message = "Reset to defaults. Reopen the panel to refresh the sliders."; }, t.blocked))
            : this.button("reset", "Reset…", "reset", () => { this.confirmReset = true; }, t.blocked)),
      ]),
    ];
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  render() {
    const t = theme();
    const c = cfg(), s = settings();
    const [id, title, , about] = SECTIONS.find((x) => x[0] === this.section) ?? SECTIONS[0];
    const body = { look: () => this.look(t, c, s), wallpaper: () => this.wallpaper(t, c), sidebar: () => this.sidebar(t, c),
      bars: () => this.bars(t, c), terminal: () => this.terminal(t, c, s), sounds: () => this.sounds(t, s, c),
      keys: () => this.keys(t, c), general: () => this.general(t, s) }[id]();

    const nav = v_flex().w(210).h_full().flex_none().p(5).gap(2)
      .child(h_flex().h(40).px(15).mb(6).gap(8).items_center()
        .child(svg(ICON("settings")).size(16).text_color(t.accent))
        .child(div().font_family(SANS).text_size(14).font_semibold().text_color(t.foreground).child("Settings")))
      .children(SECTIONS.map(([key, label, icon]) => {
        const on = key === id;
        return h_flex().id(`nav-${key}`).h(34).px(15).gap(10).items_center().rounded(6).cursor_pointer()
          .font_family(SANS).text_size(13)
          .when(on, (el) => el.bg(tint(t.accent, selA(t))).text_color(t.foreground))
          .when(!on, (el) => el.text_color(t.muted).hover((h) => h.bg(t.hover).text_color(t.foreground)))
          .on_click((_e, cx) => { this.section = key; localStorage.setItem("section", key); this.confirmReset = false; cx.notify(); })
          .child(svg(ICON(icon)).size(16).text_color(on ? t.accent : t.dim))
          .child(label);
      }))
      .child(div().flex_1())
      .child(h_flex().id("nav-herdr").h(32).px(15).gap(10).items_center().rounded(6).cursor_pointer()
        .font_family(SANS).text_size(12).text_color(t.dim).hover((h) => h.bg(t.hover).text_color(t.foreground))
        .on_click(() => { this.close(); run("app.settings"); })
        .child(svg(ICON("external")).size(14)).child("Herdr settings"))
      .child(div().px(15).pt(4).font_family(MONO).text_size(11).text_color(tint(t.dim, 0.8)).child("saved to rice.json"));

    const content = v_flex().flex_1().min_w(0).h_full()
      .child(h_flex().h(60).flex_none().mt(5).ml(8).mr(5).px(18).gap(12).items_center().rounded(6).bg(tint(t.foreground, 0.06))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().font_family(SANS).text_size(16).font_semibold().text_color(t.foreground).child(title))
          .child(div().font_family(SANS).text_size(12).text_color(t.dim).child(about)))
        .child(div().id("close").size(28).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
          .text_color(t.dim).hover((h) => h.bg(t.hover).text_color(t.foreground)).tooltip("Close (esc)")
          .on_click(() => this.close()).child(svg(ICON("x")).size(16))))
      .when(Boolean(this.message), (el) => el.child(h_flex().id("msg").ml(8).mr(5).mt(14).px(12).py(8).gap(10).items_center().rounded(6)
        .bg(tint(t.working, 0.12)).font_family(SANS).text_size(12).text_color(t.foreground)
        .child(div().flex_1().child(this.message))
        .child(div().id("msg-x").cursor_pointer().text_color(t.dim).on_click((_e, cx) => { this.message = null; cx.notify(); }).child(svg(ICON("x")).size(12)))))
      .child(v_flex().id(`body-${id}`).flex_1().min_h(0).overflow_y_scrollbar().pl(8).pr(5).pt(18).pb(28).gap(22).children(body));

    return h_flex().id("my-settings").size_full().rounded(12).border_1().border_color(t.border).overflow_hidden()
      .bg(t.chrome).text_color(t.foreground)
      .child(nav).child(content);
  }
}
