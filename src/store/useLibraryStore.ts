import { create } from 'zustand';
import { createEmptyProject, useProjectStore } from './useProjectStore';
import { newId } from '../lib/id';
import {
  copyAllAssetBlobs,
  deleteProjectRecord,
  getAssetBlob,
  getProject,
  listProjects,
  putProject,
  type StoredProject,
} from '../lib/db';
import { flushSave, initPersistence, resetPersistenceBaseline } from '../lib/persistence';
import { useCaptionsStore } from './useCaptionsStore';
import type { Project } from '../types';

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  width: number;
  height: number;
  thumbnail?: string;
}

type View = 'landing' | 'projects' | 'editor';

/** Resolves after the browser has actually painted the current frame, not just queued a render. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

interface LibraryState {
  view: View;
  projects: ProjectSummary[];
  loading: boolean;
  /** true while a project is being opened — covers both the async fetch/hydrate and the heavy
   *  synchronous mount of a large timeline, which otherwise looks like the tab freezing. */
  opening: boolean;
  refreshList: () => Promise<void>;
  createProject: (name?: string, width?: number, height?: number) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  goToProjects: () => Promise<void>;
  goToLanding: () => void;
  renameProject: (id: string, name: string) => Promise<void>;
  importProject: (project: Project) => Promise<void>;
}

function toSummary(p: StoredProject): ProjectSummary {
  return { id: p.id, name: p.name, updatedAt: p.updatedAt, width: p.width, height: p.height, thumbnail: p.thumbnail };
}

async function hydrateAssets(project: Project, projectId: string): Promise<Project> {
  const assets = await Promise.all(
    project.assets.map(async (asset) => {
      if (asset.missing) return asset;
      const blob = await getAssetBlob(projectId, asset.id);
      if (blob) return { ...asset, url: URL.createObjectURL(blob), missing: false };
      return { ...asset, url: '', missing: true };
    }),
  );
  return { ...project, assets };
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  view: 'landing',
  projects: [],
  loading: false,
  opening: false,

  refreshList: async () => {
    set({ loading: true });
    const list = await listProjects();
    set({ projects: list.map(toSummary), loading: false });
  },

  createProject: async (name, width, height) => {
    const id = newId();
    const project = createEmptyProject();
    if (name) project.name = name;
    if (width && height) {
      project.width = width;
      project.height = height;
    }
    const now = Date.now();
    await putProject({
      id,
      name: project.name,
      createdAt: now,
      updatedAt: now,
      width: project.width,
      height: project.height,
      data: project,
    });
    initPersistence();
    resetPersistenceBaseline([]);
    useProjectStore.getState().loadProject(project, id);
    useCaptionsStore.getState().clear();
    set({ view: 'editor' });
    void get().refreshList();
  },

  openProject: async (id) => {
    set({ opening: true });
    // Let the "Opening project…" overlay actually paint before the heavy synchronous work below
    // (hydrating + mounting a timeline with potentially hundreds of clips) blocks the main thread.
    await nextPaint();
    try {
      const stored = await getProject(id);
      if (!stored) return;
      const hydrated = await hydrateAssets(stored.data, id);
      initPersistence();
      resetPersistenceBaseline(hydrated.assets.filter((a) => !a.missing).map((a) => a.id));
      useProjectStore.getState().loadProject(hydrated, id);
      useCaptionsStore.getState().clear();
      set({ view: 'editor' });
    } finally {
      set({ opening: false });
    }
  },

  deleteProject: async (id) => {
    await deleteProjectRecord(id);
    if (useProjectStore.getState().projectId === id) {
      useProjectStore.getState().clearProject();
    useCaptionsStore.getState().clear();
      set({ view: 'projects' });
    }
    void get().refreshList();
  },

  duplicateProject: async (id) => {
    const stored = await getProject(id);
    if (!stored) return;
    const newProjectId = newId();
    const now = Date.now();
    const copy: Project = { ...stored.data, name: `${stored.data.name} (Copy)` };
    await putProject({
      id: newProjectId,
      name: copy.name,
      createdAt: now,
      updatedAt: now,
      width: copy.width,
      height: copy.height,
      thumbnail: stored.thumbnail,
      data: copy,
    });
    await copyAllAssetBlobs(id, newProjectId);
    void get().refreshList();
  },

  goToProjects: async () => {
    useProjectStore.getState().setPlaying(false);
    await flushSave();
    set({ view: 'projects' });
    void get().refreshList();
  },

  goToLanding: () => set({ view: 'landing' }),

  renameProject: async (id, name) => {
    const stored = await getProject(id);
    if (!stored) return;
    await putProject({ ...stored, name, data: { ...stored.data, name } });
    if (useProjectStore.getState().projectId === id) {
      useProjectStore.getState().setProjectName(name);
    }
    void get().refreshList();
  },

  importProject: async (project) => {
    const id = newId();
    const now = Date.now();
    await putProject({
      id,
      name: project.name,
      createdAt: now,
      updatedAt: now,
      width: project.width,
      height: project.height,
      data: project,
    });
    initPersistence();
    resetPersistenceBaseline([]);
    useProjectStore.getState().loadProject(project, id);
    useCaptionsStore.getState().clear();
    set({ view: 'editor' });
    void get().refreshList();
  },
}));
