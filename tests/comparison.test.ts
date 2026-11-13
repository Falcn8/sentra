import test from 'node:test';
import assert from 'node:assert/strict';
import { buildComparison, comparisonWindows, monthsForWindow } from '../src/comparison.ts';
import type { DashboardData, Source } from '../src/types.ts';
const source:Source={id:'clipmaster',name:'ClipMaster',url:'https://example.com',kind:'HTML archive',region:'Japan',color:'#5278ef',abbreviation:'CM',enabled:true,status:'healthy',lastAttempt:null,lastSuccess:null,error:null,reportCount:0,fetchedCount:0,custom:false};
const report=(id:string,publishedAt:string)=>({id,publishedAt});
function checked(months:string[]):DashboardData['archiveCoverage']{return Object.fromEntries(months.map(month=>[month,{checkedAt:'2026-10-29T12:00:00Z',complete:true,sources:[{id:source.id,name:source.name,status:'healthy',count:0,error:null}]}]));}
const windows=comparisonWindows('2026-10-31','Monthly','2026-10-29');
const allMonths=[...new Set([windows.current,windows.previous,windows.reference].flatMap(monthsForWindow))];
test('month-to-date compares matched calendar cutoffs and annual reference',()=>{
 assert.deepEqual(windows.current,{start:'2026-10-01',end:'2026-10-29'});
 assert.deepEqual(windows.previous,{start:'2026-09-01',end:'2026-09-29'});
 assert.deepEqual(windows.reference,{start:'2025-10-01',end:'2025-10-29'});
 const result=buildComparison({reports:[report('a','2026-10-01'),report('a','2026-10-01'),report('b','2026-10-29'),report('future','2026-10-30'),report('previous','2026-09-20'),report('outside-cutoff','2026-09-30')],anchor:'2026-10-31',interval:'Monthly',today:'2026-10-29',sources:[source],coverage:checked(allMonths)});
 assert.equal(result.current.count,2);assert.equal(result.previous.count,1);assert.equal(result.previousChange,100);assert.equal(result.dailyAverage,2/29);assert.equal(result.limited,false);
});
test('completed months retain full calendar lengths and never roll February into March',()=>{
 assert.deepEqual(comparisonWindows('2026-03-31','Monthly','2026-10-29').previous,{start:'2026-02-01',end:'2026-02-28'});
 assert.deepEqual(comparisonWindows('2026-03-31','Monthly','2026-03-30').previous,{start:'2026-02-01',end:'2026-02-28'});
});
test('leap-day and YTD references clamp to valid dates; yearly reference is two years ago',()=>{
 const leap=comparisonWindows('2024-12-31','Yearly','2024-02-29');
 assert.deepEqual(leap.current,{start:'2024-01-01',end:'2024-02-29'});
 assert.deepEqual(leap.previous,{start:'2023-01-01',end:'2023-02-28'});
 assert.deepEqual(leap.reference,{start:'2022-01-01',end:'2022-02-28'});
 assert.deepEqual(comparisonWindows('2024-02-29','Daily','2026-10-29').reference,{start:'2023-02-28',end:'2023-02-28'});
});
test('partial weeks compare the same weekdays, with a 52-week annual reference',()=>{
 const week=comparisonWindows('2026-11-01','Weekly','2026-10-29');
 assert.deepEqual(week.current,{start:'2026-10-26',end:'2026-10-29'});
 assert.deepEqual(week.previous,{start:'2026-10-19',end:'2026-10-22'});
 assert.deepEqual(week.reference,{start:'2025-10-27',end:'2025-10-30'});
});
test('unknown zero baselines stay unavailable; known zeros do not produce infinity',()=>{
 const input={reports:[report('a','2026-10-29')],anchor:'2026-10-31',interval:'Monthly' as const,today:'2026-10-29',sources:[source]};
 const missing=buildComparison({...input,coverage:{}});
 assert.equal(missing.previous.available,false);assert.equal(missing.previousChange,null);assert.equal(missing.limited,true);assert.deepEqual(missing.missingMonths,['2025-10','2026-09','2026-10']);
 const zero=buildComparison({...input,coverage:checked(allMonths)});
 assert.equal(zero.previous.available,true);assert.equal(zero.previous.count,0);assert.equal(zero.previousChange,null);
 const empty=buildComparison({...input,reports:[],coverage:checked(allMonths)});assert.equal(empty.previousChange,0);assert.equal(empty.dailyAverage,0);
 const unknown=buildComparison({...input,reports:[],coverage:{}});assert.equal(unknown.current.available,false);assert.equal(unknown.dailyAverage,null);
});
test('incomplete positive baselines retain recorded arithmetic and flag partial history',()=>{
 const result=buildComparison({reports:[report('a','2026-10-29'),report('b','2026-10-28'),report('old','2026-09-01')],anchor:'2026-10-31',interval:'Monthly',today:'2026-10-29',sources:[source],coverage:{}});
 assert.equal(result.previousChange,100);assert.equal(result.limited,true);
});
test('disabled sources do not invalidate available archive coverage; RSS never claims complete history',()=>{
 const input={reports:[report('a','2026-10-29')],anchor:'2026-10-31',interval:'Monthly' as const,today:'2026-10-29',coverage:checked(allMonths)};
 assert.equal(buildComparison({...input,sources:[source,{...source,id:'paused',enabled:false}]}).limited,false);
 const rss=buildComparison({...input,sources:[{...source,kind:'RSS feed',region:'Global'}]});assert.equal(rss.limited,true);assert.equal(rss.previous.available,false);assert.deepEqual(rss.missingMonths,[]);
});
test('today and the final calendar day remain marked in progress',()=>{
 assert.equal(comparisonWindows('2026-10-29','Daily','2026-10-29').partialPeriod,true);
 assert.equal(comparisonWindows('2026-10-31','Monthly','2026-10-31').partialPeriod,true);
});
