import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowsOut, BookmarkSimple, CheckCircle, DownloadSimple, GearSix, GlobeHemisphereEast, MagnifyingGlass, Moon, Plus, ShieldCheck, Sun, WarningCircle, X } from '@phosphor-icons/react';
import DateNavigator, { todayJst, type DateWindow } from './DateNavigator';
import MonitorSettings from './MonitorSettings';
import type { ChartInterval } from './activity';
import type { LiveStatus } from './useLiveUpdates';
import useArrivals from './useArrivals';
import ComparisonBlock from './ComparisonBlock';
import { buildComparison } from './comparison';
import { evidenceOf, latestArrival } from './arrivals';
import './monitor-theme.css';
import type { Category, DashboardData, Incident, Severity } from './types';
import './monitor.css';

interface Props {
  data:DashboardData|null; error:string; busy:boolean; liveStatus:LiveStatus; region:Incident['region']; interval:ChartInterval;
  range:DateWindow; reports:Incident[]; selectedRange:{start:string;end:string};
  onRegion:(region:Incident['region'])=>void; onInterval:(interval:ChartInterval)=>void; onRange:(range:DateWindow)=>void;
  onClearRange:()=>void; onRefresh:()=>void; onSelect:(id:string)=>void;
  onToggle:(incident:Incident)=>void;
  onMutate:(path:string,method:string,body?:unknown,onError?:(message:string)=>void)=>Promise<boolean>;
  chart:(height:number)=>ReactNode; detail:ReactNode; toast:ReactNode;
}
const num=(value:number)=>new Intl.NumberFormat('en-US').format(value);
const date=(value:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(`${value.slice(0,10)}T12:00:00Z`));
const categories:{name:Category;label:string;color:string}[]=[
  {name:'Data exposure',label:'Exposure',color:'#5279ee'},
  {name:'Ransomware',label:'Ransomware',color:'#e59bb9'},
  {name:'Unauthorized access',label:'Access',color:'#9cb6f5'},
  {name:'Phishing',label:'Phishing',color:'#d9b36e'},
  {name:'Malware',label:'Malware',color:'#b993b8'},
  {name:'Vulnerability',label:'Vuln.',color:'#a99bd5'},
  {name:'Service disruption',label:'Disruption',color:'#84bfa9'},
  {name:'Other',label:'Other',color:'#b9c1cd'},
];
const reportText=(incident:Incident)=>[incident.title,incident.organization,incident.summary,...(incident.reports||[]).map(r=>`${r.title} ${r.organization} ${r.summary}`)].join(' ').toLocaleLowerCase();

const sourceLabels:Record<string,string>={'incident-radar':'Radar',japanhacked:'JapanHacked',clipmaster:'ClipMaster',scannet:'ScanNet',bleeping:'Bleeping',thehackernews:'Hacker News'};

export function Monitor(props:Props) {
  const {data,reports,region,range,interval,busy}=props;
  const [theme,setTheme]=useState<'dark'|'light'>(()=>{try{return localStorage.getItem('sentra-monitor-theme')==='light'?'light':'dark';}catch{return 'dark';}});
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [showSearch,setShowSearch]=useState(false);
  const [severity,setSeverity]=useState<Severity|null>(null);
  const criticalOnly=severity==='Critical';
  const [savedOnly,setSavedOnly]=useState(false);
  const [sourceId,setSourceId]=useState('all');
  const [category,setCategory]=useState<Category|null>(null);
  const [keyword,setKeyword]=useState('');
  const [page,setPage]=useState(0);
  const [rowCount,setRowCount]=useState(3);
  const [chartHeight,setChartHeight]=useState(140);
  const [sourcePage,setSourcePage]=useState(0);
  const [watchPage,setWatchPage]=useState(0);
  const [newTerm,setNewTerm]=useState('');
  const [adding,setAdding]=useState(false);
  const [showAddTerm,setShowAddTerm]=useState(false);
  const [mobileTab,setMobileTab]=useState('activity');
  const [message,setMessage]=useState('');
  const [loadingHistory,setLoadingHistory]=useState(false);
  const {arrivals,announcedAt,active:arrivalActive}=useArrivals(data);
  const [compactSignals,setCompactSignals]=useState(()=>innerWidth>680&&innerHeight<760);
  const [showAllCategories,setShowAllCategories]=useState(false);
  const [arrivalSlots,setArrivalSlots]=useState(()=>innerWidth<=680?6:innerHeight<900?1:2);
  const [watchSlots,setWatchSlots]=useState(()=>innerWidth>680&&innerHeight<900?2:4);
  const recentArrivals=arrivals.filter(a=>arrivalActive&&a.collectedAt>=new Date(Date.parse(announcedAt||'1970-01-01')-60_000).toISOString());
  const arrivingIds=new Set(recentArrivals.flatMap(a=>a.reportIds));
  const arrivalLabel=(incident:Incident)=>recentArrivals.some(a=>a.kind==='incident'&&a.reportIds.some(id=>evidenceOf(incident).some(r=>r.id===id)))?'New':'Updated';
  const arriving=reports.filter(i=>evidenceOf(i).some(r=>arrivingIds.has(r.id)));
  const newIncidents=arriving.filter(i=>arrivalLabel(i)==='New').length;
  const regionalArrivals=data?.incidents.filter(i=>(i.regions||[i.region]).includes(region)&&evidenceOf(i).some(r=>arrivingIds.has(r.id))).length||0;
  const latest=data?.incidents.filter(i=>(i.regions||[i.region]).includes(region)).map(i=>({...i,arrivalAt:latestArrival(i)})).sort((a,b)=>b.arrivalAt.localeCompare(a.arrivalAt)).slice(0,arrivalSlots)||[];
  const arrivalTime=(value:string)=>new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(new Date(value));
  useEffect(()=>{
    const resize=()=>{setCompactSignals(innerWidth>680&&innerHeight<760);setWatchSlots(innerWidth>680&&innerHeight<900?2:4);};
    window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);
  },[]);
  const queueRef=useRef<HTMLDivElement>(null);
  const plotRef=useRef<HTMLDivElement>(null);
  const arrivalListRef=useRef<HTMLDivElement>(null);
  const screenRef=useRef<HTMLDivElement>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const sources=data?.sources.filter(s=>s.region===region)||[];
  const enabled=sources.filter(s=>s.enabled);
  const healthy=enabled.filter(s=>s.status==='healthy');
  const today=todayJst();
  const comparisonAnchor=props.selectedRange.end||props.selectedRange.start||range.end;
  const comparison=useMemo(()=>buildComparison({reports:data?.incidents.filter(incident=>(incident.regions||[incident.region]).includes(region))||[],anchor:comparisonAnchor,interval,today,sources,coverage:data?.archiveCoverage||{}}),[comparisonAnchor,interval,today,data,region]);
  async function loadComparisonHistory(months:string[]){
    setLoadingHistory(true);try{for(let offset=0;offset<months.length;offset+=12){if(!await props.onMutate('/refresh','POST',{months:months.slice(offset,offset+12)}))break;}}finally{setLoadingHistory(false);}
  }
  const watchlist=data?.watchlist||[];
  const watched=reports.filter(i=>watchlist.some(w=>reportText(i).includes(w.term.toLocaleLowerCase())));
  const critical=reports.filter(i=>i.severity==='Critical').length;
  const mix=categories.map(c=>({...c,count:reports.filter(i=>i.category===c.name).length})).sort((a,b)=>b.count-a.count);
  const filtered=useMemo(()=>reports.filter(i=>(!query||reportText(i).includes(query.toLocaleLowerCase()))&&(!severity||i.severity===severity)&&(!category||i.category===category)&&(!savedOnly||i.saved)&&(!keyword||reportText(i).includes(keyword.toLocaleLowerCase()))&&(sourceId==='all'||(i.reports||[i]).some(r=>r.sourceId===sourceId))&&(!props.selectedRange.start||(i.publishedAt>=props.selectedRange.start&&i.publishedAt<=(props.selectedRange.end||props.selectedRange.start)))),[reports,query,severity,category,savedOnly,keyword,sourceId,props.selectedRange.start,props.selectedRange.end]);
  const filteredArriving=filtered.filter(i=>evidenceOf(i).some(r=>arrivingIds.has(r.id)));
  const filteredNew=filteredArriving.filter(i=>arrivalLabel(i)==='New').length;
  const totalPages=Math.max(1,Math.ceil(filtered.length/rowCount));
  const actualPage=Math.min(page,totalPages-1);
  const visible=[...filtered].sort((a,b)=>{const aLive=evidenceOf(a).some(r=>arrivingIds.has(r.id)),bLive=evidenceOf(b).some(r=>arrivingIds.has(r.id));return Number(bLive)-Number(aLive)||(aLive&&bLive?latestArrival(b).localeCompare(latestArrival(a)):0)||b.publishedAt.localeCompare(a.publishedAt);}).slice(actualPage*rowCount,(actualPage+1)*rowCount);
  const archiveMonths=Object.entries(data?.archiveCoverage||{}).filter(([month])=>month>=range.start.slice(0,7)&&month<=range.end.slice(0,7));
  const incomplete=archiveMonths.filter(([,coverage])=>!coverage.complete);
  const sourcePages=Math.max(1,Math.ceil(sources.length/4));
  const watchPages=Math.max(1,Math.ceil(watchlist.length/watchSlots));
  const selectedSourcePage=Math.min(sourcePage,sourcePages-1);
  const selectedWatchPage=Math.min(watchPage,watchPages-1);

  useEffect(()=>{
    document.body.classList.add('monitor-mode');
    const syncTheme=(event:StorageEvent)=>{if(event.key==='sentra-monitor-theme')setTheme(event.newValue==='light'?'light':'dark');};
    window.addEventListener('storage',syncTheme);
    return()=>{document.body.classList.remove('monitor-mode');delete document.documentElement.dataset.monitorTheme;document.documentElement.style.colorScheme='';window.removeEventListener('storage',syncTheme);};
  },[]);
  useEffect(()=>{
    try{localStorage.setItem('sentra-monitor-theme',theme);}catch{/* The chosen theme still works when storage is unavailable. */}
    document.documentElement.dataset.monitorTheme=theme;document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#14181d':'#f6f7f9');
  },[theme]);
  useEffect(()=>{
    const queue=queueRef.current,plot=plotRef.current;
    if(!queue||!plot)return;
    const observer=new ResizeObserver(entries=>{
      for(const entry of entries){
        if(entry.target===queue&&entry.contentRect.height>0)setRowCount(Math.max(1,Math.min(12,Math.floor(entry.contentRect.height/60))));
        if(entry.target===plot&&entry.contentRect.height>0)setChartHeight(Math.max(60,Math.round(entry.contentRect.height)));
        if(entry.target===arrivalListRef.current&&entry.contentRect.height>0){
          const rowHeight=parseFloat(getComputedStyle(entry.target).getPropertyValue('--monitor-arrival-row'))||48;
          setArrivalSlots(Math.max(1,Math.min(32,Math.floor(entry.contentRect.height/rowHeight))));
        }
      }
    });
    observer.observe(queue);observer.observe(plot);if(arrivalListRef.current)observer.observe(arrivalListRef.current);return()=>observer.disconnect();
  },[!!data]);
  useEffect(()=>{setPage(0);},[query,severity,category,savedOnly,keyword,sourceId,region,range.start,range.end,props.selectedRange.start,rowCount]);
  useEffect(()=>{if(sourceId!=='all'&&!data?.sources.some(s=>s.id===sourceId&&s.enabled&&s.region===region))setSourceId('all');if(keyword&&!watchlist.some(w=>w.term===keyword))setKeyword('');},[data,sourceId,keyword,region]);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(settingsOpen)return;if((event.metaKey||event.ctrlKey)&&event.key==='k'){event.preventDefault();setMobileTab('feed');setShowSearch(true);}if(event.key==='Escape'){setShowAddTerm(false);setShowAllCategories(false);setMessage('');}};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[settingsOpen]);

  useEffect(()=>{if(showSearch)searchRef.current?.focus();},[showSearch]);

  function clearFilters(){setQuery('');setSeverity(null);setCategory(null);setSavedOnly(false);setKeyword('');setSourceId('all');props.onClearRange();}
  function download(){
    const rows=[['First reported','Title','Organization','Category','Severity','Sources','Original URLs'],...filtered.map(i=>[i.publishedAt,i.title,i.organization,i.category,i.severity,(i.reports||[i]).map(r=>data?.sources.find(s=>s.id===r.sourceId)?.name||r.sourceId).join(' | '),(i.reports||[i]).map(r=>r.url).join(' | ')])];
    const csv='\uFEFF'+rows.map(row=>row.map(value=>`"${String(value).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=`sentra-monitor-${region.toLowerCase()}-${range.end}.csv`;anchor.click();URL.revokeObjectURL(url);
    setMessage(`Exported ${num(filtered.length)} incidents.`);
  }
  async function fullScreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await screenRef.current?.requestFullscreen();}catch{setMessage('Use your browser’s full-screen control to expand the monitor.');}}
  async function addTerm(event:React.FormEvent){event.preventDefault();setAdding(true);try{if(await props.onMutate('/watchlist','POST',{term:newTerm})){setNewTerm('');setShowAddTerm(false);}}finally{setAdding(false);}}

  return <div className="monitor-screen" ref={screenRef} data-mobile-tab={mobileTab} data-theme={theme}>
    <a className="skip-link" href="#monitor-content">Skip to monitor</a>
    <header className="monitor-header">
      <div className="monitor-identity"><span className="brand"><span className="brand-icon"><ShieldCheck size={20} weight="bold"/></span><span>sentra<span className="brand-period">.</span></span></span><span className="monitor-header-divider"/><h1 aria-label="Incident monitor"><span className="monitor-title-full">Incident monitor</span><span className="monitor-title-short">Monitor</span></h1></div>
      <div className="monitor-header-actions">
        <button className="icon-button" aria-label={`Switch to ${theme==='dark'?'light':'dark'} mode`} title={`Switch to ${theme==='dark'?'light':'dark'} mode`} onClick={()=>setTheme(theme==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>
        <button className="icon-button" aria-label="Toggle full screen" title="Toggle full screen" onClick={()=>void fullScreen()}><ArrowsOut size={18}/></button>
        <button className="icon-button" aria-label="Settings" aria-haspopup="dialog" aria-controls="monitor-settings" title="Settings" onClick={()=>setSettingsOpen(true)}><GearSix size={19}/></button>
      </div>
    </header>
    <div className="monitor-toolbar">
      <div className="region-switch" role="group" aria-label="Coverage view"><button aria-pressed={region==='Japan'} className={region==='Japan'?'active':''} onClick={()=>props.onRegion('Japan')}><span className="japan-flag"/>Japan</button><button aria-pressed={region==='Global'} className={region==='Global'?'active':''} onClick={()=>props.onRegion('Global')}><GlobeHemisphereEast size={15}/>Global</button></div>
      <div className="monitor-period-controls"><div className="chart-toggle" role="group" aria-label="Chart interval">{(['Daily','Weekly','Monthly','Yearly'] as ChartInterval[]).map(item=><button key={item} className={interval===item?'active':''} aria-pressed={interval===item} onClick={()=>props.onInterval(item)}>{item}</button>)}</div><DateNavigator value={range} interval={interval} collected={[...new Set([...(data?.collectedMonths||[]),...Object.keys(data?.archiveCoverage||{})])]} onChange={props.onRange}/></div>
      <button className="icon-button monitor-refresh" aria-label="Refresh data" title={busy?'Collecting reports':'Refresh data'} onClick={props.onRefresh} disabled={busy||!data}><ArrowClockwise size={18} className={busy?'rotating':''}/></button>
    </div>
    <nav className="monitor-mobile-tabs" aria-label="Monitor section">{[['activity','Activity'],['feed','Incidents'],['arrivals','Live'],['signals','Signals']].map(([id,label])=><button key={id} aria-pressed={mobileTab===id} onClick={()=>setMobileTab(id)}>{label}</button>)}</nav>
    {!data?<main id="monitor-content" className="monitor-loading" aria-live="polite"><ShieldCheck size={32}/><h2>{props.error?'Unable to load the monitor':'Connecting your monitor…'}</h2><p>{props.error||'Loading collected reports, source health and watchlists.'}</p>{props.error&&<button className="button" onClick={()=>window.location.reload()}>Try again</button>}</main>:<main id="monitor-content" className="monitor-workspace">
      <div className="monitor-primary">
        <section className="monitor-sheet monitor-activity" aria-labelledby="monitor-activity-title">
          <div className="monitor-section-heading"><h2 id="monitor-activity-title">Incident activity</h2><span className="monitor-meta">{num(reports.reduce((sum,i)=>sum+(i.reportCount||1),0))} supporting reports</span></div>
          <div className="monitor-stats" data-arrivals={newIncidents>0}>
            <div><span>Incidents</span><strong key={`incidents:${reports.length}`} className={newIncidents?'number-updated':undefined}>{num(reports.length)}</strong></div>
            <button className={criticalOnly?'active':''} aria-pressed={criticalOnly} title="Includes source-reported and inferred severity. Open a report to inspect the severity basis." onClick={()=>{setSeverity(value=>value==='Critical'?null:'Critical');setMobileTab('feed');}}><span><i className="tiny-dot pink"/>Critical</span><strong key={`critical:${critical}`} className={newIncidents?'number-updated':undefined}>{num(critical)}</strong></button>
            <div><span>Watchlist</span><strong key={`watched:${watched.length}`} className={newIncidents?'number-updated':undefined}>{num(watched.length)}</strong></div>
          </div>
          <ComparisonBlock className="monitor-mobile-comparison" id="monitor-mobile-comparison-title" model={comparison} busy={busy||loadingHistory} onLoadHistory={months=>void loadComparisonHistory(months)}/>
          <div className="monitor-plot" ref={plotRef}>{props.chart(chartHeight)}</div>
          <div className="monitor-chart-key"><span><i className="hatched-swatch"/>Data exposure</span><span><i/>Other incidents</span><span className="monitor-chart-hint">Select a bar to filter</span></div>
        </section>
        <section className="monitor-sheet monitor-feed" aria-labelledby="monitor-feed-title">
          <div className="monitor-section-heading"><div className="title-with-count"><h2 id="monitor-feed-title">Incident feed</h2><span className={`count-label ${filteredArriving.length?'has-arrivals':''}`}>{num(filtered.length)}{filteredArriving.length>0&&<b> +{filteredNew||filteredArriving.length} {filteredNew?'new':'updated'}</b>}</span></div><div className="monitor-feed-actions"><button className="icon-button" aria-label="Search and filter incidents" aria-expanded={showSearch} onClick={()=>setShowSearch(v=>!v)}><MagnifyingGlass size={17}/></button><button className={`icon-button ${savedOnly?'selected':''}`} aria-label="Show saved incidents" aria-pressed={savedOnly} onClick={()=>setSavedOnly(v=>!v)}><BookmarkSimple size={17} weight={savedOnly?'fill':'regular'}/></button><button className="icon-button" aria-label="Export filtered incidents as CSV" onClick={download}><DownloadSimple size={17}/></button></div></div>
          {(showSearch||query||sourceId!=='all')&&<div className="monitor-search-row"><label className="search-input"><MagnifyingGlass size={16}/><input ref={searchRef} aria-label="Search incidents" placeholder="Search incidents or organizations…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Clear search" onClick={()=>setQuery('')}><X size={14}/></button>}</label><select aria-label="Filter by source" value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="all">All sources</option>{enabled.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
          {(severity||category||keyword||props.selectedRange.start)&&<div className="monitor-filter-state"><span>{[severity&&`${severity} only`,category,keyword,props.selectedRange.start&&`${date(props.selectedRange.start)}${props.selectedRange.end?` – ${date(props.selectedRange.end)}`:''}`].filter(Boolean).join(' · ')}</span><button onClick={clearFilters}>Clear filters <X size={12}/></button></div>}
          <div className="monitor-queue" ref={queueRef} style={{gridTemplateRows:`repeat(${rowCount},minmax(0,1fr))`}}>{visible.length?visible.map(incident=><article className={`monitor-incident ${evidenceOf(incident).some(r=>arrivingIds.has(r.id))?'just-arrived':''}`} key={incident.id}><button className="monitor-incident-main" onClick={()=>props.onSelect(incident.id)}><strong title={incident.title}>{incident.title}</strong><span>{evidenceOf(incident).some(r=>arrivingIds.has(r.id))&&<b className="monitor-new-label">{arrivalLabel(incident)}</b>}<time dateTime={incident.publishedAt}>{date(incident.publishedAt)}</time><span className="monitor-row-source">{[...new Set((incident.reports||[incident]).map(r=>data.sources.find(s=>s.id===r.sourceId)?.name||r.sourceId))].join(' · ')}</span>{(incident.reportCount||1)>1&&<span className="monitor-merged">{incident.reportCount} reports</span>}</span></button><span className={`severity severity-${incident.severity.toLowerCase()}`}><span className="tiny-dot" style={{background:'currentColor'}}/>{incident.severity}</span><button className={`icon-button ${incident.saved?'selected':''}`} aria-label={`${incident.saved?'Unsave':'Save'} ${incident.title}`} aria-pressed={incident.saved} onClick={()=>props.onToggle(incident)}><BookmarkSimple size={16} weight={incident.saved?'fill':'regular'}/></button></article>):<div className="monitor-empty"><MagnifyingGlass size={22}/><strong>{enabled.length?'No matching incidents':'Sources are turned off'}</strong><span>{enabled.length?'Adjust the period or clear your filters.':'Enable a source in the collection panel.'}</span>{(query||severity||category||savedOnly||keyword||sourceId!=='all'||props.selectedRange.start)&&<button className="text-button" onClick={clearFilters}>Clear filters</button>}</div>}</div>
          <div className="monitor-pagination"><span>{filtered.length?`${num(actualPage*rowCount+1)}–${num(Math.min((actualPage+1)*rowCount,filtered.length))} of ${num(filtered.length)}`:'0 incidents'}<span className="monitor-pagination-note"> · newest first</span></span><div><button className="icon-button" aria-label="Previous incidents" disabled={actualPage===0} onClick={()=>setPage(actualPage-1)}><ArrowLeft size={16}/></button><span>{num(actualPage+1)} / {num(totalPages)}</span><button className="icon-button" aria-label="Next incidents" disabled={actualPage>=totalPages-1} onClick={()=>setPage(actualPage+1)}><ArrowRight size={16}/></button></div></div>
        </section>
      </div>
      <aside className="monitor-sidebar" aria-label="Incident signals and collection">
        <section className="monitor-sheet monitor-mix" aria-labelledby="monitor-mix-title"><div className="monitor-section-heading"><h2 id="monitor-mix-title">Incident mix</h2><button className="monitor-meta monitor-category-toggle" aria-label="Show all incident categories" aria-expanded={showAllCategories} onClick={()=>setShowAllCategories(v=>!v)}>All types</button></div><div className="monitor-mix-bar" role="img" aria-label={mix.map(c=>`${c.name}: ${c.count}`).join(', ')}>{mix.filter(c=>c.count).map(c=><span key={c.name} style={{flex:c.count,background:c.color}}/>)}</div><div className="monitor-mix-list">{(compactSignals?mix.slice(0,4):mix).map(c=><button key={c.name} title={`${c.name}: ${num(c.count)} incidents (${reports.length?Math.round(c.count/reports.length*100):0}%). Filter the incident feed by this category.`} aria-pressed={category===c.name} onClick={()=>{setCategory(category===c.name?null:c.name);setMobileTab('feed');}}><i style={{background:c.color}}/><span>{c.label}</span><b>{reports.length?Math.round(c.count/reports.length*100):0}%</b></button>)}</div>{showAllCategories&&<div className="monitor-category-popover"><div className="monitor-section-heading"><h3>Incident categories</h3><button className="icon-button" aria-label="Close incident categories" onClick={()=>setShowAllCategories(false)}><X size={16}/></button></div>{mix.map(c=><button key={c.name} onClick={()=>{setCategory(c.name);setMobileTab('feed');setShowAllCategories(false);}}><span>{c.name}</span><b>{num(c.count)}</b></button>)}</div>}</section>
        <section className="monitor-sheet monitor-arrivals" aria-labelledby="monitor-arrivals-title"><div className="monitor-section-heading"><h2 id="monitor-arrivals-title">Live arrivals</h2><span className={`monitor-arrival-state ${regionalArrivals?'has-arrivals':''}`}>{regionalArrivals?`${regionalArrivals} updated`:'Latest'}</span></div><div className="monitor-arrival-list" ref={arrivalListRef}>{latest.length?latest.map(incident=><button key={incident.id} className={evidenceOf(incident).some(r=>arrivingIds.has(r.id))?'just-arrived':''} onClick={()=>props.onSelect(incident.id)} title={`${incident.title} — Reported ${incident.publishedAt}; collected ${incident.arrivalAt}`}><strong>{incident.title}</strong><span><time dateTime={incident.arrivalAt}>Collected {arrivalTime(incident.arrivalAt)}</time><span>{data.sources.find(s=>s.id===[...evidenceOf(incident)].sort((a,b)=>b.firstSeen.localeCompare(a.firstSeen))[0].sourceId)?.name}</span></span></button>):<p className="monitor-arrival-empty">Waiting for reports from enabled sources.</p>}</div><span className="sr-only" role="status" aria-live="polite">{arrivalActive&&arriving.length?`${newIncidents} new ${newIncidents===1?'incident':'incidents'} and ${arriving.length-newIncidents} coverage ${arriving.length-newIncidents===1?'update':'updates'} collected in the selected period. Dashboard counts updated.`:''}</span></section>
        <section className="monitor-sheet monitor-watch" aria-labelledby="monitor-watch-title"><div className="monitor-section-heading"><h2 id="monitor-watch-title">Watchlist</h2><div className="monitor-small-controls">{watchPages>1&&<><button className="icon-button" aria-label="Previous watchlist keywords" disabled={!selectedWatchPage} onClick={()=>setWatchPage(selectedWatchPage-1)}><ArrowLeft size={14}/></button><button className="icon-button" aria-label="Next watchlist keywords" disabled={selectedWatchPage>=watchPages-1} onClick={()=>setWatchPage(selectedWatchPage+1)}><ArrowRight size={14}/></button></>}<button className="icon-button" aria-label="Add watchlist keyword" aria-expanded={showAddTerm} onClick={()=>setShowAddTerm(v=>!v)}><Plus size={16}/></button></div></div><div className="monitor-keywords">{watchlist.slice(selectedWatchPage*watchSlots,selectedWatchPage*watchSlots+watchSlots).map(w=><button key={w.id} title={w.term} className={keyword===w.term?'active':''} aria-pressed={keyword===w.term} onClick={()=>{setKeyword(keyword===w.term?'':w.term);setMobileTab('feed');}}><span>{w.term}</span><b>{num(reports.filter(i=>reportText(i).includes(w.term.toLocaleLowerCase())).length)}</b></button>)}{!watchlist.length&&<button className="text-button" onClick={()=>setShowAddTerm(true)}>Add a name or threat to follow <Plus size={14}/></button>}</div>{showAddTerm&&<form className="monitor-add-keyword" onSubmit={e=>void addTerm(e)}><label htmlFor="monitor-keyword">Add a keyword</label><div><input id="monitor-keyword" aria-label="New watchlist keyword" autoFocus value={newTerm} onChange={e=>setNewTerm(e.target.value)} minLength={2} maxLength={80} placeholder="Organization or threat" required/><button className="button primary" disabled={adding}>{adding?'Adding…':'Add'}</button><button type="button" className="icon-button" aria-label="Close keyword form" onClick={()=>setShowAddTerm(false)}><X size={16}/></button></div></form>}</section>
        <section className="monitor-sheet monitor-sources" aria-labelledby="monitor-sources-title"><div className="monitor-section-heading"><h2 id="monitor-sources-title">Collection</h2><div className="monitor-small-controls"><span className="monitor-meta">{enabled.length}/{sources.length} on</span>{sourcePages>1&&<><button className="icon-button" aria-label="Previous sources" disabled={!selectedSourcePage} onClick={()=>setSourcePage(selectedSourcePage-1)}><ArrowLeft size={14}/></button><button className="icon-button" aria-label="Next sources" disabled={selectedSourcePage>=sourcePages-1} onClick={()=>setSourcePage(selectedSourcePage+1)}><ArrowRight size={14}/></button></>}</div></div><div className="monitor-source-list">{sources.slice(selectedSourcePage*4,selectedSourcePage*4+4).map(s=><div key={s.id}><span className={`status-dot ${s.enabled?s.status==='healthy'?'live':'degraded':''}`} title={!s.enabled?'Turned off':s.error||s.status}/><label htmlFor={`monitor-source-${s.id}`} title={`${s.name}${s.error?`: ${s.error}`:''}`}>{sourceLabels[s.id]||s.name}</label><button id={`monitor-source-${s.id}`} role="switch" aria-checked={s.enabled} aria-label={`Enable ${s.name}`} className={`toggle ${s.enabled?'on':''}`} onClick={()=>void props.onMutate(`/sources/${s.id}`,'PATCH',{enabled:!s.enabled})}><span/></button></div>)}</div><div className="monitor-source-footer"><span>{busy?'Collecting…':!enabled.length?'Paused':`${healthy.length}/${enabled.length} healthy`}</span><label className="monitor-cadence" title={`RSS feeds are checked every ${data.rssRefreshMinutes||1} minute; choose the website interval.`}><select aria-label="Website scan interval" value={data.refreshMinutes} onChange={event=>void props.onMutate('/settings','PATCH',{refreshMinutes:Number(event.target.value)})}>{[5,15,30,60,120].map(value=><option key={value} value={value}>Web {value}m</option>)}</select></label></div></section>
        <ComparisonBlock className="monitor-sheet" id="monitor-comparison-title" model={comparison} busy={busy||loadingHistory} onLoadHistory={months=>void loadComparisonHistory(months)}/>
      </aside>
    </main>}
    <footer className="monitor-footer"><span className="monitor-live-status" data-state={props.liveStatus} aria-live="polite" title={`Live server updates. RSS checks every ${data?.rssRefreshMinutes||1} minute; websites every ${data?.refreshMinutes||5} minutes.`}><span className={`status-dot ${props.liveStatus==='live'?'live':props.liveStatus==='offline'?'degraded':'working'}`}/>{props.liveStatus==='offline'?'Offline · cached data':props.liveStatus==='reconnecting'?'Reconnecting…':props.liveStatus==='connecting'?'Connecting live…':props.liveStatus==='fallback'?'Auto refresh':props.error?'Update failed · cached data':busy?`Live · ${data?.collectingKind==='rss'?'Checking feeds…':'Collecting…'}`:data?.lastCollected?`Live · Checked ${new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Tokyo'}).format(new Date(data.lastCollected))} JST`:'Live · Awaiting collection'}</span><span className="monitor-grouping"><CheckCircle size={13}/>Automatic duplicate merging</span>{region==='Japan'?<details className="monitor-coverage"><summary>{incomplete.length?<WarningCircle size={14}/>:<CheckCircle size={14}/>}<span>{incomplete.length?'Partial archives':`${archiveMonths.length} archive months checked`}</span></summary><div className="monitor-coverage-popover"><h3>Archive coverage</h3><p>{archiveMonths.filter(([,c])=>c.complete).length}/{archiveMonths.length} checked months complete. Available reports are included.</p>{incomplete.map(([month,c])=><div key={month}><strong>{month}</strong><span>{c.sources.filter(s=>s.status!=='healthy').map(s=>`${s.name}: ${s.error||s.status}`).join(' · ')}</span></div>)}<button className="button" disabled={busy} onClick={props.onRefresh}>Retry collection <ArrowClockwise size={14}/></button></div></details>:<span className="monitor-rss-note">RSS history from collection onward</span>}</footer>
    {props.detail}{props.toast}{message&&<div className="toast" role="status"><CheckCircle size={18}/><span>{message}</span><button aria-label="Dismiss message" onClick={()=>setMessage('')}><X size={16}/></button></div>}
    <MonitorSettings open={settingsOpen} onClose={()=>setSettingsOpen(false)} data={data} region={region} theme={theme} onTheme={setTheme} onMutate={props.onMutate}/>
  </div>;
}
