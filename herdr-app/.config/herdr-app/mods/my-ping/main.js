// Personal: a thumbs-up beside Claude Code's pings. Herdr's own `toast` mod draws the note in the
// bottom-right corner (it's shipped, so it can't be restyled for good); this mod watches the agents
// and, when a Claude Code agent finishes while you weren't looking or needs you, pops the thumbs-up
// just left of that note for as long as the note shows.
//
// Three roles, one file:
//   - the layout block (zero-height, `my-ping` in na29-islands): watches agents();
//   - props.measure: a see-through window the size of the app, open for one frame, to learn the
//     window's size (mods have no API for it), then it opens the thumbs-up and closes itself;
//   - props.show: the thumbs-up itself, a small frameless window that closes on its own.

import { View, div, image } from "gpui-kit";
import { agents, openOverlay, closeOverlay, props, window } from "herdr";

const IMG = "mods/my-ping/thumbs-up.png";
const SIZE = 110;         // the thumbs-up, px
const SHOW_MS = 6000;     // about as long as Herdr's note stays
// Herdr's note, measured from a screenshot: 18px in from the right and bottom edges, ~374px wide.
const TOAST = { right: 18, bottom: 18, width: 374, height: 78 };
const GAP = 2;

const isClaude = (a) => a.app === "claude-code" || /claude/i.test(a.program?.name ?? "");

export default class Ping extends View {
  init(_p, cx) {
    // An overlay's props come from props(), not init's argument.
    const p = props() ?? {};
    this.role = p.measure ? "measure" : p.show ? "show" : "watch";
    this.seen = new Map(agents().map((a) => [a.address, a.status]));
    if (this.role === "show") cx.timer.after(SHOW_MS, () => closeOverlay(props().overlay));
    // Never leave a see-through window over the app, even if the size never comes.
    if (this.role === "measure") cx.timer.after(400, () => closeOverlay(props().overlay));
  }

  // Herdr posts its note when an agent turns "done" (finished while you weren't looking) or
  // "blocked" while you aren't looking at it. Same rule here.
  watch() {
    let ping = false;
    const now = new Map();
    for (const a of agents()) {
      const was = this.seen.get(a.address);
      now.set(a.address, a.status);
      if (was === undefined || was === a.status || !isClaude(a)) continue;
      if (a.status === "done" || (a.status === "blocked" && !(a.focused && window().active))) ping = true;
    }
    this.seen = now;
    if (ping) openOverlay({ mod: "my-ping", kind: "window", frame: "none", width: 1, height: 1, at: { x: 0, y: 0 }, props: { measure: true } });
  }

  render() {
    if (this.role === "watch") {
      this.watch();
      return div();
    }
    if (this.role === "measure") {
      return div().id("ping-measure").size_full().on_size_change((size) => {
        if (this.done || !size?.width) return;
        this.done = true;
        const x = Math.round(size.width - TOAST.right - TOAST.width - GAP - SIZE);
        const y = Math.round(size.height - TOAST.bottom - SIZE + 4); // sits on the note's baseline
        openOverlay({ mod: "my-ping", kind: "window", frame: "none", key: "my-ping", width: SIZE, height: SIZE,
          at: { x, y }, props: { show: true } });
        closeOverlay(props().overlay);
      });
    }
    // show
    return div().id("ping-show").size(SIZE).cursor_pointer()
      .on_click(() => closeOverlay(props().overlay))
      .child(image(IMG).size(SIZE).loop("opacity", { from: 0.85, to: 1, period: 900 }));
  }
}
