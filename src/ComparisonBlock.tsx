import { useEffect, useRef } from 'react';
import { CaretDown, X } from '@phosphor-icons/react';
import type { ComparedPeriod, PeriodComparison } from './comparison';

const count=(value:number)=>new Intl.NumberFormat('en-US',{notation:value>=10_000?'compact':'standard',maximumFractionDigits:1}).format(value);
const average=(value:number)=>new Intl.NumberFormat('en-US',value>0&&value<1?{maximumSignificantDigits:2}:{maximumFractionDigits:1}).format(value);
const fullCount=(value:number)=>new Intl.NumberFormat('en-US').format(value);
const formatDate=(value:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`));
function periodLabel(model:PeriodComparison){
  const value=model.current.start;
  if(model.interval==='Yearly')return `${value.slice(0,4)}${model.partialPeriod?' YTD':''}`;
  if(model.interval==='Monthly')return `${formatDate(value,{month:'short'})}${model.partialPeriod?' MTD':''}`;
  if(model.interval==='Weekly')return model.partialPeriod?'Week so far':'Week total';
  return model.partialPeriod?'Today':formatDate(value,{month:'short',day:'numeric'});
}
function comparisonValue(model:PeriodComparison,period:ComparedPeriod,change:number|null){
  if(!model.current.available||!period.available)return '—';
  if(period.count===0&&model.current.count>0)return 'New';
  if(change===null)return '—';
  const rounded=Math.abs(change)>=1000?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(change):new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(change);
  return `${change>0?'+':''}${rounded}%${!model.current.complete||!period.complete?'*':''}`;
}
export default function ComparisonBlock({model,id,className,busy,onLoadHistory}:{model:PeriodComparison;id:string;className:string;busy:boolean;onLoadHistory:(months:string[])=>void}){
  const ref=useRef<HTMLDetailsElement>(null);
  const close=(focus=false)=>{if(ref.current?.open){ref.current.open=false;if(focus)ref.current.querySelector<HTMLElement>('summary')?.focus();}};
  useEffect(()=>{
    const outside=(event:PointerEvent)=>{if(!ref.current?.contains(event.target as Node))close();};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close(true);};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};
  },[]);
  const previousLabel=model.interval==='Monthly'?`vs ${formatDate(model.previous.start,{month:'short'})}`:model.interval==='Yearly'?`vs ${model.previous.start.slice(0,4)}`:model.interval==='Daily'?`vs ${formatDate(model.previous.start,{month:'short',day:'numeric'})}`:'vs prev';
  const referenceLabel=model.interval==='Weekly'?'52w ago':`vs ${model.reference.start.slice(0,4)}`;
  const description=(period:ComparedPeriod)=>`${period.start} through ${period.end}: ${fullCount(period.count)} recorded incidents. ${period.complete?'Archive checks complete.':'Partial or unavailable historical coverage.'}`;
  return <section className={`monitor-comparison ${className}`} aria-labelledby={id}>
    <div className="monitor-section-heading"><h2 id={id}>Period change</h2><details ref={ref} className="monitor-comparison-details"><summary aria-label="Show period comparison details" title="See comparison dates, counts and collection coverage"><span className={model.limited?'comparison-limited':''}>{model.limited?'Partial':'Details'}</span><CaretDown size={12}/></summary><div className="monitor-comparison-popover">
      <div className="monitor-section-heading"><h3>Comparison details</h3><button className="icon-button" aria-label="Close comparison details" onClick={()=>close(true)}><X size={16}/></button></div>
      <p className="comparison-history-note">{model.limited?'* History is incomplete. Percentages use collected reports and can change as missing archives load.':'Counts use incident groups from the currently enabled sources.'}</p>
      <table><thead><tr><th>Window</th><th>Incidents</th><th>History</th></tr></thead><tbody>{[['Current',model.current],['Previous',model.previous],[model.interval==='Yearly'?'Two years ago':model.interval==='Weekly'?'52 weeks ago':'Year ago',model.reference]].map(([label,value])=>{const period=value as ComparedPeriod;return <tr key={String(label)}><td><strong>{String(label)}</strong><small>{period.start} – {period.end}</small></td><td>{period.available?fullCount(period.count):'—'}</td><td>{period.complete?'Checked':period.count?'Partial':'Missing'}</td></tr>;})}</tbody></table>
      <p>Uses the selected {model.interval.toLowerCase().replace('daily','day').replace('weekly','week').replace('monthly','month').replace('yearly','year')} on the chart, or its last bucket when no bar is selected. {model.partialPeriod?(model.interval==='Daily'?'Today is still accumulating; earlier days are complete calendar days.':'Current and earlier periods use the same calendar cutoff, capped at the end of each period.'):'Completed calendar periods use their full lengths.'} Weekly annual comparisons use 52 weeks ago.</p>
      <p className="comparison-history-note">A dash means no comparable baseline. Average/day uses elapsed calendar days. These are public report counts, not verified attack rates.</p>
      {model.missingMonths.length>0&&<button className="button" disabled={busy} onClick={()=>onLoadHistory(model.missingMonths)}>{busy?'Collecting…':`Load missing archives (${model.missingMonths.length})`}</button>}
    </div></details></div>
    <div className="monitor-comparison-grid">
      <div className="monitor-comparison-stat" title={description(model.current)}><span>{periodLabel(model)}</span><b>{model.current.available?count(model.current.count):'—'}</b></div>
      <div className="monitor-comparison-stat comparison-change" title={description(model.previous)}><span>{previousLabel}</span><b>{comparisonValue(model,model.previous,model.previousChange)}</b></div>
      <div className="monitor-comparison-stat comparison-change" title={description(model.reference)}><span>{referenceLabel}</span><b>{comparisonValue(model,model.reference,model.referenceChange)}</b></div>
      <div className="monitor-comparison-stat" title={`Recorded incidents per elapsed calendar day from ${model.current.start} through ${model.current.end}`}><span>Avg/day</span><b>{model.dailyAverage===null?'—':average(model.dailyAverage)}</b></div>
    </div>
  </section>;
}
