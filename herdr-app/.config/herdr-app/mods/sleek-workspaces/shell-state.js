// Agent-independent state derivation. Background process ownership is shared by all
// agents; native footer signals fill in counts hidden inside an agent's own TUI.
export function shellReading(screen) {
  const lines = String(screen).replace(/\x1b\[[0-9;]*m/g, '').split('\n');
  const footer = lines.filter(line => /^\s*[✻✽✶✳✢✺]\s+.+\bdone\b/i.test(line)).at(-1);
  const claude = Number(footer?.match(/\b(\d+)\s+shells?\s+still running\b/i)?.[1] ?? 0);
  // Codex keeps OSC 'working' while background terminals exist. Its current
  // status line distinguishes Ready from a foreground turn that's still Working.
  const tail = lines.slice(-14);
  const codex = tail.map(line => line.match(/^\s*(\d+) background terminals? running\s*[·•]\s*\/ps to view\s*[·•]\s*\/stop to close\s*$/)).find(Boolean);
  const status = tail.filter(line => /^\s*GPT-\S+.*[·•].*[·•]/i.test(line)).at(-1);
  return { count: codex ? Number(codex[1]) : claude,
    ready: Boolean(codex && status && /[·•]\s*Ready\s*[·•]/i.test(status)) };
}

export const shellCount = screen => shellReading(screen).count;

export function withShellState(agent, reading, jobs = [], jobsAt = 0) {
  if (agent.status === 'blocked') return agent;
  const fresh = reading && reading.seq === agent.seq && Date.now() - reading.at < 15000;
  // Use exact terminal ownership, never just the same folder: two agents can
  // work in one project. This path includes OpenCode and any other agent.
  const owned = Date.now() - jobsAt < 15000
    ? jobs.filter(job => job.terminal === agent.address).length : 0;
  const count = Math.max(fresh ? reading.count : 0, owned);
  const yielded = ['idle', 'done'].includes(agent.status) || (fresh && reading.ready);
  if (!yielded || count < 1) return agent;
  return { ...agent, status: 'waiting', shells: count };
}
