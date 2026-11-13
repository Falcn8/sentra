import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import type { ParsedReport } from '../server/parsers.ts';

process.env.DATABASE_PATH=':memory:';
const {createApp}=await import('../server/app.ts');
const {db,saveReports,getReports}=await import('../server/db.ts');
const {closeDashboardStreams}=await import('../server/live.ts');

const report=(id:string,organization:string):ParsedReport=>({
  id,sourceId:'clipmaster',title:`${organization} reports unauthorized access`,organization,url:`https://example.com/${id}`,
  publishedAt:'2026-10-29',category:'Unauthorized access',severity:'High',severityBasis:'Inferred',region:'Japan',summary:'',impact:'Not disclosed',sector:'Not specified',reportedStatus:'Investigating',
});

async function eventClient(url:string) {
  const controller=new AbortController();
  const response=await fetch(url,{signal:controller.signal});
  assert.equal(response.status,200);assert.match(response.headers.get('content-type')||'',/text\/event-stream/);
  const reader=response.body!.getReader();const decoder=new TextDecoder();let buffer='';
  const next=async()=>{
    for(;;){
      const end=buffer.indexOf('\n\n');
      if(end>=0){
        const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
        const event=frame.match(/^event: (.+)$/m)?.[1],data=frame.match(/^data: (.+)$/m)?.[1];
        if(event&&data)return {event,data:JSON.parse(data) as {revision:number;instance:string;reasons:string[]}};
      }else{
        const chunk=await reader.read();if(chunk.done)throw new Error('Event stream ended before an update');
        buffer+=decoder.decode(chunk.value,{stream:true});
      }
    }
  };
  return {next,close:()=>controller.abort()};
}

test('server push keeps two viewers current and restores the latest snapshot on reconnect',{timeout:10_000},async t=>{
  saveReports([report('initial','Alpha Cloud')]);await delay(120);
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address==='object');
  const base=`http://127.0.0.1:${address.port}`;
  const clients:Awaited<ReturnType<typeof eventClient>>[]=[];
  t.after(async()=>{for(const client of clients)client.close();closeDashboardStreams();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));db.close();});
  const first=await eventClient(`${base}/api/events`),second=await eventClient(`${base}/api/events`);clients.push(first,second);
  const ready=await first.next();assert.equal(ready.event,'ready');assert.equal((await second.next()).event,'ready');

  saveReports([report('new-report','Beta Services')]);
  const [a,b]=await Promise.all([first.next(),second.next()]);
  assert.equal(a.event,'dashboard');assert.ok(a.data.revision>ready.data.revision);assert.ok(a.data.reasons.includes('reports'));
  assert.deepEqual(a,b);
  let snapshot=await (await fetch(`${base}/api/dashboard`)).json();
  assert.equal(snapshot.rawReportCount,2);assert.equal(snapshot.incidents.length,2);

  const patch=async(path:string,body:unknown)=>{const response=await fetch(`${base}/api${path}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,200);};
  await patch('/sources/clipmaster',{enabled:false});
  const [disabledA,disabledB]=await Promise.all([first.next(),second.next()]);assert.equal(disabledA.data.revision,disabledB.data.revision);
  snapshot=await (await fetch(`${base}/api/dashboard`)).json();assert.equal(snapshot.rawReportCount,0);assert.deepEqual(snapshot.incidents,[]);assert.equal(getReports().length,2);

  await patch('/sources/clipmaster',{enabled:true});await Promise.all([first.next(),second.next()]);
  await patch('/incidents/new-report',{saved:true});await Promise.all([first.next(),second.next()]);
  snapshot=await (await fetch(`${base}/api/dashboard`)).json();assert.equal(snapshot.incidents.find((i:{id:string})=>i.id==='new-report').saved,true);
  first.close();
  const reconnected=await eventClient(`${base}/api/events`);clients.push(reconnected);
  const resumed=await reconnected.next();assert.equal(resumed.event,'ready');assert.ok(resumed.data.revision>disabledA.data.revision);
  const latest=await (await fetch(`${base}/api/dashboard`)).json();assert.equal(latest.rawReportCount,2);assert.equal(latest.incidents.find((i:{id:string})=>i.id==='new-report').saved,true);
  const crossOrigin=await fetch(`${base}/api/events`,{headers:{Origin:'https://other.example'}});assert.equal(crossOrigin.status,403);
});
