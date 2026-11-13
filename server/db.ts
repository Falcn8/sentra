import { dashboardChanged } from './live.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Incident, Source, WatchTerm } from '../src/types.ts';
import type { ParsedReport } from './parsers.ts';

export const databasePath = process.env.DATABASE_PATH || resolve('data/monitor.sqlite');
if(databasePath !== ':memory:') mkdirSync(dirname(databasePath),{recursive:true});
export const db = new DatabaseSync(databasePath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, kind TEXT NOT NULL,
 region TEXT NOT NULL, color TEXT NOT NULL, abbreviation TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
 status TEXT NOT NULL DEFAULT 'pending', lastAttempt TEXT, lastSuccess TEXT, error TEXT,
 fetchedCount INTEGER NOT NULL DEFAULT 0, custom INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, sourceId TEXT NOT NULL REFERENCES sources(id), title TEXT NOT NULL,
 organization TEXT NOT NULL, url TEXT NOT NULL, publishedAt TEXT NOT NULL, category TEXT NOT NULL, severity TEXT NOT NULL,
 severityBasis TEXT NOT NULL, region TEXT NOT NULL, summary TEXT NOT NULL, impact TEXT NOT NULL, sector TEXT NOT NULL,
 reportedStatus TEXT NOT NULL, firstSeen TEXT NOT NULL, updatedAt TEXT NOT NULL,
 saved INTEGER NOT NULL DEFAULT 0, reviewed INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS reports_date ON reports(publishedAt DESC);
 CREATE TABLE IF NOT EXISTS watchlist(id TEXT PRIMARY KEY, term TEXT UNIQUE NOT NULL, createdAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);

const defaults = [
 ['incident-radar','Incident Radar','https://incident-radar.com/archive/{year}/{month}/','HTML archive','Japan','#5278ef','IR'],
 ['japanhacked','JapanHacked','https://japanhacked.jp/incidents','HTML directory','Japan','#b27add','JH'],
 ['clipmaster','ClipMaster','https://jouhourouei.clipmaster.jp/months/{year}-{month}','HTML archive','Japan','#e4a653','CM'],
 ['scannet','ScanNetSecurity','https://s.netsecurity.ne.jp/category/incident/incident/{year}/{month}/','HTML archive','Japan','#68a894','SN'],
 ['bleeping','BleepingComputer','https://www.bleepingcomputer.com/feed/','RSS feed','Global','#608ca4','BC'],
 ['thehackernews','The Hacker News','https://feeds.feedburner.com/TheHackersNews','RSS feed','Global','#b5936e','HN'],
];
const insertSource=db.prepare('INSERT OR IGNORE INTO sources(id,name,url,kind,region,color,abbreviation) VALUES(?,?,?,?,?,?,?)');
for(const source of defaults) insertSource.run(...source);

export const setting = (key:string, fallback='') => (db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value as string | undefined) ?? fallback;
export const setSetting = (key:string,value:string) => { db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);dashboardChanged('settings'); };
export function getSources(): Source[] {
  return (db.prepare('SELECT s.*, (SELECT COUNT(*) FROM reports r WHERE r.sourceId=s.id) reportCount FROM sources s ORDER BY custom, rowid').all() as unknown as Source[]).map(s=>({...s,enabled:!!s.enabled,custom:!!s.custom}));
}
export function getReports({enabledOnly=false}:{enabledOnly?:boolean}={}): Incident[] {
  const query=enabledOnly
    ? 'SELECT r.* FROM reports r JOIN sources s ON s.id=r.sourceId WHERE s.enabled=1 ORDER BY r.publishedAt DESC, r.firstSeen DESC, r.id'
    : 'SELECT * FROM reports ORDER BY publishedAt DESC, firstSeen DESC, id';
  return (db.prepare(query).all() as unknown as Incident[]).map(r=>({...r,saved:!!r.saved,reviewed:!!r.reviewed}));
}
export function getWatchlist(): WatchTerm[] { return db.prepare('SELECT * FROM watchlist ORDER BY createdAt').all() as unknown as WatchTerm[]; }
export function addWatchTerm(term:string) {const id=randomUUID();db.prepare('INSERT INTO watchlist(id,term,createdAt) VALUES(?,?,?)').run(id,term,new Date().toISOString());return id;}

const reportColumns=['id','sourceId','title','organization','url','publishedAt','category','severity','severityBasis','region','summary','impact','sector','reportedStatus'] as const;
const upsert = db.prepare(`INSERT INTO reports(${reportColumns.join(',')},firstSeen,updatedAt) VALUES(${Array(reportColumns.length+2).fill('?').join(',')})
 ON CONFLICT(id) DO UPDATE SET ${reportColumns.slice(2).map(c=>`${c}=excluded.${c}`).join(',')},updatedAt=excluded.updatedAt`);
export function saveReports(reports: ParsedReport[]) {
  const now=new Date().toISOString(); db.exec('BEGIN');
  try {for(const r of reports) upsert.run(...reportColumns.map(c=>r[c]),now,now);db.exec('COMMIT');if(reports.length)dashboardChanged('reports');}
  catch(e){db.exec('ROLLBACK');throw e;}
}
export function updateSource(id:string, status:string, count:number, error:string|null) {
  const now=new Date().toISOString();
  db.prepare(`UPDATE sources SET status=?,fetchedCount=?,error=?,lastAttempt=?,lastSuccess=CASE WHEN ? IN ('healthy','partial') THEN ? ELSE lastSuccess END WHERE id=?`).run(status,count,error,now,status,now,id);dashboardChanged('sources');
}

export function startDatabaseWatcher(){
  const readVersion=()=>Number((db.prepare('PRAGMA data_version').get() as {data_version:number}).data_version);
  let previous=readVersion();
  const timer=setInterval(()=>{const next=readVersion();if(next!==previous){previous=next;dashboardChanged('external database update');}},2000);
  timer.unref();return timer;
}
