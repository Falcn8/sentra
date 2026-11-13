import { useEffect, useRef, useState } from 'react';

export type LiveStatus='connecting'|'live'|'reconnecting'|'offline'|'fallback';

export default function useLiveUpdates(load:()=>Promise<void>) {
  const [status,setStatus]=useState<LiveStatus>(()=>navigator.onLine?'connecting':'offline');
  const latestLoad=useRef(load);
  useEffect(()=>{latestLoad.current=load;},[load]);
  useEffect(()=>{
    let source:EventSource|undefined;
    let refreshTimer:ReturnType<typeof setTimeout>|undefined;
    let state:LiveStatus='connecting';
    let opened=false;
    const updateStatus=(next:LiveStatus)=>{state=next;setStatus(next);};
    const refresh=()=>{
      if(refreshTimer)return;
      refreshTimer=setTimeout(()=>{refreshTimer=undefined;void latestLoad.current();},120);
    };
    const connect=()=>{
      const previous=source;source=undefined;previous?.close();
      if(!navigator.onLine){updateStatus('offline');return;}
      if(typeof EventSource==='undefined'){updateStatus('fallback');return;}
      updateStatus(opened?'reconnecting':'connecting');
      source=new EventSource('/api/events');const connection=source;
      source.onopen=()=>{if(source===connection){opened=true;updateStatus('live');}};
      const changed=()=>{if(source===connection)refresh();};
      source.addEventListener('ready',changed);source.addEventListener('dashboard',changed);
      source.onerror=()=>{if(source===connection)updateStatus(navigator.onLine?'reconnecting':'offline');};
    };
    const offline=()=>{const previous=source;source=undefined;previous?.close();updateStatus('offline');};
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    const fallback=setInterval(()=>{if(state!=='live'&&navigator.onLine)refresh();},15_000);
    connect();
    window.addEventListener('online',connect);window.addEventListener('offline',offline);document.addEventListener('visibilitychange',visible);
    return()=>{const previous=source;source=undefined;previous?.close();clearInterval(fallback);if(refreshTimer)clearTimeout(refreshTimer);window.removeEventListener('online',connect);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',visible);};
  },[]);
  return status;
}
