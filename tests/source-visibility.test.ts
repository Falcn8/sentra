import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { groupIncidents } from '../server/dedupe.ts';
import type { ParsedReport } from '../server/parsers.ts';

process.env.DATABASE_PATH=':memory:';
const {db,saveReports,getReports}=await import('../server/db.ts');

const report=(id:string,sourceId:string,title:string,region:'Japan'|'Global'='Japan',publishedAt='2026-10-21'):ParsedReport=>({
  id,sourceId,title,region,publishedAt,url:`https://example.com/${id}`,organization:'',
  category:'Unauthorized access',severity:'High',severityBasis:'Inferred',summary:'',impact:'Not disclosed',sector:'Not specified',reportedStatus:'Investigating',
});
const visibleIncidents=()=>groupIncidents(getReports({enabledOnly:true}));

beforeEach(()=>{db.exec('DELETE FROM reports; UPDATE sources SET enabled=1');});

test('disabled sources are excluded before grouping, including evidence, dates, and regions',()=>{
  saveReports([
    report('japan','japanhacked','GMOインターネット：「お名前.com デスクトップクラウド」に不正アクセス'),
    report('global','thehackernews',"Japan's GMO Offers $1 Million Bounty to Catch Hackers Behind FX Trading Cloud Breach",'Global','2026-10-20'),
    report('global-only','thehackernews','Unrelated overseas bank incident','Global'),
  ]);
  db.prepare('UPDATE reports SET saved=1,reviewed=1 WHERE id=?').run('global');
  assert.equal(visibleIncidents().length,2);
  db.prepare('UPDATE sources SET enabled=0 WHERE id=?').run('thehackernews');
  const visible=visibleIncidents();
  assert.equal(visible.length,1);
  assert.equal(visible[0].id,'japan');
  assert.equal(visible[0].reportCount,1);
  assert.equal(visible[0].publishedAt,'2026-10-21');
  assert.deepEqual(visible[0].regions,['Japan']);
  assert.deepEqual(visible[0].reports?.map(r=>r.sourceId),['japanhacked']);
  assert.equal(visible[0].saved,false);
  assert.equal(visible[0].reviewed,false);
  assert.equal(getReports({enabledOnly:true}).length,1);
  assert.equal(getReports().length,3);
  db.prepare('UPDATE sources SET enabled=1 WHERE id=?').run('thehackernews');
  const restored=visibleIncidents().find(i=>i.reportCount===2)!;
  assert.ok(restored);
  assert.equal(restored.saved,true);
  assert.deepEqual(new Set(restored.regions),new Set(['Japan','Global']));
  assert.equal(getReports().find(r=>r.id==='global')?.reviewed,true);
});

test('disabling a representative source yields an actionable remaining incident',()=>{
  saveReports([
    report('one','incident-radar','お名前.com デスクトップクラウドに不正アクセス'),
    report('two','clipmaster','お名前.com デスクトップクラウドに不正アクセス'),
  ]);
  const original=visibleIncidents()[0];
  assert.equal(original.reportCount,2);
  db.prepare('UPDATE sources SET enabled=0 WHERE id=?').run(original.sourceId);
  const remaining=visibleIncidents()[0];
  assert.notEqual(remaining.id,original.id);
  assert.equal(remaining.reportCount,1);
  // Resolve the ID using the same enabled-source grouping used by the PATCH route.
  const actionable=visibleIncidents().find(i=>i.id===remaining.id)!;
  assert.ok(actionable);
  for(const evidence of actionable.reports||[actionable])db.prepare('UPDATE reports SET saved=1 WHERE id=?').run(evidence.id);
  assert.equal(getReports().find(r=>r.id===remaining.id)?.saved,true);
  assert.equal(getReports().find(r=>r.id===original.id)?.saved,false);
});

test('all sources off returns no visible reports without deleting cached state',()=>{
  saveReports([report('cached','clipmaster','An incident with retained review state')]);
  db.prepare('UPDATE reports SET saved=1,reviewed=1 WHERE id=?').run('cached');
  db.exec('UPDATE sources SET enabled=0');
  assert.deepEqual(getReports({enabledOnly:true}),[]);
  assert.deepEqual(visibleIncidents(),[]);
  assert.equal(getReports().length,1);
  db.prepare('UPDATE sources SET enabled=1 WHERE id=?').run('clipmaster');
  assert.equal(visibleIncidents()[0].saved,true);
  assert.equal(visibleIncidents()[0].reviewed,true);
});
