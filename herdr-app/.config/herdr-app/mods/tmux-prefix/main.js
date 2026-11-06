// From herdr.dev/mods/herdrdev/tmux-prefix. Personal changes: pane moves (h/j/k/l, arrows)
// close at once instead of waiting 500 ms for a repeat; prefix is Ctrl+A
// (here and in keys.json), plus s = Settings, b = toggle sidebar, g = Go to (my-goto).
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { closeOverlay, focused, hc, nextCommand, props, run, theme } from "herdr";

// Edit these two things to make the example yours. Only repeatable actions
// start a timer: the first key after Ctrl+A can take as long as you like.
const REPEAT_MS = 500;
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
  ["s", "Settings", "app.settings"],
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
    this.send("ctrl+a", cx);
  }

  key(e, cx) {
    cx.stop_propagation();
    const m = e.modifiers;
    if (e.key === "escape") return this.dismiss();
    if (m.control && e.key === "a") return this.sendPrefix(cx);
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
    run(command, args);
    if (repeatable) {
      this.repeat = true;
      const generation = ++this.generation;
      cx.timer.after(REPEAT_MS, () => {
        if (this.generation === generation) this.dismiss();
      });
      cx.notify();
    }
  }

  render() {
    const t = theme();
    const rows = this.all ? BINDINGS : BINDINGS.filter(([key]) => !["left", "right", "up", "down"].includes(key) && !/^\d$/.test(key));
    // Personal: frameless popup (mod.json "frame": "none") with a tall invisible frame.
    // The panel below is only as tall as its rows, so ? grows it instead of scrolling,
    // and its background is see-through.
    return v_flex().id("tmux-prefix").size_full().track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .child(v_flex().w_full().p(14).gap(8).rounded(12).border_1().border_color(t.border).shadow_lg()
        .bg(translucent(t.popover, PANEL_ALPHA)).text_color(t.foreground).text_size(12)
        .child(h_flex().justify_between().child(div().font_semibold().child(this.repeat ? `Repeat · ${REPEAT_MS} ms` : "Ctrl+A · waiting for a key"))
          .child(div().text_color(t.muted).child("Esc cancel · ^A send prefix")))
        .child(v_flex().children(rows.map(([key, label, , , repeatable]) =>
          h_flex().h(20).flex_none().items_center().gap(12).child(div().w(40).text_color(t.accent).child(key))
            .child(div().flex_1().child(label)).child(div().text_color(t.dim).child(repeatable ? "repeat" : "")))))
        .child(div().text_color(t.muted).child(this.all ? "? fewer bindings" : "0–9 tabs (0 = 10) · arrows focus · ? all bindings")));
  }
}
