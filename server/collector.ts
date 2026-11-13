import { dashboardChanged } from './live.ts';
import { DEFAULT_WEB_REFRESH_MINUTES, nextCollection } from './collection-schedule.ts';
import { getSources, saveReports, updateSource, setSetting, setting } from './db.ts';
import { clipmasterCaseList, parseRadar, parseJapanHacked, parseClipmaster, parseScanNet, parseRss, nextPage, type ParsedReport } from './parsers.ts';
import { fetchPublic } from './network.ts';
import type { Source } from '../src/types.ts';

export const currentMonth = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
export const sourceUrl = (source:Source,month=currentMonth()) => source.url.replace('{year}',month.slice(0,4)).replace('{month}',month.slice(5,7));
let active:Promise<void>|null=null;
let collectingMonth:string|null=null;let collectingKind:'all'|'rss'|null=null;
const pendingJobs:{month:string;rssOnly:boolean}[]=[];
export const isCollecting=()=>active!==null;
export const collectionState=()=>({collectingMonth,collectingKind,pendingMonths:[...new Set(pendingJobs.map(job=>job.month))],collectedMonths:JSON.parse(setting('collectedMonths','[]')) as string[],archiveCoverage:JSON.parse(setting('archiveCoverage','{}'))});
async function collectSource(source:Source,month:string){
  const all=new Map<string,ParsedReport>();let url:string|null=sourceUrl(source,month);let partial:string|null=null;
  const seen=new Set<string>();
  for(let page=0;url && page<12;page++){
    if(!getSources().some(s=>s.id===source.id&&s.enabled))return;
    if(seen.has(url))break;seen.add(url);
    try{
      const html=await fetchPublic(url);
      if(!getSources().some(s=>s.id===source.id&&s.enabled))return;
      const reports=source.kind==='RSS feed' ? parseRss(html,url,source.id,source.region) :
        source.id==='incident-radar' ? parseRadar(html,url) : source.id==='japanhacked' ? parseJapanHacked(html,url) :
        source.id==='clipmaster' ? parseClipmaster(html,url) : parseScanNet(html,url);
      if (!reports.length && source.id === 'clipmaster') {
        const caseList = clipmasterCaseList(html, url);
        if (caseList) {
          url = caseList;
          continue;
        }
      }
      if(!reports.length)throw new Error('No dated reports found. The archive may be empty or the publisher layout may have changed.');
      for(const r of reports)all.set(r.id,r);
      saveReports(reports);
      let next: string | null = ['japanhacked','scannet'].includes(source.id) ? nextPage(html,url) : null;
      // ScanNet's mobile archive declares its canonical desktop origin for pagination.
      if(next && source.id==='scannet' && new URL(next).hostname==='scan.netsecurity.ne.jp') {
        const mobile:URL=new URL(next);mobile.hostname='s.netsecurity.ne.jp';next=mobile.href;
      }
      if(next && new URL(next).origin!==new URL(url).origin)throw new Error('Pagination changed publisher origin.');
      url=next;
      if(url)await new Promise(resolve=>setTimeout(resolve,600));
    }catch(e){partial=e instanceof Error?e.message:'Collection failed';break;}
  }
  if(url && seen.size===12 && !partial)partial='Collection stopped at the 12-page safety limit. Earlier reports may not be included.';
  updateSource(source.id,partial?(all.size?'partial':'error'):'healthy',all.size,partial);
}
export function collect(month=currentMonth(),{rssOnly=false}:{rssOnly?:boolean}={}):Promise<void>{
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Invalid archive month.');
  if(collectingMonth===month&&(collectingKind==='all'||rssOnly))return active||Promise.resolve();
  if(pendingJobs.some(job=>job.month===month&&(!job.rssOnly||rssOnly)))return active||Promise.resolve();
  if(!rssOnly){const queuedRss=pendingJobs.findIndex(job=>job.month===month&&job.rssOnly);if(queuedRss>=0)pendingJobs.splice(queuedRss,1);}
  const job={month,rssOnly};
  if(month===currentMonth())pendingJobs.unshift(job);else pendingJobs.push(job);
  dashboardChanged('collection');
  if(active)return active;
  active=(async()=>{
    while(pendingJobs.length){
      const job=pendingJobs.shift()!;collectingMonth=job.month;collectingKind=job.rssOnly?'rss':'all';dashboardChanged('collection');
      const enabled=getSources().filter(s=>s.enabled&&(job.rssOnly?s.kind==='RSS feed':collectingMonth===currentMonth()||s.kind==='HTML archive'));
      await Promise.allSettled(enabled.map(async source=>{
        try{await collectSource(source,job.month);}catch(e){updateSource(source.id,'error',0,e instanceof Error?e.message:'Collection failed');}
      }));
      if(!job.rssOnly){
        const archives=getSources().filter(s=>s.enabled&&s.kind==='HTML archive');
        const coverage=JSON.parse(setting('archiveCoverage','{}'));
        coverage[job.month]={checkedAt:new Date().toISOString(),complete:archives.length>0&&archives.every(s=>s.status==='healthy'),sources:archives.map(s=>({id:s.id,name:s.name,status:s.status,count:s.fetchedCount,error:s.error}))};
        setSetting('archiveCoverage',JSON.stringify(coverage));
        if(archives.length&&archives.every(s=>s.status==='healthy')){
          const months=new Set<string>(JSON.parse(setting('collectedMonths','[]')));months.add(job.month);setSetting('collectedMonths',JSON.stringify([...months].sort()));
        }
      }
      const now=new Date().toISOString();
      if(job.month===currentMonth()){
        if(!job.rssOnly)setSetting('lastWebsiteScan',now);
        if(enabled.some(s=>s.kind==='RSS feed'))setSetting('lastRssScan',now);
      }
      setSetting('lastCollected',now);
    }
  })().finally(()=>{active=null;collectingMonth=null;collectingKind=null;dashboardChanged('collection');});
  return active;
}
export function startScheduler(){
  const timestamp=(key:string,fallback='')=>{const value=Date.parse(setting(key,fallback));return Number.isFinite(value)?value:0;};
  const timer=setInterval(()=>{
    const kinds=getSources().filter(s=>s.enabled).map(s=>s.kind);
    const next=nextCollection({now:Date.now(),lastWeb:timestamp('lastWebsiteScan',setting('lastCollected')),lastRss:timestamp('lastRssScan'),webMinutes:Number(setting('refreshMinutes',String(DEFAULT_WEB_REFRESH_MINUTES))),kinds});
    if(next)void collect(currentMonth(),{rssOnly:next==='rss'}).catch(error=>console.error('Collection failed:',error.message));
  },1000);timer.unref();return timer;
}
