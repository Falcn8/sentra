import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { aggregateActivity, type ChartInterval } from './activity';
import type { DateWindow } from './DateNavigator';
import type { Incident } from './types';

const number=(v:number)=>new Intl.NumberFormat('en-US').format(v);
const dateLabel=(value:string,options:Intl.DateTimeFormatOptions={month:'short',day:'numeric'})=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(`${value.slice(0,10)}T12:00:00Z`));

export default function ActivityChart({reports,interval,range,onRange,height}:{reports:Incident[];interval:ChartInterval;range:DateWindow;onRange:(start:string,end:string)=>void;height:number}){
  const [hover,setHover]=useState<number|null>(null);
  useEffect(()=>setHover(null),[range.start,range.end,interval]);
  const chartRef=useRef<HTMLDivElement>(null);const [chartWidth,setChartWidth]=useState(760);
  useEffect(()=>{const element=chartRef.current;if(!element)return;const observer=new ResizeObserver(entries=>setChartWidth(Math.max(280,entries[0].contentRect.width)));observer.observe(element);return()=>observer.disconnect();},[]);
  const days=useMemo(()=>{
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
    return aggregateActivity(reports,range.start,range.end>today?today:range.end,interval);
  },[reports,interval,range.start,range.end]);
  const max=Math.max(...days.map(d=>d.exposure+d.other),1);const ceiling=Math.ceil(max/4)*4;
  const width=Math.max(chartWidth,days.length*10+48),left=40,bottom=height<160?24:28,top=height<160?8:16,plot=height-bottom-top;
  const step=(width-left-8)/Math.max(days.length,1);const barWidth=Math.min(64,Math.max(2,step*.66));
  const highlighted=hover!==null?days[hover]:null;
  const points=days.map((d,index)=>[left+index*step+step/2,top+plot-(d.exposure+d.other)/ceiling*plot]);
  const line=points.map((p,index)=>`${index===0?'M':'L'}${p[0]},${p[1]}`).join(' ');
  const area=line&&`${line} L${points.at(-1)![0]},${top+plot} L${points[0][0]},${top+plot} Z`;
  useEffect(()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const element=chartRef.current;if(!element)return;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;
      element.querySelectorAll('.chart-bar').forEach((bar,index)=>bar.animate([{clipPath:'inset(100% 0 0 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:700,delay:Math.min(index*18,450),easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'}));observer.disconnect();
    },{threshold:.3});observer.observe(element);return()=>observer.disconnect();
  },[range.start,range.end,interval,reports.length]);
  return <div className="activity-chart" ref={chartRef} onMouseLeave={()=>setHover(null)}>
    <svg viewBox={`0 0 ${width} ${height}`} style={{width,minWidth:'100%'}} role="group" aria-label={`${interval} report activity. ${reports.length} incident groups in the selected period.`}>
      <defs><pattern id="blue-stripes" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(35)"><rect width="5" height="5" fill="#d7e4ff"/><rect width="2.5" height="5" fill="#4b7aee"/></pattern><linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#789bf3" stopOpacity=".20"/><stop offset="100%" stopColor="#789bf3" stopOpacity=".01"/></linearGradient></defs>
      {(height<160?[0,2,4]:[0,1,2,3,4]).map(n=>{const y=top+plot*(1-n/4);return <g key={n}><line x1={left} x2={width} y1={y} y2={y} stroke="#e9edf2" strokeDasharray={n?'3 5':undefined}/><text x={left-10} y={y+4} textAnchor="end" fill="#9299a6" fontSize="10">{number(ceiling*n/4)}</text></g>;})}
      {points.length>1&&<path d={area} fill="url(#activity-fill)"/>}
      {days.map((d,index)=>{
        const x=left+index*step+(step-barWidth)/2;const a=d.exposure/ceiling*plot;const b=d.other/ceiling*plot;
        const label=interval==='Yearly'?d.date.slice(0,4):interval==='Monthly'?dateLabel(d.date,{month:'short'}):dateLabel(d.date);
        return <g key={d.date} tabIndex={0} role="button" aria-label={`${label}: ${d.exposure+d.other} incidents. View this period.`} onMouseEnter={()=>setHover(index)} onFocus={()=>setHover(index)} onClick={()=>onRange(d.date,d.end)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onRange(d.date,d.end);}}} style={{cursor:'pointer'}}>
          <rect x={x-4} y={top} width={barWidth+8} height={plot} fill="transparent"/>
          <rect className="chart-bar" x={x} y={top+plot-a} width={barWidth} height={a} fill={hover===index?'#4b75e5':'url(#blue-stripes)'} rx="3" opacity={hover===null||hover===index?1:.45}/>
          <rect x={x} y={top+plot-a-b} width={barWidth} height={b} fill="#b1c8fa" rx="1" opacity={hover===null||hover===index?1:.55}/>
          {((interval==='Monthly'||interval==='Yearly')&&days.length<=12?(interval==='Yearly'||width>=400||index%3===0||index===days.length-1):(index===0||index===days.length-1||index%Math.max(1,Math.floor(days.length/6))===0))&&<text x={x+barWidth/2} y={height-7} textAnchor="middle" fill="#9299a6" fontSize="10">{label}</text>}
        </g>;
      })}
      {points.length>1&&<path d={line} fill="none" stroke="#6e91e9" strokeWidth="1.5" strokeLinecap="round" pointerEvents="none"/>}
    </svg>
    {highlighted&&<div className="chart-tooltip" style={{left:`${Math.min(82,Math.max(10,(hover!+1)/days.length*95))}%`}}><b>{interval==='Yearly'?highlighted.date.slice(0,4):interval==='Monthly'?dateLabel(highlighted.date,{month:'long',year:'numeric'}):interval==='Weekly'?`Week of ${dateLabel(highlighted.date)}`:dateLabel(highlighted.date)}</b><span>{number(highlighted.exposure+highlighted.other)} incidents</span><button onClick={()=>onRange(highlighted.date,highlighted.end)}>View this period <ArrowRight size={12}/></button></div>}
  </div>;
}
