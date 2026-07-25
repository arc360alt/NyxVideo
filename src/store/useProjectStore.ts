import { create } from 'zustand';
import type {
  Clip,
  ClipKind,
  EffectParams,
  KeyframeProp,
  MediaAsset,
  MediaClip,
  Project,
  ProjectBackground,
  ShapeClip,
  ShapeStyle,
  ShapeType,
  TextClip,
  Track,
  TrackKind,
  Transform,
  Transition,
  TransitionType,
} from '../types';
import { DEFAULT_BACKGROUND, DEFAULT_EFFECTS } from '../types';
import { captureVideoFrame } from '../lib/freezeFrame';
import { withKeyframe, withoutKeyframe, propHasKeyframes, KEYFRAME_PROPS } from '../lib/keyframes';
import { newId } from '../lib/id';
import { probeMediaFile } from '../lib/mediaProbe';
import { getSfxDef, renderAndCacheSfx } from '../lib/soundEffects';
import { getEngine } from '../lib/engine';
import { projectDuration } from '../lib/time';
import type { KeepSegment } from '../lib/silence';

function makeTrack(kind: TrackKind, name: string): Track {
  return { id: newId(), kind, name, clips: [], muted: false, locked: false, hidden: false };
}

export function createEmptyProject(): Project {
  return {
    name: 'Untitled Project',
    width: 1280,
    height: 720,
    fps: 30,
    background: { ...DEFAULT_BACKGROUND },
    markers: [],
    transitions: [],
    tracks: [makeTrack('video', 'Video 1'), makeTrack('audio', 'Audio 1')],
    assets: [],
  };
}

function fitTransform(project: Project, srcW: number, srcH: number): Transform {
  const srcAspect = srcW / srcH || 1;
  const dstAspect = project.width / project.height;
  let w: number, h: number;
  if (srcAspect > dstAspect) {
    w = project.width;
    h = w / srcAspect;
  } else {
    h = project.height;
    w = h * srcAspect;
  }
  return { x: project.width / 2, y: project.height / 2, width: w, height: h, rotation: 0, opacity: 100 };
}

/** Backfills fields added after a project may have been saved, so older saved/imported projects don't crash on load. */
function normalizeClip(clip: Clip): Clip {
  if (!('assetId' in clip)) return clip;
  const mc = clip as MediaClip;
  if (mc.speed !== undefined && mc.preservePitch !== undefined) return clip;
  return { ...mc, speed: mc.speed ?? 1, preservePitch: mc.preservePitch ?? true };
}

function trackEnd(track: Track): number {
  return track.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
}

/** Compacts a track's clips left-to-right with no gaps between them, preserving order and the first clip's position. */
function closeGaps(clips: Clip[]): Clip[] {
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  let cursor = sorted.length > 0 ? sorted[0].start : 0;
  return sorted.map((c) => {
    const updated = { ...c, start: cursor };
    cursor += c.duration;
    return updated;
  });
}

function overlaps(track: Track, start: number, duration: number, excludeId?: string, transitions: Transition[] = []): boolean {
  const end = start + duration;
  const transitionPartners = new Set<string>();
  if (excludeId) {
    for (const tr of transitions) {
      if (tr.fromClipId === excludeId) transitionPartners.add(tr.toClipId);
      if (tr.toClipId === excludeId) transitionPartners.add(tr.fromClipId);
    }
  }
  return track.clips.some((c) => {
    if (c.id === excludeId || transitionPartners.has(c.id)) return false;
    return start < c.start + c.duration - 1e-6 && end > c.start + 1e-6;
  });
}

interface EditorState {
  project: Project;
  projectId: string | null;
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedClipIds: string[];
  selectedTransitionId: string | null;
  rippleDeleteEnabled: boolean;
  snapEnabled: boolean;
  autoScrollEnabled: boolean;
  zoomToScrubberEnabled: boolean;
  pxPerSecond: number;
  silenceModalClipId: string | null;
  exportModalOpen: boolean;
  projectSettingsModalOpen: boolean;
  hotkeysModalOpen: boolean;
  isImporting: boolean;
  importError: string | null;

  // project / assets
  loadProject: (project: Project, id: string) => void;
  clearProject: () => void;
  relinkAsset: (assetId: string, file: File) => void;
  importFiles: (files: FileList | File[]) => Promise<void>;
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (assetId: string) => void;
  setProjectName: (name: string) => void;
  updateProjectSettings: (partial: { width?: number; height?: number; fps?: number; background?: Partial<ProjectBackground> }) => void;

  // markers
  addMarker: (time: number, label?: string) => string;
  removeMarker: (markerId: string) => void;
  renameMarker: (markerId: string, label: string) => void;
  jumpToMarker: (direction: 'next' | 'prev') => void;

  // clip placement
  addMediaToTimeline: (assetId: string, opts?: { trackId?: string; start?: number }) => string | null;
  addShapeToTimeline: (shapeType: ShapeType, opts?: { trackId?: string; start?: number }) => string;
  addTextToTimeline: (opts?: { trackId?: string; start?: number }) => string;
  addCaptionsAsTextClips: (sourceClipId: string, captions: { start: number; end: number; text: string }[]) => string | null;
  addSoundEffectToTimeline: (sfxId: string, opts?: { trackId?: string; start?: number }) => Promise<string | null>;

  // clip editing
  selectClip: (clipId: string | null) => void;
  selectClips: (clipIds: string[]) => void;
  toggleClipInSelection: (clipId: string) => void;
  selectAllClips: () => void;
  toggleRippleDelete: () => void;
  toggleSnap: () => void;
  toggleAutoScroll: () => void;
  toggleZoomToScrubber: () => void;
  removeAllKeyframesAt: (clipId: string, localTime: number) => void;
  moveSelectedClips: (clipIds: string[], deltaTime: number) => void;
  deleteSelectedClips: () => void;
  duplicateSelectedClips: () => void;
  applyTransition: (trackId: string, fromClipId: string, toClipId: string, type: TransitionType, duration?: number) => void;
  updateTransition: (id: string, partial: Partial<Pick<Transition, 'type' | 'duration'>>) => void;
  removeTransition: (id: string) => void;
  selectTransition: (id: string | null) => void;
  moveClip: (clipId: string, trackId: string, start: number) => void;
  trimClipEdge: (clipId: string, edge: 'start' | 'end', timelineTime: number) => void;
  splitClipAtTime: (clipId: string, atTime: number) => void;
  deleteClip: (clipId: string) => void;
  duplicateClip: (clipId: string) => void;
  updateTransform: (clipId: string, partial: Partial<Transform>) => void;
  /** Like updateTransform, but redirects a property to its keyframe track (at `localTime`) if it already has one. */
  setTransformProp: (clipId: string, localTime: number, prop: KeyframeProp, value: number) => void;
  updateEffects: (clipId: string, partial: Partial<EffectParams>) => void;
  updateShapeStyle: (clipId: string, partial: Partial<ShapeStyle>) => void;
  updateShapeType: (clipId: string, shapeType: ShapeType) => void;
  updateText: (clipId: string, partial: Partial<Pick<TextClip, 'text' | 'fontFamily' | 'fontSize' | 'color' | 'bold' | 'italic' | 'align' | 'backgroundColor'>>) => void;
  updateVolume: (clipId: string, volume: number) => void;
  toggleMute: (clipId: string) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  setClipPreservePitch: (clipId: string, preserve: boolean) => void;
  applySilenceRemoval: (clipId: string, keepSegments: KeepSegment[]) => void;
  splitKeepSide: (clipId: string, atTime: number, side: 'left' | 'right') => void;
  insertFreezeFrame: (clipId: string, atTime: number, durationSec?: number) => Promise<void>;

  // keyframes
  setKeyframe: (clipId: string, prop: KeyframeProp, localTime: number, value: number) => void;
  removeKeyframeAt: (clipId: string, prop: KeyframeProp, localTime: number) => void;
  keyframeAllAt: (clipId: string, localTime: number) => void;

  // tracks
  addTrack: (kind: TrackKind) => string;
  removeTrack: (trackId: string) => void;
  renameTrack: (trackId: string, name: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackHidden: (trackId: string) => void;

  // transport
  setCurrentTime: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setZoom: (pxPerSecond: number) => void;

  // modals
  openSilenceModal: (clipId: string) => void;
  closeSilenceModal: () => void;
  setExportModalOpen: (open: boolean) => void;
  setProjectSettingsModalOpen: (open: boolean) => void;
  setHotkeysModalOpen: (open: boolean) => void;

  // history
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export const useProjectStore = create<EditorState>((set, get) => ({
  project: createEmptyProject(),
  projectId: null,
  currentTime: 0,
  isPlaying: false,
  selectedClipId: null,
  selectedClipIds: [],
  selectedTransitionId: null,
  rippleDeleteEnabled: localStorage.getItem('nyxvideo:rippleDelete') === 'true',
  snapEnabled: localStorage.getItem('nyxvideo:snapEnabled') !== 'false',
  autoScrollEnabled: localStorage.getItem('nyxvideo:autoScroll') !== 'false',
  zoomToScrubberEnabled: localStorage.getItem('nyxvideo:zoomToScrubber') !== 'false',
  pxPerSecond: 80,
  silenceModalClipId: null,
  exportModalOpen: false,
  projectSettingsModalOpen: false,
  hotkeysModalOpen: false,
  isImporting: false,
  importError: null,
  canUndo: false,
  canRedo: false,

  loadProject: (project, id) => {
    getEngine().dispose();
    set({
      project: {
        ...project,
        markers: project.markers ?? [],
        transitions: project.transitions ?? [],
        background: project.background ?? { ...DEFAULT_BACKGROUND },
        tracks: project.tracks.map((t) => ({ ...t, clips: t.clips.map(normalizeClip) })),
      },
      projectId: id,
      currentTime: 0,
      isPlaying: false,
      selectedClipId: null,
      selectedClipIds: [],
      selectedTransitionId: null,
      silenceModalClipId: null,
    });
  },

  clearProject: () => {
    getEngine().dispose();
    set({
      project: createEmptyProject(),
      projectId: null,
      currentTime: 0,
      isPlaying: false,
      selectedClipId: null,
      selectedClipIds: [],
      selectedTransitionId: null,
      silenceModalClipId: null,
    });
  },

  relinkAsset: (assetId, file) =>
    set((s) => {
      const url = URL.createObjectURL(file);
      return {
        project: {
          ...s.project,
          assets: s.project.assets.map((a) => (a.id === assetId ? { ...a, url, missing: false } : a)),
        },
      };
    }),

  importFiles: async (files) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    set({ isImporting: true, importError: null });
    const newAssets: MediaAsset[] = [];
    for (const file of list) {
      try {
        const asset = await probeMediaFile(file);
        newAssets.push(asset);
      } catch (err) {
        set({ importError: err instanceof Error ? err.message : String(err) });
      }
    }
    set((s) => ({
      project: { ...s.project, assets: [...s.project.assets, ...newAssets] },
      isImporting: false,
    }));
  },

  addAsset: (asset) => set((s) => ({ project: { ...s.project, assets: [...s.project.assets, asset] } })),

  removeAsset: (assetId) =>
    set((s) => ({
      project: {
        ...s.project,
        assets: s.project.assets.filter((a) => a.id !== assetId),
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.filter((c) => !('assetId' in c) || (c as MediaClip).assetId !== assetId),
        })),
      },
    })),

  setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),

  updateProjectSettings: (partial) =>
    set((s) => {
      const oldW = s.project.width;
      const oldH = s.project.height;
      const newW = partial.width ?? oldW;
      const newH = partial.height ?? oldH;
      const scaleX = newW / oldW;
      const scaleY = newH / oldH;
      const rescale = scaleX !== 1 || scaleY !== 1;

      const tracks = rescale
        ? s.project.tracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => {
              if (!('transform' in c)) return c;
              const tr = (c as MediaClip | ShapeClip | TextClip).transform;
              const scaledTransform = {
                ...tr,
                x: tr.x * scaleX,
                y: tr.y * scaleY,
                width: tr.width * scaleX,
                height: tr.height * scaleY,
              };
              return { ...c, transform: scaledTransform } as Clip;
            }),
          }))
        : s.project.tracks;

      return {
        project: {
          ...s.project,
          width: newW,
          height: newH,
          fps: partial.fps ?? s.project.fps,
          background: partial.background ? { ...s.project.background, ...partial.background } : s.project.background,
          tracks,
        },
      };
    }),

  addMarker: (time, label) => {
    const id = newId();
    set((s) => ({
      project: {
        ...s.project,
        markers: [...s.project.markers, { id, time: Math.max(0, time), label: label ?? `Marker ${s.project.markers.length + 1}`, color: '#f59e0b' }].sort(
          (a, b) => a.time - b.time,
        ),
      },
    }));
    return id;
  },

  removeMarker: (markerId) =>
    set((s) => ({ project: { ...s.project, markers: s.project.markers.filter((m) => m.id !== markerId) } })),

  renameMarker: (markerId, label) =>
    set((s) => ({
      project: { ...s.project, markers: s.project.markers.map((m) => (m.id === markerId ? { ...m, label } : m)) },
    })),

  jumpToMarker: (direction) => {
    const { project, currentTime, setCurrentTime } = get();
    const markers = [...project.markers].sort((a, b) => a.time - b.time);
    if (markers.length === 0) return;
    if (direction === 'next') {
      const next = markers.find((m) => m.time > currentTime + 0.05);
      setCurrentTime(next ? next.time : markers[markers.length - 1].time);
    } else {
      const prev = [...markers].reverse().find((m) => m.time < currentTime - 0.05);
      setCurrentTime(prev ? prev.time : markers[0].time);
    }
  },

  addMediaToTimeline: (assetId, opts) => {
    const state = get();
    const asset = state.project.assets.find((a) => a.id === assetId);
    if (!asset) return null;

    const wantKind: TrackKind = asset.kind === 'audio' ? 'audio' : 'video';
    let tracks = state.project.tracks;
    let track = opts?.trackId
      ? tracks.find((t) => t.id === opts.trackId)
      : tracks.find((t) => t.kind === wantKind && !t.locked);

    let didCreateTrack = false;
    if (!track) {
      track = makeTrack(wantKind, `${wantKind === 'video' ? 'Video' : 'Audio'} ${tracks.filter((t) => t.kind === wantKind).length + 1}`);
      didCreateTrack = true;
    }

    const duration = asset.kind === 'image' ? 5 : asset.duration;
    let start = opts?.start ?? trackEnd(track);
    if (start < 0) start = 0;
    if (overlaps(track, start, duration)) {
      start = trackEnd(track);
    }

    const clip: MediaClip = {
      id: newId(),
      trackId: track.id,
      kind: asset.kind,
      name: asset.name,
      start,
      duration,
      assetId: asset.id,
      sourceIn: 0,
      volume: 100,
      muted: false,
      speed: 1,
      preservePitch: true,
      transform: fitTransform(state.project, asset.width || state.project.width, asset.height || state.project.height),
      effects: { ...DEFAULT_EFFECTS },
    };

    set((s) => {
      const tid = track!.id;
      let newTracks = s.project.tracks;
      if (didCreateTrack) {
        newTracks = wantKind === 'video' ? [track!, ...newTracks] : [...newTracks, track!];
      }
      newTracks = newTracks.map((t) => (t.id === tid ? { ...t, clips: [...t.clips, clip] } : t));
      return { project: { ...s.project, tracks: newTracks }, selectedClipId: clip.id, selectedClipIds: [clip.id] };
    });

    return clip.id;
  },

  addShapeToTimeline: (shapeType, opts) => {
    const state = get();
    let track = opts?.trackId
      ? state.project.tracks.find((t) => t.id === opts.trackId)
      : state.project.tracks.find((t) => t.kind === 'video' && !t.locked);
    let didCreateTrack = false;
    if (!track) {
      track = makeTrack('video', 'Video 1');
      didCreateTrack = true;
    }
    const w = Math.min(state.project.width, state.project.height) * 0.4;
    const h = w;
    const start = opts?.start ?? state.currentTime;
    const duration = 5;

    const clip: ShapeClip = {
      id: newId(),
      trackId: track.id,
      kind: 'shape',
      name: `${shapeType[0].toUpperCase()}${shapeType.slice(1)}`,
      start,
      duration,
      shapeType,
      style: { fill: '#a78bfa', stroke: '#ffffff', strokeWidth: 0 },
      transform: {
        x: state.project.width / 2,
        y: state.project.height / 2,
        width: w,
        height: h,
        rotation: 0,
        opacity: 100,
      },
    };

    set((s) => {
      const tid = track!.id;
      let newTracks = s.project.tracks;
      if (didCreateTrack) newTracks = [track!, ...newTracks];
      newTracks = newTracks.map((t) => (t.id === tid ? { ...t, clips: [...t.clips, clip] } : t));
      return { project: { ...s.project, tracks: newTracks }, selectedClipId: clip.id, selectedClipIds: [clip.id] };
    });

    return clip.id;
  },

  addTextToTimeline: (opts) => {
    const state = get();
    let track = opts?.trackId
      ? state.project.tracks.find((t) => t.id === opts.trackId)
      : state.project.tracks.find((t) => t.kind === 'video' && !t.locked);
    let didCreateTrack = false;
    if (!track) {
      track = makeTrack('video', 'Video 1');
      didCreateTrack = true;
    }
    const start = opts?.start ?? state.currentTime;

    const clip: TextClip = {
      id: newId(),
      trackId: track.id,
      kind: 'text',
      name: 'Text',
      start,
      duration: 5,
      text: 'Your text here',
      fontFamily: 'system-ui, sans-serif',
      fontSize: Math.round(state.project.height * 0.08),
      color: '#ffffff',
      bold: true,
      italic: false,
      align: 'center',
      transform: {
        x: state.project.width / 2,
        y: state.project.height / 2,
        width: state.project.width * 0.8,
        height: state.project.height * 0.2,
        rotation: 0,
        opacity: 100,
      },
    };

    set((s) => {
      const tid = track!.id;
      let newTracks = s.project.tracks;
      if (didCreateTrack) newTracks = [track!, ...newTracks];
      newTracks = newTracks.map((t) => (t.id === tid ? { ...t, clips: [...t.clips, clip] } : t));
      return { project: { ...s.project, tracks: newTracks }, selectedClipId: clip.id, selectedClipIds: [clip.id] };
    });

    return clip.id;
  },

  addCaptionsAsTextClips: (sourceClipId, captions) => {
    const state = get();
    const sourceClip = state.project.tracks.flatMap((t) => t.clips).find((c) => c.id === sourceClipId);
    if (!sourceClip || captions.length === 0) return null;

    const captionTrackCount = state.project.tracks.filter((t) => t.name.startsWith('Captions')).length;
    const track = makeTrack('video', captionTrackCount > 0 ? `Captions ${captionTrackCount + 1}` : 'Captions');
    const fontSize = Math.round(state.project.height * 0.055);

    const clips: TextClip[] = captions
      .map((cap) => {
        const start = Math.max(sourceClip.start, sourceClip.start + cap.start);
        const end = Math.min(sourceClip.start + sourceClip.duration, sourceClip.start + cap.end);
        const duration = end - start;
        if (duration <= 0.05 || !cap.text.trim()) return null;
        const textClip: TextClip = {
          id: newId(),
          trackId: track.id,
          kind: 'text',
          name: cap.text.slice(0, 24),
          start,
          duration,
          text: cap.text.trim(),
          fontFamily: 'system-ui, sans-serif',
          fontSize,
          color: '#ffffff',
          bold: true,
          italic: false,
          align: 'center',
          backgroundColor: 'rgba(0,0,0,0.6)',
          isCaption: true,
          transform: {
            x: state.project.width / 2,
            y: state.project.height * 0.86,
            width: state.project.width * 0.82,
            height: state.project.height * 0.16,
            rotation: 0,
            opacity: 100,
          },
        };
        return textClip;
      })
      .filter((c): c is TextClip => c !== null);

    if (clips.length === 0) return null;

    set((s) => ({
      project: { ...s.project, tracks: [{ ...track, clips }, ...s.project.tracks] },
    }));

    return track.id;
  },

  addSoundEffectToTimeline: async (sfxId, opts) => {
    const def = getSfxDef(sfxId);
    if (!def) return null;
    const state = get();
    let asset = state.project.assets.find((a) => a.id === sfxId);
    if (!asset) {
      const rendered = await renderAndCacheSfx(sfxId);
      asset = {
        id: sfxId,
        name: def.name,
        kind: 'audio',
        url: rendered.url,
        duration: rendered.duration,
        width: 0,
        height: 0,
        builtin: true,
      };
      set((s) => ({ project: { ...s.project, assets: [...s.project.assets, asset!] } }));
    }
    return get().addMediaToTimeline(asset.id, { trackId: opts?.trackId, start: opts?.start ?? get().currentTime });
  },

  selectClip: (clipId) =>
    set({
      selectedClipId: clipId,
      selectedClipIds: clipId ? [clipId] : [],
      selectedTransitionId: clipId ? null : get().selectedTransitionId,
    }),

  selectClips: (clipIds) =>
    set({
      selectedClipIds: clipIds,
      selectedClipId: clipIds.length === 1 ? clipIds[0] : null,
      selectedTransitionId: clipIds.length > 0 ? null : get().selectedTransitionId,
    }),

  toggleClipInSelection: (clipId) => {
    const current = get().selectedClipIds;
    const next = current.includes(clipId) ? current.filter((id) => id !== clipId) : [...current, clipId];
    set({
      selectedClipIds: next,
      selectedClipId: next.length === 1 ? next[0] : null,
      selectedTransitionId: next.length > 0 ? null : get().selectedTransitionId,
    });
  },

  selectAllClips: () => {
    const ids = get().project.tracks.flatMap((t) => t.clips.map((c) => c.id));
    get().selectClips(ids);
  },

  toggleRippleDelete: () => {
    const next = !get().rippleDeleteEnabled;
    localStorage.setItem('nyxvideo:rippleDelete', String(next));
    set({ rippleDeleteEnabled: next });
  },

  toggleSnap: () => {
    const next = !get().snapEnabled;
    localStorage.setItem('nyxvideo:snapEnabled', String(next));
    set({ snapEnabled: next });
  },

  toggleAutoScroll: () => {
    const next = !get().autoScrollEnabled;
    localStorage.setItem('nyxvideo:autoScroll', String(next));
    set({ autoScrollEnabled: next });
  },

  toggleZoomToScrubber: () => {
    const next = !get().zoomToScrubberEnabled;
    localStorage.setItem('nyxvideo:zoomToScrubber', String(next));
    set({ zoomToScrubberEnabled: next });
  },

  selectTransition: (id) =>
    set({
      selectedTransitionId: id,
      selectedClipId: id ? null : get().selectedClipId,
      selectedClipIds: id ? [] : get().selectedClipIds,
    }),

  applyTransition: (trackId, fromClipId, toClipId, type, duration = 1) =>
    set((s) => {
      const track = s.project.tracks.find((t) => t.id === trackId);
      if (!track) return s;
      const fromClip = track.clips.find((c) => c.id === fromClipId);
      const toClip = track.clips.find((c) => c.id === toClipId);
      if (!fromClip || !toClip) return s;

      const existing = s.project.transitions.find((tr) => tr.fromClipId === fromClipId && tr.toClipId === toClipId);
      const currentOverlap = Math.max(0, fromClip.start + fromClip.duration - toClip.start);
      const maxDuration = Math.min(fromClip.duration, toClip.duration) * 0.9;
      const clampedDuration = Math.max(0.1, Math.min(duration, maxDuration));
      const delta = clampedDuration - currentOverlap;

      const tracks = s.project.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          clips: t.clips.map((c) => {
            if (c.start >= toClip.start - 1e-6) {
              return { ...c, start: Math.max(0, c.start - delta) };
            }
            return c;
          }),
        };
      });

      const transitions = existing
        ? s.project.transitions.map((tr) => (tr.id === existing.id ? { ...tr, type, duration: clampedDuration } : tr))
        : [...s.project.transitions, { id: newId(), trackId, fromClipId, toClipId, type, duration: clampedDuration }];

      return { project: { ...s.project, tracks, transitions } };
    }),

  updateTransition: (id, partial) =>
    set((s) => {
      const transition = s.project.transitions.find((tr) => tr.id === id);
      if (!transition) return s;
      if (partial.duration !== undefined && partial.duration !== transition.duration) {
        // Re-run through applyTransition's ripple logic to adjust the overlap.
        get().applyTransition(transition.trackId, transition.fromClipId, transition.toClipId, partial.type ?? transition.type, partial.duration);
        return s;
      }
      return {
        project: {
          ...s.project,
          transitions: s.project.transitions.map((tr) => (tr.id === id ? { ...tr, ...partial } : tr)),
        },
      };
    }),

  removeTransition: (id) =>
    set((s) => {
      const transition = s.project.transitions.find((tr) => tr.id === id);
      if (!transition) return s;
      const tracks = s.project.tracks.map((t) => {
        if (t.id !== transition.trackId) return t;
        const toClip = t.clips.find((c) => c.id === transition.toClipId);
        if (!toClip) return t;
        return {
          ...t,
          clips: t.clips.map((c) => (c.start >= toClip.start - 1e-6 ? { ...c, start: c.start + transition.duration } : c)),
        };
      });
      return {
        project: { ...s.project, tracks, transitions: s.project.transitions.filter((tr) => tr.id !== id) },
        selectedTransitionId: s.selectedTransitionId === id ? null : s.selectedTransitionId,
      };
    }),

  moveClip: (clipId, trackId, start) =>
    set((s) => {
      const clampedStart = Math.max(0, start);
      const targetTrack = s.project.tracks.find((t) => t.id === trackId);
      if (!targetTrack || targetTrack.locked) return s;
      const clip = s.project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
      if (!clip) return s;
      if (targetTrack.kind === 'audio' && clip.kind !== 'audio') return s;
      if (targetTrack.kind === 'video' && clip.kind === 'audio') return s;
      if (overlaps(targetTrack, clampedStart, clip.duration, clipId, s.project.transitions)) return s;

      const tracks = s.project.tracks.map((t) => {
        if (t.id === clip.trackId && t.id === trackId) {
          return { ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, start: clampedStart } : c)) };
        }
        if (t.id === clip.trackId) {
          return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
        }
        if (t.id === trackId) {
          return { ...t, clips: [...t.clips, { ...clip, trackId, start: clampedStart }] };
        }
        return t;
      });
      const trackChanged = trackId !== clip.trackId;
      const transitions = trackChanged
        ? s.project.transitions.filter((tr) => tr.fromClipId !== clipId && tr.toClipId !== clipId)
        : s.project.transitions;
      return { project: { ...s.project, tracks, transitions } };
    }),

  trimClipEdge: (clipId, edge, timelineTime) =>
    set((s) => {
      const tracks = s.project.tracks.map((t) => {
        const idx = t.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return t;
        const clip = t.clips[idx];
        const end = clip.start + clip.duration;
        let updated: Clip = clip;

        if (edge === 'start') {
          let newStart = Math.min(Math.max(0, timelineTime), end - 0.1);
          const delta = newStart - clip.start;
          if ('assetId' in clip) {
            const mc = clip as MediaClip;
            const speed = mc.speed || 1;
            const newSourceIn = mc.sourceIn + delta * speed;
            if (newSourceIn < 0) newStart = clip.start - mc.sourceIn / speed;
            updated = { ...mc, start: newStart, duration: end - newStart, sourceIn: Math.max(0, mc.sourceIn + (newStart - clip.start) * speed) };
          } else {
            updated = { ...clip, start: newStart, duration: end - newStart };
          }
        } else {
          let newEnd = Math.max(timelineTime, clip.start + 0.1);
          if ('assetId' in clip) {
            const mc = clip as MediaClip;
            // Can't extend past source-known bound only when we know asset duration; caller (asset) enforces via UI.
            updated = { ...mc, duration: newEnd - clip.start };
          } else {
            updated = { ...clip, duration: newEnd - clip.start };
          }
        }

        if (overlaps(t, updated.start, updated.duration, clipId, s.project.transitions)) return t;
        const newClips = [...t.clips];
        newClips[idx] = updated;
        return { ...t, clips: newClips };
      });
      return { project: { ...s.project, tracks } };
    }),

  splitClipAtTime: (clipId, atTime) =>
    set((s) => {
      const tracks = s.project.tracks.map((t) => {
        const idx = t.clips.findIndex((c) => c.id === clipId);
        if (idx === -1) return t;
        const clip = t.clips[idx];
        if (atTime <= clip.start + 0.02 || atTime >= clip.start + clip.duration - 0.02) return t;

        const firstDuration = atTime - clip.start;
        const secondDuration = clip.duration - firstDuration;
        const first: Clip = { ...clip, duration: firstDuration };
        let second: Clip;
        if ('assetId' in clip) {
          const mc = clip as MediaClip;
          second = { ...mc, id: newId(), start: atTime, duration: secondDuration, sourceIn: mc.sourceIn + firstDuration * (mc.speed || 1) };
        } else {
          second = { ...(clip as ShapeClip | TextClip), id: newId(), start: atTime, duration: secondDuration } as Clip;
        }
        const newClips = [...t.clips];
        newClips.splice(idx, 1, first, second);
        return { ...t, clips: newClips };
      });
      return { project: { ...s.project, tracks } };
    }),

  splitKeepSide: (clipId, atTime, side) => {
    if (side === 'left') get().trimClipEdge(clipId, 'end', atTime);
    else get().trimClipEdge(clipId, 'start', atTime);
  },

  insertFreezeFrame: async (clipId, atTime, durationSec = 2) => {
    const state = get();
    const track = state.project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
    const clip = track?.clips.find((c) => c.id === clipId);
    if (!track || !clip || clip.kind !== 'video') return;
    const mc = clip as MediaClip;
    const asset = state.project.assets.find((a) => a.id === mc.assetId);
    if (!asset) return;
    if (atTime <= clip.start + 0.02 || atTime >= clip.start + clip.duration - 0.02) return;

    const sourceTime = mc.sourceIn + (atTime - mc.start) * (mc.speed || 1);
    const dataUrl = await captureVideoFrame(asset, sourceTime);

    const stillAsset: MediaAsset = {
      id: newId(),
      name: `${asset.name} (freeze)`,
      kind: 'image',
      url: dataUrl,
      duration: 0,
      width: mc.transform.width,
      height: mc.transform.height,
      thumbnail: dataUrl,
    };

    const freezeClip: Clip = {
      id: newId(),
      trackId: track.id,
      kind: 'image',
      name: 'Freeze Frame',
      start: atTime,
      duration: durationSec,
      assetId: stillAsset.id,
      sourceIn: 0,
      volume: 100,
      muted: true,
      speed: 1,
      preservePitch: true,
      transform: { ...mc.transform },
      effects: { ...mc.effects },
      isFreezeFrame: true,
    } as MediaClip;

    set((s) => {
      const tracks = s.project.tracks.map((t) => {
        if (t.id !== track.id) {
          return { ...t, clips: t.clips.map((c) => (c.start >= atTime - 1e-6 ? { ...c, start: c.start + durationSec } : c)) };
        }
        const original = t.clips.find((c) => c.id === clipId) as MediaClip;
        const firstDuration = atTime - original.start;
        const secondDuration = original.duration - firstDuration;
        const before: MediaClip = { ...original, duration: firstDuration };
        const after: MediaClip = {
          ...original,
          id: newId(),
          start: atTime + durationSec,
          duration: secondDuration,
          sourceIn: original.sourceIn + firstDuration * (original.speed || 1),
        };
        const others = t.clips
          .filter((c) => c.id !== clipId)
          .map((c) => (c.start >= atTime - 1e-6 ? { ...c, start: c.start + durationSec } : c));
        return { ...t, clips: [...others, before, freezeClip, after] };
      });
      return {
        project: { ...s.project, assets: [...s.project.assets, stillAsset], tracks },
        selectedClipId: freezeClip.id,
        selectedClipIds: [freezeClip.id],
      };
    });
  },

  deleteClip: (clipId) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          if (!t.clips.some((c) => c.id === clipId)) return t;
          const remaining = t.clips.filter((c) => c.id !== clipId);
          return { ...t, clips: s.rippleDeleteEnabled ? closeGaps(remaining) : remaining };
        }),
        transitions: s.project.transitions.filter((tr) => tr.fromClipId !== clipId && tr.toClipId !== clipId),
      },
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
      selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId),
    })),

  deleteSelectedClips: () =>
    set((s) => {
      const ids = new Set(s.selectedClipIds.length > 0 ? s.selectedClipIds : s.selectedClipId ? [s.selectedClipId] : []);
      if (ids.size === 0) return s;
      return {
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => {
            if (!t.clips.some((c) => ids.has(c.id))) return t;
            const remaining = t.clips.filter((c) => !ids.has(c.id));
            return { ...t, clips: s.rippleDeleteEnabled ? closeGaps(remaining) : remaining };
          }),
          transitions: s.project.transitions.filter((tr) => !ids.has(tr.fromClipId) && !ids.has(tr.toClipId)),
        },
        selectedClipId: null,
        selectedClipIds: [],
      };
    }),

  duplicateSelectedClips: () =>
    set((s) => {
      const ids = new Set(s.selectedClipIds.length > 0 ? s.selectedClipIds : s.selectedClipId ? [s.selectedClipId] : []);
      if (ids.size === 0) return s;
      const newIds: string[] = [];
      const tracks = s.project.tracks.map((t) => {
        const selectedHere = t.clips.filter((c) => ids.has(c.id));
        if (selectedHere.length === 0) return t;
        let cursor = trackEnd(t);
        const copies = selectedHere.map((clip) => {
          const copy: Clip = { ...clip, id: newId(), start: cursor };
          cursor += clip.duration;
          newIds.push(copy.id);
          return copy;
        });
        return { ...t, clips: [...t.clips, ...copies] };
      });
      return {
        project: { ...s.project, tracks },
        selectedClipId: newIds.length === 1 ? newIds[0] : null,
        selectedClipIds: newIds,
      };
    }),

  moveSelectedClips: (clipIds, deltaTime) =>
    set((s) => {
      if (deltaTime === 0 || clipIds.length === 0) return s;
      const idSet = new Set(clipIds);
      const proposedStart = new Map<string, number>();
      for (const track of s.project.tracks) {
        for (const clip of track.clips) {
          if (idSet.has(clip.id)) proposedStart.set(clip.id, Math.max(0, clip.start + deltaTime));
        }
      }

      for (const track of s.project.tracks) {
        const selectedHere = track.clips.filter((c) => idSet.has(c.id));
        if (selectedHere.length === 0) continue;
        const others = track.clips.filter((c) => !idSet.has(c.id));
        for (const clip of selectedHere) {
          const newStart = proposedStart.get(clip.id)!;
          const newEnd = newStart + clip.duration;
          for (const other of [...others, ...selectedHere.filter((c) => c.id !== clip.id)]) {
            const otherStart = idSet.has(other.id) ? proposedStart.get(other.id)! : other.start;
            const otherEnd = otherStart + other.duration;
            if (newStart < otherEnd - 1e-6 && newEnd > otherStart + 1e-6) return s; // would overlap — reject whole batch
          }
        }
      }

      return {
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => (idSet.has(c.id) ? { ...c, start: proposedStart.get(c.id)! } : c)),
          })),
        },
      };
    }),

  duplicateClip: (clipId) =>
    set((s) => {
      const track = s.project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
      if (!track) return s;
      const clip = track.clips.find((c) => c.id === clipId)!;
      const newStart = trackEnd(track);
      const copy: Clip = { ...clip, id: newId(), start: newStart };
      return {
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === track.id ? { ...t, clips: [...t.clips, copy] } : t)),
        },
        selectedClipId: copy.id,
        selectedClipIds: [copy.id],
      };
    }),

  updateTransform: (clipId, partial) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId && 'transform' in c
              ? { ...c, transform: { ...(c as MediaClip).transform, ...partial } }
              : c,
          ),
        })),
      },
    })),

  setTransformProp: (clipId, localTime, prop, value) => {
    const clip = get().project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);
    if (!clip) return;
    if (propHasKeyframes(clip, prop)) {
      get().setKeyframe(clipId, prop, localTime, value);
    } else {
      get().updateTransform(clipId, { [prop]: value });
    }
  },

  updateEffects: (clipId, partial) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId && c.kind !== 'shape' && c.kind !== 'text'
              ? { ...c, effects: { ...(c as MediaClip).effects, ...partial } }
              : c,
          ),
        })),
      },
    })),

  updateShapeStyle: (clipId, partial) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId && c.kind === 'shape' ? { ...c, style: { ...(c as ShapeClip).style, ...partial } } : c,
          ),
        })),
      },
    })),

  updateShapeType: (clipId, shapeType) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId && c.kind === 'shape' ? { ...c, shapeType } : c)),
        })),
      },
    })),

  updateText: (clipId, partial) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId && c.kind === 'text' ? { ...c, ...partial } : c)),
        })),
      },
    })),

  updateVolume: (clipId, volume) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId && 'volume' in c ? { ...c, volume } : c)),
        })),
      },
    })),

  toggleMute: (clipId) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId && 'muted' in c ? { ...c, muted: !(c as MediaClip).muted } : c)),
        })),
      },
    })),

  setClipSpeed: (clipId, speed) =>
    set((s) => {
      // 16x matches the practical ceiling browsers support for HTMLMediaElement.playbackRate;
      // going higher risks the element rejecting the rate change outright (see engine.ts).
      const clampedSpeed = Math.max(0.1, Math.min(16, speed));
      const track = s.project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
      if (!track) return s;
      const clip = track.clips.find((c) => c.id === clipId);
      if (!clip || !('assetId' in clip)) return s;
      const mc = clip as MediaClip;
      // Reshape duration to keep the same amount of source content covered: less time to play it back faster, more to play it slower.
      const sourceSpan = mc.duration * (mc.speed || 1);
      let newDuration = Math.max(0.05, sourceSpan / clampedSpeed);
      const oldEnd = mc.start + mc.duration;

      let clips: Clip[];
      if (s.rippleDeleteEnabled) {
        // Push/pull every later clip on this track by however much this clip's duration changed, preserving their relative gaps.
        const newEnd = mc.start + newDuration;
        const delta = newEnd - oldEnd;
        clips = track.clips.map((c) => {
          if (c.id === clipId) return { ...c, speed: clampedSpeed, duration: newDuration };
          if (c.start >= oldEnd - 1e-6) return { ...c, start: Math.max(0, c.start + delta) };
          return c;
        });
      } else {
        const nextStart = track.clips
          .filter((c) => c.id !== clipId && c.start >= mc.start - 1e-6)
          .reduce((min, c) => Math.min(min, c.start), Infinity);
        if (Number.isFinite(nextStart)) newDuration = Math.min(newDuration, Math.max(0.05, nextStart - mc.start));
        clips = track.clips.map((c) => (c.id === clipId ? { ...c, speed: clampedSpeed, duration: newDuration } : c));
      }

      return {
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id !== track.id ? t : { ...t, clips })),
        },
      };
    }),

  setClipPreservePitch: (clipId, preserve) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId && 'assetId' in c ? { ...c, preservePitch: preserve } : c)),
        })),
      },
    })),

  setKeyframe: (clipId, prop, localTime, value) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, keyframes: withKeyframe(c.keyframes, prop, localTime, value) } : c,
          ),
        })),
      },
    })),

  removeKeyframeAt: (clipId, prop, localTime) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId ? { ...c, keyframes: withoutKeyframe(c.keyframes, prop, localTime) } : c,
          ),
        })),
      },
    })),

  removeAllKeyframesAt: (clipId, localTime) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId || !c.keyframes) return c;
            let kf = c.keyframes;
            for (const prop of KEYFRAME_PROPS) kf = withoutKeyframe(kf, prop, localTime);
            return { ...c, keyframes: kf };
          }),
        })),
      },
    })),

  keyframeAllAt: (clipId, localTime) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => {
            if (c.id !== clipId || !('transform' in c)) return c;
            const tr = (c as MediaClip | ShapeClip | TextClip).transform;
            let kf = c.keyframes;
            for (const prop of KEYFRAME_PROPS) kf = withKeyframe(kf, prop, localTime, tr[prop]);
            return { ...c, keyframes: kf };
          }),
        })),
      },
    })),

  applySilenceRemoval: (clipId, keepSegments) =>
    set((s) => {
      const track = s.project.tracks.find((t) => t.clips.some((c) => c.id === clipId));
      if (!track) return s;
      const clip = track.clips.find((c) => c.id === clipId) as MediaClip;
      if (!clip || !('assetId' in clip)) return s;
      if (keepSegments.length === 0) return s;

      const speed = clip.speed || 1;
      let cursor = clip.start;
      const newClips: MediaClip[] = keepSegments.map((seg) => {
        const timelineDuration = (seg.sourceOut - seg.sourceIn) / speed;
        const c: MediaClip = { ...clip, id: newId(), start: cursor, duration: timelineDuration, sourceIn: seg.sourceIn };
        cursor += timelineDuration;
        return c;
      });
      const originalEnd = clip.start + clip.duration;
      const newEnd = cursor;
      const shift = originalEnd - newEnd;

      const idx = track.clips.findIndex((c) => c.id === clipId);
      const finalClips = [
        ...track.clips.slice(0, idx),
        ...newClips,
        ...track.clips.slice(idx + 1).map((c) => (c.start >= originalEnd - 1e-6 ? { ...c, start: c.start - shift } : c)),
      ];

      return {
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => (t.id === track.id ? { ...t, clips: finalClips } : t)),
        },
        selectedClipId: newClips[0]?.id ?? null,
        selectedClipIds: newClips[0] ? [newClips[0].id] : [],
      };
    }),

  addTrack: (kind) => {
    const track = makeTrack(kind, `${kind === 'video' ? 'Video' : 'Audio'} ${get().project.tracks.filter((t) => t.kind === kind).length + 1}`);
    set((s) => ({
      project: {
        ...s.project,
        tracks: kind === 'video' ? [track, ...s.project.tracks] : [...s.project.tracks, track],
      },
    }));
    return track.id;
  },

  removeTrack: (trackId) =>
    set((s) => ({ project: { ...s.project, tracks: s.project.tracks.filter((t) => t.id !== trackId) } })),

  renameTrack: (trackId, name) =>
    set((s) => ({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, name } : t)) } })),

  toggleTrackMute: (trackId) =>
    set((s) => ({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)) } })),

  toggleTrackLock: (trackId) =>
    set((s) => ({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)) } })),

  toggleTrackHidden: (trackId) =>
    set((s) => ({ project: { ...s.project, tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, hidden: !t.hidden } : t)) } })),

  setCurrentTime: (t) => {
    const clamped = Math.max(0, t);
    set({ currentTime: clamped });
    getEngine().syncFrame(get().project, clamped, get().isPlaying);
  },
  setPlaying: (playing) => {
    set({ isPlaying: playing });
    if (playing) getEngine().syncFrame(get().project, get().currentTime, true);
    else getEngine().pauseAll();
  },
  togglePlay: () => {
    const next = !get().isPlaying;
    set({ isPlaying: next });
    if (next) getEngine().syncFrame(get().project, get().currentTime, true);
    else getEngine().pauseAll();
  },
  setZoom: (pxPerSecond) => set({ pxPerSecond: Math.min(400, Math.max(2, pxPerSecond)) }),

  openSilenceModal: (clipId) => set({ silenceModalClipId: clipId }),
  closeSilenceModal: () => set({ silenceModalClipId: null }),
  setExportModalOpen: (open) => set({ exportModalOpen: open }),
  setProjectSettingsModalOpen: (open) => set({ projectSettingsModalOpen: open }),
  setHotkeysModalOpen: (open) => set({ hotkeysModalOpen: open }),

  undo: () => {
    flushPendingHistorySnapshot();
    if (historyPast.length === 0) return;
    const previous = historyPast.pop()!;
    historyFuture.push(get().project);
    suppressHistoryTracking = true;
    set({ project: previous, selectedClipId: null, selectedClipIds: [], selectedTransitionId: null });
    suppressHistoryTracking = false;
    syncHistoryFlags();
  },
  redo: () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture.pop()!;
    historyPast.push(get().project);
    suppressHistoryTracking = true;
    set({ project: next, selectedClipId: null, selectedClipIds: [], selectedTransitionId: null });
    suppressHistoryTracking = false;
    syncHistoryFlags();
  },
}));

// ---- Undo/redo history ----
// Kept outside the reactive store (as plain module state) since it only needs to react to `project`
// changing, not to trigger renders of its own; canUndo/canRedo are mirrored into the store so buttons
// can reflect them. Rapid-fire changes from a single physical gesture (dragging a volume/effect
// slider fires one store update per pixel) are coalesced into a single undo step via a short
// debounce, rather than one step per input event. This window has to stay short — long enough to
// bridge the ~10-30ms gaps between onChange events during a drag, but well short of the gap between
// two separate deliberate actions (even a fast double-click on a button), or those get wrongly
// merged into one undo step too.
const MAX_HISTORY = 100;
const HISTORY_DEBOUNCE_MS = 120;

let historyPast: Project[] = [];
let historyFuture: Project[] = [];
let pendingSnapshot: Project | null = null;
let historyDebounceHandle: ReturnType<typeof setTimeout> | null = null;
let suppressHistoryTracking = false;

function syncHistoryFlags() {
  useProjectStore.setState({
    canUndo: historyPast.length > 0 || pendingSnapshot !== null,
    canRedo: historyFuture.length > 0,
  });
}

function flushPendingHistorySnapshot() {
  if (historyDebounceHandle !== null) {
    clearTimeout(historyDebounceHandle);
    historyDebounceHandle = null;
  }
  if (pendingSnapshot !== null) {
    historyPast.push(pendingSnapshot);
    if (historyPast.length > MAX_HISTORY) historyPast.shift();
    pendingSnapshot = null;
  }
}

useProjectStore.subscribe((state, prevState) => {
  if (suppressHistoryTracking) return;

  if (state.projectId !== prevState.projectId) {
    // Switched to a different project (or cleared it) — history doesn't carry over.
    historyPast = [];
    historyFuture = [];
    pendingSnapshot = null;
    if (historyDebounceHandle !== null) {
      clearTimeout(historyDebounceHandle);
      historyDebounceHandle = null;
    }
    syncHistoryFlags();
    return;
  }

  if (state.project === prevState.project) return;

  if (pendingSnapshot === null) pendingSnapshot = prevState.project;
  historyFuture = [];
  if (historyDebounceHandle !== null) clearTimeout(historyDebounceHandle);
  historyDebounceHandle = setTimeout(() => {
    historyDebounceHandle = null;
    flushPendingHistorySnapshot();
    syncHistoryFlags();
  }, HISTORY_DEBOUNCE_MS);
  syncHistoryFlags();
});

export function selectClipKind(clip: Clip): ClipKind {
  return clip.kind;
}

export function getProjectDuration(project: Project): number {
  return projectDuration(project);
}
