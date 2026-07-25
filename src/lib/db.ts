import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../types';

export interface StoredProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  thumbnail?: string;
  data: Project;
}

interface AssetBlobRecord {
  key: string; // `${projectId}:${assetId}`
  projectId: string;
  assetId: string;
  blob: Blob;
}

interface NyxDB extends DBSchema {
  projects: {
    key: string;
    value: StoredProject;
  };
  assetBlobs: {
    key: string;
    value: AssetBlobRecord;
    indexes: { 'by-projectId': string };
  };
}

let dbPromise: Promise<IDBPDatabase<NyxDB>> | null = null;

function getDb(): Promise<IDBPDatabase<NyxDB>> {
  if (!dbPromise) {
    dbPromise = openDB<NyxDB>('nyxvideo', 1, {
      upgrade(db) {
        db.createObjectStore('projects', { keyPath: 'id' });
        const assetStore = db.createObjectStore('assetBlobs', { keyPath: 'key' });
        assetStore.createIndex('by-projectId', 'projectId');
      },
    });
  }
  return dbPromise;
}

export async function listProjects(): Promise<StoredProject[]> {
  const db = await getDb();
  const all = await db.getAll('projects');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<StoredProject | undefined> {
  const db = await getDb();
  return db.get('projects', id);
}

export async function putProject(record: StoredProject): Promise<void> {
  const db = await getDb();
  await db.put('projects', record);
}

export async function deleteProjectRecord(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('projects', id);
  const tx = db.transaction('assetBlobs', 'readwrite');
  const index = tx.store.index('by-projectId');
  let cursor = await index.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function putAssetBlob(projectId: string, assetId: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put('assetBlobs', { key: `${projectId}:${assetId}`, projectId, assetId, blob });
}

export async function getAssetBlob(projectId: string, assetId: string): Promise<Blob | undefined> {
  const db = await getDb();
  const record = await db.get('assetBlobs', `${projectId}:${assetId}`);
  return record?.blob;
}

export async function deleteAssetBlob(projectId: string, assetId: string): Promise<void> {
  const db = await getDb();
  await db.delete('assetBlobs', `${projectId}:${assetId}`);
}

export async function listAssetBlobKeys(projectId: string): Promise<string[]> {
  const db = await getDb();
  const keys = await db.getAllKeysFromIndex('assetBlobs', 'by-projectId', projectId);
  return keys.map((k) => String(k));
}

export async function copyAllAssetBlobs(fromProjectId: string, toProjectId: string): Promise<void> {
  const db = await getDb();
  const records = await db.getAllFromIndex('assetBlobs', 'by-projectId', fromProjectId);
  const tx = db.transaction('assetBlobs', 'readwrite');
  for (const rec of records) {
    await tx.store.put({ key: `${toProjectId}:${rec.assetId}`, projectId: toProjectId, assetId: rec.assetId, blob: rec.blob });
  }
  await tx.done;
}
