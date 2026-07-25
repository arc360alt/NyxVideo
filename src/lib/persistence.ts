import { useProjectStore } from '../store/useProjectStore';
import { getProject, putProject, putAssetBlob, deleteAssetBlob } from './db';

const DEBOUNCE_MS = 700;
const MAX_BLOB_SAVE_ATTEMPTS = 2;

let timer: ReturnType<typeof setTimeout> | null = null;
let knownAssetIds = new Set<string>();
let failedAttempts = new Map<string, number>();

/** Tells the autosave which asset blobs are already persisted for the current project, so it doesn't re-write them. */
export function resetPersistenceBaseline(knownIds: string[]) {
  knownAssetIds = new Set(knownIds);
  failedAttempts = new Map();
}

async function persistNow() {
  const { project, projectId } = useProjectStore.getState();
  if (!projectId) return;

  const existing = await getProject(projectId);
  const now = Date.now();
  await putProject({
    id: projectId,
    name: project.name,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    width: project.width,
    height: project.height,
    thumbnail: project.assets.find((a) => a.kind !== 'audio' && a.thumbnail)?.thumbnail,
    data: project,
  });

  const currentIds = new Set(project.assets.map((a) => a.id));
  for (const asset of project.assets) {
    if (knownAssetIds.has(asset.id) || asset.missing || !asset.url) continue;
    const attempts = failedAttempts.get(asset.id) ?? 0;
    if (attempts >= MAX_BLOB_SAVE_ATTEMPTS) continue; // gave up earlier this session — stop hammering it on every edit

    try {
      const blob = await fetch(asset.url).then((r) => r.blob());
      await putAssetBlob(projectId, asset.id, blob);
      knownAssetIds.add(asset.id);
      failedAttempts.delete(asset.id);
    } catch (err) {
      const next = attempts + 1;
      failedAttempts.set(asset.id, next);
      if (next >= MAX_BLOB_SAVE_ATTEMPTS) {
        console.warn(
          `NyxVideo: giving up on saving "${asset.name}" to local storage after ${next} failed attempts (likely too large for browser storage). ` +
            `It'll keep working for this session but won't survive a reload — export a .nv workspace to keep it.`,
          err,
        );
      }
    }
  }
  for (const id of knownAssetIds) {
    if (!currentIds.has(id)) await deleteAssetBlob(projectId, id);
  }
  knownAssetIds = currentIds;
}

function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void persistNow();
  }, DEBOUNCE_MS);
}

/** Immediately persists, bypassing the debounce (used before navigating away from the editor). */
export function flushSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return persistNow();
}

let initialized = false;
export function initPersistence() {
  if (initialized) return;
  initialized = true;
  useProjectStore.subscribe((state, prev) => {
    if (state.project === prev.project) return;
    scheduleSave();
  });
}
