import express from 'express';
import { resolve } from 'node:path';
import { db, setting, setSetting, startDatabaseWatcher } from './db.ts';
import { startScheduler } from './collector.ts';
import { createApp } from './app.ts';
import { closeDashboardStreams } from './live.ts';

if(setting('liveCollectionVersion')!=='1'){
  setSetting('refreshMinutes','5');setSetting('liveCollectionVersion','1');
}
const app=createApp();
if(process.env.NODE_ENV==='production'){
  app.use(express.static(resolve('dist')));
  app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
}else{
  const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);
}
const port=Number(process.env.PORT || 3000);const host=process.env.HOST || '127.0.0.1';
const server=app.listen(port,host,()=>console.log(`Sentra is ready at http://${host}:${port}`));
const timer=process.env.AUTO_COLLECT==='false'?null:startScheduler();
const databaseWatcher=startDatabaseWatcher();
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  if(timer)clearInterval(timer);clearInterval(databaseWatcher);closeDashboardStreams();
  server.close(()=>{db.close();process.exit(0);});
});
