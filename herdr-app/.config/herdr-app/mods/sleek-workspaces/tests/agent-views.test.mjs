import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { VIEW_MODES, viewMode, orderAgents, attentionGroups } from '../agent-views.js';
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
 child(x){assert.notEqual(x,null);return this;}
 children(xs){xs.forEach(x=>this.child(x));return this;}
 when(c,f){if(c)f(this);return this;}
 on_click(f){this.click=f;return this;}
 hover(f){f(this);return this;}
}
const el=()=>new Element(), sp=[{id:'one',name:'Frontend',active:true,tabs:[{id:'t1',index:1}]},{id:'two',name:'Backend',tabs:[{id:'t2',index:1}]}];
const state={rice:{'sidebar.agentView':mode,'usage.codex':false},'space.colors':{one:'ansi6',two:'ansi3'}};
const scope={VIEW_MODES,viewMode,orderAgents,attentionGroups,View:class{},div:el,sqDiv:el,image:el,svg:el,v_flex:el,h_flex:el,
 console,Date,Math,Number,String,Boolean,Map,Set,Object,Array,JSON,
 shared:k=>state[k],sqShared:k=>state[k],setShared:(k,v)=>{state[k]=v;calls.push(['shared',k,v]);},
 spaces:()=>sp,machines:()=>[],panes:()=>fixture.map(a=>({pane:a.pane,tab:a.tab,cwd:'/repo'})),agents:()=>fixture,terminals:()=>[],
 theme:()=>new Proxy({},{get:()=> '#334455'}),layout:()=>({id:'sidebar',size:{px:268}}),window:()=>({active:true}),
 setAgentOrder:a=>calls.push(['order',Array.from(a)]),run:(...a)=>calls.push(['run',...a]),
 props:()=>({overlay:"view-menu"}),closeOverlay:()=>calls.push(["close"]),localStorage:{getItem:()=>null,setItem(){}},settings:()=>({}),watchFolder:async()=>{},openOverlay(){}};
vm.createContext(scope);
const source=fs.readFileSync(new URL('../main.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'').replace(/export function /g,'function ').replace('export default class','globalThis.TestView=class');
new vm.Script(source).runInContext(scope);
const view=new scope.TestView();Object.assign(view,{changed:{},git:{},listFolded:false,boxesFolded:new Set(),folded:new Set(),shown:new Set(['one','two']),born:{},ordering:null,pressed:null,over:null,machines:[],reconnecting:{}});
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
