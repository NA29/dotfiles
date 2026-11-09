import { div, image, svg, PathBuilder, Background } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, agents } from "herdr";
import { readings, untilText, dateText, pct, WEEK } from "./model.js";
import { tint } from "./box.js";
const SANS="Geist", MONO="Geist Mono";
const PROVIDERS=[['codex','Codex','icons/codex.svg'],['claude','Claude Code','icons/claude.svg'],['opencode','OpenCode','icons/opencode.svg']];
const nameOf=id=>PROVIDERS.find(p=>p[0]===id)?.[1]??id;
const iconOf=id=>PROVIDERS.find(p=>p[0]===id)?.[2];
const providerIcon=(id,size,t)=>id==='opencode'?svg(iconOf(id)).size(size).text_color(t.foreground):image(iconOf(id)).size(size);
const estimate=p=>p.tokens>0&&p.unpriced===p.tokens?'Unpriced':money(p.cost);
// Personal: selection strength. A wash that reads on dark looks heavy on white.
const selA = (t) => (parseInt(String(t.chrome).slice(1, 3), 16) > 128 ? 0.12 : 0.20);
const colorOf=(t,id)=>id==='claude'?'#d97757':id==='codex'?t.foreground:t.ansi4;
export const compact=n=>n>=1e9?`${(n/1e9).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}B`:n>=1e6?`${(n/1e6).toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}M`:n>=1e3?`${(n/1e3).toFixed(1).replace(/\.0$/,'')}K`:String(Math.round(n));
export const money=n=>'$'+Number(n??0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const percent=(n,total)=>!total?'0%':n/total*100<0.1&&n>0?'<0.1%':`${(n/total*100).toFixed(1)}%`;
const label=(text,t,size=12)=>div().font_family(SANS).text_size(size).text_color(t.muted).child(text);
const number=(text,t,size=12)=>div().font_family(MONO).text_size(size).text_color(t.foreground).child(String(text));
const rect=()=>PathBuilder.fill().move_to('0%','0%').line_to('100%','0%').line_to('100%','100%').line_to('0%','100%').close().build();
function chip(id,text,on,action,t){return div().id(id).px(10).h(28).flex_none().flex().items_center().justify_center().rounded(6).bg(on?tint(t.accent,selA(t)):tint(t.foreground,0.06)).text_color(on?t.foreground:t.muted).font_family(SANS).text_size(12).cursor_pointer().hover(h=>h.bg(t.hover).text_color(t.foreground)).on_click(action).child(text);}
function heading(text,t){return div().font_family(SANS).text_size(13).font_semibold().text_color(t.foreground).child(text);}

function chart(v,t,data){
 const days=v.period===1?2:v.period;
 const end=new Date((data.at??Date.now()/1000)*1000);end.setHours(0,0,0,0);
 const dates=Array.from({length:days},(_,i)=>{const d=new Date(end);d.setDate(d.getDate()-(days-1-i));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
 const metric=v.tab==='cost'?'cost':'tokens';
 const points=data.providers.map(p=>({id:p.name,values:dates.map(day=>data.daily.find(d=>d.name===day&&d.provider===p.name)?.[metric]??0)}));
 const rawMax=Math.max(1,...points.flatMap(p=>p.values));
 const magnitude=10**Math.floor(Math.log10(rawMax));
 const max=Math.ceil(rawMax/magnitude)*magnitude;
 const paths=[];
 for(const p of points){
  const line=PathBuilder.stroke(2),area=PathBuilder.fill();area.move_to('0%','100%');
  p.values.forEach((n,i)=>{const x=`${i/(days-1)*100}%`,y=`${100-n/max*92}%`;if(i===0)line.move_to(x,y);else line.line_to(x,y);area.line_to(x,y);});
  area.line_to('100%','100%').close();
  paths.push(window.paint_path(area.build(),tint(colorOf(t,p.id),0.10)).absolute().size_full());
  paths.push(window.paint_path(line.build(),colorOf(t,p.id)).absolute().size_full());
 }
 const grid=[0,0.333,0.667,1].map(f=>div().absolute().top(`${f*100}%`).left(0).right(0).h(1).bg(tint(t.foreground,0.08)));
 const hover=dates.map((day,i)=>div().id(`usage-chart-day-${i}`).absolute().top(0).bottom(0).left(`${Math.max(0,i/(days-1)*100-50/days)}%`).w(`${100/days}%`)
  .tooltip(`${day}\n`+points.map(p=>`${nameOf(p.id)}: ${metric==='cost'?money(p.values[i]):compact(p.values[i])}`).join('\n')));
 return v_flex().flex_1().min_w(0).gap(12)
  .child(heading(v.tab==='cost'?'Daily estimated cost':'Daily processed tokens',t))
  .child(h_flex().h(225).gap(10)
   .child(v_flex().w(62).h_full().flex_none().justify_between().items_end().children([1,2/3,1/3,0].map(f=>label(metric==='cost'?money(max*f):compact(max*f),t,10))))
   .child(div().id('usage-chart').relative().h_full().flex_1().min_w(0).overflow_hidden().children(grid).children(paths).children(hover)))
  .child(h_flex().ml(72).justify_between().children([dates[0],dates[Math.floor((days-1)/2)],dates[days-1]].map(d=>label(d.slice(5),t,10))));
}

function totals(v,t,data){
 const a=data.total;
 const items=[['Processed tokens',compact(a.tokens)],['Cached input',compact(a.read)],['Uncached input',compact(a.input)],['Output',compact(a.output)],['Cache savings',money(a.savings)]];
 const values=v.tab==='cost'?a.cost_parts:[a.input,a.read,a.write,a.output];const sum=values.reduce((a,b)=>a+b,0);
 const colors=[tint(t.foreground,0.35),tint(t.foreground,0.15),tint(t.foreground,0.5),t.foreground];
 const names=['Input','Cache read','Cache write','Output'];
 return v_flex().gap(18)
  .child(heading('Totals',t))
  .child(h_flex().gap(16).children(items.map(([key,value])=>v_flex().flex_1().min_w(0).gap(8).child(label(key,t,11)).child(number(value,t,16)))))
  .child(v_flex().pt(10).gap(10).child(heading(v.tab==='cost'?'Cost by type':'Tokens by type',t))
   .child(h_flex().w_full().h(7).rounded(3).overflow_hidden().bg(t.border).children(values.map((value,i)=>div().w(sum?`${value/sum*100}%`:0).h_full().bg(colors[i]))))
   .child(h_flex().gap(16).flex_wrap().children(values.map((value,i)=>h_flex().gap(6).items_center().child(div().size(6).rounded(1).bg(colors[i])).child(label(`${names[i]}  ${v.tab==='cost'?money(value):compact(value)}`,t,11))))));
}

function breakdown(v,t,data,cx){
 const byDay=v.breakdown==='day';const metric=v.tab==='cost'?'cost':'tokens';
 let rows=data.models;
 if(byDay){const map=new Map();for(const d of data.daily){const r=map.get(d.name)??{name:d.name,cost:0,tokens:0,unpriced:0};r.cost+=d.cost;r.tokens+=d.tokens;r.unpriced+=d.unpriced;map.set(d.name,r);}rows=[...map.values()].sort((a,b)=>b.name.localeCompare(a.name));}
 else rows=[...rows].sort((a,b)=>b[metric]-a[metric]);
 const choose=key=>(_e,c)=>{v.breakdown=key;v.handle.focus();c.notify();};
 const row=(r,i)=>v_flex().id(`usage-breakdown-${i}`).gap(8).py(10)
  .child(h_flex().gap(12).items_center()
   .child(label(String(i+1),t,11).w(20).flex_none())
   .child(h_flex().flex_1().min_w(0).gap(8).items_center()
    .when(!byDay&&Boolean(iconOf(r.provider)),el=>el.child(providerIcon(r.provider,13,t).flex_none()))
    .child(div().font_family(SANS).text_size(12).text_color(t.foreground).truncate().child(r.name)))
   .child(number(r.unpriced===r.tokens&&r.tokens>0?'Unpriced':money(r.cost),t).w(100).text_right().flex_none())
   .child(label(percent(r[metric],data.total[metric]),t,11).w(65).text_right().flex_none())
   .child(number(compact(r.tokens),t).w(85).text_right().flex_none()))
  .child(div().ml(32).h(2).child(div().h_full().w(`${Math.max(0.1,100*r[metric]/Math.max(1,...rows.map(r=>r[metric])))}%`).bg(colorOf(t,r.provider))));
 return v_flex().gap(10).pt(10)
  .child(h_flex().items_center().child(heading('Breakdown',t)).child(div().flex_1())
   .child(chip('usage-group-model','Model',!byDay,choose('model'),t)).child(chip('usage-group-day','Day',byDay,choose('day'),t)))
  .child(h_flex().gap(12).py(6).child(label('#',t,10).w(20)).child(label(byDay?'Day':'Model',t,10).flex_1()).child(label('Cost',t,10).w(100).text_right()).child(label('Share',t,10).w(65).text_right()).child(label('Tokens',t,10).w(85).text_right()))
  .children(rows.map(row));
}

function analytics(v,t,cx){
 const d=v.analytics;
 if(!d||d.days!==v.period||d.provider!==v.providerFilter)return v_flex().p(30).gap(12).child(heading(v.historyError?'Could not load usage history':'Reading local usage history…',t)).child(label(v.historyError??'The first scan may take a few seconds.',t));
 const cost=v.tab==='cost';const total=cost?estimate(d.total):compact(d.total.tokens);
 const summary=v_flex().w(270).flex_none().gap(8)
  .child(number(total,t,36).font_semibold())
  .child(label(`${d.total.sessions} sessions${cost?' · API estimate':''}`,t,11))
  .child(v_flex().pt(14).gap(18).children(d.providers.map(p=>v_flex().gap(8)
   .child(h_flex().gap(8).items_center().child(div().size(6).rounded_full().bg(colorOf(t,p.name)))
    .child(providerIcon(p.name,14,t)).child(label(nameOf(p.name),t,12)).child(label(`${p.sessions} sessions`,t,10)).child(div().flex_1()).child(number(cost?estimate(p):compact(p.tokens),t)))
   .child(label(`${percent(p[cost?'cost':'tokens'],d.total[cost?'cost':'tokens'])} of ${cost?'cost':'tokens'} · ${cost?compact(p.tokens)+' tokens':estimate(p)}`,t,11)))))
  .when(d.total.unpriced>0,el=>el.child(label(`${compact(d.total.unpriced)} tokens have no known price.`,t,11)));
 return v_flex().w_full().max_w(1060).gap(30)
  .child(h_flex().gap(28).child(summary).child(chart(v,t,d)))
  .when(d.total.tokens===0,el=>el.child(label('No recorded usage in this period. Choose a longer range or another provider.',t)))
  .child(totals(v,t,d)).child(breakdown(v,t,d,cx))
  .child(label(`API-equivalent estimates, not subscription charges. Rates snapshot: ${dateText(d.price_at)}. All local workspaces are included.`,t,10))
  .when(Boolean(d.warnings?.length),el=>el.child(label(d.warnings.join(' · '),t,10)));
}

function limitRow(v,t,name,w,color,now){
 const known=Boolean(w&&!w.expired),remaining=known?100-w.used:null;
 const elapsed=w?.resets&&w?.minutes?Math.max(0,Math.min(100,(now-(w.resets-w.minutes*60))/(w.minutes*60)*100)):null;
 const reset=w?.expired?'Awaiting new reading':w?.resets?`↻ ${untilText(w.resets-now)}`:'No reset time reported';
 const track=div().relative().flex_1().min_w(0).h(10).rounded(5).overflow_hidden().bg(tint(color,0.12))
  .when(known,el=>el.child(div().absolute().left(0).top(0).h_full().w(`${remaining}%`).rounded(5).bg(color)))
  .when(elapsed!=null,el=>el.child(div().absolute().top(0).bottom(0).left(`${100-elapsed}%`).w(2).bg(t.foreground).tooltip('Time-based allowance pace marker')));
 return h_flex().gap(20).p(16).rounded(6).bg(tint(t.foreground, 0.06)).items_center()
  .child(v_flex().w(170).flex_none().gap(6).child(label(name,t,12))
   .child(h_flex().gap(6).items_end().child(number(known?pct(remaining):'—',t,28).font_semibold()).child(label('left',t,11).pb(4))))
  .child(v_flex().flex_1().min_w(0).gap(10).child(track)
   .child(h_flex().justify_between().items_center().gap(12).child(label(w?.expired?`Last reported ${pct(w.used)} used · reset passed`:known?`${pct(w.used)} used${w.resets?' · '+dateText(w.resets):''}${w.at&&now-w.at>600?' · reported '+untilText(now-w.at)+' ago':''}`:'No provider reading available for this window',t,11)).child(label(reset,t,11).flex_none())));
}

function limits(v,t){
 const now=Date.now()/1000,raw=readings(v.raw.claude,v.raw.codex,now);
 const list=PROVIDERS.filter(p=>v.providerFilter==='all'||v.providerFilter===p[0]);
 return v_flex().w_full().max_w(1060).gap(26).children(list.map(([id,name,icon])=>{
  const d=raw[id],source=v.raw[id],color=colorOf(t,id);
  const expired=d?.five?.expired||d?.week?.expired;
  return v_flex().gap(10)
   .child(h_flex().gap(8).items_center().child(providerIcon(id,17,t)).child(heading(name,t))
    .when(Boolean(d?.plan),el=>el.child(label(String(d.plan),t,11)))
    .child(div().flex_1())
    .when(Boolean(source?.reset_credits?.availableCount),el=>el.child(label(`${source.reset_credits.availableCount} reset credits`,t,11)))
    .child(label(d?.at?(now-d.at<60?'Updated just now':`Updated ${untilText(Math.max(0,now-d.at))} ago`):'No reading yet',t,10)))
   .when(id!=='opencode',el=>el.child(v_flex().gap(10)
    .child(limitRow(v,t,'Session · 5 hours',d?.five,color,now)).child(limitRow(v,t,'Weekly',d?.week,color,now))
    .children((d?.extra??[]).map(w=>limitRow(v,t,w.label,w.value,color,now)))))
   .when(id==='opencode',el=>el.child(label('OpenCode session history is included in Cost and Tokens. Account limits are not reported in the local history.',t)))
   .when(expired,el=>el.child(label('A reset has passed. The previous percentage is retained as history until a new provider reading arrives.',t,11)));
 }));
}

export function dashboard(v,cx){
 const t=theme(),close=()=>closeOverlay(props().overlay);
 const chooseTab=tab=>(_e,c)=>{v.tab=tab;localStorage.setItem('usage.tab',tab);v.handle.focus();c.notify();if(tab!=='limits'&&!v.analytics)v.loadHistory(c);};
 const provider=key=>(_e,c)=>{v.providerFilter=key;v.providerMenu=false;v.handle.focus();c.notify();v.loadHistory(c);};
 const header=h_flex().min_h(46).px(12).py(6).gap(8).items_center().flex_wrap().bg(tint(t.foreground, 0.06)).rounded(6)
  .child(heading('Usage',t)).child(label('/',t))
  .child(div().font_family(SANS).text_size(12).text_color(t.muted).tooltip('Local histories across all workspaces on this Mac').child('This Mac'))
  .child(label('/',t)).child(chip('usage-provider-filter',
   h_flex().gap(6).items_center()
    .child(div().child(v.providerFilter==='all'?'All providers':nameOf(v.providerFilter)))
    .child(svg('mods/workspace-chrome/chevron-down.svg').size(12).flex_none()),
   v.providerMenu,(_e,c)=>{v.providerMenu=!v.providerMenu;c.notify();},t))
  .child(div().flex_1())
  .when(v.tab!=='limits',el=>el.child(h_flex().gap(2).children([[1,'Past 24h'],[7,'7 days'],[30,'30 days'],[90,'90 days']].map(([n,text])=>chip(`usage-period-${n}`,text,v.period===n,(_e,c)=>{v.period=n;v.handle.focus();c.notify();v.loadHistory(c);},t)))))
  .child(h_flex().gap(2).ml(4).children(['cost','tokens','limits'].map(key=>chip(`usage-view-${key}`,key[0].toUpperCase()+key.slice(1),v.tab===key,chooseTab(key),t))))
  .child(chip('usage-refresh',(v.refreshing||v.historyLoading)?'…':svg('mods/my-settings/reset.svg').size(14),false,(_e,c)=>{v.refresh(c);if(v.tab!=='limits')v.loadHistory(c);v.handle.focus();},t).tooltip('Reload limits and local usage history'))
  .child(chip('usage-close',svg('mods/my-settings/x.svg').size(14),false,close,t));
 return v_flex().id('usage-dialog').size_full().track_focus(v.handle)
  .on_key_down((e,c)=>{
   const plain=!e.modifiers.control&&!e.modifiers.alt&&!e.modifiers.platform,k=e.key_char??e.key;
   if(e.key==='escape'){if(v.providerMenu){v.providerMenu=false;c.notify();}else close();c.stop_propagation();return;}
   if(!plain)return;
   if(k==='q')close();
   else if(k==='r'||k==='R'){v.refresh(c);if(v.tab!=='limits')v.loadHistory(c);}
   else if(['1','2','3'].includes(k))chooseTab(['cost','tokens','limits'][Number(k)-1])(e,c);
   else if(['h','l','left','right','tab'].includes(k)){const tabs=['cost','tokens','limits'],i=tabs.indexOf(v.tab);chooseTab(tabs[(i+(['h','left'].includes(k)?2:1))%3])(e,c);}
   else return;c.stop_propagation();
  })
  .child(v_flex().size_full().p(5).gap(8).rounded(12).border_1().border_color(t.border).overflow_hidden().bg(t.chrome).text_color(t.foreground)
   .child(header)
   .when(v.providerMenu,el=>el.child(h_flex().px(12).py(6).gap(6).flex_none().children([['all','All providers'],...PROVIDERS.map(p=>[p[0],p[1]])].map(([id,name])=>chip(`usage-filter-${id}`,name,v.providerFilter===id,provider(id),t)))))
   .child(v_flex().id('usage-scroll').flex_1().min_h(0).overflow_y_scrollbar().px(28).py(22).items_center()
    .child(v.tab==='limits'?limits(v,t):analytics(v,t,cx)))
   .child(h_flex().h(26).px(12).flex_none().gap(8).items_center().child(label('1 Cost · 2 Tokens · 3 Limits · R refresh',t,11)).child(div().flex_1()).child(label('Local time · Esc closes',t,11))));
}
