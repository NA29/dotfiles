// Personal plugin (not managed by herdr): reports OpenCode's status to the Herdr
// desktop app, so OpenCode shows up in its agents list.
//
// The desktop app's core (herdr-core, `hc`) reads status from an escape code the
// program prints: ESC ] 7501 ; state=<idle|working|blocked>:app=opencode BEL.
// The old TUI integration (herdr-tui-session.js) talks to the TUI's socket instead,
// which doesn't exist in desktop-app terminals. This only runs inside herdr-core
// terminals (HC_TERMINAL_ID is set), so it never fires in the TUI.
//
// State: blocked while a permission or question waits on you (or after an error),
// working while any session is busy, otherwise idle. The app turns idle into "done"
// when it finished while you weren't looking. On quit it sends state=clear (what
// Claude Code sends too), so the agent leaves the list even though the shell stays.

import fs from "node:fs";

const APP = "opencode";

function makeReporter() {
  let fd;
  try {
    fd = fs.openSync("/dev/tty", "w");
  } catch {
    fd = undefined;
  }
  let last;
  const report = (state, force = false) => {
    if (!force && state === last) return;
    last = state;
    const seq = state === "clear" ? "\x1b]7501;state=clear\x07" : `\x1b]7501;state=${state}:app=${APP}\x07`;
    try {
      if (fd !== undefined) fs.writeSync(fd, seq);
      else process.stdout.write(seq);
    } catch {}
  };
  // Once, on OpenCode's own shutdown or, failing that, on process exit.
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    report("clear", true);
    try { if (fd !== undefined) fs.closeSync(fd); } catch {}
  };
  process.once("exit", close);
  return { report, close };
}

function inHerdrCore() {
  return Boolean(process.env.HC_TERMINAL_ID);
}

// OpenCode 1.x full TUI.
async function tui(api) {
  if (!inHerdrCore()) return;
  const { report, close } = makeReporter();
  const busy = new Set();
  const errors = new Set();
  const blockers = new Map();

  const publish = () => report(blockers.size || errors.size ? "blocked" : busy.size ? "working" : "idle");

  const handlers = {
    "session.status": (p) => {
      const kind = typeof p.status === "string" ? p.status : p.status?.type;
      if (kind === "busy" || kind === "retry") { busy.add(p.sessionID); errors.delete(p.sessionID); }
      else if (kind === "idle") busy.delete(p.sessionID);
    },
    "session.idle": (p) => busy.delete(p.sessionID),
    "session.error": (p) => {
      if (p.error?.name !== "MessageAbortedError" && p.sessionID) errors.add(p.sessionID);
      busy.delete(p.sessionID);
    },
    "session.deleted": (p) => {
      const id = p.sessionID ?? p.info?.id;
      busy.delete(id);
      errors.delete(id);
      for (const [k, r] of blockers) if (r.sessionID === id) blockers.delete(k);
    },
    "permission.asked": (p) => { if (p.id) blockers.set(`permission:${p.id}`, p); },
    "question.asked": (p) => { if (p.id) blockers.set(`question:${p.id}`, p); },
    "permission.replied": (p) => blockers.delete(`permission:${p.requestID}`),
    "question.replied": (p) => blockers.delete(`question:${p.requestID}`),
    "question.rejected": (p) => blockers.delete(`question:${p.requestID}`),
    // A new prompt clears an old error.
    "message.updated": (p) => { if (p.info?.role === "user" && p.info?.sessionID) errors.delete(p.info.sessionID); },
  };

  const subscriptions = Object.entries(handlers).map(([type, handle]) =>
    api.event.on(type, (event) => {
      try { handle(event?.properties ?? {}); } catch {}
      publish();
    }));
  // Reconnects can drop events: say it again so the app never sits on a stale word.
  for (const type of ["server.connected", "server.instance.disposed", "global.disposed"]) {
    subscriptions.push(api.event.on(type, () => publish()));
  }

  report("idle", true);
  api.lifecycle.onDispose(() => {
    for (const unsubscribe of subscriptions) { try { unsubscribe(); } catch {} }
    close();
  });
}

// OpenCode 2.x TUI.
function setup(api) {
  if (!inHerdrCore()) return;
  const { report, close } = makeReporter();
  const running = new Set();
  const failed = new Set();
  const blockers = new Set();
  const publish = () => report(blockers.size || failed.size ? "blocked" : running.size ? "working" : "idle");

  const unsubscribe = api.data.listen(({ details: event }) => {
    const data = event?.data;
    if (data == null) return;
    const id = event.type === "form.created" ? data.form?.sessionID : data.sessionID;
    switch (event.type) {
      case "session.execution.started": running.add(id); failed.delete(id); break;
      case "session.execution.succeeded":
      case "session.execution.interrupted": running.delete(id); break;
      case "session.execution.failed": running.delete(id); failed.add(id); break;
      case "permission.asked": blockers.add(`permission:${data.id}`); break;
      case "permission.replied": blockers.delete(`permission:${data.requestID}`); break;
      case "form.created": blockers.add(`form:${data.form?.id}`); break;
      case "form.replied":
      case "form.cancelled": blockers.delete(`form:${data.id}`); break;
      default: return;
    }
    publish();
  });
  report("idle", true);
  return () => { try { unsubscribe(); } catch {} close(); };
}

export default { id: "personal.herdr-app-status", tui, setup };
