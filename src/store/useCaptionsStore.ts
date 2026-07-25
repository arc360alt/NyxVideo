import { create } from 'zustand';
import { newId } from '../lib/id';
import { extractWhisperSamples } from '../lib/audioExtract';
import { transcribeAudio, type TranscribeProgress } from '../lib/captionClient';
import { useProjectStore } from './useProjectStore';

export interface EditableCaption {
  id: string;
  start: number; // seconds, relative to the source clip's own timeline start
  end: number;
  text: string;
}

interface CaptionsState {
  sourceClipId: string | null;
  captions: EditableCaption[] | null;
  generating: boolean;
  progress: TranscribeProgress | null;
  error: string | null;

  setSourceClipId: (id: string | null) => void;
  generate: () => Promise<void>;
  updateCaptionText: (id: string, text: string) => void;
  updateCaptionTiming: (id: string, start: number, end: number) => void;
  removeCaption: (id: string) => void;
  clear: () => void;
}

export const useCaptionsStore = create<CaptionsState>((set, get) => ({
  sourceClipId: null,
  captions: null,
  generating: false,
  progress: null,
  error: null,

  setSourceClipId: (id) => set({ sourceClipId: id, captions: null, error: null }),

  generate: async () => {
    const { sourceClipId } = get();
    if (!sourceClipId) return;
    const project = useProjectStore.getState().project;
    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === sourceClipId);
    if (!clip || (clip.kind !== 'video' && clip.kind !== 'audio')) {
      set({ error: 'Select a video or audio clip first.' });
      return;
    }
    const asset = project.assets.find((a) => a.id === clip.assetId);
    if (!asset || asset.missing) {
      set({ error: 'This clip\'s media is missing — relink it in the Media panel first.' });
      return;
    }

    set({ generating: true, error: null, progress: { status: 'loading model' } });
    try {
      const samples = await extractWhisperSamples(asset.url, clip.sourceIn, clip.sourceIn + clip.duration);
      const { chunks } = await transcribeAudio(samples, (p) => set({ progress: p }));
      const captions: EditableCaption[] = chunks.map((c) => ({ id: newId(), start: c.start, end: c.end, text: c.text }));
      set({ captions, generating: false, progress: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), generating: false, progress: null });
    }
  },

  updateCaptionText: (id, text) =>
    set((s) => ({ captions: s.captions?.map((c) => (c.id === id ? { ...c, text } : c)) ?? null })),

  updateCaptionTiming: (id, start, end) =>
    set((s) => ({ captions: s.captions?.map((c) => (c.id === id ? { ...c, start, end } : c)) ?? null })),

  removeCaption: (id) =>
    set((s) => ({ captions: s.captions?.filter((c) => c.id !== id) ?? null })),

  clear: () => set({ sourceClipId: null, captions: null, generating: false, progress: null, error: null }),
}));
