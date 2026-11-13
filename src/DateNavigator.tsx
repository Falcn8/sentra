import { useEffect, useRef, useState } from 'react';
import { CalendarBlank, CaretDown, CaretLeft, CaretRight, Check } from '@phosphor-icons/react';
import { activityWindow, periodWindow, type ChartInterval } from './activity';
export interface DateWindow {start:string;end:string}
export const todayJst=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const format=(value:string,options:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
export function windowLabel(window:DateWindow,interval:ChartInterval):string {
  if(interval==='Yearly')return `${window.start.slice(0,4)} – ${window.end.slice(0,4)}`;
  if(interval==='Monthly')return `${format(window.start,{month:'short',year:'numeric'})} – ${format(window.end,{month:'short',year:'numeric'})}`;
  return `${format(window.start,{month:'short',day:'numeric'})} – ${format(window.end,{month:'short',day:'numeric',year:'numeric'})}`;
}
export default function DateNavigator({value,interval,collected,onChange}:{value:DateWindow;interval:ChartInterval;collected:string[];onChange:(range:DateWindow)=>void}){
  const [open,setOpen]=useState(false);const [year,setYear]=useState(Number(value.end.slice(0,4)));const [month,setMonth]=useState(Number(value.end.slice(5,7))-1);const [chooseYear,setChooseYear]=useState(false);
  const ref=useRef<HTMLDivElement>(null);const today=todayJst();const unit=interval==='Daily'?'day':interval==='Weekly'?'week':interval==='Monthly'?'month':'year';
  const triggerRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&open){setOpen(false);triggerRef.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[open]);
  useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>{const picker=ref.current?.querySelector('.period-picker');const selected=picker?.querySelector<HTMLButtonElement>('.day-grid [aria-pressed="true"]:not(:disabled)')||picker?.querySelector<HTMLButtonElement>('[aria-pressed="true"]:not(:disabled)')||picker?.querySelector<HTMLButtonElement>('button:not(:disabled)');selected?.focus();});return()=>cancelAnimationFrame(frame);},[open,chooseYear]);
  function select(anchor:string){onChange(activityWindow(anchor,interval));setOpen(false);triggerRef.current?.focus();}
  const selectedPeriod=periodWindow(value.end,interval);
  const next=activityWindow(value.end,interval,1);const nextPeriod=periodWindow(value.end,interval,1);const first=new Date(Date.UTC(year,month,1,12));const offset=(first.getUTCDay()+6)%7;const days=new Date(Date.UTC(year,month+1,0,12)).getUTCDate();
  const monthNames=Array.from({length:12},(_,i)=>format(`${year}-${String(i+1).padStart(2,'0')}-01`,{month:'short'}));
  return <div className="date-navigator" ref={ref}>
    <button className="period-arrow" aria-label={`Previous ${unit}`} onClick={()=>onChange(activityWindow(value.end,interval,-1))}><CaretLeft size={15}/></button>
    <button ref={triggerRef} className="date-trigger" aria-label="Choose date period" aria-expanded={open} aria-haspopup="dialog" onClick={()=>{setYear(Number((value.end>today?today:value.end).slice(0,4)));setMonth(Number((value.end>today?today:value.end).slice(5,7))-1);setChooseYear(interval==='Yearly');setOpen(v=>!v);}}><CalendarBlank size={15}/><span>{windowLabel(value,interval)}</span><CaretDown size={12}/></button>
    <button className="period-arrow" aria-label={`Next ${unit}`} disabled={nextPeriod.start>today} onClick={()=>onChange(next)}><CaretRight size={15}/></button>
    {open&&<div className="period-picker" role="dialog" aria-label="Choose reporting period"><div className="picker-heading"><button className="icon-button" aria-label="Previous picker year" onClick={()=>setYear(y=>y-1)}><CaretLeft size={15}/></button><button className="picker-year" onClick={()=>setChooseYear(v=>!v)}>{year}<CaretDown size={12}/></button><button className="icon-button" aria-label="Next picker year" disabled={year>=Number(today.slice(0,4))} onClick={()=>setYear(y=>y+1)}><CaretRight size={15}/></button></div>
      {chooseYear?<div className="year-grid">{Array.from({length:12},(_,i)=>year-8+i).map(y=><button disabled={y>Number(today.slice(0,4))} className={String(y)===value.end.slice(0,4)?'active':''} aria-pressed={String(y)===value.end.slice(0,4)} key={y} onClick={()=>{if(interval==='Yearly')select(`${y}-01-01`);else{setYear(y);setChooseYear(false);}}}>{y}</button>)}</div>:<>
        <div className="month-grid">{monthNames.map((name,i)=>{const m=`${year}-${String(i+1).padStart(2,'0')}`;return <button key={m} disabled={m>today.slice(0,7)} className={(interval==='Monthly'?value.end.slice(0,7)===m:month===i)?'active':''} aria-pressed={interval==='Monthly'?value.end.slice(0,7)===m:month===i} onClick={()=>{if(interval==='Monthly')select(m+'-01');else setMonth(i);}}><span>{name}</span>{collected.includes(m)?<Check size={10}/>:<span className="month-unloaded"/>}</button>;})}</div>
        {(interval==='Daily'||interval==='Weekly')&&<div className="day-calendar"><div className="weekday-row">{['M','T','W','T','F','S','S'].map((label,i)=><span key={i}>{label}</span>)}</div><div className="day-grid">{Array.from({length:offset},(_,i)=><span key={`blank-${i}`}/>)}{Array.from({length:days},(_,i)=>{const day=`${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return <button key={day} disabled={day>today} className={day>=selectedPeriod.start&&day<=selectedPeriod.end?'active':''} aria-pressed={day>=selectedPeriod.start&&day<=selectedPeriod.end} aria-label={format(day,{month:'long',day:'numeric',year:'numeric'})} onClick={()=>select(day)}>{i+1}</button>;})}</div></div>}
      </>}
      <div className="picker-footer"><span><Check size={10}/>Choose ending period</span><button className="text-button" onClick={()=>select(today)}>{interval==='Yearly'?'This year':interval==='Monthly'?'This month':interval==='Weekly'?'This week':'Today'}</button></div>
    </div>}
  </div>;
}
