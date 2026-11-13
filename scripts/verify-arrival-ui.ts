/** Isolated, explicitly synthetic UI verification. Never opens the user's database. */
import express from 'express';
import { resolve } from 'node:path';
process.env.DATABASE_PATH=':memory:';
process.env.AUTO_COLLECT='false';
const {db,getReports,getSources,getWatchlist,saveReports,addWatchTerm}=await import('../server/db.ts');
const {createApp}=await import('../server/app.ts');
const {groupIncidents}=await import('../server/dedupe.ts');
const {closeDashboardStreams}=await import('../server/live.ts');
const {currentMonth}=await import('../server/collector.ts');
const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'});
const example=(id:string,organization:string,sourceId='clipmaster')=>({id,sourceId,organization,title:`${organization} — synthetic incident for live-update verification`,url:`https://example.com/verification/${id}`,publishedAt:day,category:'Unauthorized access' as const,severity:'Critical' as const,severityBasis:'Synthetic test fixture',region:'Japan' as const,summary:'Isolated browser verification; never added to the real dashboard.',impact:'Not applicable',sector:'Testing',reportedStatus:'Synthetic'});
db.exec("UPDATE sources SET enabled=CASE WHEN id IN ('clipmaster','incident-radar') THEN 1 ELSE 0 END,status='healthy'");
saveReports([{...example('fixture-initial','Verification Atlas'),severity:'High'}]);
addWatchTerm('Verification Boreal');
const months=Array.from({length:12},(_,n)=>{const date=new Date(`${currentMonth()}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()-n);return date.toISOString().slice(0,7);});
const app=express();
function inject(command:string){
 if(command==='new')saveReports([example('fixture-new','Verification Boreal')]);
 if(command==='coverage')saveReports([example('fixture-extra','Verification Boreal','incident-radar')]);
 if(command==='rescan')saveReports([example('fixture-new','Verification Boreal')]);
 return {incidents:groupIncidents(getReports()).length,reports:getReports().length};
}
app.post('/__verification/:command',(req,res)=>res.json(inject(String(req.params.command))));
app.get('/api/dashboard',(_req,res)=>{const reports=getReports({enabledOnly:true});res.json({incidents:groupIncidents(reports),sources:getSources(),watchlist:getWatchlist(),collecting:false,lastCollected:new Date().toISOString(),refreshMinutes:5,rssRefreshMinutes:1,currentMonth:currentMonth(),rawReportCount:reports.length,months,collectedMonths:months,collectingMonth:null,collectingKind:null,pendingMonths:[],archiveCoverage:Object.fromEntries(months.map(month=>[month,{checkedAt:new Date().toISOString(),complete:true,sources:[]}]))});});
app.use(createApp());app.use(express.static(resolve('dist')));app.get('/monitor',(_req,res)=>res.sendFile(resolve('dist/index.html')));
const server=app.listen(3001,'127.0.0.1',()=>console.log('Synthetic verification monitor: http://127.0.0.1:3001/. Commands: new / coverage / rescan / quit.'));
process.stdin.setEncoding('utf8');process.stdin.on('data',input=>{const command=String(input).trim();
 if(command==='new')saveReports([example('fixture-new','Verification Boreal')]);
 if(command==='coverage')saveReports([example('fixture-extra','Verification Boreal','incident-radar')]);
 if(command==='rescan')saveReports([example('fixture-new','Verification Boreal')]);
 if(command==='quit'){closeDashboardStreams();server.close(()=>{db.close();process.exit(0);});}
 if(command!=='quit')console.log(command,JSON.stringify({incidents:groupIncidents(getReports()).length,reports:getReports().length}));
});
