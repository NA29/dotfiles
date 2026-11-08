# Usage dashboard

Click **details ↗** for the dashboard, or a provider row for its Limits view. Prefix → U opens the last-used tab. **1 / 2 / 3** select Cost / Tokens / Limits; **R** refreshes and **Esc** closes.

Cost and Tokens include Past 24h, 7/30/90 calendar-day ranges, provider selection, daily charts (hover a date for its values), totals, cache/input/output breakdowns and Model/Day tables. History covers all local workspaces on **This Mac**; remote-machine histories are not implicitly included. The longer ranges include today plus the preceding days. Past 24h is a rolling window, displayed by calendar day.

Limits shows providers together, with remaining percentages, used percentages, reset countdowns/local times, and an elapsed-time pace marker where reset timing is available. Codex reset credits and additional Claude model-specific windows appear when reported. Provider filtering applies to Limits too.

## Data and interpretation

- History is read from local Claude JSONL logs, Codex JSONL logs and OpenCode's SQLite message metadata, using Python's standard library. Repeated Claude streaming records are merged by message/request ID. Codex cumulative usage is differenced and repeated snapshots are skipped. Fork copies with the same event key are deduplicated. Reasoning is not added to output a second time.
- Processed tokens = uncached input + cache reads + cache writes + output. OpenCode account limits are not present in its history, so that section directs the user to the history tabs.
- Dollar values are **API-equivalent estimates**, not subscription charges or invoices. Known cache lifetime and service-tier information is used where available; models without known rates remain **Unpriced**. The rate-catalog snapshot time appears below the tables. The existing T3 local rate catalog is used if available, with bundled `rates.json` as an offline fallback. Differing cache-lifetime/tier assumptions can produce a different estimate from other apps.
- Limits merge each window independently from Claude's status-line cache, Codex rate-limit events and optional T3 provider snapshots. This restores explicit 0% Claude session readings when the status line reports only the weekly window. Missing windows do not erase known readings. The status-line cache writer preserves each window's own observation time. A passed reset is marked unknown until a new report; it is not invented as 0%.
- No credentials are read and no new network requests are made. Refresh rereads local records. If T3 is closed and the status line supplies no fresh session window, that value remains a last-reported reading, with its age shown. Provider caches may not report a reset time for an unused allowance.
- Only usage metadata is cached in `~/.cache/herdr-usage/sessions-v1.json`; prompts and replies are not exported or stored there. Log contents are never displayed. Parsing is cached by file size/mtime; unchanged logs are not reparsed. Limits refresh every 30s; history refreshes every 60s while a history tab is open.

`usage.py --limits` returns allowance metadata. `usage.py --days 30 --provider all` returns aggregated usage. It can be run with `python3 -I` and has no third-party Python dependencies.

## Checks

Run `herdr-app check ~/.config/herdr-app/mods/sleek-usage`, then open all three tabs in the app: the native checker does not test asynchronous data or layout geometry. Backend tests: `python3 tests/test_usage.py`. Interaction tests (Node 22+): `node --experimental-default-type=module tests/dashboard.test.mjs`. Test fixtures are synthetic.
