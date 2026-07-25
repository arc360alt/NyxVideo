import { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import {
  fetchFreesoundAsset,
  getFreesoundApiKey,
  hasEnvApiKey,
  searchFreesound,
  setFreesoundApiKey,
  shortenLicense,
  type FreesoundResult,
} from '../../lib/freesound';
import { FiExternalLink, FiPause, FiPlay, FiPlus, FiSearch } from 'react-icons/fi';

export function FreesoundTab() {
  const addAsset = useProjectStore((s) => s.addAsset);
  const addMediaToTimeline = useProjectStore((s) => s.addMediaToTimeline);
  const currentTime = useProjectStore((s) => s.currentTime);

  const [apiKeyDraft, setApiKeyDraft] = useState(getFreesoundApiKey());
  const [savedKey, setSavedKey] = useState(getFreesoundApiKey());
  const hasKey = !!savedKey;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FreesoundResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [playingId, setPlayingId] = useState<number | null>(null);
  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const [addingId, setAddingId] = useState<number | null>(null);

  const runSearch = async (nextPage: number, append: boolean) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const page_ = await searchFreesound(query, nextPage);
      setResults((prev) => (append ? [...prev, ...page_.results] : page_.results));
      setHasMore(page_.hasMore);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const togglePreview = (result: FreesoundResult) => {
    if (playingId === result.id) {
      audioEl?.pause();
      setPlayingId(null);
      return;
    }
    audioEl?.pause();
    const el = new Audio(result.previewUrl);
    el.onended = () => setPlayingId(null);
    void el.play();
    setAudioEl(el);
    setPlayingId(result.id);
  };

  const handleAdd = async (result: FreesoundResult) => {
    setAddingId(result.id);
    setError(null);
    try {
      const asset = await fetchFreesoundAsset(result);
      addAsset(asset);
      addMediaToTimeline(asset.id, { start: currentTime });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {hasEnvApiKey() ? (
        <div className="rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-[10px] text-fg-faint">
          Using the Freesound API key configured for this app.
        </div>
      ) : (
        <div className="rounded-md border border-border bg-surface-1 p-2.5 text-xs">
          <div className="mb-1 flex items-center justify-between text-fg-muted">
            <span>Freesound API key</span>
            <a
              href="https://freesound.org/apiv2/apply/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-violet-400 hover:text-violet-300"
            >
              Get a free key <FiExternalLink size={10} />
            </a>
          </div>
          <div className="flex gap-1.5">
            <input
              type="password"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              placeholder="Paste your API key"
              className="flex-1 rounded border border-border bg-surface-0 px-2 py-1 text-xs text-fg"
            />
            <button
              onClick={() => {
                const trimmed = apiKeyDraft.trim();
                setFreesoundApiKey(trimmed);
                setSavedKey(trimmed);
              }}
              className="rounded bg-surface-2 px-2 py-1 text-xs text-fg-muted hover:bg-surface-3"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(1, false);
        }}
        className="flex gap-1.5"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={hasKey ? 'Search Freesound…' : 'Add an API key above first'}
          disabled={!hasKey}
          className="flex-1 rounded border border-border bg-surface-1 px-2 py-1.5 text-xs text-fg disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!hasKey || loading || !query.trim()}
          className="flex items-center justify-center rounded bg-violet-600 px-2.5 text-white hover:bg-violet-500 disabled:opacity-40"
        >
          <FiSearch size={13} />
        </button>
      </form>

      {error && <div className="text-xs text-red-400">{error}</div>}
      {loading && results.length === 0 && <div className="text-xs text-fg-subtle">Searching…</div>}
      {!loading && hasKey && query && results.length === 0 && !error && (
        <div className="text-xs text-fg-faint">No results for "{query}".</div>
      )}

      <div className="nyx-scroll min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex min-w-0 flex-col gap-1.5">
          {results.map((result) => (
            <div
              key={result.id}
              className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border bg-surface-1 px-2 py-1.5"
            >
              <button
                onClick={() => togglePreview(result)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg hover:bg-violet-600"
              >
                {playingId === result.id ? <FiPause size={12} /> : <FiPlay size={12} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-fg-muted" title={result.name}>
                  {result.name}
                </div>
                <div className="truncate text-[10px] text-fg-faint">
                  {result.username} · {shortenLicense(result.license)}
                </div>
              </div>
              <span className="shrink-0 text-[10px] text-fg-faint">{result.duration.toFixed(1)}s</span>
              <button
                onClick={() => void handleAdd(result)}
                disabled={addingId === result.id}
                title="Download and add to timeline"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-surface-2 text-fg hover:bg-violet-600 disabled:opacity-50"
              >
                <FiPlus size={12} />
              </button>
            </div>
          ))}
        </div>

        {hasMore && (
          <button
            onClick={() => void runSearch(page + 1, true)}
            disabled={loading}
            className="mt-2 w-full rounded-md bg-surface-1 py-1.5 text-xs text-fg-muted hover:bg-surface-2 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
