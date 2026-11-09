import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { VIEW_MODES, viewMode, orderAgents, attentionGroups } from '../agent-views.js';
import { shellReading, shellCount, withShellState } from '../shell-state.js';
const fixture=[
 {address:'a',space:'one',tab:'t1',pane:'p1',status:'working',title:'Build interface',program:{name:'Codex',icon:'icons/codex.svg'}},
 {address:'b',space:'two',tab:'t2',pane:'p2',status:'blocked',title:'Fix parser',program:{name:'Claude',icon:'icons/claude.svg'}},
 {address:'c',space:'one',tab:'t1',pane:'p3',status:'idle',pinned:true,title:'Review code',program:{name:'Codex'}},
 {address:'d',space:'two',tab:'t2',pane:'p4',status:'done',title:'Run tests',program:{name:'Codex'}},
 {address:'e',space:'two',tab:'t2',pane:'p5',status:'new-status',title:'Other agent',program:{name:'Codex'}},
];
const ids=list=>list.map(a=>a.address);
assert.equal(viewMode(undefined),'workspaces');assert.equal(viewMode('bad'),'workspaces');
assert.deepEqual(ids(orderAgents(fixture,'agents')),['c','a','b','d','e']);
assert.deepEqual(ids(orderAgents(fixture.map(a=>({...a,status:'done'})),'agents')),['c','a','b','d','e'],'flat order must not jump when statuses change');
assert.deepEqual(ids(orderAgents(fixture,'attention')),['b','d','a','c','e']);
assert.equal(attentionGroups(fixture).at(-1).title,'Other');
assert.deepEqual(attentionGroups([]),[]);
assert.deepEqual(ids(fixture),['a','b','c','d','e'],'sorting must not mutate app state');

let elements=[],calls=[],mode='agents';
class Element{
 constructor(){return new Proxy(this,{get:(o,k,r)=>k in o?o[k]:(...a)=>r});}
 id(id){this.identifier=id;elements.push(this);return this;}
 child(x){assert.notEqual(x,null);if(typeof x==='string')this.text=x;return this;}
 tooltip(x){this.tip=x;return this;}
 on_mouse_down(_b,f){this.down=f;return this;}
 children(xs){xs.forEach(x=>this.child(x));return this;}
 when(c,f){if(c)f(this);return this;}
 on_click(f){this.click=f;return this;}
 hover(f){f(this);return this;}
}
const el=()=>new Element(), sp=[{id:'one',name:'Frontend',active:true,tabs:[{id:'t1',index:1}]},{id:'two',name:'Backend',tabs:[{id:'t2',index:1}]}];
const state={rice:{'sidebar.agentView':mode,'usage.codex':false},'space.colors':{one:'ansi6',two:'ansi3'}};
const scope={shellReading,shellCount,withShellState,homeDir:()=>"/home/test",VIEW_MODES,viewMode,orderAgents,attentionGroups,View:class{},div:el,sqDiv:el,image:el,svg:el,v_flex:el,h_flex:el,
 console,Date,Math,Number,String,Boolean,Map,Set,Object,Array,JSON,
 shared:k=>state[k],sqShared:k=>state[k],setShared:(k,v)=>{state[k]=v;calls.push(['shared',k,v]);},
 spaces:()=>sp,machines:()=>[],panes:()=>fixture.map(a=>({terminal:a.address,pane:a.pane,tab:a.tab,cwd:'/repo'})),agents:()=>fixture,terminals:()=>[],
 theme:()=>new Proxy({},{get:()=> '#334455'}),layout:()=>({id:'sidebar',size:{px:268}}),window:()=>({active:true}),
 setAgentOrder:a=>calls.push(['order',Array.from(a)]),run:(...a)=>calls.push(['run',...a]),
 props:()=>({overlay:"view-menu"}),closeOverlay:()=>calls.push(["close"]),localStorage:{getItem:()=>null,setItem(){}},settings:()=>({}),watchFolder:async()=>{},openOverlay(){}};
vm.createContext(scope);
const source=fs.readFileSync(new URL('../main.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'').replace(/export function /g,'function ').replace('export default class','globalThis.TestView=class');
new vm.Script(source).runInContext(scope);
const view=new scope.TestView();Object.assign(view,{agentKeys:new Set(),changed:{},git:{},listFolded:false,boxesFolded:new Set(),folded:new Set(),shown:new Set(['one','two']),born:{},ordering:null,pressed:null,over:null,machines:[],reconnecting:{}});
const cx={notify(){},stop_propagation(){}};
const render=()=>{elements=[];calls=[];view.render();};
render();assert.deepEqual(calls.find(c=>c[0]==='order')[1],['c','a','b','d','e']);
assert(!elements.some(e=>e.identifier==='agent-view-switch'),'no separate selector row');
assert(elements.some(e=>e.identifier==='agent-view-menu'),'selector belongs in existing header');
view.menuHandle={focus(){}};view.renderViewMenu();
const switchButton=elements.find(e=>e.identifier==='agent-view-attention');switchButton.click({},cx);
assert(calls.some(c=>c[0]==='close'),'choosing a view closes the popup');
assert.equal(state.rice['sidebar.agentView'],'attention');assert.equal(state.rice['usage.codex'],false,'switching must retain other settings');
render();assert.deepEqual(calls.find(c=>c[0]==='order')[1],['b','d','a','c','e']);
assert(elements.find(e=>e.identifier==='attention-blocked'));
elements.find(e=>e.identifier==='ag-b').click({},cx);assert(calls.some(c=>c[0]==='run'&&c[1]==='pane.focus'&&c[2].pane==='p2'));
assert(!elements.some(e=>e.identifier==='agent-browse-workspaces'),'no browse-workspaces footer');
state.rice['sidebar.agentView']='workspaces';render();assert(elements.find(e=>e.identifier==='space-one'));
scope.agents=()=>[];state.rice['sidebar.agentView']='agents';render();assert(!elements.find(e=>e.identifier==='agent-browse-workspaces'));
console.log('PASS: stable flat order, pinned agents, attention groups, unknown/empty states, preserved settings, workspace view, navigation order, agent actions and removed footer.');

const waitingAgent = withShellState(fixture[3], {seq: fixture[3].seq, at: Date.now(), count: 2});
assert.equal(waitingAgent.status, 'waiting');
assert.equal(attentionGroups([waitingAgent])[0].title, 'Waiting for shells');
scope.agents = () => [fixture[3]];
view.shellReadings = {d: {seq: fixture[3].seq, at: Date.now(), count: 2}};
state.rice['sidebar.agentView'] = 'attention';
render();
assert(elements.find(e => e.identifier === 'attention-waiting'));
assert.equal(shellCount('✻ Worked for 42s · done 2:14 PM · 2 shells still running'), 2);
assert.equal(shellCount('✻ Worked for 42s · done 2:14 PM · 1 shell still running'), 1);
assert.equal(shellCount('Agent says 2 shells still running'), 0);
assert.equal(shellCount('✻ Worked for 42s · done 2:14 PM · 2 shells still running\n✻ Baked for 1s · done 2:15 PM'), 0);
for (const status of ['working', 'blocked']) {
 assert.equal(withShellState({...fixture[3], status}, {seq: fixture[3].seq, at: Date.now(), count: 2}).status, status);
}
assert.equal(withShellState(fixture[3], {seq: 'old', at: Date.now(), count: 2}).status, 'done');
assert.equal(withShellState(fixture[3], {seq: fixture[3].seq, at: Date.now() - 16000, count: 2}).status, 'done');
assert.equal(withShellState(fixture[3], {seq: fixture[3].seq, at: Date.now(), count: 0}).status, 'done');
console.log('PASS: shell footer detection, completion clearing, stale reads, state priority and waiting group rendering.');

const codexScreen = `Worked for 6s • 14:52
1 background terminal running · /ps to view · /stop to close
› Ask Codex to do anything
GPT-6.1-Sol low · ~ · Ready · Context 13% used · 5h 95% left
← for agents · ? for shortcuts`;
const codexReading = {...shellReading(codexScreen), seq: 7, at: Date.now()};
assert.equal(codexReading.count, 1);
const codexAgent = {...fixture[0], app: 'codex', seq: 7};
assert.equal(withShellState(codexAgent, codexReading).status, 'waiting');
assert.equal(withShellState(codexAgent, {...shellReading(codexScreen.replace('Ready', 'Working')), seq: 7, at: Date.now()}).status, 'working');
assert.equal(withShellState({...codexAgent, status:'blocked'}, codexReading).status, 'blocked');
assert.equal(withShellState({...codexAgent, seq:8}, codexReading).status, 'working');
for (const app of ['opencode', 'claude-code', 'codex', 'another-agent']) {
 const agent = {...fixture[0], app, status: 'idle'};
 const jobs = [{terminal: agent.address}];
 assert.equal(withShellState(agent, undefined, jobs, Date.now()).status, 'waiting', app);
 assert.equal(withShellState({...agent, status:'working'}, undefined, jobs, Date.now()).status, 'working', app);
 assert.equal(withShellState({...agent, status:'blocked'}, undefined, jobs, Date.now()).status, 'blocked', app);
 assert.equal(withShellState(agent, undefined, [], Date.now()).status, 'idle', app);
 assert.equal(withShellState(agent, undefined, jobs, Date.now()-16000).status, 'idle', app);
 assert.equal(withShellState(agent, undefined, [{terminal:'another-terminal',cwd:'/repo'}], Date.now()).status, 'idle', app);
}
scope.agents = () => [codexAgent];
view.shellReadings = {[codexAgent.address]:codexReading};
state.rice['sidebar.agentView'] = 'attention';
render();
assert(elements.find(e => e.identifier === 'attention-waiting'));
assert(!elements.find(e => e.identifier === 'attention-working'));
scope.agents = () => [{...fixture[0], app:'opencode',status:'idle'}];
view.shellReadings = {};
view.jobs = [{terminal:fixture[0].address}]; view.jobsAt = Date.now();
render(); assert(elements.find(e => e.identifier === 'attention-waiting'));
console.log('PASS: Codex Ready vs Working, screenshot regression, OpenCode/Claude/other agent job ownership, completion, stale scans and permission priority.');
const readAgents = [
 {...fixture[0],address:'codex', app:'codex',seq:7},
 {...fixture[0],address:'claude',app:'claude-code',status:'idle'},
 {...fixture[0],address:'opencode',app:'opencode',status:'idle'},
 {...fixture[0],address:'other',app:'other-agent',status:'idle'},
];
scope.agents = () => readAgents;
const readAddresses = [];
scope.hc = async args => {readAddresses.push(args[1]); return {code:0, stdout:args[1]==='codex'?codexScreen:''};};
view.refreshShells({spawn: f => {scope.readTask = f({notify(){}});}});
await scope.readTask;
assert.deepEqual(readAddresses,['codex','claude','opencode','other']);
assert.equal(view.shellReadings.codex.ready,true);
scope.hc = async () => {throw new Error('terminal gone');};
view.refreshShells({spawn: f => {scope.readTask = f({notify(){}});}});
await scope.readTask;
assert.equal(Object.keys(view.shellReadings).length,0);
console.log('PASS: live-reader integration includes all agents and clears failed reads.');
// Detached session: its live jobs are displayed by folder association because
// they retain no viewer terminal ID. Status must follow those very same rows.
scope.agents = () => [];
scope.panes = () => [{pane:'p-silent',terminal:'silent',tab:'t1',cwd:'/detached-project',status:null,program:{key:'opencode',name:'OpenCode'}}];
view.agentKeys = new Set(['opencode']);
view.jobs = [{pid:101, terminal:null,cwd:'/detached-project',label:'build',age:120},
 {pid:102, terminal:'old-terminal',cwd:'/detached-project',label:'worker',age:90}];
view.jobsAt = Date.now();
view.shellReadings = {};
state.rice['sidebar.agentView'] = 'attention';
render();
assert(elements.find(e => e.identifier === 'attention-waiting'));
assert.equal(view.ctx.visibleAgents[0].shells,2);
assert.equal(view.ctx.jobsOf.get('silent').length,2);
state.rice['sidebar.agentView'] = 'workspaces';
render();
assert.equal(view.ctx.bySpace.get('one')[0].status,'waiting');
view.jobs = [];
render();
assert.equal(view.ctx.bySpace.get('one')[0].status,'idle');
console.log('PASS: detached statusless agent with two displayed shells shows waiting in Spaces and Attention, then clears when shells finish.');
// Shells live behind the waiting dot, never in the agent list.
const shell={pid:201,terminal:'w',cwd:'/repo',label:'pnpm test',age:120,log:'/repo/logs/test.log'};
scope.agents=()=>[{...fixture[0],address:'w',pane:'p-w',tab:'t1',status:'idle',app:'opencode'}];
scope.panes=()=>[{terminal:'w',pane:'p-w',tab:'t1',cwd:'/repo'}];
view.jobs=[shell];view.jobsAt=Date.now();view.shellReadings={};
state.rice['sidebar.agentView']='workspaces';
const overlays=[];scope.openOverlay=spec=>{overlays.push(spec);return 'o';};
render();
assert(!elements.some(e=>/^(job-|jobs-more-)/.test(e.identifier??'')),'no inline shell rows');
const dot=elements.find(e=>e.identifier==='shells-w');
assert.equal(dot.tip,'Waiting for background shells');
let stops=0;const stopping={notify(){},stop_propagation(){stops++;}};
dot.down({},stopping);dot.click({},stopping);
assert.equal(stops,2,'the dot must keep its press and click from the row');
assert(!calls.some(c=>c[0]==='run'&&c[1]==='pane.focus'));
assert.equal(overlays.at(-1).props.shellMenu,true);assert.equal(overlays.at(-1).props.agent,'w');
const popupProps={overlay:'shells',shellMenu:true,agent:'w',title:'Tests',program:'OpenCode',jobs:[shell]};
const renderPopup=()=>{elements=[];calls=[];view.renderShellMenu();};
scope.props=()=>popupProps;view.menuHandle={focus(){}};view.menuAt=0;view.sawShells=true;
renderPopup();
assert.equal(scope.shellDetail(shell),'logs/test.log');
const pick=elements.find(e=>e.identifier==='shell-pick-201');assert(pick,'shell listed');
scope.hc=async()=>({code:0,stdout:'{"address":"v1"}'});scope.terminals=()=>[{address:'v1'}];
let opening;const spawning={...stopping,spawn:f=>{opening=f(stopping);}};
pick.click({},spawning);await opening;
assert(calls.some(c=>c[0]==='run'&&c[1]==='terminal.peek'&&c[2].terminal==='v1'),'existing viewer opens');
assert(calls.some(c=>c[0]==='close'),'popup closes once the viewer is open');
view.openingPid=undefined;
view.jobs=[{...shell,pid:202,label:'pnpm build'}];renderPopup();
assert(elements.find(e=>e.identifier==='shell-pick-202'),'list follows shells starting');
assert(!elements.find(e=>e.identifier==='shell-pick-201'),'list follows shells finishing');
view.jobs=[];renderPopup();
assert.equal(elements.find(e=>e.identifier==='shell-empty-title').text,'All shells finished');
view.sawShells=false;scope.props=()=>({...popupProps,jobs:[],reported:2});renderPopup();
assert.equal(elements.find(e=>e.identifier==='shell-empty-title').text,'Shell details unavailable');
view.jobsFailed=true;renderPopup();
assert.equal(elements.find(e=>e.identifier==='shell-empty-title').text,"Couldn't read shells");
view.jobsFailed=false;
console.log('PASS: shells stay out of the agent list, the dot opens a live popup without focusing the row, and empty states are clear.');
// A backgrounded session reports no status: its screen decides between running and waiting.
for (const line of ['✻ Deliberating… (10s · ↓ 913 tokens · thought for 2s)','· Percolating… (4m 7s · ↓ 26.3k tokens)','* Moseying… (34s · ↓ 2.9k tokens)'])
 assert.equal(shellReading(line).busy,true,line);
for (const line of ['✻ Worked for 42s · done 2:14 PM · 2 shells still running','Running 2 shell commands…','• Thinking… about this (later)',''])
 assert.equal(shellReading(line).busy,false,line);
const silentAgent={address:'bg',status:'idle',program:{key:'claude'}};
const busyScreen={seq:undefined,at:Date.now(),count:1,busy:true};
const quietScreen={...busyScreen,busy:false};
const ownJobs=[{terminal:'bg'}];
assert.equal(withShellState(silentAgent,busyScreen,ownJobs,Date.now()).status,'working','replying beats waiting');
assert.equal(withShellState(silentAgent,quietScreen,ownJobs,Date.now()).status,'waiting','only shells left means waiting');
assert.equal(withShellState(silentAgent,{...busyScreen,at:Date.now()-16000},[],0).status,'idle','stale screens are ignored');
assert.equal(withShellState({...silentAgent,status:'blocked'},busyScreen,ownJobs,Date.now()).status,'blocked');
assert.equal(withShellState({...silentAgent,seq:4,status:'done'},{...busyScreen,seq:4,count:0},[],0).status,'done','agents that report status keep their own');
console.log('PASS: a backgrounded session shows running while replying and waiting once only shells remain.');
