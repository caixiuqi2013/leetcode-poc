import {test} from 'node:test';import assert from 'node:assert/strict';import {runInNewContext} from 'node:vm';import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('tests/fixtures/google-thirty-days.page1.json','utf8')).favoriteQuestionList;
const code=readFileSync('apps/extension/dist/content.js','utf8');
import type {Context} from '../packages/shared/src/schema';
const ranges=[['google-thirty-days','30 days',30],['google-three-months','3 months',null],['google-six-months','6 months',null],['google-more-than-six-months','More than 6 months',null],['google-all','All',null]] as const;
const context:Context={sourceUrl:'https://leetcode.com/company/google/?favoriteSlug=google-thirty-days',company:{slug:'google',name:'Google'},recency:{raw:'google-thirty-days',label:'30 days',days:30}};
function harness(fetcher:(url:string,init:any)=>Promise<any>,ids=fixture.questions.map((p:any)=>String(p.id)), initial:Context=context, labelOverride?:string){
 let handler:(m:any,s:any,r:(x:any)=>void)=>void=()=>{};let complete:(value:any)=>void=()=>{};const end=new Promise<any>(resolve=>complete=resolve);const events:any[]=[];const listeners=new Map<string,Function>();
 const location=new URL(initial.sourceUrl);const search={value:''};const extraCombos:string[]=[];
 const document={documentElement:{},querySelectorAll:(selector:string)=>selector==='h1'?[{textContent:'Google'}]:selector==='[role="combobox"]'?[{textContent:labelOverride??ranges.find(r=>r[0]===location.searchParams.get('favoriteSlug'))?.[1]??'Unknown'},...extraCombos.map(textContent=>({textContent}))]:ids.map((id:string)=>({id,href:`https://leetcode.com/problems/example?envType=company&envId=google&favoriteSlug=${location.searchParams.get('favoriteSlug')}`})),querySelector:()=>search,addEventListener:(k:string,f:Function)=>listeners.set(k,f),removeEventListener:(k:string)=>listeners.delete(k)};
 const chrome={runtime:{id:'test',onMessage:{addListener:(f:typeof handler)=>handler=f},sendMessage:async(e:any)=>{events.push(e);if(e.type==='DONE'||e.type==='FAIL')complete(e);return {accepted:true};}}};
 const window={addEventListener:(k:string,f:Function)=>listeners.set(k,f),removeEventListener:(k:string)=>listeners.delete(k)};
 class Observer {constructor(callback:Function){listeners.set('mutation',callback);}observe(){}disconnect(){listeners.delete('mutation');}}
 runInNewContext(code,{chrome,document,window,MutationObserver:Observer,location,URL,crypto,fetch:fetcher,AbortSignal,AbortController,setInterval,clearInterval,setTimeout,clearTimeout,console});
 return {events,end,location,search,extraCombos,mutate:()=>listeners.get('mutation')?.(),click:()=>listeners.get('click')?.({isTrusted:true}),send:(m:any)=>new Promise<any>(resolve=>handler(m,{id:'test'},resolve))};
}
const ok=(body:any)=>({status:200,ok:true,text:async()=>JSON.stringify({data:body})});
const run=async(h:ReturnType<typeof harness>,scope:Context=context)=>{const id=crypto.randomUUID();await h.send({type:'RUN',id,context:scope});return id;};
test('built content script sends observed same-origin POST, persists checkpoint and verifies API completeness (synthetic terminal)',async()=>{
 const calls:any[]=[];const h=harness(async(url,init)=>{calls.push({url,init});return ok({favoriteQuestionList:{...fixture,totalLength:100,hasMore:false}});});await run(h);const e=await h.end;
 assert.equal(e.type,'DONE');assert.equal(e.result.completeness,'complete');assert.equal(e.result.coverage.missingTopics,1);assert.equal(h.events[0].type,'PROGRESS');assert.equal(h.events[0].result.completeness,'partial');assert.equal(calls[0].url,'https://leetcode.com/graphql/');assert.equal(calls[0].init.credentials,'same-origin');assert.equal(JSON.parse(calls[0].init.body).variables.skip,0);
});
test('content pagination uses skip=100 and reports mid-page rate limit as partial',async()=>{const offsets:number[]=[];const h=harness(async(_url,init)=>{const skip=JSON.parse(init.body).variables.skip;offsets.push(skip);return skip===0?ok({favoriteQuestionList:fixture}):{status:429,ok:false};});await run(h);const e=await h.end;assert.deepEqual(offsets,[0,100]);assert.equal(e.type,'DONE');assert.equal(e.result.completeness,'partial');assert.ok(e.result.warnings.includes('rate-limited'));});
test('content denies HTTP 403 without claiming empty data',async()=>{const h=harness(async()=>({status:403,ok:false}));await run(h);const e=await h.end;assert.equal(e.type,'FAIL');assert.equal(e.code,'no-access');assert.equal(h.events.some(e=>e.type==='DONE'),false);});
test('observed recency change aborts pending network operation and discards data',async()=>{let started:()=>void=()=>{};const start=new Promise<void>(r=>started=r);const h=harness(async(_u,init)=>{started();return new Promise((_res,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('abort'))));});await run(h);await start;h.location.search='?favoriteSlug=google-all';h.mutate();const e=await h.end;assert.equal(e.type,'FAIL');assert.equal(e.code,'context-changed');});
test('context URL change during response prevents any checkpoint',async()=>{let finish:(v:any)=>void=()=>{};let started:()=>void=()=>{};const start=new Promise<void>(r=>started=r);const h=harness(async()=>{started();return new Promise(r=>finish=r);});await run(h);await start;h.location.search='?favoriteSlug=google-three-months';finish(ok({favoriteQuestionList:fixture}));const e=await h.end;assert.equal(e.type,'FAIL');assert.equal(e.code,'context-changed');assert.equal(h.events.some(e=>e.type==='PROGRESS'),false);});

for(const [raw,label,days] of ranges)test(`scope ${label}: actual observed mapping reaches request and export (simulated response)`,async()=>{
 const scope:Context={...context,sourceUrl:`https://leetcode.com/company/google/?favoriteSlug=${raw}`,recency:{raw,label,days}};
 const sent:string[]=[];const h=harness(async(_u,init)=>{sent.push(JSON.parse(init.body).variables.favoriteSlug);return ok({favoriteQuestionList:{...fixture,totalLength:100,hasMore:false}});},undefined,scope);
 assert.deepEqual(JSON.parse(JSON.stringify((await h.send({type:'PROBE'})).context)),scope);
 await run(h,scope);const e=await h.end;assert.equal(e.type,'DONE');assert.deepEqual(sent,[raw]);assert.equal(e.result.completeness,'complete');assert.deepEqual(JSON.parse(JSON.stringify(e.result.recency)),{raw,label,days});
});
test('new scope URL with previous label is rejected while SPA is still rendering',async()=>{
 const scope:Context={...context,sourceUrl:'https://leetcode.com/company/google/?favoriteSlug=google-all',recency:{raw:'google-all',label:'All',days:null}};
 const h=harness(async()=>{throw new Error('must not fetch');},undefined,scope,'6 months');assert.equal((await h.send({type:'PROBE'})).error,'context-not-ready');
});
test('unknown recency still fails closed',async()=>{
 const scope:Context={...context,sourceUrl:'https://leetcode.com/company/google/?favoriteSlug=google-new-scope',recency:{raw:'google-new-scope',label:'All',days:null}};
 const h=harness(async()=>{throw new Error('must not fetch');},undefined,scope,'All');assert.equal((await h.send({type:'PROBE'})).error,'unsupported-scope');
});

// Synthetic pagination envelopes built from the real 152-row export. Not live network tests.
const realExport=JSON.parse(readFileSync('examples/google-thirty-days.live.complete.json','utf8'));
const allRows=realExport.problems.map((p:any)=>({id:Number(p.leetcodeId),questionFrontendId:p.frontendId,title:p.title,titleSlug:p.slug,difficulty:p.difficulty.toUpperCase(),topicTags:p.topics.map((name:string)=>({name,slug:'fixture-topic'})),frequency:p.frequency}));
for(const renderedIds of [[],['1'],allRows.slice(0,100).map((p:any)=>String(p.id)),['122','162']])test(`no-scroll full pagination with ${renderedIds.length} DOM rows (synthetic transport)`,async()=>{
 const offsets:number[]=[];const h=harness(async(_u,init)=>{const v=JSON.parse(init.body).variables;offsets.push(v.skip);const questions=allRows.slice(v.skip,v.skip+v.limit);return ok({favoriteQuestionList:{questions,totalLength:152,hasMore:v.skip+questions.length<152}});},renderedIds);
 await run(h);const event=await h.end;assert.equal(event.type,'DONE');assert.equal(event.result.completeness,'complete');assert.equal(event.result.extractedCount,152);assert.deepEqual(offsets,[0,100]);assert.equal(event.result.scope.kind,'company-recency');assert.equal(event.result.evidence.exhausted,true);
});
test('page search and DOM ordering do not silently redefine recency-only extraction',async()=>{
 let request:any;const h=harness(async(_u,init)=>{request=JSON.parse(init.body);return ok({favoriteQuestionList:{...fixture,totalLength:100,hasMore:false}});},['937','1']);h.search.value='Two Sum';
 assert.equal((await h.send({type:'PROBE'})).context.recency.raw,'google-thirty-days');await run(h);const event=await h.end;
 assert.equal(event.result.extractedCount,100);assert.equal(event.result.scope.pageFiltersApplied,false);assert.equal(event.result.scope.pageSortApplied,false);assert.equal(request.variables.searchKeyword,'');assert.equal(request.variables.sortBy.sortField,'CUSTOM');
});
test('incomplete last API page stays partial even when no DOM rows are rendered',async()=>{
 const h=harness(async()=>ok({favoriteQuestionList:{...fixture,hasMore:false}}),[]);await run(h);const e=await h.end;assert.equal(e.type,'DONE');assert.equal(e.result.completeness,'partial');assert.equal(e.result.expectedTotal,152);assert.equal(e.result.extractedCount,100);
});
test('authenticated explicit empty API result is complete independently of unloaded DOM',async()=>{
 const h=harness(async()=>ok({favoriteQuestionList:{questions:[],totalLength:0,hasMore:false}}),[]);await run(h);const e=await h.end;assert.equal(e.type,'DONE');assert.equal(e.result.completeness,'complete');assert.equal(e.result.extractedCount,0);
});

test('ordinary page click used to close popup does not cancel extraction',async()=>{
 let finish:(v:any)=>void=()=>{};let started:()=>void=()=>{};const start=new Promise<void>(r=>started=r);
 const h=harness(async()=>{started();return new Promise(r=>finish=r);},[]);await run(h);await start;h.click();h.mutate();finish(ok({favoriteQuestionList:{...fixture,totalLength:100,hasMore:false}}));
 const e=await h.end;assert.equal(e.type,'DONE');assert.equal(e.result.completeness,'complete');
});
test('explicit Cancel still aborts pending request',async()=>{
 let started:()=>void=()=>{};const start=new Promise<void>(r=>started=r);const h=harness(async(_u,init)=>{started();return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('abort'))));},[]);
 const id=await run(h);await start;await h.send({type:'CANCEL',id});const e=await h.end;assert.equal(e.type,'FAIL');assert.equal(e.code,'cancelled');
});

test('open filter Match=All combobox does not redefine current recency',async()=>{
 const h=harness(async()=>ok({favoriteQuestionList:{...fixture,totalLength:100,hasMore:false}}),[]);h.extraCombos.push('All');assert.equal((await h.send({type:'PROBE'})).context.recency.label,'30 days');await run(h);assert.equal((await h.end).result.completeness,'complete');
});
test('filter Match=All cannot hide a stale recency label during navigation to All',async()=>{
 const scope:Context={...context,sourceUrl:'https://leetcode.com/company/google/?favoriteSlug=google-all',recency:{raw:'google-all',label:'All',days:null}};
 const h=harness(async()=>{throw new Error('must not fetch');},[],scope,'6 months');h.extraCombos.push('All');assert.equal((await h.send({type:'PROBE'})).error,'context-not-ready');
});
