// Shared by the personal sidebar sections: a btop-style box whose title sits in its top
// line ("╭─ ❯ title ──── extra ▾ ─╮"). Clicking the top line folds it to a flat line that
// shows `summary` instead. `fit` sizes the section's layout block to its content.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";

export function box(t, { id, title, open, onToggle, summary = [], extra = [], body }) {
  const frame = t.border;
  const corner = (side) => div().w(8).h(10).flex_none().self_end().border_t(1).border_color(frame)
    .when(side === "l", (el) => el.border_l(1).rounded_tl(6))
    .when(side === "r", (el) => el.border_r(1).rounded_tr(6));
  const line = (grow) => div().h(1).bg(frame).when(grow, (el) => el.flex_1().min_w(6)).when(!grow, (el) => el.flex_none().w(4));
  const bits = open ? extra : summary;
  return v_flex().w_full().flex_none()
    .child(h_flex().id(`${id}-head`).h(20).items_center().cursor_pointer().on_click(onToggle)
      .child(open ? corner("l") : line(false)).child(line(false))
      .child(h_flex().flex_none().px(5).gap(6).items_center()
        .child(div().text_color(t.dim).child("❯"))
        .child(div().font_family("Geist").text_color(t.muted).font_semibold().child(title)))
      .child(line(true))
      .when(bits.length > 0, (el) => el.child(h_flex().flex_shrink_1().min_w(0).px(5).gap(8).items_center().children(bits)).child(line(false)))
      .child(div().flex_none().px(4).text_color(t.dim).child(open ? "▾" : "▸"))
      .child(line(false))
      .child(open ? corner("r") : line(false)))
    .when(open, (el) => el.child(v_flex().border_l(1).border_r(1).border_b(1).border_color(frame)
      .rounded_bl(6).rounded_br(6).py(4).child(body)));
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// Size the layout block `id` to `px` (0 hides it). Only acts when something changed.
export function fit(layout, run, id, px) {
  const node = find(layout(), id);
  if (!node) return;
  if (!px) { if (!node.hidden) run("layout.hide", { id }); return; }
  if (node.hidden) run("layout.show", { id });
  if (node.size?.px !== px) run("layout.resize", { id, px });
}

// Segmented bar: `cells` small blocks, lit up to `pct`, foam → gold → red as it fills.
export function segments(t, pct, cells = 18, dim = false) {
  const fill = pct >= 85 ? t.blocked : pct >= 60 ? t.working : t.ansi4;
  const lit = pct > 0 ? Math.max(1, Math.round((pct / 100) * cells)) : 0;
  return h_flex().flex_1().min_w(0).h(7).gap(2)
    .children(Array.from({ length: cells }, (_, i) => div().flex_1().h_full().rounded(1)
      .bg(i < lit ? (dim ? fill + "80" : fill) : t.border)));
}

export const pctColor = (t, pct) => pct >= 85 ? t.blocked : pct >= 60 ? t.working : t.ansi4;
