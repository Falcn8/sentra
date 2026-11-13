import type { Incident } from './types';

export type ChartInterval = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
export interface ActivityBucket { date:string; end:string; exposure:number; other:number }
const day=(date:Date)=>date.toISOString().slice(0,10);
export function bucketStart(value:string,interval:ChartInterval):Date {
  const date=new Date(value+'T12:00:00Z');
  if(interval==='Weekly')date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  if(interval==='Monthly')date.setUTCDate(1);
  if(interval==='Yearly'){date.setUTCMonth(0,1);}
  return date;
}
export function advance(value:Date,interval:ChartInterval):Date {
  const date=new Date(value);
  if(interval==='Daily')date.setUTCDate(date.getUTCDate()+1);
  if(interval==='Weekly')date.setUTCDate(date.getUTCDate()+7);
  if(interval==='Monthly')date.setUTCMonth(date.getUTCMonth()+1);
  if(interval==='Yearly')date.setUTCFullYear(date.getUTCFullYear()+1);
  return date;
}
export function periodWindow(anchor:string,interval:ChartInterval,direction=0):{start:string;end:string}{
  let start=bucketStart(anchor,interval);
  if(direction<0){
    if(interval==='Daily')start.setUTCDate(start.getUTCDate()-1);
    if(interval==='Weekly')start.setUTCDate(start.getUTCDate()-7);
    if(interval==='Monthly')start.setUTCMonth(start.getUTCMonth()-1);
    if(interval==='Yearly')start.setUTCFullYear(start.getUTCFullYear()-1);
  }else if(direction>0)start=advance(start,interval);
  const end=new Date(advance(start,interval).getTime()-86400000);return {start:day(start),end:day(end)};
}
export function activityWindow(anchor:string,interval:ChartInterval,direction=0):{start:string;end:string}{
  const last=periodWindow(anchor,interval,direction);
  const start=new Date(last.start+'T12:00:00Z');
  const count=interval==='Yearly'?5:12;
  if(interval==='Daily')start.setUTCDate(start.getUTCDate()-(count-1));
  if(interval==='Weekly')start.setUTCDate(start.getUTCDate()-(count-1)*7);
  if(interval==='Monthly')start.setUTCMonth(start.getUTCMonth()-(count-1));
  if(interval==='Yearly')start.setUTCFullYear(start.getUTCFullYear()-(count-1));
  return {start:day(start),end:last.end};
}
export function aggregateActivity(reports:Pick<Incident,'publishedAt'|'category'>[],start:string,end:string,interval:ChartInterval):ActivityBucket[]{
  const map=new Map<string,ActivityBucket>();let cursor=bucketStart(start,interval);const last=new Date(end+'T12:00:00Z');
  while(cursor<=last && map.size<5000){
    const next=advance(cursor,interval);const bucketEnd=new Date(next.getTime()-86400000);
    const date=day(cursor);map.set(date,{date,end:day(bucketEnd),exposure:0,other:0});cursor=next;
  }
  for(const report of reports){
    if(report.publishedAt<start||report.publishedAt>end)continue;
    const item=map.get(day(bucketStart(report.publishedAt,interval)));
    if(item){if(report.category==='Data exposure')item.exposure++;else item.other++;}
  }
  return [...map.values()];
}
