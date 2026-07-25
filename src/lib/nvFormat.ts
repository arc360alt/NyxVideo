import type { MediaAsset, Project } from '../types';

const FORMAT_VERSION = 1;
const APP_ID = 'NyxVideo';
/** Assets at or under this size get embedded directly in the .nv file; larger ones are referenced by filename and must be relinked after import. */
const EMBED_THRESHOLD_BYTES = 5 * 1024 * 1024;

interface NvAssetEntry extends Omit<MediaAsset, 'url' | 'missing'> {
  embedded: boolean;
  data?: string; // data: URL, present when embedded
}

interface NvProject extends Omit<Project, 'assets'> {
  assets: NvAssetEntry[];
}

interface NvFile {
  formatVersion: number;
  app: string;
  exportedAt: string;
  project: NvProject;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function exportWorkspace(project: Project): Promise<Blob> {
  const assets: NvAssetEntry[] = [];
  for (const asset of project.assets) {
    const { url: _url, missing: _missing, ...rest } = asset;
    void _url;
    void _missing;
    try {
      const blob = await fetch(asset.url).then((r) => r.blob());
      if (blob.size <= EMBED_THRESHOLD_BYTES) {
        const data = await blobToDataUrl(blob);
        assets.push({ ...rest, embedded: true, data });
        continue;
      }
    } catch {
      // fall through to reference-only
    }
    assets.push({ ...rest, embedded: false, sourceFileName: rest.sourceFileName ?? rest.name });
  }

  const nv: NvFile = {
    formatVersion: FORMAT_VERSION,
    app: APP_ID,
    exportedAt: new Date().toISOString(),
    project: { ...project, assets },
  };

  return new Blob([JSON.stringify(nv)], { type: 'application/json' });
}

export async function importWorkspace(file: File): Promise<Project> {
  const text = await file.text();
  const nv = JSON.parse(text) as NvFile;
  if (nv.app !== APP_ID || !nv.project) {
    throw new Error('Not a valid NyxVideo workspace file.');
  }

  const assets: MediaAsset[] = await Promise.all(
    nv.project.assets.map(async (entry) => {
      const { embedded, data, ...rest } = entry;
      if (embedded && data) {
        try {
          const blob = await fetch(data).then((r) => r.blob());
          return { ...rest, url: URL.createObjectURL(blob), missing: false };
        } catch {
          return { ...rest, url: '', missing: true };
        }
      }
      return { ...rest, url: '', missing: true };
    }),
  );

  return { ...nv.project, assets };
}

export function suggestNvFilename(projectName: string): string {
  return `${projectName.replace(/[^a-z0-9 _-]/gi, '').trim() || 'nyxvideo-project'}.nv`;
}
