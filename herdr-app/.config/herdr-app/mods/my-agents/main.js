// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// A viewed done agent stays in Done until left.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, settings } from "herdr";

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

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}


// Personal (my-agents): agents split by workspace, tiling-WM style. Each workspace gets
// a header "[n] name ⎇ branch ───── counts" in its color (the same color as its sidebar
// badge) and a colored rail its agents hang off; rows are two lines in the terminal font.
const MONO = () => settings().font_family ?? "JetBrains Mono";
function tint(color, alpha) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color + Math.round(alpha * 255).toString(16).padStart(2, "0") : color;
}
// A workspace's badge, the same as in the Spaces sidebar: a tinted tile with its letter
// (filled when it's the shown workspace), a house for ~, a pin for the pinned group.
function badge(t, s, color, size = 18, glyph) {
  const ink = s?.active ? t.background : color;
  const tile = h_flex().size(size).flex_none().rounded(Math.round(size * 0.3)).items_center().justify_center()
    .when(Boolean(s?.active), (el) => el.bg(color))
    .when(!s?.active, (el) => el.bg(tint(color, 0.16)).border_1().border_color(tint(color, 0.38)));
  if (glyph) return tile.child(svg(glyph).size(Math.round(size * 0.6)).text_color(ink));
  if (s?.name === "~") return tile.child(svg("mods/my-spaces/home.svg").size(Math.round(size * 0.6)).text_color(ink));
  return tile.text_size(Math.round(size * 0.55)).font_bold().text_color(ink).child([...(s?.name ?? "?")][0]?.toUpperCase() ?? "?");
}
function spaceTone(t, s) {
  if (!s || s.name === "~") return t.ansi6;
  const stored = (shared("space.colors") ?? {})[s.id];
  return !stored ? t.ansi6 : stored.startsWith("#") ? stored : (t[stored] ?? t.accent);
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]");
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  // Looking at a done agent makes it idle; it stays with Done until you leave
  // it rather than drop away under you. Any other change moves it at once.
  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    // Arriving, or any change but done turning idle, sets what it was.
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.peek(k.address))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    this.hold(list);
    // Always by workspace, in sidebar order; inside one, the most urgent first.
    const order = new Map(spaces().map((s, i) => [s.id, i]));
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    list = [...list].sort((x, y) => (order.get(x.space) ?? 0) - (order.get(y.space) ?? 0) || rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));
    const mono = MONO();
    const spaceOf = new Map(spaces().map((s) => [s.id, s]));

    const withKids = (a, last, color) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, subs, last, color);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, true))];
    };

    // The fold chevron for sub-agents; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div().id(`fold-${a.address}`).h(18).px(3).gap(3).flex().items_center().rounded(4).text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim)).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row's title is the agent's session name, from the title it gives its terminal
    // (Claude Code: "◑ Herdr config migration", OpenCode: "OC | Fix login"). Titles that
    // say nothing (the program's own name, a folder, user@host) fall back to a tab you
    // named, else "untitled".
    const paneCwd = new Map(panes().map((p) => [p.pane, p.cwd ?? ""]));
    const tabOf = new Map(spaces().flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));
    const sessionName = (a) => {
      const raw = clean(a.title).replace(/^(OC|CC|Codex)\s*[|:·-]\s*/i, "").trim();
      const low = raw.toLowerCase();
      const folder = (paneCwd.get(a.pane) ?? "").split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
      const said = [a.program?.name, a.program?.key, a.app].filter(Boolean).map((x) => x.toLowerCase());
      const generic = !raw || said.includes(low) || low === folder || /^[~/]/.test(raw) || raw.includes("@")
        || /^(claude( code)?|codex|open ?code|shell)$/.test(low)
        // OpenCode's placeholder before it names a conversation: "New session - 2026-11-05T…".
        || /^new session\b/.test(low);
      if (!generic) return raw;
      const tab = tabOf.get(a.tab);
      return tab?.named ? tab.name : null;
    };

    const row = (a, subs, last, color = t.dim) => {
      const pic = icon(a.program, 14, t.muted);
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      const when = this.since(a);
      const isPinned = a.pinned;
      const name = sessionName(a);
      const tabIndex = tabOf.get(a.tab)?.index;
      const prog = (a.program?.name ?? a.app ?? "agent").toLowerCase();
      if (collapsed) {
        return h_flex().id(`ag-${a.address}`).h(26).px(8).flex_none().items_center().gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(list.indexOf(a) + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const pin = div().id(`pin-${a.address}`).flex_none().p(2).rounded(4).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      const quiet = a.status === "idle" && !a.focused;
      return h_flex().id(`ag-${a.address}`).h(42).flex_none().px(8).items_center().gap(9).rounded(7).cursor_pointer()
        .when(a.focused, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .child(div().w(16).flex_none().flex().items_center().justify_center().when(Boolean(pic), (el) => el.child(pic)))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(name
            ? div().w_full().truncate().text_size(12.5).text_color(quiet ? t.muted : t.foreground).when(a.focused, (d) => d.font_semibold()).child(name)
            : div().w_full().truncate().text_size(12.5).italic().text_color(t.dim).child("untitled"))
          .child(h_flex().w_full().min_w(0).gap(5).font_family(mono).text_size(10.5).text_color(t.dim)
            .child(div().flex_none().child(prog))
            .when(tabIndex != null, (el) => el.child(div().flex_none().child(`· tab ${tabIndex}`)))
            .when(Boolean(when), (el) => el.child(div().flex_none().child(`· ${duration(now - when)}`)))
            .when(Boolean(machine), (el) => el.child(div().flex_none().text_color(t.muted).child(`@${machine}`)))))
        .when(subs.length > 0, (el) => el.child(fold(a, subs)))
        .when(this.hovered === a.address, (el) => el.child(pin))
        .child(h_flex().w(16).flex_none().justify_center().child(this.status(t, a, true)));
    };

    // Groups: pinned first, then one per workspace (agents of a space are neighbours now).
    const groups = pinned.length ? [{ id: "pinned", pinned: true, members: pinned }] : [];
    for (const a of rest) {
      const id = `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, space: spaceOf.get(a.space), name: a.space_name || "", members: [a] });
    }

    // Counts by state, most urgent first, with the same marks the rows use.
    const counts = (members) => {
      const n = (st) => members.filter((a) => a.status === st).length;
      const mark = (st) => st === "working" ? svg("mods/workspace-chrome/spinner.svg").size(10).flex_none().text_color(t.working).spin(900)
        : st === "blocked" ? div().flex_none().font_bold().text_color(t.blocked).child("!")
        : st === "done" ? div().size(6).flex_none().rounded(3).bg(t.done)
        : div().size(6).flex_none().rounded(3).border(1.2).border_color(t.idle ?? t.dim);
      return ["blocked", "working", "done", "idle"]
        .filter((st) => n(st) > 0)
        .map((st) => h_flex().flex_none().gap(4).items_center().child(mark(st))
          .child(div().text_color(st === "idle" ? t.dim : t.muted).child(String(n(st)))));
    };

    // Each workspace is a card in its color: a tinted title bar (badge, name, ⎇ branch, counts)
    // over its agents. The shown workspace's card is brighter and lifted.
    const header = (g, open, color, here) => {
      const s = g.space;
      return h_flex().id(g.id).h(30).px(10).gap(7).items_center().flex_none().cursor_pointer()
        .font_family(mono).text_size(11.5)
        .bg(tint(color, here ? 0.16 : 0.08))
        .when(open, (el) => el.border_b(1).border_color(tint(color, here ? 0.3 : 0.16)))
        .hover((el) => el.bg(tint(color, here ? 0.22 : 0.13)))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(badge(t, s, color, 18, g.pinned ? "mods/workspace-chrome/pin.svg" : null))
        .child(div().flex_shrink_1().min_w(0).truncate().font_semibold().text_color(here ? t.foreground : t.muted)
          .child(g.pinned ? "pinned" : g.name.toLowerCase()))
        .when(Boolean(s?.branch), (el) => el.child(div().flex_shrink_1().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(`⎇ ${s.branch}`)))
        .child(div().flex_1())
        .children(counts(g.members))
        .child(div().w(10).flex_none().text_color(t.dim).child(open ? "▾" : "▸"));
    };

    const block = (g) => {
      const open = !this.folded.has(g.id);
      const color = g.pinned ? t.ansi3 : spaceTone(t, g.space);
      const here = Boolean(g.space?.active);
      return v_flex().w_full().flex_none().mt(8).rounded(10).overflow_hidden().border_1()
        .border_color(tint(color, here ? 0.6 : 0.24))
        .bg(tint(color, here ? 0.06 : 0.03))
        .when(here, (el) => el.shadow_md())
        .child(header(g, open, color, here))
        .when(open, (el) => el.child(
          v_flex().p(4).gap(2)
            .children(g.members.flatMap((a, i) => withKids(a, i === g.members.length - 1, color)))));
    };

    const working = list.filter((a) => a.status === "working").length;
    const needs = list.filter((a) => a.status === "blocked").length;
    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex().px(14).h(38).pt(10).pb(4).flex_none().items_center().gap(8).font_family(mono).text_size(11)
            .child(div().text_color(t.accent).child("❯"))
            .child(div().text_color(t.muted).font_semibold().child("agents"))
            .child(div().text_color(t.dim).child(`${list.length}`))
            .child(div().flex_1())
            .when(needs > 0, (el) => el.child(div().text_color(t.blocked).child(`${needs} need you`)))
            .when(working > 0, (el) => el.child(div().text_color(t.working).child(`${working} busy`))),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(14).pt(4).font_family(mono).text_size(11.5).text_color(t.dim).child("no agents running. start one from + in the tab bar.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).pb(8).overflow_y_scrollbar().mode("always")
        .children(collapsed ? list.flatMap((a) => withKids(a, false)) : groups.map(block)))
      .when(collapsed, (el) =>
        el.child(
          h_flex().h(28).items_center().justify_center().child(
            div().id("collapse").text_size(13).text_color(t.dim).hover((s) => s.text_color(t.foreground)).on_click(toggleSidebar).child("»"),
          ),
        ),
      );
  }
}
