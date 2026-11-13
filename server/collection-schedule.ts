export const RSS_REFRESH_MINUTES=1;
export const DEFAULT_WEB_REFRESH_MINUTES=5;

export function nextCollection({now,lastWeb,lastRss,webMinutes,kinds}:{now:number;lastWeb:number;lastRss:number;webMinutes:number;kinds:string[]}):'all'|'rss'|null {
  if(!kinds.length)return null;
  if(now-lastWeb>=webMinutes*60_000)return 'all';
  if(kinds.includes('RSS feed')&&now-lastRss>=RSS_REFRESH_MINUTES*60_000)return 'rss';
  return null;
}
