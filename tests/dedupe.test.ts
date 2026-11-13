import test from 'node:test';
import assert from 'node:assert/strict';
import { groupIncidents } from '../server/dedupe.ts';
import type { Incident } from '../src/types.ts';
const report=(id:string,title:string,date='2026-10-21',organization='GMOインターネット',sourceId='clipmaster',region:'Japan'|'Global'='Japan'):Incident=>({
  id,title,publishedAt:date,organization,sourceId,region,url:`https://example.com/${id}`,category:'Unauthorized access',severity:'High',severityBasis:'Inferred',summary:'',impact:'Not disclosed',sector:'Not specified',reportedStatus:'Investigating',firstSeen:'2026-10-29T00:00:00Z',updatedAt:'2026-10-29T00:00:00Z',saved:false,reviewed:false,
});
test('automatically merges GMO / お名前.com follow-ups across sources and languages',()=>{
  const input=[report('1','GMOインターネット：「お名前.com デスクトップクラウド」に不正アクセス'),
    report('2','「お名前.com デスクトップクラウド」に不正アクセス、見舞金として一律5,000円','2026-10-27','','scannet'),
    report('3',"Japan's GMO Offers $1 Million Bounty to Catch Hackers Behind FX Trading Cloud Breach",'2026-10-28','','thehackernews','Global'),
    report('4','OANDA証券（お名前.com デスクトップクラウド不正アクセス）','2026-10-22','OANDA証券'),
    report('5','GMOリサーチ&AI：アンケートサイト「infoQ」に不正アクセス','2026-10-05','GMOリサーチ&AI'),
    report('6','ConoHa WING byGMO に不正アクセス','2026-10-14',''),
  ];
  const groups=groupIncidents(input);assert.equal(groups.length,3);
  const desktop=groups.find(g=>g.reports?.some(r=>r.id==='1'))!;assert.equal(desktop.reportCount,4);
  assert.deepEqual(new Set(desktop.regions),new Set(['Japan','Global']));assert.equal(desktop.publishedAt,'2026-10-21');assert.equal(desktop.latestPublishedAt,'2026-10-28');
  assert.equal(desktop.reports?.length,4);
});
test('a shared company and date never merge different affected systems',()=>{
  const input=[report('1','日本経済新聞社：Microsoft 365アカウントが乗っ取られる','2026-10-04','日本経済新聞社','japanhacked'),
    report('2','日本経済新聞社員の Microsoft 365 アカウントに不正ログイン','2026-10-04','株式会社日本経済新聞社','incident-radar'),
    report('3','日本経済新聞社：社員のGoogle Workspaceアカウントに不正ログイン','2026-10-04','日本経済新聞社','japanhacked'),
    report('4','日本経済新聞社 · グーグルワークスペースのアカウント','2026-10-04','日本経済新聞社','clipmaster')];
  const groups=groupIncidents(input);assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.reportCount),[2,2]);
});
test('recurrences remain separate and all evidence and user state are retained',()=>{
  const a=report('1','お名前.com デスクトップクラウドに不正アクセス');const b={...report('2','お名前.com デスクトップクラウドに不正アクセス','2026-10-27'),saved:true,reviewed:true};
  const later=report('3','お名前.com デスクトップクラウドに不正アクセス','2027-03-01');
  const groups=groupIncidents([a,b,later]);assert.equal(groups.length,2);const group=groups.find(g=>g.reportCount===2)!;
  assert.equal(group.saved,true);assert.equal(group.reviewed,false);assert.equal(groups.reduce((n,g)=>n+g.reports!.length,0),3);
  assert.deepEqual(groupIncidents([later,b,a]).map(g=>g.id),groups.map(g=>g.id));
});
test('new explicitly named provider incidents are grouped automatically across affected customers',()=>{
  const input=[report('1','Example Cloudに不正アクセス','2026-10-01','Example Cloud','japanhacked'),
    report('2','被害組織A（Example Cloud不正アクセス） · 顧客情報','2026-10-05','被害組織A（Example Cloud不正アクセス）'),
    report('3','被害組織B（Example Cloud不正アクセス） · 配信先リスト','2026-10-07','被害組織B（Example Cloud不正アクセス）'),
    report('4','被害組織B（Other Cloud不正アクセス） · 別の事案','2026-10-07','被害組織B（Other Cloud不正アクセス）')];
  const groups=groupIncidents(input);assert.equal(groups.length,2);assert.ok(groups.some(g=>g.reportCount===3));
});
