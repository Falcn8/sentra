import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory=mkdtempSync(join(tmpdir(),'sentra-live-database-'));
process.env.DATABASE_PATH=join(directory,'monitor.sqlite');
const {db,saveReports,getReports,startDatabaseWatcher}=await import('../server/db.ts');
const {subscribeDashboard}=await import('../server/live.ts');

test('updates committed by another database connection notify the live dashboard',{timeout:7000},async()=>{
  let timer:ReturnType<typeof setInterval>|undefined;
  let external:DatabaseSync|undefined;
  let unsubscribe=()=>{};
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
    saveReports([{id:'external',sourceId:'clipmaster',title:'Initial report',organization:'External example',url:'https://example.com/external',publishedAt:'2026-10-29',category:'Other',severity:'Unrated',severityBasis:'Not reported',region:'Japan',summary:'',impact:'Not disclosed',sector:'Not specified',reportedStatus:'Investigating'}]);
    await delay(120);
    timer=startDatabaseWatcher();
    const changed=new Promise<void>((resolve,reject)=>{
      timeout=setTimeout(()=>reject(new Error('External update was not broadcast')),5000);
      unsubscribe=subscribeDashboard(event=>{if(event.reasons.includes('external database update'))resolve();});
    });
    external=new DatabaseSync(process.env.DATABASE_PATH!);
    external.prepare('UPDATE reports SET title=? WHERE id=?').run('Updated by another collector','external');
    await changed;
    assert.equal(getReports()[0].title,'Updated by another collector');
  }finally{
    if(timer)clearInterval(timer);if(timeout)clearTimeout(timeout);unsubscribe();external?.close();db.close();rmSync(directory,{recursive:true,force:true});
  }
});
