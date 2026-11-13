import test from 'node:test';
import assert from 'node:assert/strict';
import { findArrivals, latestArrival } from '../src/arrivals.ts';
import type { Incident } from '../src/types.ts';
const baseline='2026-10-29T10:00:00.000Z';
const report=(id:string,firstSeen:string):Incident=>({id,firstSeen,updatedAt:firstSeen,sourceId:'clipmaster',title:id,organization:id,url:`https://example.com/${id}`,publishedAt:'2026-10-29',region:'Japan',category:'Unauthorized access',severity:'High',severityBasis:'Inferred',summary:'',impact:'',sector:'',reportedStatus:'',saved:false,reviewed:false});
const old=report('old','2026-10-29T09:00:00.000Z');
const fresh=report('fresh','2026-10-29T10:01:00.000Z');
test('arrivals distinguish a new incident from added coverage of an existing group',()=>{
  const extra=report('extra','2026-10-29T10:01:10.000Z');
  const result=findArrivals([fresh,{...old,reports:[old,extra]}],new Set(['old']),baseline);
  assert.deepEqual(result.map(a=>[a.kind,a.reportIds]),[['incident',['fresh']],['coverage',['extra']]]);
});
test('rescanning, changing a representative and saving reports do not fabricate arrivals',()=>{
  const known=new Set(['old','fresh']);
  const regrouped={...fresh,saved:true,updatedAt:'2026-10-29T11:00:00.000Z',reports:[old,fresh]};
  assert.deepEqual(findArrivals([regrouped],known,baseline),[]);
});
test('enabling a source with preexisting cached reports does not announce a new incident',()=>{
  assert.deepEqual(findArrivals([old],new Set(),baseline),[]);
  assert.equal(findArrivals([{...old,reports:[old,fresh]}],new Set(),baseline)[0].kind,'coverage');
});
test('latest collected order uses immutable firstSeen across evidence, never rescan updatedAt',()=>{
  assert.equal(latestArrival({...old,updatedAt:'2026-10-29T12:00:00.000Z',reports:[old,fresh]}),fresh.firstSeen);
});
