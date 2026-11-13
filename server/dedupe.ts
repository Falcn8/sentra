import type { Incident } from '../src/types.ts';

const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/株式会社|有限会社|合同会社|一般社団法人|公益社団法人|一般財団法人|公益財団法人/g,'').replace(/[^\p{L}\p{N}]/gu,'');
const organization=(value:string)=>normalize(value.split(/[（(]/)[0]);
const distance=(a:string,b:string)=>Math.abs(new Date(a).getTime()-new Date(b).getTime())/86400000;
const priority:Record<string,number>={japanhacked:0,'incident-radar':1,clipmaster:2,scannet:3,bleeping:4,thehackernews:5};
const servicePatterns:[string,RegExp][]=[
  ['onamae-desktop-cloud',/お名前\s*\.\s*com.*デスクトップ|onamae.*desktop|gmo.*(?:fx trading cloud|shut down pcs.*ransomware)/i],
  ['gmo-infoq',/infoq|gmoリサーチ[&＆]ai/i],
  ['gmo-conoha-wing',/conoha\s*wing/i],
  ['sonet-member-database',/so[\s-]?net.*(?:会員|database)|ソニーネットワークコミュニケーションズ/i],
  ['rakuten-travel',/楽天トラベル|rakuten travel/i],
  ['rakuten-drive',/楽天ドライブ|rakuten drive/i],
  ['rakuten-mobile-payment',/楽天モバイル.*支払い証明書/i],
  ['blastmail',/ブラストメール|\bblastmail\b/i],
  ['cuenote',/cuenote\s*(?:fc|base)|ユミルリンク.*メール配信/i],
  ['temairazu',/temairazu|手間いらず/i],
  ['wasabi-switch',/wasabi\s*switch/i],
  ['studio-cloud',/studio不正アクセス|studio.*(?:クラウド環境|cloud.*breach)/i],
  ['microsoft365',/microsoft\s*365|マイクロソフト\s*365|m365/i],
  ['google-workspace',/google\s*workspace|グーグルワークスペース/i],
  ['slack',/\bslack\b/i],
  ['development-cloud',/システム開発.*クラウド|開発用.*クラウド/i],
];
const rootServices=new Set(['onamae-desktop-cloud','gmo-infoq','gmo-conoha-wing','sonet-member-database','rakuten-travel','rakuten-drive','rakuten-mobile-payment','blastmail','cuenote','temairazu','wasabi-switch','studio-cloud']);
const isRoot=(value:string)=>rootServices.has(value)||value.startsWith('provider:');
function namedProvider(report:Incident):string {
  const match=(`${report.organization} ${report.title}`).normalize('NFKC').match(/\(([^()]{2,60}?)(?:への)?(?:不正アクセス|ランサムウェア(?:攻撃)?|サイバー攻撃|への攻撃)\)/);
  return match?normalize(match[1].replace(/^(?:委託先|取引先)\s*/,'').replace(/への$/,'')):'';
}
function service(report:Incident):string {
  const text=`${report.title} ${report.organization} ${report.url}`.normalize('NFKC');
  return servicePatterns.find(([,pattern])=>pattern.test(text))?.[0] || '';
}
function similarity(a:string,b:string):number{
  const parts=(value:string)=>{const s=normalize(value);return new Set(Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2)));};
  const x=parts(a),y=parts(b);if(!x.size||!y.size)return 0;let overlap=0;for(const p of x)if(y.has(p))overlap++;return 2*overlap/(x.size+y.size);
}
const canonicalUrl=(value:string)=>{const url=new URL(value);if(url.hostname==='s.netsecurity.ne.jp')url.hostname='scan.netsecurity.ne.jp';for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid|ref)$/i.test(key))url.searchParams.delete(key);url.hash='';return url.href.replace(/\/$/,'');};

export function groupIncidents(reports:Incident[]):Incident[]{
  const entities=[...new Set(reports.map(r=>organization(r.organization)).filter(name=>name.length>=4))].sort((a,b)=>b.length-a.length);
  const identify=(report:Incident)=>{
    const explicit=organization(report.organization);if(explicit)return explicit;
    const text=normalize(report.title);
    return entities.find(entity=>{const index=text.indexOf(entity);return index>=0&&index<=12;}) || '';
  };
  type Group={members:Incident[];entity:string;service:string;basis:string};
  const groups:Group[]=[];const index=new Map<string,Set<Group>>();
  const providers=[...new Set(reports.map(namedProvider).filter(Boolean))].sort((a,b)=>b.length-a.length);
  const metadata=new Map<string,{entity:string;topic:string;title:string;url:string}>();
  for(const report of reports){
    const entity=identify(report),title=normalize(report.title);const provider=namedProvider(report)||providers.find(name=>name===entity||(title.startsWith(name)&&/不正アクセス|サイバー攻撃|ランサムウェア/.test(report.title)));
    metadata.set(report.id,{entity,topic:service(report)||(provider?`provider:${provider}`:''),title,url:canonicalUrl(report.url)});
  }
  const addIndex=(key:string,group:Group)=>{if(!index.has(key))index.set(key,new Set());index.get(key)!.add(group);};
  const keysFor=(meta:{entity:string;topic:string;title:string;url:string})=>[
    `url:${meta.url}`,`title:${meta.title}`,...(meta.entity?[`entity:${meta.entity}`]:[]),...(isRoot(meta.topic)?[`service:${meta.topic}`]:[]),
  ];
  const sorted=[...reports].sort((a,b)=>a.publishedAt.localeCompare(b.publishedAt)||a.id.localeCompare(b.id));
  for(const report of sorted){
    const meta=metadata.get(report.id)!;const {entity,topic,title,url}=meta;
    const candidates=new Set<Group>();for(const key of keysFor(meta))for(const group of index.get(key)||[])candidates.add(group);
    if(!entity)for(let delta=-3;delta<=3;delta++){const date=new Date(report.publishedAt);date.setUTCDate(date.getUTCDate()+delta);for(const group of index.get(`unidentified:${date.toISOString().slice(0,10)}`)||[])candidates.add(group);}
    let basis='';
    const group=[...candidates].find(g=>{
      if(distance(g.members[0].publishedAt,report.publishedAt)>(isRoot(topic)?45:32))return false;
      if(g.members.some(r=>metadata.get(r.id)!.url===url)){basis='Same original article URL';return true;}
      if(topic&&isRoot(topic)&&g.service===topic){basis='Same affected service or explicitly named provider incident within a 45 day reporting window';return true;}
      if(entity&&g.entity===entity){
        // A shared company is insufficient when the affected systems differ.
        if(topic&&g.service&&topic!==g.service)return false;
        if(topic&&topic===g.service){basis='Same organization and affected system within a 32 day reporting window';return true;}
        const close=g.members.some(r=>distance(r.publishedAt,report.publishedAt)<=3);
        if(close&&g.members.some(r=>metadata.get(r.id)!.title===title||similarity(r.title,report.title)>=.38)){
          basis='Matching organization, nearby publication dates, and overlapping headline evidence';return true;
        }
      }
      if(g.members.some(r=>metadata.get(r.id)!.title===title&&(!entity||!g.entity||entity===g.entity))){basis='Matching normalized headline and reporting window';return true;}
      if(!entity&&!g.entity&&g.members.some(r=>distance(r.publishedAt,report.publishedAt)<=3&&similarity(r.title,report.title)>=.8)){
        basis='Near-identical headlines within three days';return true;
      }
      return false;
    });
    const selected=group||{members:[],entity,service:topic,basis:'Single source report'};
    if(!group)groups.push(selected);
    selected.members.push(report);if(!selected.service&&topic)selected.service=topic;if(!selected.entity&&entity)selected.entity=entity;if(basis)selected.basis=basis;
    for(const key of keysFor(meta))addIndex(key,selected);if(!entity)addIndex(`unidentified:${report.publishedAt}`,selected);
  }
  return groups.map(g=>{
    const members=[...g.members].sort((a,b)=>(priority[a.sourceId]??6)-(priority[b.sourceId]??6)||a.publishedAt.localeCompare(b.publishedAt)||a.id.localeCompare(b.id));
    const representative=members[0];const dates=members.map(m=>m.publishedAt).sort();
    return {...representative,publishedAt:dates[0],latestPublishedAt:dates[dates.length-1],
      regions:[...new Set(members.map(m=>m.region))],reports:members,reportCount:members.length,dedupeBasis:g.basis,
      saved:members.some(m=>m.saved),reviewed:members.every(m=>m.reviewed),
      firstSeen:members.map(m=>m.firstSeen).sort()[0],updatedAt:members.map(m=>m.updatedAt).sort().at(-1)!,
    };
  }).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||b.latestPublishedAt.localeCompare(a.latestPublishedAt)||a.id.localeCompare(b.id));
}
