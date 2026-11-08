// Personal: agent usage limits (5-hour and 7-day), drawn as a btop-style box under the
// workspaces in my-combined.
//   Claude Code  ~/.cache/agent-usage/claude.json, written by ~/.claude/statusline.sh
//                from the rate limits Claude Code hands its status line.
//   Codex        its newest session log (./codex-limits.py reads the last snapshot).
// Shown: any agent with a reading from the last 7 days; running ones are lit with a
// dot, the others dimmed. Click a provider for details; prefix U opens the dialog.
// Expired snapshots stay unknown until the provider reports a new reading.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, exec, home, readTextFile, run, theme, layout, shared, setShared, props, appHome, openOverlay, closeOverlay } from "herdr";

// Personal settings (my-settings panel): which providers, and when they show.
const R = (k, d) => (shared("rice") ?? {})[k] ?? d;
import { box, bar as thinBar, pctColor, glass, tint } from "./box.js";
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

// Font rule: words in Geist, numbers and code in Geist Mono (one family, designed together).
const MONO = () => "Geist Mono";
const SANS = "Geist";
import { WEEK, readings, untilText, dateText, pct, windowLabel } from "./model.js";

const PROVIDERS = [
  { id: "claude", name: "claude code", app: "claude-code", icon: "icons/claude.svg" },
  { id: "codex", name: "codex", app: "codex", icon: "icons/codex.svg" },
];

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Usage extends View {
  init(_props, cx) {
    this.detail = Boolean(props()?.detail || props()?.overlay);
    this.raw = shared("usage.latest") ?? {};
    this.errors = {};
    this.refreshing = false;
    this.selected = props()?.provider ?? (agents().some(a => a.app === "codex") ? "codex" : "claude");
    if (this.detail) { this.handle = cx.focus_handle(); this.handle.focus(); }
    this.folded = localStorage.getItem("folded") === "1";
    this.refresh(cx);
    cx.timer.every(30000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    if (this.refreshing) return;
    this.refreshing = true;
    cx.notify();
    cx.spawn(async (cx) => {
      const raw = { ...this.raw }, errors = {};
      try {
        const value = JSON.parse(await readTextFile(`${home()}/.cache/agent-usage/claude.json`));
        if (!value?.rate_limits) throw new Error("No usage snapshot");
        raw.claude = value;
      } catch { errors.claude = "No new Claude reading available."; }
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/sleek-usage/codex-limits.py`]);
        if (r.code !== 0 || !r.stdout.trim()) throw new Error("No usage snapshot");
        const value = JSON.parse(r.stdout);
        if (!value?.rate_limits) throw new Error("No usage snapshot");
        raw.codex = value;
      } catch { errors.codex = "No new Codex reading available."; }
      this.raw = raw;
      this.errors = errors;
      this.refreshing = false;
      if (!this.detail) setShared("usage.latest", raw);
      this.fit();
      cx.notify();
    });
  }

  openDetails(provider) {
    openOverlay({ mod: "sleek-usage", kind: "dialog", width: 760, height: 0.78, frame: "none", props: { detail: true, provider } });
  }

  shown(now) {
    const live = new Set(agents().map((a) => a.app));
    const data = readings(this.raw.claude, this.raw.codex, now);
    return PROVIDERS
      .map((p) => ({ ...p, data: data[p.id], live: live.has(p.app) }))
      .filter((p) => R(`usage.${p.id}`, true))
      .filter((p) => {
        const mode = R("usage.mode", "recent");
        if (mode === "always") return true;
        if (mode === "live") return p.live;
        return (p.data && now - (p.data.at ?? 0) < WEEK) || p.live;
      });
  }

  // The block is as tall as its providers: the edge, then each provider's three lines.
  fit() {
    if (this.detail) return;
    const n = R("sidebar.usage", true) === false ? 0 : this.shown(Math.floor(Date.now() / 1000)).length;
    const px = !n ? 0 : this.narrow ? 8 + 8 + n * 24 + 4 : this.folded ? 34 : 44 + n * 62;
    const node = find(layout(), "usage");
    if (node && node.size?.px !== px) run(px ? "layout.show" : "layout.hide", { id: "usage" });
    if (node && px && node.size?.px !== px) run("layout.resize", { id: "usage", px });
  }

  // Sleek: a thin continuous bar instead of segments.
  bar(t, label, w, dim) {
    const known = Boolean(w && !w.expired);
    const used = known ? w.used : 0;
    const fill = pctColor(t, used);
    return h_flex().h(18).gap(8).items_center()
      .child(div().w(18).flex_none().text_color(t.dim).child(label))
      .child(thinBar(t, used, dim ? fill + "80" : fill))
      .child(div().w(34).flex_none().text_right().text_color(known ? (used >= 85 ? t.blocked : t.foreground) : t.dim)
        .child(known ? `${Math.round(used)}%` : "—"))
      .child(div().w(50).flex_none().whitespace_nowrap().text_right().text_color(t.dim)
        .child(w?.expired ? "↻ due" : w?.resets ? `↻ ${untilText(w.resets - Math.floor(Date.now() / 1000))}` : ""));
  }

  provider(t, p, now) {
    const d = p.data;
    const age = d?.at ? now - d.at : null;
    const pic = p.icon ? image(p.icon).w(13).h(13).flex_none() : null;
    return v_flex().id(`usage-provider-${p.id}`).px(10).py(3).gap(1).rounded(7).cursor_pointer()
      .hover(h => h.bg(t.hover)).tooltip("Open detailed usage")
      .on_click((_e, cx) => { cx.stop_propagation(); this.openDetails(p.id); }).when(!p.live, (el) => el.opacity(0.62))
      .child(h_flex().h(20).gap(7).items_center()
        .when(Boolean(pic), (el) => el.child(pic))
        .child(div().font_family(SANS).text_color(t.foreground).font_semibold().child(p.name))
        .when(p.live, (el) => el.child(div().size(6).rounded(3).bg(t.done)))
        .when(Boolean(d?.plan), (el) => el.child(div().font_family(SANS).text_color(t.dim).child(d.plan)))
        .child(div().flex_1())
        .child(div().font_family(SANS).text_color(t.dim).child(!d ? "no reading yet" : age > 600 ? `as of ${untilText(age)} ago` : "")))
      .child(this.bar(t, "5h", d?.five, !p.live))
      .child(this.bar(t, "7d", d?.week, !p.live));
  }

  detailWindow(t, label, w, now) {
    const valid = Boolean(w && !w.expired);
    const color = valid ? pctColor(t, w.used) : t.dim;
    const left = valid ? 100 - w.used : null;
    return v_flex().flex_1().min_w(0).p(16).gap(10).rounded(10).bg(t.background)
      .child(div().font_family(SANS).text_size(12).text_color(t.muted).child(windowLabel(w, label)))
      .child(h_flex().gap(8).items_end()
        .child(div().font_family(MONO()).text_size(30).font_semibold().text_color(color).child(valid ? pct(w.used) : "—"))
        .child(div().pb(4).font_family(SANS).text_size(12).text_color(t.dim).child(valid ? "used" : "not available")))
      .child(h_flex().h(8).child(thinBar(t, valid ? w.used : 0, color)))
      .child(div().font_family(SANS).text_size(12).text_color(valid ? t.foreground : t.dim)
        .child(valid ? `${pct(left)} remaining` : w?.expired ? `Last reported: ${pct(w.used)} used` : "No reading for this allowance yet"))
      .child(v_flex().pt(6).gap(5)
        .child(div().font_family(SANS).text_size(12).text_color(t.muted)
          .child(w?.expired ? "Reset time has passed" : w?.resets ? `Resets in ${untilText(w.resets - now)}` : "Reset time not reported"))
        .child(div().font_family(MONO()).text_size(11).text_color(t.dim)
          .child(w?.resets ? dateText(w.resets) : "—")));
  }

  renderDetails() {
    const t = theme(), now = Math.floor(Date.now() / 1000);
    const data = readings(this.raw.claude, this.raw.codex, now);
    const provider = PROVIDERS.find(p => p.id === this.selected) ?? PROVIDERS[0];
    const d = data[provider.id];
    const count = agents().filter(a => a.app === provider.app).length;
    const age = d?.at ? Math.max(0, now - d.at) : null;
    const stale = age != null && age > 600;
    const expired = Boolean(d?.five?.expired || d?.week?.expired);
    const close = () => closeOverlay(props().overlay);
    const choose = (id, cx) => { this.selected = id; this.handle.focus(); cx.notify(); };
    const button = (id, text, action) => div().id(id).h(28).px(10).flex().items_center().justify_center()
      .rounded(6).bg(t.background).font_family(SANS).text_size(12).text_color(t.muted).cursor_pointer()
      .hover(h => h.bg(t.hover).text_color(t.foreground)).on_click(action).child(text);
    const tabs = PROVIDERS.map((p, i) => {
      const selected = provider.id === p.id;
      return h_flex().id(`usage-tab-${p.id}`).flex_1().min_w(0).h(42).px(12).gap(8).items_center().rounded(8)
        .bg(selected ? tint(t.accent, 0.14) : t.background).cursor_pointer().hover(h => h.text_color(t.foreground))
        .text_color(selected ? t.foreground : t.muted)
        .on_click((_e, cx) => choose(p.id, cx))
        .child(image(p.icon).w(16).h(16).flex_none())
        .child(div().flex_1().font_family(SANS).text_size(13).font_semibold().child(p.id === "claude" ? "Claude Code" : "Codex"))
        .child(div().font_family(MONO()).text_size(10.5).text_color(t.dim).child(String(i + 1)));
    });
    const extra = [];
    if (d?.extra?.length) {
      extra.push(h_flex().gap(10).children(d.extra.map(w => this.detailWindow(t, w.label, w.value, now))));
    }
    if (d?.credits) {
      const c = d.credits;
      const balance = c.balance == null ? null : String(c.balance);
      const text = c.unlimited === true ? "Unlimited credits"
        : balance != null ? `${balance} credits remaining`
        : c.has_credits === true ? "Credits available" : c.has_credits === false ? "No additional credits" : "Credit balance not reported";
      extra.push(h_flex().px(14).py(12).gap(10).items_center().rounded(8).bg(t.background)
        .child(div().flex_1().font_family(SANS).text_size(12).text_color(t.muted).child("Additional credits"))
        .child(div().font_family(MONO()).text_size(12).text_color(t.foreground).child(text)));
    }
    return v_flex().id("usage-dialog").size_full().track_focus(this.handle)
      .on_key_down((e, cx) => {
        const plain = !e.modifiers.control && !e.modifiers.alt && !e.modifiers.platform;
        const key = e.key_char ?? e.key;
        if (e.key === "escape" || (plain && key === "q")) { cx.stop_propagation(); close(); return; }
        if (!plain) return;
        if (key === "r" || key === "R") this.refresh(cx);
        else if (key === "1") choose("claude", cx);
        else if (key === "2") choose("codex", cx);
        else if (["left", "right", "h", "l", "tab"].includes(key)) choose(provider.id === "claude" ? "codex" : "claude", cx);
        else return;
        cx.stop_propagation();
      })
      .child(v_flex().size_full().rounded(14).border_1().border_color(t.border).shadow_lg().overflow_hidden()
        .bg(t.chrome).text_color(t.foreground).p(8).gap(8)
        .child(h_flex().h(46).flex_none().px(12).gap(10).items_center().rounded(10).bg(t.background)
          .child(div().h(22).px(8).flex_none().flex().items_center().rounded(6).font_family(MONO()).text_size(10.5).font_bold()
            .bg(t.ansi4).text_color(t.background).child("USAGE"))
          .child(div().flex_1().font_family(SANS).text_size(14).font_semibold().child("Usage & limits"))
          .child(button("usage-refresh", this.refreshing ? "Refreshing…" : "Refresh", (_e, cx) => { this.handle.focus(); this.refresh(cx); }))
          .child(button("usage-close", "×", close)))
        .child(h_flex().flex_none().gap(6).children(tabs))
        .child(v_flex().id("usage-detail-body").flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(14)
          .child(h_flex().gap(8).items_center()
            .child(image(provider.icon).w(22).h(22).flex_none())
            .child(div().font_family(SANS).text_size(16).font_semibold().child(provider.id === "claude" ? "Claude Code" : "Codex"))
            .when(Boolean(d?.plan), el => el.child(div().px(8).py(3).rounded(5).bg(t.background)
              .font_family(SANS).text_size(11).text_color(t.muted).child(String(d.plan))))
            .child(div().flex_1())
            .child(div().font_family(SANS).text_size(11).text_color(t.dim).child(`${count} open session${count === 1 ? "" : "s"}`)))
          .child(h_flex().gap(10)
            .child(this.detailWindow(t, "5-hour allowance", d?.five, now))
            .child(this.detailWindow(t, "Weekly allowance", d?.week, now)))
          .children(extra)
          .child(v_flex().p(14).gap(7).rounded(8).bg(t.background)
            .child(h_flex().gap(8)
              .child(div().font_family(SANS).text_size(12).text_color(t.muted).child("Last provider update"))
              .child(div().flex_1())
              .child(div().font_family(SANS).text_size(12).text_color(t.dim)
                .child(age == null ? "Not available" : age < 60 ? "Just now" : `${untilText(age)} ago`)))
            .when(Boolean(d?.at), el => el.child(div().font_family(MONO()).text_size(11).text_color(t.dim).child(dateText(d.at))))
            .child(div().font_family(SANS).text_size(12).text_color(t.dim)
              .child(!d ? "Run a request in this provider to record usage. Allowances appear when the provider reports them."
                : expired ? "Waiting for a provider reading after reset. Previous percentages do not describe the new window."
                : stale ? "This reading may be out of date. Usage updates when the provider reports new activity."
                : "These are the latest reported account limits, shared across sessions."))
            .when(Boolean(this.errors[provider.id]), el => el.child(div().font_family(SANS).text_size(11).text_color(t.dim)
              .child(this.errors[provider.id])))))
        .child(h_flex().h(34).flex_none().px(10).gap(8).items_center().font_family(SANS).text_size(11).text_color(t.dim)
          .child(div().font_family(MONO()).child("1 / 2"))
          .child(div().child("provider"))
          .child(div().font_family(MONO()).ml(8).child("r"))
          .child(div().child("reload reading"))
          .child(div().flex_1())
          .child(div().child("Local times · Esc closes"))));
  }

  render() {
    if (this.detail) return this.renderDetails();
    const t = theme();
    const now = Math.floor(Date.now() / 1000);
    const list = this.shown(now);
    if (!list.length) return div();
    const open = !this.folded;
    const toggle = (_e, cx) => {
      this.folded = !this.folded;
      localStorage.setItem("folded", this.folded ? "1" : "0");
      this.fit();
      cx.notify();
    };
    // Folded: one line with each agent's 5-hour use, colored like its bar.
    const summary = list.map((p) => {
      const used = p.data?.five?.expired ? null : p.data?.five?.used;
      const color = used == null ? t.dim : used >= 85 ? t.blocked : used >= 60 ? t.working : t.ansi4;
      return h_flex().id(`usage-summary-${p.id}`).gap(4).flex_none().cursor_pointer()
        .on_click((_e, cx) => { cx.stop_propagation(); this.openDetails(p.id); })
        .child(div().font_family(SANS).text_color(t.dim).child(p.name.split(" ")[0]))
        .child(div().text_color(color).child(used == null ? "—" : `${Math.round(used)}%`));
    });
    const watch = (el) => el.on_size_change((size, cx) => {
      if ((size.width < 140) !== this.narrow) { this.narrow = size.width < 140; this.fit(); cx.notify(); }
    });
    // Narrow sidebar: each agent's icon and 5-hour use, colored like its bar.
    if (this.narrow) {
      return watch(v_flex().id("root").size_full().min_h(0).px(6).pt(8).font_family(MONO()).text_size(10.5))
        .child(v_flex().id("usage-rail").w_full().py(4).rounded(10).bg(glass(t.background)).tooltip("Open detailed usage").cursor_pointer().on_click(() => this.openDetails(this.shown(now)[0]?.id))
          .children(list.map((p) => {
            const used = p.data?.five?.expired ? null : p.data?.five?.used;
            const pic = p.icon ? image(p.icon).w(12).h(12).flex_none() : null;
            return h_flex().h(24).gap(5).items_center().justify_center().when(!p.live, (el) => el.opacity(0.62))
              .when(Boolean(pic), (el) => el.child(pic))
              .child(div().text_color(used == null ? t.dim : pctColor(t, used)).child(used == null ? "—" : `${Math.round(used)}%`));
          })));
    }
    return watch(v_flex().id("root").size_full().min_h(0).font_family(MONO()).text_size(11))
      .child(box(t, {
        id: "usage", title: "usage", open, onToggle: toggle, summary,
        extra: [div().id("usage-open-details").font_family(SANS).text_size(11).cursor_pointer()
          .text_color(t.dim).hover(h => h.text_color(t.foreground)).tooltip("Open usage · prefix U")
          .on_click((_e, cx) => { cx.stop_propagation(); this.openDetails(); }).child("details ↗")],
        body: v_flex().children(list.map((p) => this.provider(t, p, now))),
      }));
  }
}
