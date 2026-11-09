import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, spaces, settings } from "herdr";
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

// The sidebar is either full or the rail, nothing between; the layout's limits keep it that way.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// Full: dragged between SIDEBAR_MIN (everything still fits) and SIDEBAR_MAX. Rail: fixed.
const SIDEBAR_MIN = 232, SIDEBAR_MAX = 480;

// One layout.set moves the size and the limits together, so no frame draws the rail inside a
// full-width sidebar. The rail is as wide as its tiles; sleek-tabs clears the traffic lights itself.
function setRail(on) {
  const root = JSON.parse(JSON.stringify(layout()));
  const side = find(root, "sidebar"), row = find(root, "dim");
  if (!side || !row) return;
  const rail = 52;
  if (on) setShared("sidebar.width", side.size?.px);
  setShared("sidebar.collapsed", on);   // mods edited before the rail went by width still read it
  side.size = { px: on ? rail : Math.max(SIDEBAR_MIN, shared("sidebar.width") ?? 268) };
  side.min = on ? rail : SIDEBAR_MIN;
  side.max = on ? rail : SIDEBAR_MAX;
  row.resizable = !on;   // the rail's edge isn't a drag handle
  run("layout.set", { layout: root });
}

const toggleSidebar = () => setRail(!narrow());

// Personal: concentric corners. Inner radius = outer radius - the padding between them.
const concentric = (outer, inset) => Math.max(0, outer - inset);
const ISLAND_R = () => (sqShared("rice") ?? {})["look.radius"] ?? 10;
const SECTION_R = () => concentric(ISLAND_R(), (sqShared("rice") ?? {})["look.gap"] ?? 6);

// Personal: surface levels. Blend the island colour toward the text colour, so a raised surface is
// visibly lighter on any dark theme (darker on a light one). The Cards slider still applies via glass().
const lift = (t, k) => {
  if (parseInt(String(t.chrome).slice(1, 3), 16) > 128) k *= 0.4;   // light themes: soft neutral steps, not stacked greys
  const a = String(t.chrome).slice(1, 7), b = String(t.foreground).slice(1, 7);
  const out = [0, 2, 4].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0"));
  return `#${out.join("")}`;
};

const FOCUSED = () => (sqShared("rice") ?? {})["look.style"] !== "islands";

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
      const chip = (id, icon, label, tip, action) => h_flex().id(id).h(FOCUSED() ? 24 : 28).px(collapsed ? 7 : FOCUSED() ? 14 : 10).gap(8).items_center().justify_center()
        .when(!collapsed && !FOCUSED(), el => el.flex_1().min_w(0))
        .rounded(concentric(ISLAND_R(), 6)).when(!FOCUSED(), (el) => el.bg(glass(lift(t, 0.13)))).text_color(t.muted).cursor_pointer().tooltip(tip)
        .hover(s => s.bg(FOCUSED() ? t.hover : glass(lift(t, 0.2))).text_color(t.foreground))
        .on_click(action).child(svg(`mods/sleek-chrome/${icon}.svg`).size(14).flex_none())
        .when(!collapsed, el => el.child(div().truncate().font_family(SANS).child(label)));
      return h_flex().size_full().px(6).gap(6).items_center()
        .text_size(12)
        .when(!collapsed && FOCUSED(), el => el.justify_between())
        .when(collapsed, el => el.px(6).gap(4).justify_center())
        .child(chip("settings", "settings", "Settings", "Settings (Cmd+,)", () => run("mod.open", { name: "my-settings" }))
          // An update is ready: a small dot, like before.
          .when(Boolean(updates().app.ready), el => el.child(div().size(5).rounded_full().bg(t.done))))
        .when(!collapsed, el => el.child(chip("machine", "plus", "Add machine", "Add a machine", () => run("mod.open", { name: "machine-add" }))));
    }
    return h_flex().w_full().h(FOCUSED() ? 36 : 46).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(14)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("frame/welcome/herdr.png").size(20).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Herdr"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/sleek-chrome/search.svg").size(16), () => run("mod.open", { name: "my-goto" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/sleek-chrome/sidebar.svg").size(16), toggleSidebar)));
  }
}
