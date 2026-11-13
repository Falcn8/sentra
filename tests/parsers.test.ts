import test from 'node:test';
import assert from 'node:assert/strict';
import { clipmasterCaseList, parseRadar, parseJapanHacked, parseClipmaster, parseScanNet, parseRss, inferSeverity, classify, nextPage } from '../server/parsers.ts';
import { privateAddress, validatePublicUrl } from '../server/network.ts';

test('Radar preserves source-specific metadata and stable identifiers',()=>{
  const html='<table class="itable"><tbody><tr><td><a href="/incident/test/">テスト組織</a><span class="itable__title">会員情報の漏えい</span></td><td><time datetime="2026-10-27"></time></td><td>通信</td><td>原因未公表</td><td>—</td><td>2,141,986件</td><td>漏えい確認</td></tr></tbody></table>';
  const [r]=parseRadar(html,'https://incident-radar.com');
  assert.equal(r.organization,'テスト組織');assert.equal(r.impact,'2,141,986件');assert.equal(r.publishedAt,'2026-10-27');
  assert.equal(r.severity,'Critical');assert.match(r.severityBasis,/Inferred/);assert.equal(r.url,'https://incident-radar.com/incident/test/');
  assert.equal(r.id,parseRadar(html,'https://incident-radar.com')[0].id);
});
test('JapanHacked prioritizes the publisher severity and de-duplicates duplicate markup',()=>{
  const row='<tr><td>2026-10-27</td><td>2026-10-27 19:58</td><td><a href="/incidents/example"><span class="text-org">組織</span>：不正アクセス</a></td><td>[重大]</td><td>組織</td><td>東京都</td><td>不正侵入</td><td>情報漏洩</td><td>2585481</td><td>[調査中]</td></tr>';
  const list=parseJapanHacked(`<table><tbody>${row}${row}</tbody></table>`,'https://japanhacked.jp');
  assert.equal(list.length,1);assert.equal(list[0].severity,'Critical');assert.match(list[0].severityBasis,/Reported by source/);
  assert.equal(list[0].reportedStatus,'調査中');
});
test('ClipMaster decodes entities and preserves line break boundaries',()=>{
  const [r]=parseClipmaster('<table><tbody><tr><td>2026/10/28</td><td><a href="/cases/test">R&amp;D<br>メール配信サービス</a></td><td>A 外部攻撃<br>漏えい確認</td><td>調査中</td></tr></tbody></table>','https://jouhourouei.clipmaster.jp');
  assert.equal(r.title,'R&D · メール配信サービス');assert.equal(r.organization,'R&D');assert.equal(r.publishedAt,'2026-10-28');
  assert.equal(r.impact,'調査中');
});
test('ClipMaster follows only the case list for the same publisher and month', () => {
  const summary = 'https://jouhourouei.clipmaster.jp/months/2026-11';
  const caseList = `${summary}/cases`;
  const unrelated = `
    <a href="https://other.example/months/2026-11/cases">Other publisher</a>
    <a href="/months/2026-10/cases">Previous month</a>
  `;
  assert.equal(clipmasterCaseList(unrelated, summary), null);
  assert.equal(clipmasterCaseList(`${unrelated}<a href="/months/2026-11/cases">Case list</a>`, summary), caseList);
  assert.equal(clipmasterCaseList(`<a href="${caseList}">Case list</a>`, caseList), null);

  const table = '<table><tbody><tr><td>2026/11/12</td><td><a href="/cases/test">組織</a></td><td>調査中</td><td>非公表</td></tr></tbody></table>';
  assert.deepEqual(parseClipmaster(table, caseList), parseClipmaster(table, summary));
});
test('ScanNet extracts only the main archive listings, with subscription metadata',()=>{
  const [r]=parseScanNet('<div class="main-news"><div class="news-list"><section class="item item--members"><a class="link" href="/article/2026/10/28/1.html"><h2 class="title">不正アクセスの報告</h2><span class="group">インシデント</span><time datetime="2026-10-28T08:00:00+09:00"></time></a></section></div></div><aside><h2>Related report</h2></aside>','https://s.netsecurity.ne.jp');
  assert.equal(r.title,'不正アクセスの報告');assert.match(r.reportedStatus,/subscription/);
});
test('RSS and Atom support dated entries and reject script links or undated content',()=>{
  const rss='<rss><channel><item><title>Ransomware report</title><link>https://news.example/a</link><pubDate>Wed, 28 Oct 2026 09:00:00 GMT</pubDate><description>Unneeded body</description></item><item><title>Undated</title><link>https://news.example/b</link></item><item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Wed, 28 Oct 2026 09:00:00 GMT</pubDate></item></channel></rss>';
  const list=parseRss(rss,'https://news.example','custom','Global');assert.equal(list.length,1);assert.equal(list[0].category,'Ransomware');assert.equal(list[0].summary,'');
  const atom='<feed><entry><title>New vulnerability</title><link href="https://news.example/c" rel="alternate"/><updated>2026-10-27T10:00:00Z</updated></entry></feed>';
  assert.equal(parseRss(atom,'https://news.example','custom','Global')[0].publishedAt,'2026-10-27');
  assert.throws(()=>parseRss('<html>Not a feed</html>','https://example.com','x','Global'),/RSS or Atom/);
});
test('severity inference does not treat arbitrary dates and mixed impact numbers as populations',()=>{
  assert.equal(inferSeverity('Oct 2026 report','Other','2025年9月 4,238,242件と追加16件').severity,'Unrated');
  assert.equal(inferSeverity('Unclassified report','Other').severity,'Unrated');
  assert.equal(classify('ランサムウェアによる情報漏えい'),'Ransomware');
});
test('pagination recognizes mobile archive head links and Japanese directory controls',()=>{
  assert.equal(nextPage('<link rel="next" href="/archive/?page=2">','https://example.com/archive/'),'https://example.com/archive/?page=2');
  assert.equal(nextPage('<a aria-label="次のページ" href="/incidents?page=2">→</a>','https://japanhacked.jp'),'https://japanhacked.jp/incidents?page=2');
});
test('custom feed input rejects local, private, credentialed and non-HTTPS URLs',async()=>{
  for(const value of ['http://example.com/feed','https://localhost/feed','https://127.0.0.1/feed','https://192.168.1.1/feed','https://[::1]/feed','https://user:secret@example.com/feed','https://example.com:3000/feed'])await assert.rejects(validatePublicUrl(value));
  for(const ip of ['10.1.1.1','172.16.0.1','169.254.169.254','::1','fc00::1','fe80::1','::ffff:127.0.0.1'])assert.equal(privateAddress(ip),true,ip);
  assert.equal(privateAddress('8.8.8.8'),false);assert.equal(privateAddress('2606:4700:4700::1111'),false);
});
