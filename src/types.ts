export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Unrated';
export type Category = 'Data exposure' | 'Unauthorized access' | 'Ransomware' | 'Malware' | 'Phishing' | 'Service disruption' | 'Vulnerability' | 'Other';
export interface Incident {
  id: string; sourceId: string; title: string; organization: string; url: string;
  publishedAt: string; category: Category; severity: Severity; severityBasis: string;
  region: 'Japan' | 'Global'; summary: string; impact: string; sector: string;
  reportedStatus: string; firstSeen: string; updatedAt: string; saved: boolean; reviewed: boolean;
  reports?: ReportEvidence[]; regions?: ('Japan' | 'Global')[]; reportCount?:number; dedupeBasis?:string; latestPublishedAt?:string;
}
export type ReportEvidence = Omit<Incident,'reports'|'regions'|'reportCount'|'dedupeBasis'|'latestPublishedAt'>;
export interface Source {
  id: string; name: string; url: string; kind: string; region: 'Japan' | 'Global';
  color: string; abbreviation: string; enabled: boolean; status: 'pending' | 'healthy' | 'error' | 'partial';
  lastAttempt: string | null; lastSuccess: string | null; error: string | null;
  reportCount: number; fetchedCount: number; custom: boolean;
}
export interface WatchTerm { id: string; term: string; createdAt: string }
export interface DashboardData {
  incidents: Incident[]; sources: Source[]; watchlist: WatchTerm[];
  collecting: boolean; lastCollected: string | null; refreshMinutes: number; rssRefreshMinutes:number;
  months: string[]; currentMonth: string;
  rawReportCount: number;
  collectedMonths:string[];collectingMonth:string|null;collectingKind?:'all'|'rss'|null;pendingMonths:string[];
  archiveCoverage:Record<string,{checkedAt:string;complete:boolean;sources:{id:string;name:string;status:string;count:number;error:string|null}[]}>;
}
