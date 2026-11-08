import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
def module(name, filename):
 s=importlib.util.spec_from_file_location(name,ROOT/filename);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
u=module('usage','usage.py');cache=module('claude_cache','claude-cache.py')
class UsageTests(unittest.TestCase):
 def test_streamed_claude_messages_are_not_counted_twice(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'test.jsonl'
   entries=[{'type':'assistant','timestamp':'2026-11-07T12:00:00Z','sessionId':'s','requestId':'r','message':{'id':'m','model':'model','usage':{'input_tokens':100,'cache_read_input_tokens':20,'cache_creation_input_tokens':30,'output_tokens':n}}} for n in [10,20]]
   p.write_text('\n'.join(map(json.dumps,entries))+'\n{broken')
   rows=u.parse_claude(p);self.assertEqual(len(rows),1);self.assertEqual(rows[0]['output'],20);self.assertEqual(rows[0]['input'],100)
 def test_codex_cumulative_events_duplicates_and_reset(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'log.jsonl';events=[{'type':'turn_context','payload':{'model':'test','service_tier':'priority'}}]
   for n,last in [(100,100),(100,100),(150,50),(100,100)]:
    events.append({'type':'event_msg','timestamp':f'2026-11-07T12:00:{len(events):02d}Z','payload':{'type':'token_count','info':{'total_token_usage':{'input_tokens':n,'cached_input_tokens':n//2,'output_tokens':n//10},'last_token_usage':{'input_tokens':last,'cached_input_tokens':last//2,'output_tokens':last//10}}}})
   p.write_text('\n'.join(map(json.dumps,events)));rows=u.parse_codex(p)
   self.assertEqual(len(rows),3);self.assertEqual(sum(r['input']+r['read'] for r in rows),250);self.assertEqual(sum(r['output'] for r in rows),25)
 def test_cost_totals_unknown_models_and_provider_filter(self):
  now=dt.datetime.now().timestamp()
  r=u.record('claude','session','priced',now-60,{'input':100,'read':200,'write':50,'output':10},'a')
  unknown=u.record('opencode','other','unknown',now-60,{'input':20},'b')
  rates={'document':{'priced':{'input_cost_per_token':1,'cache_read_input_token_cost':0.1,'cache_creation_input_token_cost':2,'output_cost_per_token':3}}}
  result=u.aggregate([r,unknown],30,now=now,catalog=rates)
  self.assertEqual(result['total']['tokens'],380);self.assertEqual(result['total']['cost'],250);self.assertEqual(result['total']['unpriced'],20);self.assertEqual(result['total']['sessions'],2)
  self.assertEqual(sum(p['tokens'] for p in result['providers']),result['total']['tokens'])
  self.assertEqual(sum(d['tokens'] for d in result['daily']),result['total']['tokens'])
  result=u.aggregate([r,unknown],30,'claude',now=now,catalog=rates);self.assertEqual(result['total']['tokens'],360)
 def test_rolling_24h_and_future_exclusion(self):
  now=dt.datetime.now().timestamp();rows=[u.record('codex','s','unknown',t,{'input':1},str(t)) for t in [now-86401,now-86399,now+1]]
  self.assertEqual(u.aggregate(rows,1,now=now)['total']['tokens'],1)
 def test_partial_statusline_preserves_session_window_and_its_timestamp(self):
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'claude.json'
   cache.update({'rate_limits':{'five_hour':{'used_percentage':85}}},path,100)
   cache.update({'rate_limits':{'seven_day':{'used_percentage':20}}},path,200)
   d=json.loads(path.read_text());self.assertEqual(d['rate_limits']['five_hour']['used_percentage'],85);self.assertEqual(d['rate_limits']['five_hour']['observed_at'],100)
   cache.update({'rate_limits':{'five_hour':None}},path,300)
   self.assertEqual(json.loads(path.read_text())['rate_limits']['five_hour']['used_percentage'],85)
 def test_newer_zero_reading_wins_over_old_statusline_window(self):
  with tempfile.TemporaryDirectory() as tmp:
   old_home=u.HOME_DIR;u.HOME_DIR=Path(tmp)
   try:
    p=u.HOME_DIR/'.t3/caches/claudeAgent.json';p.parent.mkdir(parents=True);p.write_text(json.dumps({'usageLimits':{'checkedAt':150,'windows':[{'kind':'session','id':'five_hour','usedPercent':0}]}}))
    q=u.HOME_DIR/'.cache/agent-usage/claude.json';q.parent.mkdir(parents=True);q.write_text(json.dumps({'at':200,'rate_limits':{'five_hour':{'used_percentage':85,'observed_at':100}}}))
    self.assertEqual(u.limits()['claude']['rate_limits']['five_hour']['used_percentage'],0)
   finally:u.HOME_DIR=old_home
if __name__=='__main__':unittest.main()
