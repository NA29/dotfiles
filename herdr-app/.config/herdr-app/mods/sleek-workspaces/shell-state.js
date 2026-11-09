// Read only Claude's own completion footer, never counts quoted in an agent reply.
// The last footer wins so an earlier run cannot leave a session waiting forever.
export function shellCount(screen) {
  const footers = String(screen).replace(/\x1b\[[0-9;]*m/g, '').split('\n')
    .filter(line => /^\s*[✻✽✶✳✢✺]\s+.+\bdone\b/i.test(line));
  const match = footers.at(-1)?.match(/\b(\d+)\s+shells?\s+still running\b/i);
  return match ? Number(match[1]) : 0;
}

export function withShellState(agent, reading) {
  if (!reading || reading.seq !== agent.seq || Date.now() - reading.at > 15000
      || !['idle', 'done'].includes(agent.status) || reading.count < 1) return agent;
  return { ...agent, status: 'waiting', shells: reading.count };
}
