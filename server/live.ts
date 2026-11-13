import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

type Change = { instance:string; revision:number; reasons:string[] };
const instance=randomUUID();
let revision=0;
let pending:ReturnType<typeof setTimeout>|undefined;
const reasons=new Set<string>();
const listeners=new Set<(change:Change)=>void>();
const streams=new Set<()=>void>();

export function dashboardChanged(reason:string) {
  reasons.add(reason);
  if(pending)return;
  pending=setTimeout(()=>{
    pending=undefined;
    const change={instance,revision:++revision,reasons:[...reasons]};reasons.clear();
    for(const listener of listeners)listener(change);
  },80);
  pending.unref();
}

export function subscribeDashboard(listener:(change:Change)=>void) {
  listeners.add(listener);return()=>{listeners.delete(listener);};
}

export function dashboardStream(req:Request,res:Response) {
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).end();
  if(streams.size>=32)return res.status(503).set('Retry-After','5').end();
  res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  res.flushHeaders();req.socket.setTimeout(0);
  let closed=false;
  const write=(event:string,change:Change)=>{
    if(closed)return;
    try{
      if(res.writableLength>64*1024){close();return;}
      res.write(`event: ${event}\nid: ${change.instance}:${change.revision}\ndata: ${JSON.stringify(change)}\n\n`);
    }catch{close();}
  };
  const unsubscribe=subscribeDashboard(change=>write('dashboard',change));
  const heartbeat=setInterval(()=>{if(!closed)res.write(': heartbeat\n\n');},20_000);heartbeat.unref();
  const close=()=>{
    if(closed)return;closed=true;clearInterval(heartbeat);unsubscribe();streams.delete(close);
    if(!res.writableEnded)res.end();
  };
  streams.add(close);res.on('close',close);res.on('error',close);
  res.write('retry: 3000\n\n');write('ready',{instance,revision,reasons:[]});
}

export function closeDashboardStreams(){for(const close of [...streams])close();}
