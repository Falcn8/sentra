import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateActivity, activityWindow, periodWindow } from '../src/activity.ts';
const reports=[
  {publishedAt:'2024-02-29',category:'Data exposure' as const},
  {publishedAt:'2025-12-31',category:'Ransomware' as const},
  {publishedAt:'2026-01-01',category:'Data exposure' as const},
  {publishedAt:'2026-01-31',category:'Phishing' as const},
  {publishedAt:'2026-02-01',category:'Malware' as const},
];
test('monthly aggregation respects calendar month lengths, leap days and year boundaries',()=>{
  const months=aggregateActivity(reports,'2025-12-01','2026-02-28','Monthly');
  assert.deepEqual(months.map(m=>[m.date,m.end,m.exposure+m.other]),[
    ['2025-12-01','2025-12-31',1],['2026-01-01','2026-01-31',2],['2026-02-01','2026-02-28',1],
  ]);
  assert.equal(aggregateActivity(reports,'2024-02-01','2024-02-29','Monthly')[0].end,'2024-02-29');
});
test('yearly totals and Monday-based weeks retain every report in the selected period',()=>{
  const years=aggregateActivity(reports,'2024-01-01','2026-12-31','Yearly');
  assert.deepEqual(years.map(y=>[y.date,y.end,y.exposure+y.other]),[
    ['2024-01-01','2024-12-31',1],['2025-01-01','2025-12-31',1],['2026-01-01','2026-12-31',3],
  ]);
  const weeks=aggregateActivity(reports,'2025-12-31','2026-01-01','Weekly');
  assert.equal(weeks.length,1);assert.equal(weeks[0].date,'2025-12-29');assert.equal(weeks[0].end,'2026-01-04');
  assert.equal(weeks[0].exposure+weeks[0].other,2);
});
test('period arrows cross calendar boundaries correctly',()=>{
  assert.deepEqual(periodWindow('2026-01-15','Monthly',-1),{start:'2025-12-01',end:'2025-12-31'});
  assert.deepEqual(periodWindow('2026-12-01','Monthly',1),{start:'2027-01-01',end:'2027-01-31'});
  assert.deepEqual(periodWindow('2026-01-01','Daily',-1),{start:'2025-12-31',end:'2025-12-31'});
  assert.deepEqual(periodWindow('2026-10-29','Weekly',-1),{start:'2026-10-19',end:'2026-10-25'});
  assert.deepEqual(periodWindow('2026-10-29','Yearly',-1),{start:'2025-01-01',end:'2025-12-31'});
});
test('monthly and yearly views contain multiple buckets of their selected granularity',()=>{
  const monthly=activityWindow('2026-10-29','Monthly');
  assert.deepEqual(monthly,{start:'2025-11-01',end:'2026-10-31'});
  const months=aggregateActivity(reports,monthly.start,'2026-10-29','Monthly');
  assert.equal(months.length,12);
  assert.deepEqual(months.slice(2,5).map(m=>m.date),['2026-01-01','2026-02-01','2026-03-01']);
  assert.equal(months.find(m=>m.date==='2026-01-01')!.exposure+months.find(m=>m.date==='2026-01-01')!.other,2);
  const yearly=activityWindow('2026-10-29','Yearly');
  assert.deepEqual(yearly,{start:'2022-01-01',end:'2026-12-31'});
  const years=aggregateActivity(reports,yearly.start,'2026-10-29','Yearly');
  assert.deepEqual(years.map(y=>y.date.slice(0,4)),['2022','2023','2024','2025','2026']);
  assert.deepEqual(years.map(y=>y.exposure+y.other),[0,0,1,1,3]);
});
test('rolling chart arrows shift by one selected bucket and preserve the window length',()=>{
  const previous=activityWindow('2026-10-31','Monthly',-1);
  assert.deepEqual(previous,{start:'2025-10-01',end:'2026-09-30'});
  assert.deepEqual(activityWindow(previous.end,'Monthly',1),activityWindow('2026-10-29','Monthly'));
  assert.deepEqual(activityWindow('2026-12-31','Yearly',-1),{start:'2021-01-01',end:'2025-12-31'});
  const weekly=activityWindow('2026-10-29','Weekly');
  assert.equal(aggregateActivity([],weekly.start,weekly.end,'Weekly').length,12);
});
