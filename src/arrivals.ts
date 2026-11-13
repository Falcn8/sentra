import type { Incident } from './types';

export const evidenceOf=(incident:Incident)=>incident.reports||[incident];
export const latestArrival=(incident:Incident)=>evidenceOf(incident).reduce((latest,report)=>report.firstSeen>latest?report.firstSeen:latest,incident.firstSeen);
export interface Arrival { incidentId:string; reportIds:string[]; kind:'incident'|'coverage'; collectedAt:string }

// Track immutable report identities, not changing representatives or collection timestamps.
// Rescans, source re-enabling and edits to saved state are not new arrivals.
export function findArrivals(incidents:Incident[],known:Set<string>,startedAt:string):Arrival[]{
  return incidents.flatMap(incident=>{
    const reports=evidenceOf(incident);
    const added=reports.filter(report=>!known.has(report.id)&&report.firstSeen>startedAt);
    if(!added.length)return [];
    return [{incidentId:incident.id,reportIds:added.map(report=>report.id),kind:reports.some(report=>known.has(report.id)||report.firstSeen<=startedAt)?'coverage' as const:'incident' as const,collectedAt:added.map(report=>report.firstSeen).sort().at(-1)!}];
  });
}
