import {z} from 'zod';
import {ContextSchema,ExportSchema,contextFromUrl} from '../../../packages/shared/src/schema';
import {Task,TaskSchema,recover,accept} from './state';
const Command=z.object({type:z.enum(['GET','START','CANCEL'])}).strict();
const Event=z.discriminatedUnion('type',[
 z.object({type:z.literal('HEARTBEAT'),id:z.string().uuid()}).strict(),
 z.object({type:z.enum(['PROGRESS','DONE']),id:z.string().uuid(),result:ExportSchema}).strict(),
 z.object({type:z.literal('FAIL'),id:z.string().uuid(),code:z.enum(['context-changed','cancelled','read-failed','no-access','not-loaded','rate-limited','source-unverified'])}).strict()
]);
let queue:Promise<unknown>=Promise.resolve();
const serial=<T>(fn:()=>Promise<T>):Promise<T>=>{const p=queue.then(fn,fn);queue=p.catch(()=>{});return p;};
async function read():Promise<Task|null>{const p=TaskSchema.safeParse((await chrome.storage.local.get('task')).task);return p.success?p.data:null;}
async function save(task:Task){await chrome.storage.local.set({task});}
async function stop(task:Task,status:Task['status'],message:string){const next={...task,status,message,updatedAt:Date.now(),result:undefined};await save(next);void chrome.tabs.sendMessage(task.tabId,{type:'CANCEL',id:task.id},task.documentId?{documentId:task.documentId}:{frameId:0}).catch(()=>{});return next;}
async function run(task:Task){
 try{
  const injected=await chrome.scripting.executeScript({target:{tabId:task.tabId},files:['content.js']});
  const documentId=injected.find(frame=>frame.frameId===0)?.documentId;
  if(!documentId)throw new Error('document-unavailable');
  const response=await chrome.tabs.sendMessage(task.tabId,{type:'PROBE',id:task.id,sourceUrl:task.context.sourceUrl},{documentId});
  if(response?.error)throw new Error(response.error);
  const context=ContextSchema.parse(response?.context);
  if(context.sourceUrl!==task.context.sourceUrl)throw new Error('context-changed');
  const ready=await serial(async()=>{const current=await read();if(!current||!accept(current,task.id))return false;await save({...current,context,documentId,updatedAt:Date.now(),message:'正在逐页提取…'});return true;});
  if(!ready)return;
  const ack=await chrome.tabs.sendMessage(task.tabId,{type:'RUN',id:task.id,context},{documentId});if(!ack?.ok)throw new Error('read-failed');
 }catch(e){await serial(async()=>{const current=await read();if(!current||!accept(current,task.id))return;const code=e instanceof Error?e.message:'';await stop(current,code==='context-changed'?'cancelled':code.startsWith('unsupported')||code==='context-not-ready'?'blocked':'failed',`未开始提取：${['context-changed','unsupported-scope','unsupported-search','context-not-ready'].includes(code)?code:'页面连接失败，请 Retry。'}`);});}
}
chrome.runtime.onMessage.addListener((raw,sender,reply)=>{
 if(sender.id!==chrome.runtime.id)return;
 if(sender.tab){
  const parsed=Event.safeParse(raw);if(!parsed.success){reply({accepted:false});return;}
  void serial(async()=>{const task=await read();const e=parsed.data;
   if(!task||!accept(task,e.id)||sender.tab?.id!==task.tabId||sender.frameId!==0||!task.documentId||sender.documentId!==task.documentId)return {accepted:false};
   // sender.url describes the sending script context; it is not the live SPA filter.
   // Use it only to restrict origin. Pin the document, then read the current tab URL.
   try{if(new URL(sender.url??'').origin!=='https://leetcode.com'||(sender.origin&&sender.origin!=='https://leetcode.com'))return {accepted:false};}catch{return {accepted:false};}
   let liveUrl:string;
   try{liveUrl=contextFromUrl((await chrome.tabs.get(task.tabId)).url??'').sourceUrl;}catch{await stop(task,'interrupted','无法读取当前来源页面，请 Retry。');return {accepted:false};}
   if(liveUrl!==task.context.sourceUrl){await stop(task,'cancelled','来源范围已改变。');return {accepted:false};}
   if(e.type==='HEARTBEAT'){await save({...task,updatedAt:Date.now()});return {accepted:true};}
   if(e.type==='FAIL'){
    if(e.code==='context-changed'||e.code==='cancelled')await stop(task,'cancelled','范围或筛选变化，已丢弃本次结果。');
    else await save({...task,status:'failed',updatedAt:Date.now(),message:`提取失败：${e.code}。已有 checkpoint 仅供调试。`});
    return {accepted:true};
   }
   if(e.result.sourceUrl!==task.context.sourceUrl||JSON.stringify(e.result.company)!==JSON.stringify(task.context.company)||JSON.stringify(e.result.recency)!==JSON.stringify(task.context.recency))return {accepted:false};
   if(e.type==='PROGRESS'&&e.result.completeness==='complete')return {accepted:false};
   await save({...task,result:e.result,count:e.result.extractedCount,status:e.type==='DONE'?'done':'running',message:e.type==='DONE'?`提取结束：${e.result.completeness}`:`已读取 ${e.result.extractedCount} / ${e.result.expectedTotal??'?'}，继续分页…`,updatedAt:Date.now()});return {accepted:true};
  }).then(reply,()=>reply({accepted:false}));return true;
 }
 if(sender.url!==chrome.runtime.getURL('popup.html'))return;
 const parsed=Command.safeParse(raw);if(!parsed.success){reply({error:'Invalid command'});return;}
 void serial(async()=>{
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});let context=null;try{context=contextFromUrl(tab?.url??'');}catch{}
  let task=await read();if(task){const next=recover(task,Date.now());if(next!==task)await save(next);task=next;}
  if(parsed.data.type==='CANCEL'&&task?.status==='running')task=await stop(task,'cancelled','已取消，本次结果已丢弃。');
  if(parsed.data.type==='START'){
   if(!context||tab?.id===undefined)return {error:'请先打开 LeetCode 公司页。',task,context};
   if(task?.status==='running')return {task,context};
   task={id:crypto.randomUUID(),tabId:tab.id,context,status:'running',updatedAt:Date.now(),message:'正在等待并核对当前范围（最多10秒）…',count:0};await save(task);void run(task);
  }
  if(task&&context?.sourceUrl===task.context.sourceUrl)context=task.context;
  return {task,context};
 }).then(reply,()=>reply({error:'Storage/browser API failed. Retry.'}));return true;
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(!change.url&&change.status!=='loading')return;void serial(async()=>{const task=await read();if(task?.tabId===tabId&&task.status==='running')await stop(task,'cancelled','页面导航，任务已中止。');});});
chrome.tabs.onRemoved.addListener(tabId=>{void serial(async()=>{const task=await read();if(task?.tabId===tabId&&task.status==='running')await save({...task,status:'interrupted',updatedAt:Date.now(),message:'来源页已关闭；仅保留部分 checkpoint。请 Retry。'});});});
