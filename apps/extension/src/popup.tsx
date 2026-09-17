import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Context,ExportSchema} from '../../../packages/shared/src/schema';
import {Task} from './state';
import './style.css';
function App(){
 const [task,setTask]=useState<Task|null>(null),[context,setContext]=useState<Context|null>(null),[error,setError]=useState('');
 async function command(type:string){try{const r=await chrome.runtime.sendMessage({type});setTask(r.task??null);setContext(r.context??null);setError(r.error??'');}catch{setError('扩展后台暂不可用，请重新打开面板。');}}
 useEffect(()=>{void command('GET');const timer=setInterval(()=>void command('GET'),2000);return()=>clearInterval(timer);},[]);
 const result=task?.result;const current=context;
 function download(){const parsed=ExportSchema.safeParse(result);if(!parsed.success){setError('JSON schema 校验失败，禁止导出。');return;}
 const url=URL.createObjectURL(new Blob([JSON.stringify(parsed.data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`leetcode-${parsed.data.extractionId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 return <main><header><span>LEETCODE / EXTRACTION POC · 0.4.0</span><h1>Company lists</h1></header><aside>支持 Google 全部 5 个范围：30 days、3 months、6 months、More than 6 months、All。无需滚动，在任何位置均可提取完整 recency 题单。忽略页面额外搜索、难度/topic 筛选与排序；提取期间请勿切换范围。</aside>
 <dl><dt>Company</dt><dd>{current?.company.name??current?.company.slug??'未识别'}{current&&!current.company.name?'（URL slug）':''}</dd>
 <dt>Recency</dt><dd>{current?.recency.label??current?.recency.raw??'未知'}{current&&!current.recency.label?'（原始 URL 值，含义未验证）':''}</dd>
 <dt>提取范围</dt><dd>完整公司 + recency（不应用页面额外筛选）</dd><dt>提取状态</dt><dd>{task?.status??'idle'}</dd><dt>API 报告总数</dt><dd>{result?.expectedTotal??'未知'}</dd><dt>已提取 / 去重</dt><dd>{result?.extractedCount??task?.count??0}</dd><dt>缺少必需字段</dt><dd>{result?.coverage.missingRequired??'未检测'}</dd><dt>缺少 topics</dt><dd>{result?.coverage.missingTopics??'未检测'}</dd><dt>集合完整性</dt><dd>{result?.completeness??'未判定'}</dd></dl>
 {task&&<p role="status">{task.message}</p>}{task&&<small>上次任务：{task.context.company.slug} / {task.context.recency.raw??'未知'}。任务结果属于此范围。</small>}
 {error&&<p role="alert">{error}</p>}{result?.warnings.map((w,i)=><p key={i}>{w}</p>)}
 <div className="actions"><button disabled={!context||task?.status==='running'} onClick={()=>void command('START')}>Extract problems</button><button disabled={!context||task?.status==='running'} onClick={()=>void command('START')}>Retry</button>{task?.status==='running'&&<button onClick={()=>void command('CANCEL')}>Cancel</button>}<button disabled={!result||task?.status==='running'} onClick={download}>Export JSON</button></div>
 <h2>结果预览</h2>{result?.problems.slice(0,5).map(p=><article key={p.slug}><a href={p.url} target="_blank" rel="noreferrer">{p.frontendId} {p.title}</a><p>{p.difficulty??'难度未知'} · {p.topics.join(', ')||'topics 缺失'}</p></article>)??<p className="muted">尚无提取结果。此界面不填充演示题目。</p>}
 <footer>数据仅保存在本机；仅向当前 LeetCode 会话发送列表读取请求；不导出凭证和个人进度。</footer></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
