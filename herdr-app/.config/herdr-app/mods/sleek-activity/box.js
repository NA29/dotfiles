// Sleek experiment: a section is a soft card (the panes' own background, rounded, no border) with a small
// header ("Activity  ⌄") you click to fold; folded, the header shows `summary` instead.
// `fit` sizes the section's layout block; `bar` is a thin continuous progress bar.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared } from "herdr";

// Personal: cards and pills follow the Cards transparency slider (my-settings).
const glass = (c) => {
  const r = shared("rice") ?? {};
  const p = r["transparency.on"] === false ? 100 : (r["transparency.cards"] ?? 100);
  return p >= 100 || !/^#[0-9a-f]{6}$/i.test(c) ? c : c + Math.round((p / 100) * 255).toString(16).padStart(2, "0");
};

export const SANS = "Geist";
export { glass };
export const tint = (c, a) => /^#[0-9a-f]{6}$/i.test(c) ? c + Math.round(a * 255).toString(16).padStart(2, "0") : c;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function box(t, { id, title, open, onToggle, summary = [], extra = [], body }) {
  const bits = open ? extra : summary;
  return v_flex().w_full().flex_none().rounded(10).bg(glass(t.background)).p(4)
    // Hovering the header brightens its title and chevron (no nested highlight).
    .child(h_flex().id(`${id}-head`).h(28).px(8).gap(8).items_center().rounded(7).cursor_pointer()
      .text_color(t.muted).hover((h) => h.text_color(t.foreground)).on_click(onToggle)
      .child(div().flex_none().font_family(SANS).text_size(12).font_semibold().child(cap(title)))
      .child(div().flex_1())
      .when(bits.length > 0, (el) => el.child(h_flex().flex_shrink_1().min_w(0).gap(8).items_center().children(bits)))
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none()))
    .when(open, (el) => el.child(v_flex().pt(2).child(body)));
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export function fit(layout, run, id, px) {
  const node = find(layout(), id);
  if (!node) return;
  if (!px) { if (!node.hidden) run("layout.hide", { id }); return; }
  if (node.hidden) run("layout.show", { id });
  if (node.size?.px !== px) run("layout.resize", { id, px });
}

export const pctColor = (t, pct) => pct >= 85 ? t.blocked : pct >= 60 ? t.working : t.ansi4;

// A thin rounded progress bar filled to `pct`.
export function bar(t, pct, color) {
  const p = Math.max(0, Math.min(100, pct));
  return div().flex_1().min_w(0).h(4).rounded(2).bg(t.border)
    .child(div().h_full().rounded(2).bg(color).w(p > 0 ? `${Math.max(2, p)}%` : 0));
}
