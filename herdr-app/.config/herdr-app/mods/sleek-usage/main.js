// Personal: agent usage limits (5-hour and 7-day), drawn as a btop-style box under the
// workspaces in my-combined.
//   Claude Code  ~/.cache/agent-usage/claude.json, written by ~/.claude/statusline.sh
//                from the rate limits Claude Code hands its status line.
//   Codex        its newest session log (./codex-limits.py reads the last snapshot).
// Shown: any agent with a reading from the last 7 days; running ones are lit with a
// dot, the others dimmed. A window whose reset time has passed shows 0%.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, exec, home, readTextFile, run, settings, theme, layout, shared } from "herdr";

// Personal settings (my-settings panel): which providers, and when they show.
const R = (k, d) => (shared("rice") ?? {})[k] ?? d;
import { box, bar as thinBar, pctColor, glass } from "./box.js";

// Font rule: words in Geist, numbers and code in Geist Mono (one family, designed together).
const MONO = () => "Geist Mono";
const SANS = "Geist";
const CELLS = 18;
const WEEK = 7 * 24 * 3600;

const PROVIDERS = [
  { id: "claude", name: "claude code", app: "claude-code", icon: "icons/claude.svg" },
  { id: "codex", name: "codex", app: "codex", icon: "icons/codex.svg" },
];

function untilText(seconds) {
  if (seconds <= 0) return "now";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${String(m % 60).padStart(2, "0")}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? `${h % 24}h` : ""}`;
}

// One window: { used: 0..100, resets: epoch s | null }, or null when unknown.
function windowOf(raw, now) {
  if (!raw) return null;
  const used = Number(raw.used_percentage ?? raw.used_percent ?? raw.utilization);
  if (!Number.isFinite(used)) return null;
  let resets = Number(raw.resets_at ?? raw.reset_at ?? raw.resetsAt);
  if (!Number.isFinite(resets)) resets = null;
  else if (resets > 1e12) resets = Math.round(resets / 1000); // ms
  // Past its reset: the window has started over.
  if (resets && resets <= now) return { used: 0, resets: null, fresh: true };
  return { used: Math.max(0, Math.min(100, used)), resets };
}

function readings(claude, codex, now) {
  const out = {};
  if (claude?.rate_limits) {
    const rl = claude.rate_limits;
    out.claude = { at: claude.at, five: windowOf(rl.five_hour, now), week: windowOf(rl.seven_day, now) };
  }
  if (codex?.rate_limits) {
    const rl = codex.rate_limits;
    out.codex = { at: codex.at, five: windowOf(rl.primary, now), week: windowOf(rl.secondary, now), plan: rl.plan_type };
  }
  return out;
}

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
    this.raw = {};
    this.folded = localStorage.getItem("folded") === "1";
    this.refresh(cx);
    cx.timer.every(30000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      const raw = {};
      try { raw.claude = JSON.parse(await readTextFile(`${home()}/.cache/agent-usage/claude.json`)); } catch {}
      try {
        const r = await exec("python3", ["-I", `${home()}/.config/herdr-app/mods/sleek-usage/codex-limits.py`]);
        if (r.code === 0 && r.stdout.trim()) raw.codex = JSON.parse(r.stdout);
      } catch {}
      this.raw = raw;
      this.fit();
      cx.notify();
    });
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
    const n = R("sidebar.usage", true) === false ? 0 : this.shown(Math.floor(Date.now() / 1000)).length;
    const px = !n ? 0 : this.narrow ? 8 + 8 + n * 24 + 4 : this.folded ? 52 : 52 + n * 62;
    const node = find(layout(), "usage");
    if (node && node.size?.px !== px) run(px ? "layout.show" : "layout.hide", { id: "usage" });
    if (node && px && node.size?.px !== px) run("layout.resize", { id: "usage", px });
  }

  // Sleek: a thin continuous bar instead of segments.
  bar(t, label, w, dim) {
    const used = w?.used ?? 0;
    const fill = pctColor(t, used);
    return h_flex().h(18).gap(8).items_center()
      .child(div().w(18).flex_none().text_color(t.dim).child(label))
      .child(thinBar(t, used, dim ? fill + "80" : fill))
      .child(div().w(34).flex_none().text_right().text_color(w ? (used >= 85 ? t.blocked : t.foreground) : t.dim)
        .child(w ? `${Math.round(used)}%` : "—"))
      .child(div().w(50).flex_none().whitespace_nowrap().text_right().text_color(t.dim)
        .child(w?.resets ? `↻ ${untilText(w.resets - Math.floor(Date.now() / 1000))}` : ""));
  }

  provider(t, p, now) {
    const d = p.data;
    const age = d?.at ? now - d.at : null;
    const pic = p.icon ? image(p.icon).w(13).h(13).flex_none() : null;
    return v_flex().px(8).py(3).gap(1).when(!p.live, (el) => el.opacity(0.62))
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

  render() {
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
      const used = p.data?.five?.used;
      const color = used == null ? t.dim : used >= 85 ? t.blocked : used >= 60 ? t.working : t.ansi4;
      return h_flex().gap(4).flex_none()
        .child(div().font_family(SANS).text_color(t.dim).child(p.name.split(" ")[0]))
        .child(div().text_color(color).child(used == null ? "—" : `${Math.round(used)}%`));
    });
    const watch = (el) => el.on_size_change((size, cx) => {
      if ((size.width < 140) !== this.narrow) { this.narrow = size.width < 140; this.fit(); cx.notify(); }
    });
    // Narrow sidebar: each agent's icon and 5-hour use, colored like its bar.
    if (this.narrow) {
      return watch(v_flex().id("root").size_full().min_h(0).px(6).pt(8).font_family(MONO()).text_size(10.5))
        .child(v_flex().id("usage-rail").w_full().py(4).rounded(10).bg(glass(t.background)).tooltip("Usage (5-hour)")
          .children(list.map((p) => {
            const used = p.data?.five?.used;
            const pic = p.icon ? image(p.icon).w(12).h(12).flex_none() : null;
            return h_flex().h(24).gap(5).items_center().justify_center().when(!p.live, (el) => el.opacity(0.62))
              .when(Boolean(pic), (el) => el.child(pic))
              .child(div().text_color(used == null ? t.dim : pctColor(t, used)).child(used == null ? "—" : `${Math.round(used)}%`));
          })));
    }
    return watch(v_flex().id("root").size_full().min_h(0).px(8).pt(8).font_family(MONO()).text_size(11))
      .child(box(t, {
        id: "usage", title: "usage", open, onToggle: toggle, summary,
        body: v_flex().children(list.map((p) => this.provider(t, p, now))),
      }));
  }
}
