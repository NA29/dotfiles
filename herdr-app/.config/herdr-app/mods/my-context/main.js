// Personal: the Context panel (tab bar → Context, beside Files and Changes). Shows what the
// focused Claude Code session has in its context:
//   - Instructions: the CLAUDE.md files it loaded (always in context, every turn);
//   - Skills: every skill it was told about. "Listed" means it only sees the name and one-line
//     description; "loaded" means the skill was used and its full instructions were read in.
// The data comes from the session's own transcript, read by extract.py (stdlib Python): the
// terminal → session link comes from the Activity hook's log (~/.cache/herdr-activity/).
// It follows the focused pane; focusing a non-Claude pane keeps the last Claude session shown.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { agents, focused, exec, appHome, theme, shared } from "herdr";
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

const SANS = "Geist", MONO = "Geist Mono";
const tint = (c, a) => /^#[0-9a-f]{6}$/i.test(c) ? c + Math.round(a * 255).toString(16).padStart(2, "0") : c;
const glass = (c) => {
  const r = shared("rice") ?? {};
  const p = r["transparency.on"] === false ? 100 : (r["transparency.cards"] ?? 100);
  return p >= 100 ? c : tint(c, p / 100);
};
const isClaude = (a) => a && (a.app === "claude-code" || /claude/i.test(a.program?.name ?? ""));
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export default class Context extends View {
  init(_props, cx) {
    this.target = null;      // the Claude terminal shown
    this.data = null;        // extract.py's answer
    this.openFile = null;    // the instruction file expanded
    this.openSkill = null;   // the skill whose description is expanded
    this.busy = false;
    // Search: every word must appear in the skill's name or description (any case).
    this.query = "";
    this.search = InputState.new({ placeholder: "Search skills by name or description" });
    this.search.on("change", (_e, cx) => { this.query = this.search.value(); cx.notify(); });
    cx.timer.every(10000, (cx) => this.refresh(cx));  // skills get loaded as the session goes on
  }

  // The focused pane's agent when it's Claude Code; else keep the last one (if still running).
  pick() {
    const list = agents();
    const f = focused();
    const here = list.find((a) => a.address === f?.terminal || (f?.pane && a.pane === f.pane));
    if (isClaude(here)) return here.address;
    if (this.target && list.some((a) => a.address === this.target)) return this.target;
    return list.find(isClaude)?.address ?? null;
  }

  refresh(cx) {
    const target = this.target;
    if (!target || this.busy || target.includes("/")) return;  // other machines: not read here
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("python3", ["-I", `${appHome()}/mods/my-context/extract.py`, target]);
        const d = JSON.parse(r.stdout || "{}");
        if (this.target === target) this.data = d;
      } catch (e) {
        if (this.target === target) this.data = { error: String(e?.message ?? e) };
      }
      this.busy = false;
      cx.notify();
    });
  }

  render(cx) {
    const t = theme(), card = glass(t.background);
    const target = this.pick();
    if (target !== this.target) {
      this.target = target; this.data = null; this.openFile = null; this.openSkill = null;
      this.refresh(cx);
    }
    const d = this.data;
    const files = d?.files ?? [], skills = d?.skills ?? [];
    const loaded = skills.filter((s) => s.loaded);
    const sorted = [...loaded, ...skills.filter((s) => !s.loaded)];
    const words = this.query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = words.length ? sorted.filter((s) => {
      const hay = `${s.name} ${s.description}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }) : sorted;

    const label = (text, count) => h_flex().h(22).flex_none().px(10).gap(6).items_center()
      .text_size(11).font_semibold().text_color(t.muted)
      .child(text).when(count != null, (el) => el.child(div().font_family(MONO).font_weight(400).text_color(t.dim).child(String(count))));
    const pill = (text, color = t.muted, wash = tint(t.foreground, 0.06)) => div().flex_none().h(18).px(6).flex().items_center()
      .rounded(4).bg(wash).font_family(MONO).text_size(10.5).text_color(color).child(text);
    const note = (text) => div().px(10).text_size(11).text_color(t.dim).child(text);

    const message = !target ? "Focus a Claude Code pane to see what it has in context."
      : target.includes("/") ? "This Claude Code session runs on another machine; its transcript isn't readable from here."
      : !d ? "Reading the session…"
      : d.error === "no-session" ? "No prompt sent in this session yet. Its context shows up after the first message."
      : d.error === "no-transcript" ? "Couldn't find this session's transcript."
      : d.error ? `Couldn't read the session: ${d.error}` : null;

    // One instruction file: type, path, length; click to read it.
    const fileRow = (f, i) => {
      const open = this.openFile === f.path;
      const parts = f.path.split("/"), name = parts.pop();
      return v_flex().flex_none()
        .child(h_flex().id(`file-${i}`).h(30).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer()
          .when(open, (e) => e.bg(tint(t.accent, 0.14))).when(!open, (e) => e.hover((s) => s.bg(tint(t.foreground, 0.05))))
          .on_click((_e, cx) => { this.openFile = open ? null : f.path; cx.notify(); })
          .child(pill(f.type || "file"))
          .child(h_flex().flex_1().min_w(0)
            .child(div().min_w(0).truncate().text_color(t.dim).child(parts.length ? parts.join("/") + "/" : ""))
            .child(div().flex_none().text_color(open ? t.foreground : t.muted).child(name)))
          .child(div().flex_none().font_family(MONO).text_size(10.5).text_color(t.dim).child(plural(f.lines, "line")))
          .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim)))
        .when(open, (el) => el.child(div().id(`file-body-${i}`).mx(4).mt(4).mb(6).p(12).max_h(320).rounded(8)
          .bg(tint(t.foreground, 0.03)).overflow_y_scrollbar().text_size(12).text_color(t.muted)
          .child(TextView.markdown(`md-${i}`, f.preview + (f.chars > f.preview.length ? "\n\n…" : "")).selectable(true))));
    };

    // One skill: a filled dot when loaded, a ring when only listed; plugin prefix dimmed.
    const skillRow = (s, i) => {
      const open = this.openSkill === s.name;
      const [scope, short] = s.name.includes(":") ? [s.name.slice(0, s.name.lastIndexOf(":") + 1), s.name.slice(s.name.lastIndexOf(":") + 1)] : ["", s.name];
      return v_flex().id(`skill-${i}`).flex_none().px(8).py(6).gap(3).rounded(7).cursor_pointer()
        .when(open, (e) => e.bg(tint(t.foreground, 0.05))).when(!open, (e) => e.hover((h) => h.bg(tint(t.foreground, 0.04))))
        .on_click((_e, cx) => { this.openSkill = open ? null : s.name; cx.notify(); })
        .child(h_flex().gap(8).items_center()
          .child(s.loaded ? div().size(7).flex_none().rounded(4).bg(t.done)
                          : div().size(7).flex_none().rounded(4).border(1.5).border_color(t.dim))
          .child(h_flex().flex_1().min_w(0).font_family(MONO).text_size(12)
            .when(Boolean(scope), (el) => el.child(div().flex_none().text_color(t.dim).child(scope)))
            .child(div().min_w(0).truncate().text_color(s.loaded ? t.foreground : t.muted).child(short)))
          .when(Boolean(s.loaded), (el) => el.child(pill(`loaded · ${s.loaded === "you" ? "by you" : "by Claude"}`, t.done, tint(t.done, 0.14)))))
        .when(Boolean(s.description), (el) => el.child(div().pl(15).text_size(11).text_color(t.dim)
          .when(!open, (d) => d.truncate()).child(s.description)));
    };

    return v_flex().id("context").size_full().min_h(0).p(6).gap(6).font_family(SANS).text_color(t.foreground).text_size(13)
      // Header card: title, which session, totals.
      .child(h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(10).bg(card)
        .child(div().flex_none().font_semibold().child("Context"))
        // Which session: its name (Claude's /rename title), shortened when the panel is narrow.
        .when(Boolean(d?.title || target), (el) => el.child(div().min_w(0).h(18).px(6).flex().items_center().rounded(4)
          .bg(tint(t.foreground, 0.06)).font_family(MONO).text_size(10.5).text_color(t.muted)
          .child(div().min_w(0).truncate().child(d?.title || target))))
        .child(div().flex_1()))
      .when(Boolean(message), (el) => el.child(div().px(10).py(6).text_size(12).text_color(t.dim).child(message)))
      .when(!message, (el) => el.child(v_flex().id("context-body").flex_1().min_h(0).gap(6).overflow_y_scrollbar()
        // Instructions
        .child(label("Instructions", files.length))
        .child(v_flex().flex_none().p(4).gap(2).rounded(10).bg(card)
          .children(files.map(fileRow))
          .when(!files.length, (e) => e.child(div().px(8).py(6).text_size(12).text_color(t.dim).child("No CLAUDE.md files loaded."))))
        .child(note("Read in whole at the start of the session and kept for every turn."))
        // Skills
        .child(h_flex().mt(6).flex_none().items_center()
          .child(label("Skills", words.length ? `${shown.length} of ${skills.length}` : skills.length))
          .child(div().flex_1())
          .child(h_flex().pr(10).gap(10).flex_none().font_family(MONO).text_size(10.5).text_color(t.dim)
            .child(h_flex().gap(5).items_center().child(div().size(6).rounded(3).bg(t.done)).child(`${loaded.length} loaded`))
            .child(h_flex().gap(5).items_center().child(div().size(6).rounded(3).border(1.2).border_color(t.dim)).child(`${skills.length - loaded.length} listed`))))
        // Search field: a filled bar like the cards; Esc or × clears it.
        .when(skills.length > 0, (el) => el.child(h_flex().id("skill-search").h(32).flex_none().px(10).gap(8).items_center().rounded(10).bg(card)
          .on_key_down((e, cx) => {
            if (e.key === "escape" && this.query) { this.search.set_value(""); this.query = ""; cx.stop_propagation(); cx.notify(); }
          })
          .child(svg("mods/workspace-chrome/search.svg").size(13).flex_none().text_color(words.length ? t.foreground : t.dim))
          .child(Input.new(this.search).flex_1().h_full().text_size(12).text_color(t.foreground))
          .when(Boolean(this.query), (e) => e.child(div().id("skill-search-clear").size(18).flex_none().flex().items_center().justify_center()
            .rounded(4).cursor_pointer().text_color(t.dim).hover((h) => h.bg(tint(t.foreground, 0.06)).text_color(t.foreground))
            .on_click((_e, cx) => { this.search.set_value(""); this.query = ""; cx.notify(); })
            .child(svg("mods/workspace-chrome/x.svg").size(12))))))
        .child(v_flex().flex_none().p(4).gap(1).rounded(10).bg(card).children(shown.map(skillRow))
          .when(!skills.length, (e) => e.child(div().px(8).py(6).text_size(12).text_color(t.dim).child("No skills in this session.")))
          .when(skills.length > 0 && !shown.length, (e) => e.child(div().px(8).py(6).text_size(12).text_color(t.dim).child(`No skills match “${this.query.trim()}”.`))))
        .child(note("Listed: Claude sees only the name and description. Loaded: the skill was used, so its full instructions are in context."))
        .child(div().h(6).flex_none())));
  }
}
