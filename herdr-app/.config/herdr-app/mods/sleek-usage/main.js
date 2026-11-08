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
import { WEEK, readings, untilText } from "./model.js";
import { dashboard } from "./dashboard.js";

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
    this.tab = props()?.tab ?? localStorage.getItem("usage.tab") ?? "cost";
    this.providerFilter = props()?.provider ?? "all";
    this.providerMenu = false;
    this.period = 30;
    this.breakdown = "model";
    this.historyLoading = false;
    this.analytics = null;
    this.historyGeneration = 0;
    if (this.detail) { this.handle = cx.focus_handle(); this.handle.focus(); }
    this.folded = localStorage.getItem("folded") === "1";
    this.refresh(cx);
    if (this.detail && this.tab !== "limits") this.loadHistory(cx);
    cx.timer.every(30000, (cx) => this.refresh(cx));
    if (this.detail) cx.timer.every(60000, (cx) => { if (this.tab !== "limits") this.loadHistory(cx); });
  }

  refresh(cx) {
    if (this.refreshing) return;
    this.refreshing = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/sleek-usage/usage.py`, "--limits"]);
        if (r.code !== 0) throw new Error("Could not read account limits");
        this.raw = JSON.parse(r.stdout);
        this.errors = {};
        if (!this.detail) setShared("usage.latest", this.raw);
      } catch { this.errors.limits = "Could not refresh account limits; showing the last reading."; }
      this.refreshing = false;
      this.fit();
      cx.notify();
    });
  }

  loadHistory(cx) {
    const generation = ++this.historyGeneration;
    this.historyLoading = true;
    this.historyError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/sleek-usage/usage.py`, "--days", String(this.period), "--provider", this.providerFilter]);
        if (r.code !== 0) throw new Error("The local history reader failed.");
        const data = JSON.parse(r.stdout);
        if (generation !== this.historyGeneration) return;
        this.analytics = data;
      } catch { if (generation === this.historyGeneration) this.historyError = "Unable to read local usage history. Press R to retry."; }
      if (generation === this.historyGeneration) { this.historyLoading = false; cx.notify(); }
    });
  }

  openDetails(provider) {
    openOverlay({ mod: "sleek-usage", kind: "dialog", width: 0.92, height: 0.92, frame: "none", props: { detail: true, provider: provider ?? "all", tab: "limits" } });
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

  renderDetails(cx) { return dashboard(this, cx); }

  render(cx) {
    if (this.detail) return this.renderDetails(cx);
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
