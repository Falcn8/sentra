import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';
import type { Category, Incident, Severity } from '../src/types.ts';

export type ParsedReport = Omit<Incident, 'firstSeen' | 'updatedAt' | 'saved' | 'reviewed'>;
export const clean = (value: string) => value.replace(/\s+/g, ' ').trim();
const plain = (value: string) => clean(cheerio.load(value).text());
export function classify(text: string): Category {
  if (/ransomware|ランサム|身代金/i.test(text)) return 'Ransomware';
  if (/phish|フィッシング|なりすまし|メール詐欺/i.test(text)) return 'Phishing';
  if (/malware|マルウェア|ウイルス|trojan|backdoor|botnet|stealer|\bworm\b/i.test(text)) return 'Malware';
  if (/情報漏[洩え]|漏えい|流出|data (?:breach|leak|expos)|leaked|exposed/i.test(text)) return 'Data exposure';
  if (/脆弱|vulnerab|CVE-\d|zero.day|exploit|\bflaws?\b|\bbugs?\b|patch(?:es|ed)?|Pwn2Own/i.test(text)) return 'Vulnerability';
  if (/不正アクセス|不正侵入|不正ログイン|乗っ取|unauthori[sz]ed|hack|intrusion|compromis|breaches?.*(?:network|server)/i.test(text)) return 'Unauthorized access';
  if (/DDoS|outage|disrupt|サービス停止|障害|サーバー.*停止/i.test(text)) return 'Service disruption';
  return 'Other';
}
export function inferSeverity(text: string, category: Category, impact = '', declared = ''): {severity: Severity; severityBasis: string} {
  const sourceSeverity: Record<string, Severity> = { '重大':'Critical', '大':'High', '中':'Medium', '小':'Low' };
  const level = declared.replace(/[\[\]\s]/g, '');
  if (sourceSeverity[level]) return { severity: sourceSeverity[level], severityBasis: `Reported by source: ${level}` };
  // Never parse dates or multiple different impact figures as a combined population.
  const count = impact.match(/(?:^|\s)([\d,]+)件(?:$|（|\s)/)?.[1];
  if (category === 'Ransomware' || (count && Number(count.replaceAll(',','')) >= 1_000_000))
    return {severity:'Critical', severityBasis:'Inferred: ransomware or a single reported impact of at least 1 million records. Not a verified risk score.'};
  if (['Data exposure','Unauthorized access','Vulnerability','Malware'].includes(category))
    return {severity:'High', severityBasis:'Inferred from report category. Not a verified risk score.'};
  if (['Phishing','Service disruption'].includes(category))
    return {severity:'Medium', severityBasis:'Inferred from report category. Not a verified risk score.'};
  return {severity:'Unrated', severityBasis:'Insufficient structured evidence to assign a severity.'};
}

function report(sourceId: string, region: 'Japan' | 'Global', fields: Partial<ParsedReport> & Pick<ParsedReport,'title'|'url'|'publishedAt'>): ParsedReport | null {
  const title = clean(fields.title);
  if (!title || !/^https?:\/\//.test(fields.url) || !/^\d{4}-\d{2}-\d{2}$/.test(fields.publishedAt)) return null;
  const category = classify(`${title} ${fields.summary || ''}`);
  const inferred = inferSeverity(title, category, fields.impact);
  return { id:createHash('sha256').update(`${sourceId}:${fields.url}`).digest('hex').slice(0,24),
    sourceId, region, organization:'', category, ...inferred, summary:'', impact:'Not disclosed', sector:'Not specified', reportedStatus:'Not specified', ...fields, title };
}

export function parseRadar(html: string, base: string): ParsedReport[] {
  const $ = cheerio.load(html); const result: ParsedReport[] = [];
  $('.itable tbody tr').each((_, row) => {
    const td = $(row).find('td'); const a = td.eq(0).find('a');
    const r = report('incident-radar','Japan', {title:clean(td.eq(0).find('.itable__title').text()) || clean(a.text()),
      organization:clean(a.text()), url:new URL(a.attr('href') || '/',base).href,
      publishedAt:td.eq(1).find('time').attr('datetime') || '', sector:clean(td.eq(2).text()),
      summary:clean(td.eq(4).text()), impact:clean(td.eq(5).text()), reportedStatus:clean(td.eq(6).text()) });
    if (r) result.push(r);
  }); return result;
}
export function parseJapanHacked(html: string, base: string): ParsedReport[] {
  const $ = cheerio.load(html); const result = new Map<string, ParsedReport>();
  $('tbody tr').each((_, row) => {
    const td = $(row).find('td'); const a = td.eq(2).find('a[href^="/incidents/"]');
    if (!a.length) return;
    const title = clean(a.text()); const impact = clean(td.eq(8).text());
    const category = classify(`${title} ${td.eq(6).text()} ${td.eq(7).text()}`);
    const severity = inferSeverity(title,category,impact,td.eq(3).text());
    const r = report('japanhacked','Japan', {title, url:new URL(a.attr('href')!,base).href,
      organization:clean(a.find('.text-org').first().text()) || title.split('：')[0], publishedAt:clean(td.eq(0).text()).slice(0,10),
      impact: impact && impact!=='不明' ? impact : 'Not disclosed', reportedStatus:clean(td.eq(9).text()).replace(/[\[\]]/g,''),
      summary:clean(`${td.eq(6).text()} ${td.eq(7).text()} ${td.eq(5).text()}`),category,...severity });
    if(r) result.set(r.id,r);
  }); return [...result.values()];
}
export function parseClipmaster(html: string, base: string): ParsedReport[] {
  const $ = cheerio.load(html); const result: ParsedReport[] = [];
  $('tbody tr').each((_, row) => {
    const td = $(row).find('td'); const a = td.eq(1).find('a[href^="/cases/"]');
    if(!a.length) return;
    const titleNode=a.clone();titleNode.find('br').replaceWith(' · ');const title=clean(titleNode.text());
    const organization = clean(a.contents().first().text());
    const r = report('clipmaster','Japan',{title,organization,url:new URL(a.attr('href')!,base).href,
      publishedAt:clean(td.eq(0).text()).replaceAll('/','-'),summary:clean(td.eq(2).text()),impact:clean(td.eq(3).text()),
      reportedStatus:clean(td.eq(2).html()?.split(/<br\s*\/?\s*>/i)[1]?.replace(/<[^>]*>/g,'') || td.eq(2).text())});
    if(r) result.push(r);
  }); return result;
}

export function clipmasterCaseList(html: string, base: string): string | null {
  const summary = new URL(base);
  const monthPath = summary.pathname.replace(/\/$/, '');
  if (!/^\/months\/\d{4}-(0[1-9]|1[0-2])$/.test(monthPath)) return null;

  const caseList = new URL(`${monthPath}/cases`, summary);
  const $ = cheerio.load(html);
  const link = $('a[href]').toArray().find(anchor => {
    const href = URL.parse($(anchor).attr('href')!, summary);
    return href?.origin === summary.origin && href.pathname.replace(/\/$/, '') === caseList.pathname;
  });
  return link ? caseList.href : null;
}

export function parseScanNet(html: string, base: string): ParsedReport[] {
  const $ = cheerio.load(html); const result: ParsedReport[] = [];
  $('.main-news .news-list section.item').each((_, row) => {
    const el = $(row); const a = el.find('a.link').first();
    const r = report('scannet','Japan',{title:clean(el.find('h2.title').text()),url:new URL(a.attr('href') || '/',base).href,
      publishedAt:(el.find('time').attr('datetime') || '').slice(0,10), summary:clean(el.find('.group').text()),
      reportedStatus:el.hasClass('item--members') ? 'Publisher subscription may be required' : 'Public report'});
    if(r) result.push(r);
  }); return result;
}
export function parseRss(xml: string, base: string, sourceId: string, region: 'Japan' | 'Global'): ParsedReport[] {
  const parser = new XMLParser({ignoreAttributes:false, processEntities:true, htmlEntities:true, isArray:(_n,path)=>['rss.channel.item','feed.entry'].includes(String(path))});
  const data = parser.parse(xml);
  const items = data?.rss?.channel?.item || data?.feed?.entry;
  if(!Array.isArray(items)) throw new Error('This URL did not return an RSS or Atom feed.');
  return items.flatMap((item: Record<string,any>) => {
    const links = Array.isArray(item.link) ? item.link : [item.link];
    const link = links.find((l:any)=>typeof l==='string' || !l?.['@_rel'] || l?.['@_rel']==='alternate');
    const rawDate = item.pubDate || item.published || item.updated || item['dc:date'];
    if(!rawDate || !link) return [];
    const d = new Date(rawDate); if(Number.isNaN(d.getTime())) return [];
    const url = new URL(typeof link==='string' ? link : link['@_href'], base);
    if(!['https:','http:'].includes(url.protocol)) return [];
    const title = plain(typeof item.title==='string' ? item.title : item.title?.['#text'] || '');
    // Only collect headline metadata. Full article bodies stay with the publisher.
    const r=report(sourceId,region,{title,url:url.href,publishedAt:d.toISOString().slice(0,10),reportedStatus:'Public reporting'});
    return r ? [r] : [];
  });
}
export function nextPage(html: string, base: string): string | null {
  const $=cheerio.load(html);
  const a=$('a[rel="next"], link[rel="next"], a[aria-label="次のページ"], .main-news a.more').first();
  const href=a.attr('href'); return href ? new URL(href,base).href : null;
}
