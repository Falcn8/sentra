import { periodWindow, type ChartInterval } from './activity';
import type { DashboardData, Incident, Source } from './types';

type Window={start:string;end:string};
export interface ComparedPeriod extends Window {count:number;complete:boolean;available:boolean}
export interface PeriodComparison {
  current:ComparedPeriod;previous:ComparedPeriod;reference:ComparedPeriod;
  interval:ChartInterval;partialPeriod:boolean;limited:boolean;dailyAverage:number|null;
  previousChange:number|null;referenceChange:number|null;missingMonths:string[];
}
const iso=(date:Date)=>date.toISOString().slice(0,10);
const utc=(value:string)=>new Date(`${value}T12:00:00Z`);
const days=(start:string,end:string)=>Math.max(0,Math.round((+utc(end)-+utc(start))/86400000)+1);
function calendarDate(year:number,month:number,date:number){return iso(new Date(Date.UTC(year,month,Math.min(date,new Date(Date.UTC(year,month+1,0)).getUTCDate()),12)));}
export function comparisonWindows(anchor:string,interval:ChartInterval,today:string):{current:Window;previous:Window;reference:Window;partialPeriod:boolean}{
  const full=periodWindow(anchor,interval);
  const end=full.end<today?full.end:today;
  const current={start:full.start,end:end<full.start?full.start:end};
  const partialPeriod=current.end===today;
  const previousFull=periodWindow(full.start,interval,-1);
  let referenceFull:Window;
  if(interval==='Weekly'){
    const start=utc(full.start);start.setUTCDate(start.getUTCDate()-364);referenceFull=periodWindow(iso(start),'Weekly');
  }else{
    const start=utc(full.start);const years=interval==='Yearly'?2:1;
    referenceFull=periodWindow(calendarDate(start.getUTCFullYear()-years,start.getUTCMonth(),start.getUTCDate()),interval);
  }
  const match=(period:Window):Window=>{
    if(!partialPeriod)return period;
    const start=utc(period.start),cutoff=utc(current.end);let matched:string;
    if(interval==='Yearly')matched=calendarDate(start.getUTCFullYear(),cutoff.getUTCMonth(),cutoff.getUTCDate());
    else{start.setUTCDate(start.getUTCDate()+days(current.start,current.end)-1);matched=iso(start);}
    return {...period,end:matched<period.end?matched:period.end};
  };
  return {current,previous:match(previousFull),reference:match(referenceFull),partialPeriod};
}
export function monthsForWindow(window:Window):string[]{
  const result:string[]=[];const cursor=utc(window.start.slice(0,7)+'-01');
  while(iso(cursor)<=window.end&&result.length<1200){result.push(iso(cursor).slice(0,7));cursor.setUTCMonth(cursor.getUTCMonth()+1);}
  return result;
}
export function percentageChange(current:ComparedPeriod,previous:ComparedPeriod):number|null{
  if(!current.available||!previous.available||previous.count===0)return previous.available&&current.available&&current.count===0&&previous.count===0?0:null;
  return (current.count-previous.count)/previous.count*100;
}
export function buildComparison({reports,anchor,interval,today,sources,coverage}:{reports:Pick<Incident,'id'|'publishedAt'>[];anchor:string;interval:ChartInterval;today:string;sources:Source[];coverage:DashboardData['archiveCoverage']}):PeriodComparison{
  const windows=comparisonWindows(anchor,interval,today);
  const enabled=sources.filter(source=>source.enabled);
  const html=enabled.filter(source=>source.kind!=='RSS feed');
  const monthComplete=(month:string,checked:Source[])=>checked.length>0&&checked.every(source=>coverage[month]?.sources.some(item=>item.id===source.id&&item.status==='healthy'));
  const describe=(window:Window):ComparedPeriod=>{
    const count=new Set(reports.filter(report=>report.publishedAt>=window.start&&report.publishedAt<=window.end).map(report=>report.id)).size;
    const complete=enabled.length>0&&html.length===enabled.length&&monthsForWindow(window).every(month=>monthComplete(month,enabled));
    return {...window,count,complete,available:count>0||complete};
  };
  const current=describe(windows.current),previous=describe(windows.previous),reference=describe(windows.reference);
  const missingMonths=[...new Set([current,previous,reference].flatMap(monthsForWindow))].filter(month=>html.length>0&&month>='2000-01'&&month<=today.slice(0,7)&&!monthComplete(month,html)).sort();
  return {current,previous,reference,interval,partialPeriod:windows.partialPeriod,limited:!current.complete||!previous.complete||!reference.complete,
    dailyAverage:current.available?current.count/days(current.start,current.end):null,previousChange:percentageChange(current,previous),referenceChange:percentageChange(current,reference),missingMonths};
}
