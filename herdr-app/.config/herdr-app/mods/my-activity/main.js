// Personal: activity feed.
//   Sidebar (this block): the latest events, newest first ("14:02 ● Sigsig recipe request
//   finished · 4m"); "all ›" opens the log. Folds to the latest event.
//   Log (the same mod as a dialog, props().log): the last 200 events by day, with each
//   agent's icon, workspace › tab, what happened, how long it worked and what it last said,
//   filters, click to jump, and Clear.
// Events are recorded by the sidebar copy only, while Herdr is open, and kept in shared
// "activity.events" so the dialog sees the same list.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, spaces, run, theme, settings, layout, props, shared, setShared, openOverlay, closeOverlay } from "herdr";
import { box, fit } from "./box.js";

// Font rule: words in Geist, numbers and code in Geist Mono (one family, designed together).
const MONO = () => "Geist Mono";
const SANS = "Geist";
const UI = () => SANS;
const SIDEBAR_ROWS = 6;
const KEEP = 200;
const ROW = 24;
const KINDS = ["needs you", "finished", "started", "closed"];

const cleanTitle = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/^(OC|CC|Codex)\s*[|:·-]\s*/i, "").trim();
function nameOf(a) {
  const raw = cleanTitle(a.title);
  const low = raw.toLowerCase();
  const generic = !raw || [a.program?.name, a.program?.key, a.app].filter(Boolean).map((x) => x.toLowerCase()).includes(low)
    || /^[~/]/.test(raw) || raw.includes("@") || /^(claude( code)?|codex|open ?code|shell)$/.test(low) || /^new session\b/.test(low);
  return generic ? `${a.program?.name ?? "agent"} · untitled` : raw;
}
const clock = (ms) => new Date(ms).toTimeString().slice(0, 5);
function took(ms) {
  if (!ms || ms < 1000) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}
function dayOf(ms) {
  const d = new Date(ms), today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "today";
  if (d.toDateString() === y.toDateString()) return "yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toLowerCase();
}
function programIcon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Activity extends View {
  init(_props, cx) {
    // Any popup copy is the log (and never records): the sidebar block has no overlay.
    this.log = Boolean(props()?.log || props()?.overlay);
    this.open = localStorage.getItem("folded") !== "1";
    this.filter = "all";
    this.confirming = false;
    this.handle = cx.focus_handle();
    this.last = null; // address -> { status, since, info }
    if (!this.log) {
      // Older builds kept events per copy: move them to the shared list once.
      const old = JSON.parse(localStorage.getItem("events") ?? "null");
      if (old && !shared("activity.events")) setShared("activity.events", old);
      localStorage.removeItem("events");
    }
    cx.timer.every(60000, (cx) => cx.notify());
  }

  events() {
    return shared("activity.events") ?? [];
  }

  // Status changes become events: started, needs you, finished, closed. Sidebar copy only.
  record(list, now) {
    const reports = new Map(terminals().map((x) => [x.address, x.report]));
    const where = new Map(spaces().flatMap((s) => s.tabs.map((tab) => [tab.id, { space: s.name, tab: tab.index }])));
    const current = new Map(list.map((a) => [a.address, {
      status: a.status,
      info: { name: nameOf(a), pane: a.pane, app: a.app, program: a.program?.name, icon: a.program?.icon ?? null, tint: a.program?.tint ?? false,
        space: where.get(a.tab)?.space ?? a.space_name, tab: where.get(a.tab)?.tab ?? null, msg: reports.get(a.address)?.msg ?? null },
    }]));
    if (this.last) {
      const fresh = [];
      const add = (address, info, kind, extra = {}) => fresh.push({ at: now, address, kind, ...info, ...extra });
      for (const [address, cur] of current) {
        const before = this.last.get(address);
        cur.since = before?.status === cur.status ? before.since : now;
        if (!before || before.status === cur.status) continue;
        const spent = before.status === "working" ? now - before.since : null;
        if (cur.status === "blocked") add(address, cur.info, "needs you", { took: spent });
        else if (cur.status === "working") add(address, cur.info, "started");
        else if ((cur.status === "done" || cur.status === "idle") && (before.status === "working" || before.status === "blocked")) add(address, cur.info, "finished", { took: spent });
      }
      for (const [address, before] of this.last) if (!current.has(address)) add(address, before.info, "closed");
      if (fresh.length) setShared("activity.events", [...fresh.reverse(), ...this.events()].slice(0, KEEP));
    } else {
      for (const cur of current.values()) cur.since = now;
    }
    this.last = current;
  }

  mark(t, kind) {
    if (kind === "needs you") return div().w(8).flex_none().font_bold().text_color(t.blocked).child("!");
    if (kind === "finished") return div().size(6).mx(1).flex_none().rounded(3).bg(t.done);
    if (kind === "started") return div().size(6).mx(1).flex_none().rounded(3).bg(t.working);
    return div().w(8).flex_none().text_color(t.dim).child("×");
  }

  tone(t, kind) {
    return kind === "needs you" ? t.blocked : kind === "finished" ? t.done : kind === "started" ? t.working : t.dim;
  }

  openLog() {
    openOverlay({ mod: "my-activity", kind: "dialog", width: 680, height: 0.72, props: { log: true } });
  }

  // ---- the sidebar block ------------------------------------------------------------
  sidebar(t) {
    const all = this.events();
    const live = new Set(agents().map((a) => a.address));
    const shown = all.slice(0, SIDEBAR_ROWS);
    const toggle = (_e, cx) => {
      this.open = !this.open;
      localStorage.setItem("folded", this.open ? "0" : "1");
      cx.notify();
    };
    fit(layout, run, "activity", 6 + 20 + (this.open ? Math.max(1, shown.length) * ROW + 10 + (all.length ? 24 : 0) : 0) + 4);
    const latest = all[0];
    // A quiet footer line under the events opens the full log.
    const footer = h_flex().id("act-all").h(24).mt(2).px(10).gap(6).items_center().justify_end().cursor_pointer()
      .border_t(1).border_color(t.border).text_color(t.dim)
      .hover((h) => h.text_color(t.accent))
      .on_click(() => this.openLog())
      .child(div().font_family(SANS).child(`view all ${all.length} event${all.length === 1 ? "" : "s"}`))
      .child(div().child("›"));

    const rows = shown.length
      ? shown.map((e, i) => h_flex().id(`act-${i}`).h(ROW).px(10).gap(8).items_center()
          .when(live.has(e.address), (el) => el.cursor_pointer().hover((h) => h.bg(t.hover))
            .on_click(() => run("pane.focus", { pane: e.pane })))
          .child(div().flex_none().text_color(t.dim).child(clock(e.at)))
          .child(h_flex().w(10).flex_none().justify_center().child(this.mark(t, e.kind)))
          .child(div().flex_1().min_w(0).truncate().font_family(UI()).text_size(12)
            .text_color(live.has(e.address) ? t.foreground : t.muted).child(e.name))
          .child(div().flex_none().font_family(SANS).text_color(this.tone(t, e.kind)).child(e.kind))
          .when(Boolean(took(e.took)), (el) => el.child(div().flex_none().text_color(t.dim).child(took(e.took)))))
      : [div().h(ROW).px(10).flex().items_center().font_family(SANS).text_color(t.dim).child("quiet so far")];

    return v_flex().id("root").size_full().min_h(0).bg(t.chrome).px(8).pt(6).font_family(MONO()).text_size(11)
      .child(box(t, {
        id: "activity", title: "activity", open: this.open, onToggle: toggle,
        extra: [],
        summary: latest ? [h_flex().min_w(0).gap(5).items_center()
          .child(this.mark(t, latest.kind))
          .child(div().min_w(0).max_w(110).truncate().font_family(SANS).text_color(t.muted).child(latest.name))
          .child(div().flex_none().font_family(SANS).text_color(this.tone(t, latest.kind)).child(latest.kind))] : [],
        body: v_flex().children(rows).when(all.length > 0, (el) => el.child(footer)),
      }));
  }

  // ---- the full log (dialog) ----------------------------------------------------------
  logView(t) {
    const all = this.events();
    const live = new Set(agents().map((a) => a.address));
    const list = this.filter === "all" ? all : all.filter((e) => e.kind === this.filter);
    const count = (k) => (k === "all" ? all.length : all.filter((e) => e.kind === k).length);
    const close = () => closeOverlay(props().overlay);

    const chip = (k) => h_flex().id(`flt-${k}`).h(22).px(8).gap(5).items_center().rounded(4).cursor_pointer()
      .border_1().border_color(this.filter === k ? (k === "all" ? t.accent : this.tone(t, k)) : t.border)
      .text_color(this.filter === k ? t.foreground : t.muted)
      .hover((h) => h.text_color(t.foreground))
      .on_click((_e, cx) => { this.filter = k; cx.notify(); })
      .when(k !== "all", (el) => el.child(this.mark(t, k)))
      .child(div().font_family(SANS).child(k))
      .child(div().text_color(t.dim).child(String(count(k))));

    const items = [];
    let day = null;
    for (const [i, e] of list.entries()) {
      const d = dayOf(e.at);
      if (d !== day) {
        day = d;
        items.push(h_flex().h(26).mt(i ? 6 : 0).px(4).gap(8).items_center()
          .child(div().flex_none().font_family(SANS).text_color(t.accent).child(d))
          .child(div().flex_1().h(1).bg(t.border)));
      }
      const here = live.has(e.address);
      const pic = e.icon ? (e.tint ? svg(e.icon).size(14).flex_none().text_color(t.muted) : image(e.icon).w(14).h(14).flex_none()) : null;
      const place = [e.space, e.tab != null ? `tab ${e.tab}` : null].filter(Boolean).join(" › ");
      items.push(v_flex().id(`log-${i}`).px(4).py(5).gap(2).rounded(4)
        .when(here, (el) => el.cursor_pointer().hover((h) => h.bg(t.hover))
          .on_click(() => { close(); run("pane.focus", { pane: e.pane }); }))
        .child(h_flex().gap(9).items_center()
          .child(div().w(38).flex_none().text_color(t.dim).child(clock(e.at)))
          .child(h_flex().w(10).flex_none().justify_center().child(this.mark(t, e.kind)))
          .child(div().w(16).flex_none().flex().justify_center().when(Boolean(pic), (el) => el.child(pic)))
          .child(div().flex_1().min_w(0).truncate().font_family(UI()).text_size(13)
            .text_color(here ? t.foreground : t.muted).child(e.name))
          .child(div().flex_none().font_family(SANS).text_color(this.tone(t, e.kind)).child(e.kind))
          .child(div().w(46).flex_none().text_right().text_color(t.dim).child(took(e.took) ? `${took(e.took)}` : "")))
        .child(h_flex().pl(82).gap(8).items_center().text_size(10.5).text_color(t.dim)
          .child(div().flex_none().child((e.program ?? e.app ?? "agent").toLowerCase()))
          .when(Boolean(place), (el) => el.child(div().flex_none().child(`· ${place}`)))
          .when(Boolean(e.msg), (el) => el.child(div().min_w(0).truncate().font_family(SANS).text_color(t.muted).child(`· “${e.msg}”`)))
          .when(!here, (el) => el.child(div().flex_none().child("· gone")))));
    }

    return v_flex().id("act-log").size_full().min_h(0).bg(t.popover).p(16).gap(12).font_family(MONO()).text_size(11.5).text_color(t.foreground)
      .track_focus(this.handle)
      // While asking: Enter clears, Esc only cancels (doesn't close the log).
      .on_key_down((e, cx) => {
        if (!this.confirming) return;
        if (e.key === "enter") this.clearNow();
        else if (e.key === "escape") this.confirming = false;
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().gap(8)
        .child(div().text_color(t.accent).text_size(13).child("❯"))
        .child(div().font_family(SANS).font_semibold().text_size(13).child("activity log"))
        .child(div().font_family(SANS).text_color(t.dim).child(`${all.length} of ${KEEP} kept`))
        .child(div().flex_1())
        .child(div().id("act-clear").px(8).h(22).flex().items_center().rounded(6).font_family(SANS).border_1().border_color(t.border).text_color(t.muted).cursor_pointer()
          .when(all.length === 0, (el) => el.opacity(0.4))
          .hover((h) => h.border_color(t.blocked).text_color(t.blocked))
          .on_click((_e, cx) => { if (all.length) { this.confirming = true; this.handle.focus(); cx.notify(); } })
          .child("clear"))
        .child(div().text_color(t.dim).child("esc")))
      .child(h_flex().gap(6).flex_wrap().children(["all", ...KINDS].map(chip)))
      .child(div().h(1).bg(t.border))
      .child(this.confirming ? this.confirmPanel(t, all.length) : v_flex().id("act-log-list").flex_1().min_h(0).overflow_y_scrollbar()
        .children(items.length ? items : [div().py(20).text_color(t.dim).child(this.filter === "all" ? "nothing yet: events show up as your agents work" : `no "${this.filter}" events yet`)]));
  }

  clearNow() {
    setShared("activity.events", []);
    this.confirming = false;
  }

  // "Clear activity history?" in place of the list, so nothing is lost by a stray click.
  confirmPanel(t, n) {
    const button = (id, label, danger, onClick) => h_flex().id(id).h(28).px(14).items_center().rounded(6).cursor_pointer().font_family(SANS)
      .border_1().border_color(danger ? t.blocked : t.border)
      .when(danger, (el) => el.bg(t.blocked).text_color(t.background).font_semibold())
      .when(!danger, (el) => el.text_color(t.muted).hover((h) => h.text_color(t.foreground)))
      .hover((h) => h.opacity(0.9))
      .on_click((_e, cx) => { onClick(); cx.notify(); })
      .child(label);
    return v_flex().flex_1().min_h(0).items_center().justify_center()
      .child(v_flex().w(380).p(18).gap(10).rounded(6).border_1().border_color(t.blocked)
        .child(h_flex().gap(8).items_center()
          .child(div().font_bold().text_color(t.blocked).child("!"))
          .child(div().font_family(SANS).font_semibold().text_size(13).child("clear activity history?")))
        .child(div().font_family(UI()).text_size(12.5).text_color(t.muted)
          .child(`This deletes all ${n} event${n === 1 ? "" : "s"} from the log and the sidebar. It can't be undone.`))
        .child(h_flex().pt(6).gap(8).justify_end()
          .child(div().text_color(t.dim).mr(4).child("esc · ↵"))
          .child(button("act-cancel", "cancel", false, () => { this.confirming = false; }))
          .child(button("act-confirm", "clear", true, () => this.clearNow()))));
  }

  render() {
    const t = theme();
    if (this.log) return this.logView(t);
    this.record(agents(), Date.now());
    return this.sidebar(t);
  }
}
