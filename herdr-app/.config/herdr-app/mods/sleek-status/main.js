// Personal status bar, pure rice (the sidebar and tab bar already say where you are):
//   ⌗ ▮▯▯▯▯▯▯▯▯▯ 7%  ▤ ▮▮▮▮▮▮▮▯▯▯ 76%  [███  ]▸ 73% ⚡   ⟳ 2  ! 1  thu 05 nov  [20:42]
// Left: CPU and memory (chip / memory-stick icons and meters) and a drawn
// battery, from ./stats.py every 4 s. Middle: today's Wispr Flow stats (./wispr.py, every 30 s). One color per module (cpu foam, memory rose, battery
// gold), red only when critical.
// Right: a tiny agent pulse (busy spinner, red ! when one needs you), the date and the time.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, theme, settings, exec, home, spaces, run, shared } from "herdr";

// Personal settings (my-settings panel): which modules show, the clock format.
const R = (k, d) => (shared("rice") ?? {})[k] ?? d;

// Personal: cards and pills follow the Cards transparency slider (my-settings).
const glass = (c) => {
  const r = shared("rice") ?? {};
  const p = r["transparency.on"] === false ? 100 : (r["transparency.cards"] ?? 100);
  return p >= 100 || !/^#[0-9a-f]{6}$/i.test(c) ? c : c + Math.round((p / 100) * 255).toString(16).padStart(2, "0");
};

// Font rule: words in Geist, numbers and code in Geist Mono (one family, designed together).
const MONO = () => "Geist Mono";
const SANS = "Geist";
const CELLS = 10;
// 3333 -> "3,333" (this runtime ignores toLocaleString formatting).
const commas = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export default class Status extends View {
  init(_props, cx) {
    this.stats = null;
    this.wispr = null;
    this.np = null;
    this.readNowPlaying(cx);
    cx.timer.every(2000, (cx) => this.readNowPlaying(cx));
    this.readWispr(cx);
    cx.timer.every(30000, (cx) => this.readWispr(cx));
    this.sample(cx);
    cx.timer.every(4000, (cx) => this.sample(cx)); // also keeps the clock fresh
  }

  sample(cx) {
    if (!R("bar.cpu", true) && !R("bar.memory", true) && !R("bar.battery", true)) return cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${home()}/.config/herdr-app/mods/sleek-status/stats.py`]);
        if (r.code === 0) {
          this.stats = JSON.parse(r.stdout);
        }
      } catch {}
      cx.notify();
    });
  }

  // A module: its icon and a short segmented meter, in the module's own color.
  meter(t, icon, title, pct, color) {
    const lit = pct > 0 ? Math.max(1, Math.round((pct / 100) * CELLS)) : 0;
    return h_flex().id(`mod-${title}`).flex_none().gap(6).items_center().tooltip(`${title} ${Math.round(pct)}%`)
      .child(svg(icon).size(13).flex_none().text_color(color))
      // Sleek: a thin continuous bar.
      .child(div().w(52).h(4).flex_none().rounded(2).bg(t.border)
        .child(div().h_full().rounded(2).bg(color).w(pct > 0 ? `${Math.max(3, Math.min(100, pct))}%` : 0)))
      .child(div().text_color(t.muted).child(`${Math.round(pct)}%`));
  }

  // A drawn battery: an outline with a nub, filled to its level.
  battery(t, pct, charging, color) {
    const w = 22;
    return h_flex().id("mod-battery").flex_none().gap(6).items_center().tooltip(`battery ${pct}%${charging ? ", charging" : ""}`)
      .child(h_flex().flex_none().items_center()
        .child(div().w(w).h(11).p(1.5).rounded(3).border_1().border_color(color)
          .child(div().h_full().rounded(1).bg(color).w(Math.max(2, Math.round(((w - 5) * pct) / 100)))))
        .child(div().w(2).h(5).rounded_r(1).bg(color)))
      .child(div().text_color(t.muted).child(`${pct}%`))
      .when(charging, (el) => el.child(div().text_color(color).child("⚡")));
  }

  // What Spotify (or Apple Music) is playing, every 2 s. A player is asked only when it is
  // running (pgrep), so on a Mac without Spotify nothing happens and the module stays hidden.
  readNowPlaying(cx) {
    if (!R("bar.music", true)) { this.np = null; return; }
    cx.spawn(async (cx) => {
      try {
        const running = async (name) => (await exec("pgrep", ["-x", name])).code === 0;
        const which = (await running("Spotify")) ? "spotify" : (await running("Music")) ? "music" : null;
        if (!which) { this.np = null; cx.notify(); return; }
        const r = await exec("osascript", [`${home()}/.config/herdr-app/mods/sleek-status/np-${which}.applescript`]);
        const [player, state, title, artist, pos, dur] = (r.code === 0 ? r.stdout.trim() : "").split("\t");
        this.np = player && state && state !== "stopped" && title
          ? { player, state, title, artist, pos: parseFloat(pos) || 0, dur: parseFloat(dur) || 0 }
          : null;
      } catch { this.np = null; }
      cx.notify();
    });
  }

  control(cmd, cx) {
    const app = this.np?.player === "music" ? "Music" : "Spotify";
    cx.spawn(async (cx) => {
      try { await exec("osascript", ["-e", `tell application "${app}" to ${cmd}`]); } catch {}
      this.readNowPlaying(cx);
    });
  }

  // "♪ You're Under Arrest — ILLIT  ━━━━─── 0:28 / 3:01  ⏮ ⏯ ⏭": dim while paused.
  nowPlaying(t) {
    const n = this.np;
    const playing = n.state === "playing";
    const clock = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;
    const W = 64;
    const filled = n.dur > 0 ? Math.max(2, Math.round((Math.min(n.pos, n.dur) / n.dur) * W)) : 0;
    const btn = (id, icon, cmd, tip) => div().id(id).p(3).rounded(4).flex_none().cursor_pointer().tooltip(tip)
      .text_color(t.dim).hover((h) => h.text_color(t.foreground).bg(t.hover))
      .on_click((_e, cx) => this.control(cmd, cx))
      .child(svg(`mods/sleek-status/${icon}.svg`).size(11));
    return h_flex().id("nowplaying").flex_none().gap(8).items_center().when(!playing, (el) => el.opacity(0.6))
      .child(h_flex().id("np-track").flex_none().gap(7).items_center().cursor_pointer()
        .tooltip(playing ? "Pause" : "Play").on_click((_e, cx) => this.control("playpause", cx))
        .child(svg("mods/sleek-status/music.svg").size(13).flex_none().text_color(playing ? t.done : t.dim))
        .child(div().max_w(220).truncate().font_family(SANS).text_color(t.foreground).child(n.title))
        .when(Boolean(n.artist), (el) => el.child(div().max_w(150).truncate().font_family(SANS).text_color(t.dim).child(`— ${n.artist}`))))
      .when(n.dur > 0, (el) => el
        .child(div().w(W).h(3).flex_none().rounded(2).bg(t.border).child(div().h_full().rounded(2).bg(t.done).w(filled)))
        .child(div().flex_none().text_color(t.dim).child(`${clock(n.pos)} / ${clock(n.dur)}`)))
      .when(R("bar.musicControls", true), (el) => el.child(h_flex().flex_none().gap(1).items_center()
        .child(btn("np-prev", "skip-back", "previous track", "Previous"))
        .child(btn("np-play", playing ? "pause" : "play", "playpause", playing ? "Pause" : "Play"))
        .child(btn("np-next", "skip-forward", "next track", "Next"))));
  }

  // Today's Wispr Flow numbers (./wispr.py reads its local database, read-only, counts only).
  readWispr(cx) {
    if (!R("bar.wispr", true)) { this.wispr = null; return; }
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${home()}/.config/herdr-app/mods/sleek-status/wispr.py`]);
        const w = r.code === 0 ? JSON.parse(r.stdout || "{}") : {};
        this.wispr = w.dictations != null ? w : null;
      } catch {}
      cx.notify();
    });
  }

  // "🎙 129 dictations · 3,333 words · 25m spoken": numbers in mono, words in Geist.
  wisprModule(t) {
    const w = this.wispr;
    const mins = Math.round(w.seconds / 60);
    const spoken = mins >= 60 ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}` : `${mins}m`;
    const item = (num, label, color = t.foreground) => h_flex().flex_none().gap(4).items_center()
      .child(div().text_color(color).child(num))
      .child(div().font_family(SANS).text_color(t.dim).child(label));
    const dot = () => div().flex_none().text_color(t.border).child("·");
    return h_flex().id("wispr").flex_none().gap(8).items_center()
      .tooltip("Wispr Flow today")
      .child(svg("mods/sleek-status/mic.svg").size(13).flex_none().text_color(t.ansi6))
      .child(item(commas(w.dictations), w.dictations === 1 ? "dictation" : "dictations"))
      .child(dot())
      .child(item(commas(w.words), "words"))
      .child(dot())
      .child(item(spoken, "spoken"));

  }

  render() {
    const t = theme();
    const list = agents();
    const busy = list.filter((a) => a.status === "working").length;
    const needs = list.filter((a) => a.status === "blocked").length;
    const now = new Date();
    // Built by hand: this runtime ignores toLocaleDateString's format options.
    const date = `${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()]} ${String(now.getDate()).padStart(2, "0")} ${["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][now.getMonth()]}`;

    // Three anchored zones, like polybar/waybar: left = system, centre = now playing (truly
    // centred: the two sides share the leftover width equally), right = Wispr, then date/time.
    // Nothing drifts when a title or a count changes width; empty zones just stay empty.
    const [cpuOn, memOn, batOn] = [R("bar.cpu", true), R("bar.memory", true), R("bar.battery", true)];
    const system = this.stats && (cpuOn || memOn || (batOn && this.stats.battery != null)) ? h_flex().flex_none().gap(12).items_center()
      // One color per module, red only when critical: cpu foam, memory rose, battery gold.
      .when(cpuOn, (el) => el.child(this.meter(t, "mods/sleek-status/cpu.svg", "cpu", this.stats.cpu, this.stats.cpu >= 85 ? t.blocked : t.ansi4)))
      .when(memOn, (el) => el.child(this.meter(t, "mods/sleek-status/memory.svg", "memory", this.stats.mem, this.stats.mem >= 90 ? t.blocked : t.ansi6)))
      .when(batOn && this.stats.battery != null, (el) => el.child(this.battery(t, this.stats.battery, this.stats.charging,
        this.stats.battery <= 15 && !this.stats.charging ? t.blocked : t.ansi3))) : null;
    const h = now.getHours(), mm = String(now.getMinutes()).padStart(2, "0");
    const time = R("bar.clock24", true) ? `${String(h).padStart(2, "0")}:${mm}` : `${h % 12 || 12}:${mm} ${h < 12 ? "am" : "pm"}`;
    const [agentsOn, dateOn, timeOn] = [R("bar.agents", true), R("bar.date", true), R("bar.time", true)];
    const clockShown = (agentsOn && (busy > 0 || needs > 0)) || dateOn || timeOn;
    const clock = h_flex().flex_none().gap(12).items_center()
      // Agent pulse: only when something is going on.
      .when(agentsOn && busy > 0, (el) => el.child(h_flex().flex_none().gap(4).items_center()
        .child(svg("mods/workspace-chrome/spinner.svg").size(10).text_color(t.working).spin(900))
        .child(div().text_color(t.working).child(String(busy)))))
      .when(agentsOn && needs > 0, (el) => el.child(div().flex_none().font_bold().text_color(t.blocked).child(`! ${needs}`)))
      .when(dateOn, (el) => el.child(div().flex_none().font_family(SANS).text_color(t.dim).child(date)))
      // Time: plain, bright.
      .when(timeOn, (el) => el.child(div().flex_none().text_color(t.foreground).font_semibold().child(time)));
    // Sleek experiment: each group is a soft pill in the panes' own background on the bar.
    const pill = (el) => h_flex().flex_none().h(24).px(11).items_center().rounded(8).bg(glass(t.background)).child(el);
    return h_flex().size_full().px(8).gap(12).items_center()
      .font_family(MONO()).text_size(11.5).text_color(t.muted)
      .child(h_flex().flex_1().min_w(0).items_center().justify_start().when(Boolean(system), (el) => el.child(pill(system))))
      .child(h_flex().flex_none().items_center().when(Boolean(this.np) && R("bar.music", true), (el) => el.child(pill(this.nowPlaying(t)))))
      .child(h_flex().flex_1().min_w(0).gap(8).items_center().justify_end()
        .when(Boolean(this.wispr) && R("bar.wispr", true), (el) => el.child(pill(this.wisprModule(t))))
        .when(clockShown, (el) => el.child(pill(clock))));
  }
}
