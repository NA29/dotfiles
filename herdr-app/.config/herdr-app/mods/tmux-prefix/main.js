// From herdr.dev/mods/herdrdev/tmux-prefix. Personal changes: pane moves (h/j/k/l, arrows)
// close at once instead of waiting for a repeat; the prefix key (Ctrl+A by default) and the
// repeat window come from the my-settings panel (my-keys writes keys.json); plus s = my
// settings, t = toggle transparency, b = toggle sidebar, g = Go to (my-goto).
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { closeOverlay, focused, hc, nextCommand, openOverlay, props, run, setShared, shared, theme } from "herdr";

// Personal settings (my-settings panel): the prefix key and the repeat window.
const R = (k, d) => (shared("rice") ?? {})[k] ?? d;
const PREFIX = () => { const p = R("keys.prefix", "ctrl-a"); return p === "off" ? "ctrl-a" : p; };
const PREFIX_CAP = () => ({ "ctrl-a": "⌃A", "ctrl-b": "⌃B", "ctrl-space": "⌃␣" }[PREFIX()] ?? "⌃A");
// a: the Activity log (the sidebar's activity mod as a dialog).
function openActivity() {
  openOverlay({ mod: "sleek-activity", kind: "dialog", width: 760, height: 0.84, frame: "none", props: { log: true } });
}
// t: flip see-through; my-keys writes the layout.
function toggleTransparency() {
  const r = shared("rice") ?? {};
  setShared("rice", { ...r, "transparency.on": r["transparency.on"] === false });
}

// Edit these two things to make the example yours. Only repeatable actions
// start a timer: the first key after Ctrl+A can take as long as you like.
const REPEAT_MS = () => R("keys.repeatMs", 500);
const BINDINGS = [
  ["c", "New tab", "tab.new"],
  ["%", "Split right", "pane.split", { direction: "right" }],
  ['"', "Split down", "pane.split", { direction: "down" }],
  ["x", "Close pane", "pane.close"],
  ["n", "Next tab", "tab.next"],
  ["p", "Previous tab", "tab.prev"],
  ["h", "Focus left", "pane.go", { direction: "left" }],
  ["j", "Focus down", "pane.go", { direction: "down" }],
  ["k", "Focus up", "pane.go", { direction: "up" }],
  ["l", "Focus right", "pane.go", { direction: "right" }],
  ["left", "Focus left", "pane.go", { direction: "left" }],
  ["down", "Focus down", "pane.go", { direction: "down" }],
  ["up", "Focus up", "pane.go", { direction: "up" }],
  ["right", "Focus right", "pane.go", { direction: "right" }],
  ["J", "Next space", "space.next", {}, true],
  ["K", "Previous space", "space.prev", {}, true],
  ["z", "Zoom pane", "pane.zoom"],
  ["d", "Minimize window", "window.minimize"],
  ["s", "Settings", "mod.open", { name: "my-settings" }],
  ["t", "Toggle transparency", "fn", toggleTransparency],
  ["a", "Activity log", "fn", openActivity],
  ["b", "Toggle sidebar", "layout.toggle", { id: "sidebar" }],
  ["g", "Go to…", "mod.open", { name: "my-goto" }],
  ...Array.from({ length: 10 }, (_, i) => [String(i), `Tab ${i === 0 ? 10 : i}`, "tab.select", { index: i === 0 ? 10 : i }]),
];

// Personal: how opaque the panel is (0–1). Lower is more see-through.
const PANEL_ALPHA = 1;
function translucent(color, alpha) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return color + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

function forwardKey(e, key) {
  if (["enter", "tab", "backspace", "left", "right", "up", "down", "space"].includes(e.key)) return e.key;
  if (key === " ") return "space";
  if (/^[A-Z]$/.test(key)) return `shift+${key.toLowerCase()}`;
  if (key.length === 1 && "abcdefghijklmnopqrstuvwxyz0123456789`\\[],=-.';/".includes(key)) return key === "\\" ? "backslash" : key;
  return null;
}

export default class TmuxPrefix extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.repeat = false;
    this.generation = 0;
    this.all = false;
    // The mod-specific key binding beats the global opener while we're open.
    cx.spawn(async (cx) => {
      for (;;) {
        await nextCommand();
        this.sendPrefix(cx);
      }
    });
  }

  dismiss() {
    closeOverlay(props().overlay);
  }

  send(key, cx) {
    this.generation++;
    const terminal = focused()?.terminal;
    if (!terminal) return this.dismiss();
    // hc starts its subprocess at the call, before closing cancels this view's tasks.
    const pending = hc(["keys", terminal, key]);
    cx.spawn(async () => {
      const result = await pending;
      if (result.code !== 0) console.log(`tmux-prefix: ${result.stderr}`);
    });
    this.dismiss();
  }

  sendPrefix(cx) {
    this.send(PREFIX().replace("-", "+"), cx);
  }

  key(e, cx) {
    cx.stop_propagation();
    const m = e.modifiers;
    if (e.key === "escape") return this.dismiss();
    if (m.control && e.key === PREFIX().slice(5)) return this.sendPrefix(cx);
    const plain = !m.control && !m.alt && !m.platform;
    const key = plain ? (e.key_char ?? (m.shift && e.key.length === 1 ? e.key.toUpperCase() : e.key)) : e.key;
    if (plain && key === "?") {
      this.all = !this.all;
      this.repeat = false;
      this.generation++;
      cx.notify();
      return;
    }
    const binding = plain && BINDINGS.find((b) => b[0] === key);
    if (!binding) {
      const forwarded = this.repeat && plain && forwardKey(e, key);
      if (forwarded) return this.send(forwarded, cx);
      return this.dismiss();
    }
    const [, , command, args = {}, repeatable = false] = binding;
    if (!repeatable) this.dismiss();
    if (command === "fn") args();
    else run(command, args);
    if (repeatable) {
      this.repeat = true;
      const generation = ++this.generation;
      cx.timer.after(REPEAT_MS(), () => {
        if (this.generation === generation) this.dismiss();
      });
      cx.notify();
    }
  }

  // Sleek cheat-sheet look (matches the Go to screen): a filled header bar, bindings grouped
  // in two columns, keys as soft keycap pills. Display only: the keys still come from BINDINGS.
  render() {
    const t = theme();
    const tint = (c, a) => /^#[0-9a-f]{6}$/i.test(c) ? c + Math.round(a * 255).toString(16).padStart(2, "0") : c;
    const MONO = "Geist Mono", SANS = "Geist";
    const GROUPS = [
      ["Tabs", [["c", "New tab"], ["n", "Next tab"], ["p", "Previous tab"]],
        [["1–9", "Tab 1–9"], ["0", "Tab 10"]]],
      ["Panes", [["%", "Split right"], ['"', "Split down"], ["h j k l", "Focus pane"], ["z", "Zoom pane"], ["x", "Close pane"]],
        [["← ↓ ↑ →", "Focus pane"]]],
      ["Spaces", [["J", "Next space", true], ["K", "Previous space", true]], []],
      ["App", [["g", "Go to…"], ["a", "Activity log"], ["s", "Settings"], ["t", "Toggle transparency"], ["b", "Toggle sidebar"], ["d", "Minimize window"]], []],
    ];
    const cap = (text, accent = false) => div().flex_none().min_w(22).h(20).px(6).flex().items_center().justify_center().rounded(5)
      .bg(accent ? tint(t.accent, 0.16) : tint(t.foreground, 0.07)).font_family(MONO).text_size(10.5)
      .text_color(accent ? t.accent : t.muted).child(text);
    const item = ([key, label, repeatable]) => h_flex().w_full().h(30).px(8).gap(10).items_center().rounded(7)
      .child(div().w(58).flex_none().flex().child(cap(key)))
      .child(div().flex_1().min_w(0).truncate().font_family(SANS).text_size(12.5).text_color(t.foreground).child(label))
      .when(Boolean(repeatable), (el) => el.child(div().flex_none().h(18).px(7).flex().items_center().rounded(9)
        .bg(tint(t.working, 0.13)).font_family(SANS).text_size(10.5).text_color(t.working).child("repeat")));
    const group = ([name, items, more]) => {
      const list = this.all ? [...items, ...more] : items;
      const pairs = [];
      for (let i = 0; i < list.length; i += 2) pairs.push(list.slice(i, i + 2));
      return v_flex().w_full()
        .child(div().h(26).px(10).pt(6).flex().items_center().font_family(SANS).text_size(11).font_semibold().text_color(t.dim).child(name))
        .children(pairs.map((pair, i) => h_flex().id(`pfx-${name}-${i}`).w_full().gap(4)
          .child(div().flex_1().min_w(0).child(item(pair[0])))
          .child(div().flex_1().min_w(0).when(Boolean(pair[1]), (el) => el.child(item(pair[1]))))));
    };
    // Frameless popup (mod.json "frame": "none") with a tall invisible frame: the panel is
    // only as tall as its rows, so ? grows it instead of scrolling.
    return v_flex().id("tmux-prefix").size_full().track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .child(v_flex().w_full().pt(8).pb(4).rounded(14).border_1().border_color(t.border).shadow_lg().overflow_hidden()
        .bg(translucent(t.chrome, PANEL_ALPHA)).text_color(t.foreground)
        // Header: a filled bar like Go to's search field.
        .child(h_flex().h(44).mx(8).px(12).gap(10).items_center().rounded(10).bg(t.background)
          // lualine-style block, like Go to's NORMAL/INSERT: PREFIX in the accent, REPEAT in gold.
          .child(div().flex_none().h(22).px(8).flex().items_center().rounded(6).font_family(MONO).text_size(10.5).font_bold()
            .bg(this.repeat ? t.working : t.accent).text_color(t.background).child(this.repeat ? "REPEAT" : "PREFIX"))
          .child(cap(PREFIX_CAP()))
          .child(div().flex_1().font_family(SANS).text_size(13.5).text_color(this.repeat ? t.working : t.muted)
            .child(this.repeat ? `Repeat · ${REPEAT_MS()} ms` : "waiting for a key…"))
          .child(h_flex().flex_none().gap(5).items_center().font_family(SANS).text_size(11).text_color(t.dim)
            .child(cap("esc")).child(div().mr(6).child("cancel"))
            .child(cap(PREFIX_CAP())).child(div().child(`send ${PREFIX_CAP()}`))))
        .child(v_flex().px(8).pt(2).children(GROUPS.map(group)))
        // Footer: what ? does.
        .child(h_flex().h(34).px(16).gap(6).items_center().font_family(SANS).text_size(11).text_color(t.dim)
          .child(cap("?"))
          .child(div().child(this.all ? "fewer bindings" : "all bindings: tab numbers and arrow keys"))));
  }
}
