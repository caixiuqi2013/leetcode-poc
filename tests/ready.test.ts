import {test} from 'node:test';import assert from 'node:assert/strict';
import {waitForReady} from '../packages/shared/src/ready';
test('waits for recency rendering without requiring problem rows',async()=>{let attempts=0;const result=await waitForReady(()=>{if(++attempts<3)throw new Error('context-not-ready');return {label:'All'};},new AbortController().signal,{pollMs:1});assert.equal(result.label,'All');assert.equal(attempts,3);});
test('scope changing while waiting fails rather than choosing new scope',async()=>{let attempts=0;await assert.rejects(waitForReady(()=>{throw new Error(++attempts===1?'context-not-ready':'context-changed');},new AbortController().signal,{pollMs:1}),/context-changed/);});
test('cancel interrupts readiness wait promptly',async()=>{const c=new AbortController();const p=waitForReady(()=>{throw new Error('context-not-ready');},c.signal);c.abort(new Error('cancelled'));await assert.rejects(p,/cancelled/);});
test('unsupported scope is never retried',async()=>{let count=0;await assert.rejects(waitForReady(()=>{count++;throw new Error('unsupported-scope');},new AbortController().signal),/unsupported-scope/);assert.equal(count,1);});
test('readiness timeout remains explicitly not ready',async()=>{await assert.rejects(waitForReady(()=>{throw new Error('context-not-ready');},new AbortController().signal,{timeoutMs:0}),/context-not-ready/);});
