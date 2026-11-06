// Personal key actions that need more than one app command.
//   new-space   ask for the name first, then make the space (on the focused space's machine)
//   go-left|go-down|go-up|go-right
//               Ctrl+H/J/K/L, tmux/vim-tmux-navigator style: move to the pane that way;
//               when there is none (one pane, or at the edge), the key goes to the program
//               instead, so Ctrl+L still clears, Ctrl+K still kills the line, and so on.
// Lives in a zero-height block in my-main and my-combined, so it works while the sidebar is hidden.

import { View, div } from "gpui-kit";
import { focused, hc, nextCommand, openOverlay, run, spaces } from "herdr";

const KEY = { left: "ctrl+h", down: "ctrl+j", up: "ctrl+k", right: "ctrl+l" };

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

export default class MyKeys extends View {
  init(_props, cx) {
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (command === "new-space") newSpace();
        else if (command.startsWith("go-")) go(command.slice(3));
      }
    });
  }

  render() {
    return div();
  }
}
