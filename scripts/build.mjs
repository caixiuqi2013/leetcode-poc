import {build} from 'esbuild';
import {mkdir,copyFile,rm} from 'node:fs/promises';
const out='apps/extension/dist';await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await build({entryPoints:['apps/extension/src/popup.tsx','apps/extension/src/worker.ts','apps/extension/src/content.ts'],outdir:out,bundle:true,format:'iife',target:'chrome120',minify:true,define:{'process.env.NODE_ENV':'"production"'},legalComments:'none'});
await Promise.all(['manifest.json','popup.html'].map(f=>copyFile(`apps/extension/${f}`,`${out}/${f}`)));
console.log(`Load unpacked: ${out}`);
