import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, spaces, settings } from "herdr";

// Personal (my-chrome):
// the footer is one line of small outlined buttons. (The workspace dots
// moved to the status bar: next to the window buttons they looked like a fourth button.)
const MONO = () => "Geist Mono";
const SANS = "Geist";

// Personal: cards and pills follow the Cards transparency slider (my-settings).
const glass = (c) => {
  const r = shared("rice") ?? {};
  const p = r["transparency.on"] === false ? 100 : (r["transparency.cards"] ?? 100);
  return p >= 100 || !/^#[0-9a-f]{6}$/i.test(c) ? c : c + Math.round((p / 100) * 255).toString(16).padStart(2, "0");
};

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export default class WorkspaceChrome extends View {
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      // Sleek: filled pills in the card colour, like the tab pills and status-bar pills;
      // half the width each, lined up with the cards above. Icons only on the rail.
      const chip = (id, icon, label, tip, action) => h_flex().id(id).h(28).px(collapsed ? 7 : 10).gap(7).items_center().justify_center()
        .when(!collapsed, el => el.flex_1().min_w(0))
        .rounded(8).bg(glass(t.background)).text_color(t.muted).cursor_pointer().tooltip(tip)
        .hover(s => s.bg(glass(t.selected)).text_color(t.foreground))
        .on_click(action).child(svg(`mods/sleek-chrome/${icon}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().truncate().font_family(SANS).child(label)));
      return h_flex().size_full().px(8).gap(6).items_center()
        .text_size(12)
        .when(collapsed, el => el.px(6).gap(4).justify_center())
        .child(chip("settings", "settings", "Settings", "Settings (Cmd+,)", () => run("mod.open", { name: "my-settings" }))
          // An update is ready: a small dot, like before.
          .when(Boolean(updates().app.ready), el => el.child(div().size(5).rounded_full().bg(t.done))))
        .child(chip("machine", "plus", "Add machine", "Add a machine", () => run("mod.open", { name: "machine-add" })));
    }
    return h_flex().size_full().pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("frame/welcome/herdr.png").size(20).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/sleek-chrome/search.svg").size(15), () => run("mod.open", { name: "my-goto" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/sleek-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}
