import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';

export function privateAddress(ip:string): boolean {
  const v=ip.toLowerCase();
  if(v.includes(':')) {
    if(v.startsWith('::ffff:')) return privateAddress(v.slice(7));
    return v==='::' || v==='::1' || /^(?:fc|fd|fe[89ab]|ff)/.test(v) || !/^[23]/.test(v);
  }
  const [a,b]=v.split('.').map(Number);
  return a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) ||
    (a===192&&(b===168||b===0)) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19));
}
export async function validatePublicUrl(value:string):Promise<URL> {
  let url:URL;try{url=new URL(value);}catch{throw new Error('Enter a valid HTTPS feed URL.');}
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443')) throw new Error('Use a public HTTPS URL without credentials or a custom port.');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new Error('Local and private network URLs are not supported.');
  const addresses=isIP(host) ? [{address:host}] : await lookup(host,{all:true});
  if(!addresses.length || addresses.some(a=>privateAddress(a.address))) throw new Error('This URL must resolve to a public internet address.');
  return url;
}
export async function fetchPublic(url:string, redirects=0):Promise<string> {
  const target=await validatePublicUrl(url);
  const host=target.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await lookup(host,{all:true});
  if(!addresses.length||addresses.some(a=>privateAddress(a.address)))throw new Error('Feed address changed to a private network.');
  const address=addresses.find(a=>a.family===4)||addresses[0];
  // Pin the verified IP to this request; a second DNS resolution cannot bypass validation.
  return new Promise((resolve,reject)=>{
    const req=request(target,{family:address.family,lookup:(_host,_options,callback)=>callback(null,address.address,address.family),signal:AbortSignal.timeout(25000),headers:{
      'User-Agent':'SentraIncidentMonitor/1.0 (public headline aggregation; local personal dashboard)',
      'Accept':'text/html, application/rss+xml, application/atom+xml, application/xml;q=0.9'}},response=>{
      const status=response.statusCode||0;
      if(status>=300&&status<400){response.resume();const location=response.headers.location;
        if(redirects>=4)return reject(new Error('Too many redirects.'));
        if(!location)return reject(new Error('Redirect missing destination.'));
        void fetchPublic(new URL(location,target).href,redirects+1).then(resolve,reject);return;
      }
      if(status<200||status>=300){response.resume();return reject(new Error(`Publisher returned HTTP ${status}. Cached reports are retained.`));}
      const chunks:Buffer[]=[];let size=0;
      response.on('data',(chunk:Buffer)=>{size+=chunk.byteLength;if(size>6_000_000){req.destroy(new Error('Response exceeds the 6 MB feed limit.'));return;}chunks.push(chunk);});
      response.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));response.on('error',reject);
    });
    req.on('error',reject);req.end();
  });
}
