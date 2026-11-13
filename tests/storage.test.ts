import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_PATH=':memory:';
const { db, saveReports, getReports, updateSource, getSources, addWatchTerm, getWatchlist } = await import('../server/db.ts');
const { parseRss } = await import('../server/parsers.ts');

test('repeated collection preserves save/review state and does not duplicate reports',()=>{
  const [r]=parseRss('<rss><channel><item><title>Security report</title><link>https://example.com/report</link><pubDate>Wed, 28 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>','https://example.com','bleeping','Global');
  saveReports([r]);db.prepare('UPDATE reports SET saved=1,reviewed=1 WHERE id=?').run(r.id);
  saveReports([{...r,title:'Updated security report'}]);
  const rows=getReports();assert.equal(rows.length,1);assert.equal(rows[0].title,'Updated security report');assert.equal(rows[0].saved,true);assert.equal(rows[0].reviewed,true);
});
test('collection failure retains cached records and last successful timestamp',()=>{
  updateSource('bleeping','healthy',1,null);const success=getSources().find(s=>s.id==='bleeping')!.lastSuccess;
  updateSource('bleeping','error',0,'Publisher returned HTTP 503');
  assert.equal(getReports().length,1);const source=getSources().find(s=>s.id==='bleeping')!;
  assert.equal(source.lastSuccess,success);assert.equal(source.status,'error');assert.match(source.error!,/503/);
});
test('watchlists are stored and survive report collection',()=>{
  addWatchTerm('Microsoft');assert.equal(getWatchlist()[0].term,'Microsoft');saveReports([]);assert.equal(getWatchlist().length,1);
});
