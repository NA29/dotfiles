// Display order only: switching views never reorders actual workspaces or tabs.
export const VIEW_MODES = [
  ['workspaces', 'Spaces', 'Group agents inside workspace cards'],
  ['agents', 'Agents', 'All agents in a stable list, with workspace labels'],
  ['attention', 'Attention', 'Group by Needs you, Ready to review, Running and Idle'],
];
export const viewMode = value => VIEW_MODES.some(([id]) => id === value) ? value : 'workspaces';
const STATUS = [
  ['blocked', 'Needs you'], ['done', 'Ready to review'], ['working', 'Running'], ['idle', 'Idle'],
];
export function orderAgents(list, mode) {
  if (mode === 'workspaces') return [...list];
  const stable = list.map((agent, index) => ({ agent, index }))
    .sort((a, b) => Number(Boolean(b.agent.pinned)) - Number(Boolean(a.agent.pinned)) || a.index - b.index)
    .map(({ agent }) => agent);
  return mode === 'attention' ? attentionGroups(stable).flatMap(group => group.agents) : stable;
}
export function attentionGroups(list) {
  const groups = STATUS.map(([status, title]) => ({ status, title, agents: list.filter(a => a.status === status) }));
  const unknown = list.filter(a => !STATUS.some(([status]) => status === a.status));
  if (unknown.length) groups.push({ status: 'unknown', title: 'Other', agents: unknown });
  return groups.filter(group => group.agents.length);
}
