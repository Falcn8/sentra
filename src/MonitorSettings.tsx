import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowSquareOut, Moon, Plus, Sun, Trash, X } from '@phosphor-icons/react';
import type { DashboardData, Incident, Source } from './types';
import './monitor-settings.css';

type Region = Incident['region'];
type Theme = 'dark' | 'light';
type Section = 'collection' | 'sources' | 'watchlist';
type Feedback = { error: string } | { success: string };
type Operation = { pending?: string; feedback?: Feedback };

interface Props {
  open: boolean;
  onClose: () => void;
  data: DashboardData | null;
  region: Region;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onMutate: (path: string, method: string, body?: unknown, onError?: (message: string) => void) => Promise<boolean>;
}

const websiteIntervals = [5, 15, 30, 60, 120];
const count = new Intl.NumberFormat('en-US');
const collectionTime = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo', hourCycle: 'h23',
});
const sourceStates: Record<Source['status'], string> = {
  healthy: 'Connected', pending: 'Waiting', partial: 'Partial', error: 'Unavailable',
};

function OperationFeedback({ feedback }: { feedback?: Feedback }) {
  if (!feedback) return null;
  return 'error' in feedback
    ? <p className="settings-error" role="alert">{feedback.error}</p>
    : <p className="settings-success" role="status">{feedback.success}</p>;
}

export default function MonitorSettings({ open, onClose, data, region, theme, onTheme, onMutate }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sourceFormButton = useRef<HTMLButtonElement>(null);
  const removeSourceButton = useRef<HTMLButtonElement>(null);
  const keywordInput = useRef<HTMLInputElement>(null);
  const [sourceRegion, setSourceRegion] = useState(region);
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [feedName, setFeedName] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [feedRegion, setFeedRegion] = useState(region);
  const [removeSourceId, setRemoveSourceId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [operations, setOperations] = useState<Record<Section, Operation>>({
    collection: {}, sources: {}, watchlist: {},
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setSourceRegion(region);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, region]);

  async function update(section: Section, path: string, method: string, body?: unknown, success?: string) {
    setOperations(current => ({ ...current, [section]: { pending: path } }));
    let error = 'The request failed. Please try again.';
    const saved = await onMutate(path, method, body, message => { error = message; });
    const feedback = saved ? (success ? { success } : undefined) : { error };
    setOperations(current => ({ ...current, [section]: { feedback } }));
    return saved;
  }

  function closeSourceForm() {
    setShowSourceForm(false);
    sourceFormButton.current?.focus();
  }

  async function connectFeed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { name: feedName.trim(), url: feedUrl.trim(), region: feedRegion };
    if (await update('sources', '/sources', 'POST', body, 'Feed connected and reports collected.')) {
      setFeedName('');
      setFeedUrl('');
      setSourceRegion(body.region);
      closeSourceForm();
    }
  }

  async function removeFeed(source: Source) {
    if (await update('sources', `/sources/${source.id}`, 'DELETE', undefined, `${source.name} removed.`)) {
      setRemoveSourceId(null);
      sourceFormButton.current?.focus();
    }
  }

  async function addKeyword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await update('watchlist', '/watchlist', 'POST', { term: keyword.trim() }, 'Keyword added.')) {
      setKeyword('');
      keywordInput.current?.focus();
    }
  }

  const sources = data?.sources.filter(source => source.region === sourceRegion) ?? [];
  const watchlist = data?.watchlist ?? [];

  return (
    <dialog
      ref={dialogRef}
      id="monitor-settings"
      className="monitor-settings"
      aria-labelledby="monitor-settings-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
    >
      <header className="settings-header">
        <h2 id="monitor-settings-title">Settings</h2>
        <button type="button" className="icon-button" aria-label="Close settings" onClick={onClose} autoFocus>
          <X size={19} />
        </button>
      </header>
      <div className="settings-scroll">
        <section className="settings-section settings-appearance">
          <h3 id="settings-appearance">Appearance</h3>
          <div className="settings-theme-options" role="radiogroup" aria-labelledby="settings-appearance">
            <label>
              <input type="radio" name="monitor-theme" checked={theme === 'dark'} onChange={() => onTheme('dark')} />
              <Moon size={16} /> Dark
            </label>
            <label>
              <input type="radio" name="monitor-theme" checked={theme === 'light'} onChange={() => onTheme('light')} />
              <Sun size={16} /> Light
            </label>
          </div>
        </section>
        {data ? <>
          <section className="settings-section">
            <h3>Collection</h3>
            <div className="settings-cadence">
              <div>
                <label htmlFor="settings-website-interval">Website scan interval</label>
                <p>RSS feeds are checked every {data.rssRefreshMinutes} {data.rssRefreshMinutes === 1 ? 'minute' : 'minutes'}.</p>
              </div>
              <select
                id="settings-website-interval"
                value={data.refreshMinutes}
                disabled={Boolean(operations.collection.pending)}
                onChange={event => void update('collection', '/settings', 'PATCH', { refreshMinutes: Number(event.target.value) }, 'Scan interval updated.')}
              >
                {websiteIntervals.map(minutes => <option key={minutes} value={minutes}>{minutes} min</option>)}
              </select>
            </div>
            <OperationFeedback feedback={operations.collection.feedback} />
          </section>
          <section className="settings-section">
            <div className="settings-section-heading">
              <h3>Sources</h3>
              <div className="settings-source-controls">
                <select
                  aria-label="Source region"
                  value={sourceRegion}
                  onChange={event => {
                    setSourceRegion(event.target.value as Region);
                    setRemoveSourceId(null);
                  }}
                >
                  <option>Japan</option>
                  <option>Global</option>
                </select>
                <button
                  ref={sourceFormButton}
                  type="button"
                  className="button"
                  aria-expanded={showSourceForm}
                  aria-controls="settings-source-form"
                  disabled={Boolean(operations.sources.pending)}
                  onClick={() => {
                    if (!showSourceForm) setFeedRegion(sourceRegion);
                    setShowSourceForm(!showSourceForm);
                  }}
                ><Plus size={15} />Add RSS feed</button>
              </div>
            </div>
            {showSourceForm && (
              <form id="settings-source-form" className="settings-source-form" onSubmit={connectFeed}>
                <p>Connect a public HTTPS RSS or Atom feed.</p>
                <label>Source name
                  <input value={feedName} onChange={event => setFeedName(event.target.value)} required minLength={2} maxLength={60} autoFocus />
                </label>
                <label>Feed URL
                  <input type="url" value={feedUrl} onChange={event => setFeedUrl(event.target.value)} required placeholder="https://example.com/feed.xml" />
                </label>
                <label>Coverage
                  <select value={feedRegion} onChange={event => setFeedRegion(event.target.value as Region)}>
                    <option>Japan</option>
                    <option>Global</option>
                  </select>
                </label>
                <div className="settings-form-actions">
                  <button type="button" className="button" onClick={closeSourceForm}>Cancel</button>
                  <button className="button primary" disabled={Boolean(operations.sources.pending)}>
                    {operations.sources.pending === '/sources' ? 'Checking feed…' : 'Connect feed'}
                  </button>
                </div>
              </form>
            )}
            <OperationFeedback feedback={operations.sources.feedback} />
            {sources.length ? <ul className="settings-list">
              {sources.map(source => {
                const path = `/sources/${source.id}`;
                const status = source.enabled ? sourceStates[source.status] : 'Paused';
                const dot = !source.enabled || source.status === 'pending' ? '' : source.status === 'healthy' ? 'live' : 'degraded';
                return (
                  <li className="settings-source" key={source.id}>
                    <div className="settings-source-row">
                      <div>
                        <h4>{source.name}</h4>
                        <p>{source.kind} <span aria-hidden="true">·</span> <span className={`status-dot ${dot}`} aria-hidden="true" /> {status}</p>
                      </div>
                      <button
                        type="button"
                        className={`toggle ${source.enabled ? 'on' : ''}`}
                        role="switch"
                        aria-checked={source.enabled}
                        aria-label={`Enable ${source.name}`}
                        disabled={Boolean(operations.sources.pending)}
                        onClick={() => void update('sources', path, 'PATCH', { enabled: !source.enabled })}
                      ><span /></button>
                      {source.custom && <button
                        type="button"
                        className="icon-button"
                        aria-label={`Remove source ${source.name}`}
                        aria-expanded={removeSourceId === source.id}
                        disabled={Boolean(operations.sources.pending)}
                        onClick={event => {
                          removeSourceButton.current = event.currentTarget;
                          setRemoveSourceId(removeSourceId === source.id ? null : source.id);
                        }}
                      ><Trash size={16} /></button>}
                    </div>
                    {removeSourceId === source.id && (
                      <div className="settings-confirm">
                        <p>Remove {source.name} and its stored reports?</p>
                        <div className="settings-form-actions">
                          <button type="button" className="button" onClick={() => {
                            setRemoveSourceId(null);
                            removeSourceButton.current?.focus();
                          }}>Cancel removal</button>
                          <button type="button" className="button settings-delete" disabled={Boolean(operations.sources.pending)} onClick={() => void removeFeed(source)}>
                            {operations.sources.pending === path ? 'Removing…' : 'Remove feed'}
                          </button>
                        </div>
                      </div>
                    )}
                    <details className="settings-source-details">
                      <summary>Source details</summary>
                      <dl>
                        <div><dt>Reports stored</dt><dd>{count.format(source.reportCount)}</dd></div>
                        <div><dt>Last collection</dt><dd>{count.format(source.fetchedCount)} reports</dd></div>
                        <div><dt>Last success</dt><dd>{source.lastSuccess ? `${collectionTime.format(new Date(source.lastSuccess))} JST` : 'Waiting'}</dd></div>
                      </dl>
                      {source.error && <p className="settings-source-error">{source.error}</p>}
                      <a href={source.url} target="_blank" rel="noopener noreferrer">Open source <ArrowSquareOut size={13} /></a>
                    </details>
                  </li>
                );
              })}
            </ul> : <p className="settings-muted">No sources connected for {sourceRegion}.</p>}
          </section>
          <section className="settings-section">
            <div className="settings-section-heading">
              <h3>Watchlist</h3>
              <span className="settings-muted" aria-label={`${watchlist.length} of 50 keywords`}>{watchlist.length}/50</span>
            </div>
            <form className="settings-keyword-form" onSubmit={addKeyword}>
              <label htmlFor="settings-keyword">Watchlist keyword</label>
              <div>
                <input id="settings-keyword" ref={keywordInput} value={keyword} onChange={event => setKeyword(event.target.value)} required minLength={2} maxLength={80} />
                <button className="button" disabled={Boolean(operations.watchlist.pending) || watchlist.length >= 50}>
                  <Plus size={15} />{operations.watchlist.pending === '/watchlist' ? 'Adding…' : 'Add keyword'}
                </button>
              </div>
            </form>
            <OperationFeedback feedback={operations.watchlist.feedback} />
            {watchlist.length ? <ul className="settings-list">
              {watchlist.map(term => (
                <li className="settings-keyword" key={term.id}>
                  <span>{term.term}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove keyword ${term.term}`}
                    disabled={Boolean(operations.watchlist.pending)}
                    onClick={async () => {
                      if (await update('watchlist', `/watchlist/${term.id}`, 'DELETE', undefined, 'Keyword removed.')) keywordInput.current?.focus();
                    }}
                  ><X size={16} /></button>
                </li>
              ))}
            </ul> : <p className="settings-muted">No keywords on your watchlist.</p>}
          </section>
        </> : <p className="settings-section settings-muted">Source and watchlist settings are available once the dashboard connects.</p>}
      </div>
    </dialog>
  );
}
