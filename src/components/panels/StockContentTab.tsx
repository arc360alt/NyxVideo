import { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import {
  fetchPexelsAsset,
  getPexelsApiKey,
  hasEnvApiKey,
  searchPexelsPhotos,
  searchPexelsVideos,
  setPexelsApiKey,
  type PexelsResult,
} from '../../lib/pexels';
import { FiExternalLink, FiPlus, FiSearch } from 'react-icons/fi';
import { FaPlay } from 'react-icons/fa6';

export function StockContentTab() {
  const addAsset = useProjectStore((s) => s.addAsset);
  const addMediaToTimeline = useProjectStore((s) => s.addMediaToTimeline);
  const currentTime = useProjectStore((s) => s.currentTime);

  const [apiKeyDraft, setApiKeyDraft] = useState(getPexelsApiKey());
  const [savedKey, setSavedKey] = useState(getPexelsApiKey());
  const hasKey = !!savedKey;

  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PexelsResult[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const runSearch = async (type: 'photo' | 'video', nextPage: number, append: boolean) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const page_ = type === 'photo' ? await searchPexelsPhotos(query, nextPage) : await searchPexelsVideos(query, nextPage);
      setResults((prev) => (append ? [...prev, ...page_.results] : page_.results));
      setHasMore(page_.hasMore);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const switchType = (type: 'photo' | 'video') => {
    setMediaType(type);
    setResults([]);
    setError(null);
    setPage(1);
    setHasMore(false);
  };

  const handleAdd = async (result: PexelsResult) => {
    const key = `${result.kind}:${result.id}`;
    setAddingId(key);
    setError(null);
    try {
      const asset = await fetchPexelsAsset(result);
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
      <div className="text-[10px] text-fg-faint">
        Photos &amp; videos provided by{' '}
        <a
          href="https://www.pexels.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-violet-400 hover:text-violet-300"
        >
          Pexels <FiExternalLink size={9} />
        </a>
      </div>

      {hasEnvApiKey() ? (
        <div>
        
        </div>
      ) : (
        <div className="rounded-md border border-border bg-surface-1 p-2.5 text-xs">
          <div className="mb-1 flex items-center justify-between text-fg-muted">
            <span>Pexels API key</span>
            <a
              href="https://www.pexels.com/api/new/"
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
                setPexelsApiKey(trimmed);
                setSavedKey(trimmed);
              }}
              className="rounded bg-surface-2 px-2 py-1 text-xs text-fg-muted hover:bg-surface-3"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-1">
        <button
          onClick={() => switchType('photo')}
          className={`flex-1 rounded px-2 py-1 text-xs ${mediaType === 'photo' ? 'bg-violet-600 text-white' : 'bg-surface-1 text-fg-muted hover:bg-surface-2'}`}
        >
          Photos
        </button>
        <button
          onClick={() => switchType('video')}
          className={`flex-1 rounded px-2 py-1 text-xs ${mediaType === 'video' ? 'bg-violet-600 text-white' : 'bg-surface-1 text-fg-muted hover:bg-surface-2'}`}
        >
          Videos
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(mediaType, 1, false);
        }}
        className="flex gap-1.5"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={hasKey ? `Search ${mediaType === 'photo' ? 'photos' : 'videos'}…` : 'Add an API key above first'}
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
        <div className="grid grid-cols-2 gap-2">
          {results.map((result) => {
            const key = `${result.kind}:${result.id}`;
            return (
              <div key={key} className="group relative flex flex-col overflow-hidden rounded-md border border-border bg-surface-1 text-left">
                <div className="relative flex h-20 items-center justify-center overflow-hidden bg-surface-0">
                  <img src={result.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  {result.kind === 'video' && (
                    <>
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20">
                        <FaPlay size={16} className="text-white drop-shadow" />
                      </div>
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[9px] text-white">
                        {result.duration}s
                      </span>
                    </>
                  )}
                </div>
                <div className="truncate px-2 py-1 text-[10px] text-fg-faint" title={`by ${result.photographer}`}>
                  {result.photographer}
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => void handleAdd(result)}
                    disabled={addingId === key}
                    title="Download and add to timeline"
                    className="rounded bg-violet-600 p-1.5 text-white hover:bg-violet-500 disabled:opacity-50"
                  >
                    <FiPlus size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {hasMore && (
          <button
            onClick={() => void runSearch(mediaType, page + 1, true)}
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
