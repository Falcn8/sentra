import { useEffect, useRef, useState } from 'react';
import type { DashboardData } from './types';
import { evidenceOf, findArrivals, type Arrival } from './arrivals';

export default function useArrivals(data:DashboardData|null){
  const known=useRef(new Set<string>());
  const startedAt=useRef<string|null>(null);
  const [arrivals,setArrivals]=useState<Arrival[]>([]);
  const [announcedAt,setAnnouncedAt]=useState('');
  useEffect(()=>{
    if(!data)return;
    if(startedAt.current===null)startedAt.current=new Date().toISOString();
    else{
      const added=findArrivals(data.incidents,known.current,startedAt.current);
      if(added.length){setArrivals(previous=>[...added,...previous].slice(0,100));setAnnouncedAt(new Date().toISOString());}
    }
    for(const incident of data.incidents)for(const report of evidenceOf(incident))known.current.add(report.id);
  },[data]);
  // Keep the attention cue bounded; arrival history itself stays available.
  const [active,setActive]=useState(false);
  useEffect(()=>{if(!announcedAt)return;setActive(true);const timer=setTimeout(()=>setActive(false),60_000);return()=>clearTimeout(timer);},[announcedAt]);
  return {arrivals,announcedAt,active};
}
