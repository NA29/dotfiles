import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../model.js';
const elements=[];
class Element{
 constructor(){this.handlers={};this.childrenList=[];return new Proxy(this,{get:(o,k,r)=>k in o?o[k]:(...a)=>r});}
 id(id){this.identifier=id;elements.push(this);return this;}
 child(x){assert.notEqual(x,null);this.childrenList.push(x);return this;}
 children(xs){xs.forEach(x=>this.child(x));return this;}
 when(on,f){if(on)f(this);return this;}
 on_click(f){this.handlers.click=f;return this;}
 on_key_down(f){this.handlers.key=f;return this;}
 hover(f){f(this);return this;}
}
const el=()=>new Element(),path=()=>new Proxy({},{get:(o,k)=>k==='build'?()=>({}):()=>path()});
let closed=0,loads=0,refreshes=0;
const scope={...model,console,Date,Math,Number,String,Map,Array,Boolean,
 div:el,image:el,svg:el,v_flex:el,h_flex:el,PathBuilder:{fill:path,stroke:path},Background:{pattern_slash:()=>({})},window:{paint_path:el},
 theme:()=>new Proxy({},{get:()=> '#334455'}),props:()=>({overlay:'usage'}),closeOverlay:()=>closed++,agents:()=>[],tint:c=>c,
 localStorage:{setItem(){}}};
vm.createContext(scope);
let source=fs.readFileSync(new URL('../dashboard.js',import.meta.url),'utf8').replace(/^import .*?;\s*$/gm,'').replace(/export /g,'');
source+='\nglobalThis.renderDashboard=dashboard;';new vm.Script(source).runInContext(scope);
const total={tokens:1000,input:100,read:800,write:50,output:50,cost:0.02,cost_parts:[0.002,0.008,0.003,0.007],savings:0.01,unpriced:0,sessions:1};
const analytics={at:Date.now()/1000,days:30,provider:'all',total,providers:[{...total,name:'codex'}],models:[{...total,name:'example-model',provider:'codex'}],daily:[{...total,name:'2026-11-07',provider:'codex'}],price_at:Date.now()/1000,warnings:[]};
const view={tab:'cost',raw:{},period:30,providerFilter:'all',providerMenu:false,breakdown:'model',analytics,handle:{focus(){}},loadHistory(){loads++;},refresh(){refreshes++;}};
const cx={notify(){},stop_propagation(){}};
const render=()=>{elements.length=0;scope.renderDashboard(view,cx);};
const click=id=>{const e=elements.find(e=>e.identifier===id);assert(e,id);e.handlers.click({},cx);};
render();click('usage-view-tokens');assert.equal(view.tab,'tokens');
render();click('usage-period-7');assert.equal(view.period,7);assert.equal(loads,1);
view.period=30;render();click('usage-provider-filter');assert.equal(view.providerMenu,true);
render();click('usage-filter-claude');assert.equal(view.providerFilter,'claude');assert.equal(loads,2);
view.providerFilter='all';render();click('usage-group-day');assert.equal(view.breakdown,'day');render();
click('usage-view-limits');render();
const key=elements.find(e=>e.identifier==='usage-dialog').handlers.key;
key({key:'1',key_char:'1',modifiers:{}},cx);assert.equal(view.tab,'cost');
key({key:'r',key_char:'r',modifiers:{}},cx);assert.equal(refreshes,1);
key({key:'escape',modifiers:{}},cx);assert.equal(closed,1);
view.analytics=null;render();view.historyError='Test failure';render();
console.log('PASS: Cost/Tokens/Limits renders, date/provider filters, model/day breakdown, keyboard navigation, refresh, Escape, loading/error states.');
