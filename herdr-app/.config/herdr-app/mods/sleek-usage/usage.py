"""Read local usage metadata only. No prompts, replies or credentials are exported.

Scientific costs are API-equivalent estimates from a dated local rate catalog;
unknown models remain unpriced. CLI: --limits, or --days 30 --provider all.
"""
import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import time

ROOT = Path(__file__).resolve().parent
HOME_DIR = Path.home()
CACHE = HOME_DIR / '.cache/herdr-usage'

def load(path, fallback=None):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {} if fallback is None else fallback


def stamp(value):
    if isinstance(value, (int, float)):
        return value / 1000 if value > 1e12 else value
    try:
        return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00')).timestamp()
    except (ValueError, TypeError, OverflowError):
        return 0


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile('w', dir=path.parent, prefix='.usage-', delete=False) as f:
        json.dump(value, f, separators=(',', ':'))
    os.replace(f.name, path)


def limits():
    """Merge each allowance separately; a partial status line cannot erase a window."""
    result = {}
    for provider, filename in [('claude', 'claudeAgent'), ('codex', 'codex')]:
        cached = load(HOME_DIR / '.t3/caches' / (filename + '.json')).get('usageLimits') or {}
        at = stamp(cached.get('checkedAt'))
        normalized = {}
        for w in cached.get('windows', []):
            key = w.get('id') or (('five_hour' if w.get('kind') == 'session' else 'seven_day') if provider == 'claude' else ('primary' if w.get('kind') == 'session' else 'secondary'))
            if w.get('usedPercent') is None:
                continue
            normalized[key] = {'used_percentage': w['usedPercent'], 'resets_at': w.get('resetsAt'),
                               'window_minutes': w.get('windowDurationMins'), 'observed_at': at}
        if normalized:
            result[provider] = {'at': at, 'rate_limits': normalized, 'source': 'provider cache'}
            if cached.get('resetCredits'):
                result[provider]['reset_credits'] = cached['resetCredits']
    status = load(HOME_DIR / '.cache/agent-usage/claude.json')
    if status.get('rate_limits'):
        target = result.setdefault('claude', {'at': 0, 'rate_limits': {}})
        for key, value in status['rate_limits'].items():
            if not isinstance(value, dict):
                continue
            previous = target['rate_limits'].get(key) or {}
            observed = stamp(value.get('observed_at', status.get('at')))
            if observed >= stamp(previous.get('observed_at')):
                target['rate_limits'][key] = {**value, 'observed_at': observed}
        target['at'] = max(target['at'], stamp(status.get('at')))
    spec = importlib.util.spec_from_file_location('codex_limits', ROOT / 'codex-limits.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    paths = sorted((HOME_DIR / '.codex/sessions').glob('*/*/*/rollout-*.jsonl'),
                   key=lambda p: p.stat().st_mtime, reverse=True)[:5]
    latest = module.latest_snapshot(paths)
    if latest:
        target = result.setdefault('codex', {'at': 0, 'rate_limits': {}})
        for key, value in latest['rate_limits'].items():
            if value is None:
                continue
            if key in ['primary', 'secondary']:
                old = target['rate_limits'].get(key) or {}
                if latest['at'] >= stamp(old.get('observed_at')):
                    target['rate_limits'][key] = {**value, 'observed_at': latest['at']}
            else:
                target['rate_limits'][key] = value
        target['at'] = max(target['at'], latest['at'])
    return result


def count(value):
    try:
        return max(0, int(value or 0))
    except (ValueError, TypeError, OverflowError):
        return 0


def record(provider, session, model, timestamp, usage, key, tier='standard', long_write=0):
    return {'provider': provider, 'session': session, 'model': model or 'unknown', 'at': stamp(timestamp),
            'input': count(usage.get('input')), 'read': count(usage.get('read')),
            'write': count(usage.get('write')), 'output': count(usage.get('output')),
            'long_write': count(long_write), 'key': key, 'tier': tier or 'standard'}


def parse_claude(path):
    rows = {}
    with path.open(errors='replace') as f:
        for line in f:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            m = e.get('message') or {}
            if e.get('type') != 'assistant' or not isinstance(m, dict) or not isinstance(m.get('usage'), dict):
                continue
            u = m['usage']
            key = str(m.get('id') or e.get('uuid') or hashlib.sha256(line.encode()).hexdigest()) + ':' + str(e.get('requestId') or '')
            r = record('claude', e.get('sessionId') or path.stem, m.get('model'), e.get('timestamp'),
                       {'input': u.get('input_tokens'), 'read': u.get('cache_read_input_tokens'),
                        'write': u.get('cache_creation_input_tokens'), 'output': u.get('output_tokens')}, key,
                       u.get('speed') or 'standard', (u.get('cache_creation') or {}).get('ephemeral_1h_input_tokens'))
            old = rows.get(key)
            if old:
                for k in ['input', 'read', 'write', 'output', 'long_write']:
                    r[k] = max(old[k], r[k])
            rows[key] = r
    return list(rows.values())


def parse_codex(path):
    rows, previous, previous_signature = [], None, None
    model, tier, session = 'unknown', 'standard', path.stem
    with path.open(errors='replace') as f:
        for line in f:
            try:
                e = json.loads(line)
            except ValueError:
                continue
            p = e.get('payload') or {}
            if not isinstance(p, dict):
                continue
            if e.get('type') == 'session_meta':
                session = p.get('id') or session
            if e.get('type') == 'turn_context':
                model = p.get('model') or model
                tier = p.get('service_tier') or 'standard'
            if e.get('type') != 'event_msg' or p.get('type') != 'token_count':
                continue
            info = p.get('info') or {}
            total = info.get('total_token_usage')
            last = info.get('last_token_usage')
            if not isinstance(total, dict):
                continue
            signature = json.dumps(total, sort_keys=True)
            if signature == previous_signature:
                continue
            previous_signature = signature
            keys = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens']
            reset = previous is not None and any(count(total.get(k)) < count(previous.get(k)) for k in keys)
            if previous is None or reset:
                delta = last if isinstance(last, dict) else total
            else:
                delta = {k: max(0, count(total.get(k)) - count(previous.get(k))) for k in keys}
            previous = total
            inp, read = count(delta.get('input_tokens')), count(delta.get('cached_input_tokens'))
            key = str(e.get('timestamp')) + ':' + signature
            rows.append(record('codex', session, model, e.get('timestamp'),
                {'input': max(0, inp-read), 'read': read, 'write': delta.get('cache_write_input_tokens'),
                 'output': delta.get('output_tokens')}, key, tier))
    return rows


def history():
    cache_path = CACHE / 'sessions-v1.json'
    old = load(cache_path)
    cached, rows, warnings = {}, [], []
    for provider, folder in [('claude', HOME_DIR/'.claude/projects'), ('codex', HOME_DIR/'.codex/sessions')]:
        for path in folder.rglob('*.jsonl') if folder.exists() else []:
            try:
                stat = path.stat()
                sig = [stat.st_size, stat.st_mtime_ns]
                entry = old.get(str(path))
                if not isinstance(entry, dict) or entry.get('sig') != sig:
                    parsed = parse_claude(path) if provider == 'claude' else parse_codex(path)
                    entry = {'sig': sig, 'rows': [r for r in parsed if r['at'] >= time.time()-92*86400]}
                cached[str(path)] = entry
                rows.extend(entry['rows'])
            except (OSError, ValueError, TypeError) as exc:
                warnings.append(f'{provider}: one session could not be read ({type(exc).__name__})')
    write_json(cache_path, cached)
    db = HOME_DIR/'.local/share/opencode/opencode.db'
    if db.exists():
        try:
            with sqlite3.connect('file:'+str(db)+'?mode=ro', uri=True, timeout=1) as conn:
                for ident, session, created, data in conn.execute('SELECT id,session_id,time_created,data FROM message WHERE time_created >= ?', (int((time.time()-92*86400)*1000),)):
                    try:
                        message = json.loads(data)
                    except ValueError:
                        continue
                    if message.get('role') != 'assistant':
                        continue
                    u, c = message.get('tokens') or {}, (message.get('tokens') or {}).get('cache') or {}
                    rows.append(record('opencode', session, message.get('modelID'), created,
                         {'input':u.get('input'),'read':c.get('read'),'write':c.get('write'),'output':u.get('output')}, ident))
        except (OSError, sqlite3.Error):
            warnings.append('OpenCode history is temporarily unavailable')
    # Forked logs and repeated streaming chunks share event/message keys.
    dedup = {}
    for r in rows:
        key = (r['provider'], r['key'])
        oldrow = dedup.get(key)
        if oldrow is None:
            dedup[key] = r
        else:
            for k in ['input','read','write','output','long_write']:
                oldrow[k] = max(oldrow[k], r[k])
    return list(dedup.values()), sorted(set(warnings))


def price(row, rates):
    model = row['model']
    rate = rates.get(model) or rates.get('anthropic/'+model) or rates.get('openai/'+model)
    if not rate:
        return None
    context = row['input'] + row['read'] + row['write']
    tier = row.get('tier', 'standard')
    suffix = '_priority' if tier in ['priority','fast'] else '_flex' if tier == 'flex' else ''
    def get(base, default=None):
        for bound in [272000,200000,128000]:
            if context > bound:
                value = rate.get(base + f'_above_{bound//1000}k_tokens' + suffix)
                if value is not None: return float(value)
        value = rate.get(base+suffix, rate.get(base, default))
        return None if value is None else float(value)
    inp, out = get('input_cost_per_token'), get('output_cost_per_token')
    if inp is None or out is None:
        return None
    read_rate = get('cache_read_input_token_cost', inp)
    write_rate = get('cache_creation_input_token_cost', inp)
    long_rate = rate.get('cache_creation_input_token_cost_above_1hr',write_rate)
    long_count = min(row['long_write'],row['write'])
    costs = [row['input']*inp, row['read']*read_rate,
             (row['write']-long_count)*write_rate + long_count*long_rate, row['output']*out]
    return {'parts':costs, 'cost':sum(costs), 'savings':max(0,row['read']*(inp-read_rate))}


def aggregate(rows, days=30, provider='all', now=None, catalog=None):
    now = time.time() if now is None else now
    # Rolling 24 hours; longer ranges include today and the preceding calendar days.
    today = dt.datetime.fromtimestamp(now).date()
    cutoff = now-86400 if days==1 else dt.datetime.combine(today-dt.timedelta(days=days-1),dt.time()).timestamp()
    catalog = catalog or load(HOME_DIR/'.t3/userdata/usage-model-rates.json') or load(ROOT/'rates.json')
    rates = catalog.get('document',{})
    selected=[r for r in rows if cutoff<=r['at']<=now and (provider=='all' or r['provider']==provider) and sum(r[k] for k in ['input','read','write','output'])>0]
    def empty(name):return {'name':name,'tokens':0,'input':0,'read':0,'write':0,'output':0,'cost':0,'cost_parts':[0,0,0,0],'savings':0,'unpriced':0,'sessions':set()}
    total, providers, models, daily = empty('Total'), {}, {}, {}
    for r in selected:
        p=r['provider'];m=r['model'];day=dt.datetime.fromtimestamp(r['at']).strftime('%Y-%m-%d')
        price_info=price(r,rates)
        buckets=[total,providers.setdefault(p,empty(p)),models.setdefault((p,m),{**empty(m),'provider':p}),daily.setdefault((day,p),{**empty(day),'provider':p})]
        for b in buckets:
            for k in ['input','read','write','output']:b[k]+=r[k]
            processed=sum(r[k] for k in ['input','read','write','output'])
            b['tokens']+=processed;b['sessions'].add((p,r['session']))
            if price_info:
                b['cost']+=price_info['cost'];b['savings']+=price_info['savings']
                b['cost_parts']=[a+v for a,v in zip(b['cost_parts'],price_info['parts'])]
            else:b['unpriced']+=processed
    def clean(b):b['sessions']=len(b['sessions']);return b
    return {'at':now,'days':days,'provider':provider,'environment':'This Mac','total':clean(total),
            'providers':[clean(b) for b in providers.values()],
            'models':sorted([clean(b) for b in models.values()],key=lambda b:b['tokens'],reverse=True),
            'daily':sorted([clean(b) for b in daily.values()],key=lambda b:(b['name'],b['provider'])),
            'price_at':catalog.get('fetchedAtMs',0)/1000}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--limits',action='store_true');parser.add_argument('--days',type=int,choices=[1,7,30,90],default=30);parser.add_argument('--provider',choices=['all','claude','codex','opencode'],default='all')
    args=parser.parse_args()
    if args.limits:print(json.dumps(limits()))
    else:
        records, warnings=history();result=aggregate(records,args.days,args.provider);result['warnings']=warnings;print(json.dumps(result,separators=(',',':')))
