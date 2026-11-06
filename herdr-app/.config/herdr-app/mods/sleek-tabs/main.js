import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, openOverlay, theme, window, shared, layout, settings, home } from "herdr";

// Personal: cards and pills follow the Cards transparency slider (my-settings).
// a mixed toward b by k (0..1), hex colours.
const wash = (a, b, k) => /^#[0-9a-f]{6}/i.test(a) && /^#[0-9a-f]{6}/i.test(b)
  ? "#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0")).join("")
  : a;
const glass = (c) => {
  const r = shared("rice") ?? {};
  const p = r["transparency.on"] === false ? 100 : (r["transparency.cards"] ?? 100);
  return p >= 100 || !/^#[0-9a-f]{6}$/i.test(c) ? c : c + Math.round((p / 100) * 255).toString(16).padStart(2, "0");
};

// Personal: a tab's label. A name you gave it wins; else what's in it: the agent's session
// name (from its terminal title), else the program running ("nvim"), else the shell's
// folder. Herdr's own name for an unnamed tab is just its number.
function tabLabel(tab, ps, homeDir) {
  if (tab.named) return tab.name;
  const mine = ps.filter((p) => p.tab === tab.id && p.terminal);
  const lead = mine.find((p) => p.program?.agent) ?? mine.find((p) => p.focused) ?? mine[0];
  if (!lead) return tab.name;
  const base = (dir) => !dir ? "" : dir === homeDir ? "~" : dir.split("/").filter(Boolean).pop() ?? dir;
  // An agent, or any program with a telling title (an agent that doesn't report status
  // still titles its terminal: "◐ Herdr config migration", "OC | Fix login").
  if (!lead.program?.shell) {
    const raw = (lead.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").replace(/^(OC|CC|Codex)\s*[|:·-]\s*/i, "").trim();
    const low = raw.toLowerCase();
    const said = [lead.program?.name, lead.program?.key, lead.app].filter(Boolean).map((x) => x.toLowerCase());
    const generic = !raw || said.includes(low) || low === base(lead.cwd).toLowerCase() || /^[~/]/.test(raw) || raw.includes("@")
      || /^(claude( code)?|codex|open ?code|shell)$/.test(low) || /^new session\b/.test(low);
    if (!generic) return raw;
    if (lead.program?.name && lead.program.name !== "program") return lead.program.name;
  }
  return base(lead.cwd) || tab.name;
}


function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class Tabs extends View {
  init() {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = theme();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const ps = panes(), homeDir = home();
    const mono = "Geist Mono";
    const accentEdge = /^#[0-9a-f]{6}$/i.test(t.accent) ? t.accent + "99" : t.accent;
    const item = (c, i) => {
      const program = ps.find(p => p.tab === c.id && p.program?.agent)?.program ?? ps.find(p => p.tab === c.id)?.program;
      const name = tabLabel(c, ps, homeDir);
      // Personal: every tab is a small outlined box (the border was always there, just
      // invisible, so nothing gets wider); the shown one is outlined in the accent.
      // Sleek: a borderless pill in the card color; the shown tab is filled (like a selected agent).
      return h_flex().id(`tab-${c.id}`).h(28).px(10).gap(7).rounded(8).items_center().flex_none().text_size(12)
        // Option 1: only the shown tab is a pill (the card colour washed with the accent, like the
        // current workspace card); the others are bare and get a soft pill on hover.
        .when(c.active, el => el.bg(glass(wash(t.background, t.accent, 0.22))))
        .text_color(c.active ? t.foreground : t.muted)
        .when(!c.active, el => el.hover(s => s.bg(glass(t.background)).text_color(t.foreground)))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        // The number stays as a hint: ⌘1–⌘9 go by it.
        .when((shared("rice") ?? {})["tabs.numbers"] !== false, el => el.child(div().flex_none().font_family(mono).text_size(10.5).text_color(c.active ? t.accent : t.dim).child(String(c.index))))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    // Personal: Files / Changes are one segmented toggle, deliberately unlike the outlined tab
    // boxes: a filled pill holding both, the open one raised inside it with an accent icon.
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(22).px(8).gap(5).flex_none().items_center().rounded(4)
        .text_size(12).text_color(on ? t.foreground : t.muted)
        .when(on, s => s.bg(glass(t.selected)))
        .when(!on, s => s.hover(h => h.text_color(t.foreground)))
        .on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(13).text_color(on ? t.accent : t.dim)).child(label);
    };
    const panels = ["files", "changes"].filter((p) => enabled.includes(p));
    // Sleek: no own background or border; the layout block is a floating rounded card.
    return h_flex().size_full().min_w(0).px(6).pl(lightsPadding).gap(4).items_center()
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(panels.length > 0, el => el
        // A thin divider sets the toggle apart from the tabs.
        .child(div().w(1).h(16).mx(6).flex_none().bg(t.border))
        .child(h_flex().id("panel-toggle").flex_none().h(28).p(3).gap(2).items_center().rounded(8).bg(glass(t.background))
          .when(panels.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
          // A thin divider between the halves, hidden when either is open (its highlight separates them).
          .when(panels.length === 2 && (panel?.hidden || !panels.includes(body?.active)), el => el.child(div().w(1).h(12).flex_none().bg(t.border)))
          .when(panels.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/sleek-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/sleek-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/sleek-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}
