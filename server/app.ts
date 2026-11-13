import { dashboardChanged, dashboardStream } from './live.ts';
import { RSS_REFRESH_MINUTES, DEFAULT_WEB_REFRESH_MINUTES } from './collection-schedule.ts';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { db, getReports, getSources, getWatchlist, setting, setSetting, addWatchTerm, saveReports } from './db.ts';
import { collect, currentMonth, isCollecting, sourceUrl, collectionState } from './collector.ts';
import { validatePublicUrl, fetchPublic } from './network.ts';
import { parseRss } from './parsers.ts';
import { groupIncidents } from './dedupe.ts';

export function createApp(){
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'24kb'}));
app.use('/api',(req,res,next)=>{
  res.set('Cache-Control','no-store');
  if(!['GET','HEAD'].includes(req.method))res.on('finish',()=>{if(res.statusCode<400)dashboardChanged('settings');});
  if(!['GET','HEAD'].includes(req.method) && req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)
    return res.status(403).json({error:'Cross-origin changes are not allowed.'});
  next();
});
app.get('/api/events',dashboardStream);
app.get('/api/health',(_req,res)=>res.json({ok:true,collecting:isCollecting()}));
app.get('/api/dashboard',(_req,res)=>{
  const reports=getReports({enabledOnly:true});const incidents=groupIncidents(reports);const sources=getSources().map(s=>({...s,url:sourceUrl(s)}));
  res.json({incidents,sources,watchlist:getWatchlist(),collecting:isCollecting(),lastCollected:setting('lastCollected')||null,
    refreshMinutes:Number(setting('refreshMinutes',String(DEFAULT_WEB_REFRESH_MINUTES))),rssRefreshMinutes:RSS_REFRESH_MINUTES,currentMonth:currentMonth(),
    ...collectionState(),rawReportCount:reports.length,months:[...new Set([currentMonth(),...incidents.map(i=>i.publishedAt.slice(0,7))])].sort().reverse()});
});
let lastRefresh=0;let lastRefreshKey='';
app.post('/api/refresh',(req,res)=>{
  const months:Array<string>=Array.isArray(req.body?.months)?req.body.months:[req.body?.month || currentMonth()];
  if(!months.length||months.length>12||months.some(month=>typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>currentMonth()))return res.status(400).json({error:'Choose up to 12 valid archive months, through the current month.'});
  const key=months.join(',');
  if(!isCollecting()&&key===lastRefreshKey&&Date.now()-lastRefresh<10_000)return res.status(429).json({error:'Wait a few seconds before refreshing again.'});
  lastRefresh=Date.now();lastRefreshKey=key;for(const month of months)void collect(month).catch(error=>console.error(error.message));res.status(202).json({collecting:true});
});
app.patch('/api/incidents/:id',(req,res)=>{
  const incident=groupIncidents(getReports({enabledOnly:true})).find(i=>i.id===String(req.params.id));
  if(!incident)return res.status(404).json({error:'This incident could not be found.'});
  db.exec('BEGIN');try{
    for(const field of ['saved','reviewed'] as const){
      if(typeof req.body?.[field]==='boolean')for(const report of incident.reports||[incident])db.prepare(`UPDATE reports SET ${field}=? WHERE id=?`).run(Number(req.body[field]),report.id);
    }
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  res.json({ok:true});
});
app.post('/api/watchlist',(req,res)=>{
  const term=typeof req.body?.term==='string'?req.body.term.trim():'';
  if(term.length<2||term.length>80)return res.status(400).json({error:'Use a keyword between 2 and 80 characters.'});
  if(getWatchlist().length>=50)return res.status(400).json({error:'The watchlist supports up to 50 keywords.'});
  if(getWatchlist().some(w=>w.term.toLocaleLowerCase()===term.toLocaleLowerCase()))return res.status(409).json({error:'That keyword is already on your watchlist.'});
  const id=addWatchTerm(term);res.status(201).json({id});
});
app.delete('/api/watchlist/:id',(req,res)=>{db.prepare('DELETE FROM watchlist WHERE id=?').run(String(req.params.id));res.json({ok:true});});
app.patch('/api/sources/:id',(req,res)=>{
  if(typeof req.body?.enabled!=='boolean')return res.status(400).json({error:'Provide an enabled setting.'});
  const result=db.prepare('UPDATE sources SET enabled=? WHERE id=?').run(Number(req.body.enabled),String(req.params.id));
  if(!result.changes)return res.status(404).json({error:'Source not found.'});res.json({ok:true});
});
app.post('/api/sources',async(req,res,next)=>{
  try{
    const name=typeof req.body?.name==='string'?req.body.name.trim():'';
    const value=typeof req.body?.url==='string'?req.body.url.trim():'';
    const region=req.body?.region==='Japan'?'Japan':'Global';
    if(name.length<2||name.length>60)return res.status(400).json({error:'Give the source a name between 2 and 60 characters.'});
    if(getSources().length>=20)return res.status(400).json({error:'A maximum of 20 sources is supported.'});
    const url=await validatePublicUrl(value);
    if(getSources().some(s=>s.url===url.href))return res.status(409).json({error:'This feed is already connected.'});
    const id=`rss-${randomUUID().slice(0,8)}`;const xml=await fetchPublic(url.href);
    const reports=parseRss(xml,url.href,id,region);
    if(!reports.length)return res.status(400).json({error:'The feed has no valid dated entries.'});
    const now=new Date().toISOString();
    db.prepare(`INSERT INTO sources(id,name,url,kind,region,color,abbreviation,custom,status,lastAttempt,lastSuccess,fetchedCount) VALUES(?,?,?,'RSS feed',?,'#6c82a6',?,1,'healthy',?,?,?)`).run(id,name,url.href,region,name.slice(0,2).toUpperCase(),now,now,reports.length);
    saveReports(reports);res.status(201).json({id,count:reports.length});
  }catch(e){next(e);}
});
app.delete('/api/sources/:id',(req,res)=>{
  const s=getSources().find(s=>s.id===req.params.id);
  if(!s?.custom)return res.status(400).json({error:'Built-in sources can be paused but not removed.'});
  db.exec('BEGIN');try{db.prepare('DELETE FROM reports WHERE sourceId=?').run(s.id);db.prepare('DELETE FROM sources WHERE id=?').run(s.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  res.json({ok:true});
});
app.patch('/api/settings',(req,res)=>{
  const interval=Number(req.body?.refreshMinutes);
  if(![5,15,30,60,120].includes(interval))return res.status(400).json({error:'Choose a supported refresh interval.'});
  setSetting('refreshMinutes',String(interval));res.json({ok:true});
});
app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.'}));
app.use((err:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error(err.message);res.status(400).json({error:err.message || 'The request failed. Please try again.'});
});
return app;
}
