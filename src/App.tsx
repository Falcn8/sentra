import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, X } from '@phosphor-icons/react';
import ActivityChart from './ActivityChart';
import IncidentDrawer from './IncidentDrawer';
import { Monitor } from './Monitor';
import { activityWindow, periodWindow, type ChartInterval } from './activity';
import { todayJst, type DateWindow } from './DateNavigator';
import type { DashboardData, Incident } from './types';
import useLiveUpdates from './useLiveUpdates';

type Region = Incident['region'];

async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request failed. Please try again.');
  return data;
}

function forRegion(incident: Incident, region: Region): Incident {
  if (incident.region === region) return incident;
  const evidence = incident.reports?.find(report => report.region === region);
  if (!evidence) return incident;
  return {
    ...incident,
    ...evidence,
    id: incident.id,
    publishedAt: incident.publishedAt,
    saved: incident.saved,
    reviewed: incident.reviewed,
  };
}

function monthsInRange(range: DateWindow): string[] {
  const months: string[] = [];
  const date = new Date(`${range.start.slice(0, 7)}-01T12:00:00Z`);
  const today = todayJst();
  const end = range.end < today ? range.end : today;
  while (date.toISOString().slice(0, 10) <= end && months.length < 12) {
    months.push(date.toISOString().slice(0, 7));
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return months;
}

export default function App() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [region, setRegion] = useState<Region>(() => {
    try {
      return localStorage.getItem('sentra-region') === 'Global' ? 'Global' : 'Japan';
    } catch {
      return 'Japan';
    }
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<DateWindow>({ start: '', end: '' });
  const [interval, setInterval] = useState<ChartInterval>('Monthly');
  const [windowRange, setWindowRange] = useState<DateWindow | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const dateWindow = windowRange ?? activityWindow(data ? `${data.currentMonth}-01` : todayJst(), 'Monthly');
  const previouslyCollecting = useRef(false);
  const requestedArchiveWindow = useRef('');
  const inFlightLoad = useRef<Promise<void> | null>(null);
  const loadQueued = useRef(false);
  const requestedCollection = useRef(false);

  const load = useCallback(() => {
    if (inFlightLoad.current) {
      loadQueued.current = true;
      return inFlightLoad.current;
    }
    const task = (async () => {
      do {
        loadQueued.current = false;
        try {
          const next = await api<DashboardData>('/dashboard');
          setData(next);
          setError('');
          if (previouslyCollecting.current && !next.collecting) {
            setRefreshing(false);
            if (requestedCollection.current) setToast('Collection finished. Source health has been updated.');
            requestedCollection.current = false;
          }
          previouslyCollecting.current = next.collecting;
        } catch (e) {
          setError((e as Error).message);
        }
      } while (loadQueued.current);
    })();
    inFlightLoad.current = task;
    void task.finally(() => { inFlightLoad.current = null; });
    return task;
  }, []);

  const liveStatus = useLiveUpdates(load);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    try { localStorage.setItem('sentra-region', region); } catch { /* Region selection still works without storage. */ }
  }, [region]);

  const scoped = useMemo(() => (data?.incidents ?? [])
    .filter(incident => (incident.regions || [incident.region]).includes(region))
    .map(incident => forRegion(incident, region)), [data?.incidents, region]);
  const periodReports = useMemo(() => scoped.filter(incident =>
    incident.publishedAt >= dateWindow.start && incident.publishedAt <= dateWindow.end
  ), [scoped, dateWindow.start, dateWindow.end]);
  const selectedIncident = scoped.find(incident => incident.id === selected);
  useEffect(() => {
    if (selected && !selectedIncident) {
      const updated = scoped.find(incident => incident.reports?.some(report => report.id === selected));
      setSelected(updated?.id ?? null);
    }
  }, [scoped, selected, selectedIncident]);

  function clearRange() {
    setSelectedRange({ start: '', end: '' });
  }

  function switchRegion(next: Region) {
    setRegion(next);
    clearRange();
  }

  function changeWindow(range: DateWindow) {
    setWindowRange(range);
    clearRange();
  }

  function changeInterval(next: ChartInterval) {
    setInterval(next);
    const today = todayJst();
    changeWindow(activityWindow(dateWindow.end > today ? today : dateWindow.end, next));
  }

  async function mutate(path: string, method: string, body?: unknown, onError: (message: string) => void = setToast) {
    try {
      await api(path, method, body);
      await load();
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    }
  }

  async function ensureArchives(range: DateWindow, force = false) {
    const collectionRange = interval === 'Yearly' ? periodWindow(range.end, 'Yearly') : range;
    const months = monthsInRange(collectionRange).filter(month =>
      force || (!data?.collectedMonths?.includes(month) && !data?.archiveCoverage?.[month])
    );
    if (!months.length || (region === 'Global' && !force)) return;

    setRefreshing(true);
    requestedCollection.current = true;
    try {
      await api('/refresh', 'POST', { months });
      previouslyCollecting.current = true;
      await load();
    } catch (e) {
      requestedCollection.current = false;
      setToast((e as Error).message);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!data) return;
    const key = `${region}:${interval}:${dateWindow.start}:${dateWindow.end}`;
    if (requestedArchiveWindow.current === key) return;
    requestedArchiveWindow.current = key;
    void ensureArchives(dateWindow);
  }, [!!data, region, interval, dateWindow.start, dateWindow.end]);

  async function toggleSaved(incident: Incident) {
    const saved = !incident.saved;
    setData(current => current && {
      ...current,
      incidents: current.incidents.map(item => item.id === incident.id ? { ...item, saved } : item),
    });
    try {
      await api(`/incidents/${incident.id}`, 'PATCH', { saved });
    } catch (e) {
      setToast((e as Error).message);
      await load();
    }
  }

  const sources = data?.sources ?? [];
  return (
    <Monitor
      data={data}
      error={error}
      busy={!!data?.collecting || refreshing}
      liveStatus={liveStatus}
      region={region}
      interval={interval}
      range={dateWindow}
      reports={periodReports}
      selectedRange={selectedRange}
      onRegion={switchRegion}
      onInterval={changeInterval}
      onRange={changeWindow}
      onClearRange={clearRange}
      onRefresh={() => void ensureArchives(dateWindow, true)}
      onSelect={setSelected}
      onToggle={incident => void toggleSaved(incident)}
      onMutate={mutate}
      chart={height => (
        <ActivityChart
          reports={periodReports}
          interval={interval}
          range={dateWindow}
          height={height}
          onRange={(start, end) => setSelectedRange({ start, end })}
        />
      )}
      detail={selectedIncident && (
        <IncidentDrawer
          incident={selectedIncident}
          sources={sources}
          source={sources.find(source => source.id === selectedIncident.sourceId)}
          onClose={() => setSelected(null)}
          onToggle={() => void toggleSaved(selectedIncident)}
          onWatch={async term => {
            if (await mutate('/watchlist', 'POST', { term })) setToast(`Now watching “${term}”.`);
          }}
        />
      )}
      toast={toast && (
        <div className="toast" role="status">
          <CheckCircle size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss message"><X size={14} /></button>
        </div>
      )}
    />
  );
}
