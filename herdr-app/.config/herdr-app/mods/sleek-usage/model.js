// Pure normalization/formatting shared by the sidebar and detailed usage dialog.
export const WEEK = 7 * 24 * 3600;
export function epoch(value) {
  if (value == null || value === '') return null;
  let n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) n = Date.parse(value) / 1000;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : n;
}
export function windowOf(raw, now) {
  if (!raw) return null;
  const value = raw.used_percentage ?? raw.used_percent ?? raw.utilization;
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const used = Number(value);
  if (!Number.isFinite(used)) return null;
  const resets = epoch(raw.resets_at ?? raw.reset_at ?? raw.resetsAt);
  return { used: Math.max(0, Math.min(100, used)), resets,
    expired: resets != null && resets <= now, at: epoch(raw.observed_at), minutes: Number(raw.window_minutes) || null };
}
export function readings(claude, codex, now) {
  const out = {};
  if (claude?.rate_limits) {
    const rl = claude.rate_limits;
    out.claude = { at: epoch(claude.at), plan: claude.plan_type ?? rl.plan_type,
      five: windowOf(rl.five_hour, now), week: windowOf(rl.seven_day, now),
      extra: [['Weekly · Sonnet', rl.seven_day_sonnet], ['Weekly · Opus', rl.seven_day_opus]]
        .filter(([, v]) => v != null).map(([label, v]) => ({ label, value: windowOf(v, now) })) };
  }
  if (codex?.rate_limits) {
    const rl = codex.rate_limits;
    out.codex = { at: epoch(codex.at), five: windowOf(rl.primary, now),
      week: windowOf(rl.secondary, now), plan: rl.plan_type, credits: rl.credits, extra: [] };
  }
  return out;
}
export function untilText(seconds) {
  if (seconds <= 0) return 'now';
  const m = Math.max(1, Math.ceil(seconds / 60));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? `${String(m % 60).padStart(2, '0')}m` : ''}`;
  return `${Math.floor(h / 24)}d${h % 24 ? ` ${h % 24}h` : ''}`;
}
export function dateText(seconds) {
  if (!seconds) return 'Not reported';
  const d = new Date(seconds * 1000);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
export function pct(value) { return `${Number(value.toFixed(1))}%`; }
export function windowLabel(w, fallback) {
  if (!w?.minutes) return fallback;
  if (w.minutes === 10080) return 'Weekly allowance';
  return w.minutes % 60 === 0 ? `${w.minutes / 60}-hour allowance` : `${w.minutes}-minute allowance`;
}
