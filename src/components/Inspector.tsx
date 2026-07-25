import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { useLayoutStore } from '../store/useLayoutStore';
import type { KeyframeProp, MediaClip, ShapeClip, TextClip } from '../types';
import { SHAPE_LIBRARY } from '../lib/shapes';
import { resolveTransform, propHasKeyframes, keyframeAt } from '../lib/keyframes';
import { TRANSITION_LIBRARY } from '../lib/transitions';
import { ResizeHandle } from './ResizeHandle';
import { FiCopy, FiScissors, FiTrash2, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { MdGraphicEq } from 'react-icons/md';
import { FaTrash } from 'react-icons/fa6';

const FONTS = ['system-ui, sans-serif', 'Georgia, serif', '"Courier New", monospace', '"Comic Sans MS", cursive', 'Impact, sans-serif'];

function rgbaToHex(rgba: string): string {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  const [, r, g, b] = m;
  return `#${[r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function KeyframeToggle({ active, atCurrent, onClick }: { active: boolean; atCurrent: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={atCurrent ? 'Remove keyframe here' : active ? 'Add keyframe here' : 'Animate this property'}
      className="flex h-4 w-4 shrink-0 items-center justify-center"
    >
      <span
        className={`h-2.5 w-2.5 rotate-45 border ${
          atCurrent ? 'border-violet-400 bg-violet-400' : active ? 'border-violet-400 bg-transparent' : 'border-border-strong bg-transparent hover:border-border-strong'
        }`}
      />
    </button>
  );
}

export function Inspector() {
  const inspectorWidth = useLayoutStore((s) => s.inspectorWidth);
  const setInspectorWidth = useLayoutStore((s) => s.setInspectorWidth);
  const clip = useProjectStore((s) => s.project.tracks.flatMap((t) => t.clips).find((c) => c.id === s.selectedClipId));
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const deleteSelectedClips = useProjectStore((s) => s.deleteSelectedClips);
  const duplicateSelectedClips = useProjectStore((s) => s.duplicateSelectedClips);
  const selectedTransition = useProjectStore((s) => s.project.transitions.find((tr) => tr.id === s.selectedTransitionId));
  const updateTransition = useProjectStore((s) => s.updateTransition);
  const removeTransition = useProjectStore((s) => s.removeTransition);
  const setTransformProp = useProjectStore((s) => s.setTransformProp);
  const setKeyframe = useProjectStore((s) => s.setKeyframe);
  const removeKeyframeAt = useProjectStore((s) => s.removeKeyframeAt);
  const updateVolume = useProjectStore((s) => s.updateVolume);
  const toggleMute = useProjectStore((s) => s.toggleMute);
  const setClipSpeed = useProjectStore((s) => s.setClipSpeed);
  const setClipPreservePitch = useProjectStore((s) => s.setClipPreservePitch);
  const updateShapeStyle = useProjectStore((s) => s.updateShapeStyle);
  const updateShapeType = useProjectStore((s) => s.updateShapeType);
  const updateText = useProjectStore((s) => s.updateText);
  const deleteClip = useProjectStore((s) => s.deleteClip);
  const duplicateClip = useProjectStore((s) => s.duplicateClip);
  const splitClipAtTime = useProjectStore((s) => s.splitClipAtTime);
  const currentTime = useProjectStore((s) => s.currentTime);
  const openSilenceModal = useProjectStore((s) => s.openSilenceModal);

  const [speedDraft, setSpeedDraft] = useState('1');
  useEffect(() => {
    if (clip && 'assetId' in clip) setSpeedDraft((clip as MediaClip).speed.toFixed(2));
  }, [clip]);

  if (!clip && selectedTransition) {
    return (
      <div className="flex h-full shrink-0">
        <ResizeHandle axis="x" invert size={inspectorWidth} onResize={setInspectorWidth} min={220} max={520} />
        <div
          className="nyx-scroll flex h-full flex-col gap-4 overflow-y-auto border-l border-border bg-surface-0 p-3"
          style={{ width: inspectorWidth }}
        >
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Transition</div>
            <select
              value={selectedTransition.type}
              onChange={(e) => updateTransition(selectedTransition.id, { type: e.target.value as never })}
              className="mb-2 w-full rounded border border-border bg-surface-1 px-2 py-1.5 text-xs text-fg"
            >
              {TRANSITION_LIBRARY.map((tr) => (
                <option key={tr.type} value={tr.type}>
                  {tr.name}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-fg-subtle">
              <span className="flex justify-between">
                <span>Duration</span>
                <span className="text-fg-faint">{selectedTransition.duration.toFixed(1)}s</span>
              </span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={selectedTransition.duration}
                onChange={(e) => updateTransition(selectedTransition.id, { duration: Number(e.target.value) })}
              />
            </label>
            <button
              onClick={() => removeTransition(selectedTransition.id)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-surface-1 py-1.5 text-xs text-red-400 hover:bg-red-950"
            >
              <FaTrash size={11} /> Remove Transition
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!clip && selectedClipIds.length > 1) {
    return (
      <div className="flex h-full shrink-0">
        <ResizeHandle axis="x" invert size={inspectorWidth} onResize={setInspectorWidth} min={220} max={520} />
        <div
          className="flex h-full flex-col gap-3 border-l border-border bg-surface-0 p-3"
          style={{ width: inspectorWidth }}
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-faint">
            {selectedClipIds.length} clips selected
          </div>
          <p className="text-xs text-fg-faint">
            Drag any one of them to move the whole group together. Individual properties can only be edited one clip at a time.
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={duplicateSelectedClips}
              className="flex flex-1 items-center justify-center gap-1 rounded bg-surface-1 py-1.5 text-xs text-fg-muted hover:bg-surface-2"
            >
              <FiCopy size={12} /> Duplicate
            </button>
            <button
              onClick={deleteSelectedClips}
              className="flex flex-1 items-center justify-center gap-1 rounded bg-surface-1 py-1.5 text-xs text-red-400 hover:bg-red-950"
            >
              <FiTrash2 size={12} /> Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="flex h-full shrink-0">
        <ResizeHandle axis="x" invert size={inspectorWidth} onResize={setInspectorWidth} min={220} max={520} />
        <div
          className="flex h-full flex-col items-center justify-center border-l border-border bg-surface-0 p-4 text-center text-xs text-fg-faint"
          style={{ width: inspectorWidth }}
        >
          Select a clip on the timeline to edit its properties.
        </div>
      </div>
    );
  }

  const hasTransform = 'transform' in clip;
  const localTime = clip ? currentTime - clip.start : 0;
  const t = hasTransform ? resolveTransform(clip, localTime) : null;
  const isMedia = clip.kind === 'video' || clip.kind === 'audio' || clip.kind === 'image';
  const mediaClip = isMedia ? (clip as MediaClip) : null;

  const commitSpeed = () => {
    if (!mediaClip) return;
    const n = Number(speedDraft);
    if (Number.isFinite(n) && n > 0) setClipSpeed(mediaClip.id, n);
    else setSpeedDraft(mediaClip.speed.toFixed(2));
  };

  const toggleKeyframe = (prop: KeyframeProp, currentValue: number) => {
    if (!clip) return;
    if (keyframeAt(clip, prop, localTime)) {
      removeKeyframeAt(clip.id, prop, localTime);
    } else {
      setKeyframe(clip.id, prop, localTime, currentValue);
    }
  };

  return (
    <div className="flex h-full shrink-0">
      <ResizeHandle axis="x" invert size={inspectorWidth} onResize={setInspectorWidth} min={220} max={520} />
      <div
        className="nyx-scroll flex h-full flex-col gap-4 overflow-y-auto border-l border-border bg-surface-0 p-3"
        style={{ width: inspectorWidth }}
      >
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Clip</div>
        <div className="truncate rounded bg-surface-1 px-2 py-1.5 text-sm text-fg">{clip.name}</div>
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={() => splitClipAtTime(clip.id, currentTime)}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-surface-1 py-1.5 text-xs text-fg-muted hover:bg-surface-2"
            title="Split at playhead"
          >
            <FiScissors size={12} /> Split
          </button>
          <button
            onClick={() => duplicateClip(clip.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-surface-1 py-1.5 text-xs text-fg-muted hover:bg-surface-2"
          >
            <FiCopy size={12} /> Duplicate
          </button>
          <button
            onClick={() => deleteClip(clip.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded bg-surface-1 py-1.5 text-xs text-red-400 hover:bg-red-950"
          >
            <FiTrash2 size={12} /> Delete
          </button>
        </div>
      </div>

      {mediaClip && (mediaClip.kind === 'video' || mediaClip.kind === 'audio') && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Speed</div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.25}
              max={4}
              step={0.05}
              value={Math.min(4, mediaClip.speed)}
              onChange={(e) => setClipSpeed(mediaClip.id, Number(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              min={0.1}
              max={16}
              step={0.05}
              value={speedDraft}
              onChange={(e) => setSpeedDraft(e.target.value)}
              onBlur={commitSpeed}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="w-14 rounded border border-border bg-surface-1 px-1 py-0.5 text-right text-xs text-fg"
            />
            <span className="text-xs text-fg-subtle">x</span>
          </div>
          <div className="mt-1.5 flex gap-1">
            {[0.5, 1, 1.5, 2].map((preset) => (
              <button
                key={preset}
                onClick={() => setClipSpeed(mediaClip.id, preset)}
                className={`flex-1 rounded py-1 text-[10px] ${
                  Math.abs(mediaClip.speed - preset) < 0.001 ? 'bg-violet-600 text-white' : 'bg-surface-1 text-fg-muted hover:bg-surface-2'
                }`}
              >
                {preset}x
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
            <input
              type="checkbox"
              checked={mediaClip.preservePitch}
              onChange={(e) => setClipPreservePitch(mediaClip.id, e.target.checked)}
            />
            Preserve pitch
          </label>
        </div>
      )}

      {mediaClip && (mediaClip.kind === 'video' || mediaClip.kind === 'audio') && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Audio</div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleMute(mediaClip.id)}
              className="rounded bg-surface-1 p-2 text-fg-muted hover:bg-surface-2"
            >
              {mediaClip.muted ? <FiVolumeX size={14} /> : <FiVolume2 size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={200}
              value={mediaClip.volume}
              onChange={(e) => updateVolume(mediaClip.id, Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-9 text-right text-xs text-fg-subtle">{mediaClip.volume}%</span>
          </div>
          <button
            onClick={() => openSilenceModal(mediaClip.id)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface-1 py-1.5 text-xs text-fg hover:border-violet-500 hover:text-violet-300"
          >
            <MdGraphicEq size={14} /> Remove Silence…
          </button>
        </div>
      )}

      {t && clip && (
        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-fg-faint">
            <span>Transform</span>
            <span className="normal-case text-fg-faint">◆ = keyframe</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-fg-subtle">
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between">
                X
                <KeyframeToggle active={propHasKeyframes(clip, 'x')} atCurrent={!!keyframeAt(clip, 'x', localTime)} onClick={() => toggleKeyframe('x', t.x)} />
              </span>
              <input
                type="number"
                value={Math.round(t.x)}
                onChange={(e) => setTransformProp(clip.id, localTime, 'x', Number(e.target.value))}
                className="rounded border border-border bg-surface-1 px-2 py-1 text-fg"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between">
                Y
                <KeyframeToggle active={propHasKeyframes(clip, 'y')} atCurrent={!!keyframeAt(clip, 'y', localTime)} onClick={() => toggleKeyframe('y', t.y)} />
              </span>
              <input
                type="number"
                value={Math.round(t.y)}
                onChange={(e) => setTransformProp(clip.id, localTime, 'y', Number(e.target.value))}
                className="rounded border border-border bg-surface-1 px-2 py-1 text-fg"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between">
                Width
                <KeyframeToggle active={propHasKeyframes(clip, 'width')} atCurrent={!!keyframeAt(clip, 'width', localTime)} onClick={() => toggleKeyframe('width', t.width)} />
              </span>
              <input
                type="number"
                value={Math.round(t.width)}
                onChange={(e) => setTransformProp(clip.id, localTime, 'width', Number(e.target.value))}
                className="rounded border border-border bg-surface-1 px-2 py-1 text-fg"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between">
                Height
                <KeyframeToggle active={propHasKeyframes(clip, 'height')} atCurrent={!!keyframeAt(clip, 'height', localTime)} onClick={() => toggleKeyframe('height', t.height)} />
              </span>
              <input
                type="number"
                value={Math.round(t.height)}
                onChange={(e) => setTransformProp(clip.id, localTime, 'height', Number(e.target.value))}
                className="rounded border border-border bg-surface-1 px-2 py-1 text-fg"
              />
            </label>
          </div>
          <label className="mt-2 flex flex-col gap-1 text-xs text-fg-subtle">
            <span className="flex items-center justify-between">
              <span>Rotation ({Math.round(t.rotation)}°)</span>
              <KeyframeToggle active={propHasKeyframes(clip, 'rotation')} atCurrent={!!keyframeAt(clip, 'rotation', localTime)} onClick={() => toggleKeyframe('rotation', t.rotation)} />
            </span>
            <input
              type="range"
              min={-180}
              max={180}
              value={t.rotation}
              onChange={(e) => setTransformProp(clip.id, localTime, 'rotation', Number(e.target.value))}
            />
          </label>
          <label className="mt-2 flex flex-col gap-1 text-xs text-fg-subtle">
            <span className="flex items-center justify-between">
              <span>Opacity ({Math.round(t.opacity)}%)</span>
              <KeyframeToggle active={propHasKeyframes(clip, 'opacity')} atCurrent={!!keyframeAt(clip, 'opacity', localTime)} onClick={() => toggleKeyframe('opacity', t.opacity)} />
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={t.opacity}
              onChange={(e) => setTransformProp(clip.id, localTime, 'opacity', Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {clip.kind === 'shape' && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Shape</div>
          <select
            value={(clip as ShapeClip).shapeType}
            onChange={(e) => updateShapeType(clip.id, e.target.value as ShapeClip['shapeType'])}
            className="mb-2 w-full rounded border border-border bg-surface-1 px-2 py-1 text-xs text-fg"
          >
            {SHAPE_LIBRARY.map((s) => (
              <option key={s.type} value={s.type}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2 text-xs text-fg-subtle">
            <label className="flex flex-col gap-1">
              Fill
              <input
                type="color"
                value={(clip as ShapeClip).style.fill}
                onChange={(e) => updateShapeStyle(clip.id, { fill: e.target.value })}
                className="h-8 w-full rounded border border-border bg-surface-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              Stroke
              <input
                type="color"
                value={(clip as ShapeClip).style.stroke}
                onChange={(e) => updateShapeStyle(clip.id, { stroke: e.target.value })}
                className="h-8 w-full rounded border border-border bg-surface-1"
              />
            </label>
          </div>
          <label className="mt-2 flex flex-col gap-1 text-xs text-fg-subtle">
            Stroke Width ({(clip as ShapeClip).style.strokeWidth}px)
            <input
              type="range"
              min={0}
              max={30}
              value={(clip as ShapeClip).style.strokeWidth}
              onChange={(e) => updateShapeStyle(clip.id, { strokeWidth: Number(e.target.value) })}
            />
          </label>
        </div>
      )}

      {clip.kind === 'text' && (
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Text</div>
          <textarea
            value={(clip as TextClip).text}
            onChange={(e) => updateText(clip.id, { text: e.target.value })}
            rows={2}
            className="mb-2 w-full rounded border border-border bg-surface-1 px-2 py-1 text-xs text-fg"
          />
          <select
            value={(clip as TextClip).fontFamily}
            onChange={(e) => updateText(clip.id, { fontFamily: e.target.value })}
            className="mb-2 w-full rounded border border-border bg-surface-1 px-2 py-1 text-xs text-fg"
          >
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: f }}>
                {f.split(',')[0].replace(/"/g, '')}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2 text-xs text-fg-subtle">
            <label className="flex flex-col gap-1">
              Size
              <input
                type="number"
                value={(clip as TextClip).fontSize}
                onChange={(e) => updateText(clip.id, { fontSize: Number(e.target.value) })}
                className="rounded border border-border bg-surface-1 px-2 py-1 text-fg"
              />
            </label>
            <label className="flex flex-col gap-1">
              Color
              <input
                type="color"
                value={(clip as TextClip).color}
                onChange={(e) => updateText(clip.id, { color: e.target.value })}
                className="h-8 w-full rounded border border-border bg-surface-1"
              />
            </label>
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => updateText(clip.id, { bold: !(clip as TextClip).bold })}
              className={`flex-1 rounded py-1.5 text-xs font-bold ${(clip as TextClip).bold ? 'bg-violet-600 text-white' : 'bg-surface-1 text-fg-muted'}`}
            >
              B
            </button>
            <button
              onClick={() => updateText(clip.id, { italic: !(clip as TextClip).italic })}
              className={`flex-1 rounded py-1.5 text-xs italic ${(clip as TextClip).italic ? 'bg-violet-600 text-white' : 'bg-surface-1 text-fg-muted'}`}
            >
              I
            </button>
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                onClick={() => updateText(clip.id, { align })}
                className={`flex-1 rounded py-1.5 text-xs capitalize ${(clip as TextClip).align === align ? 'bg-violet-600 text-white' : 'bg-surface-1 text-fg-muted'}`}
              >
                {align[0].toUpperCase()}
              </button>
            ))}
          </div>
          <label className="mt-2 flex items-center justify-between text-xs text-fg-subtle">
            <span className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!!(clip as TextClip).backgroundColor}
                onChange={(e) => updateText(clip.id, { backgroundColor: e.target.checked ? 'rgba(0,0,0,0.6)' : undefined })}
              />
              Background
            </span>
            {(clip as TextClip).backgroundColor && (
              <input
                type="color"
                value={rgbaToHex((clip as TextClip).backgroundColor!)}
                onChange={(e) => updateText(clip.id, { backgroundColor: hexToRgba(e.target.value, 0.6) })}
                className="h-6 w-10 rounded border border-border bg-surface-1"
              />
            )}
          </label>
        </div>
      )}
      </div>
    </div>
  );
}
