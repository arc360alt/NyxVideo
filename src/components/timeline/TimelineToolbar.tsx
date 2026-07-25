import { useProjectStore } from '../../store/useProjectStore';
import { getBindings } from '../../lib/hotkeys';
import {
  FaBookmark,
  FaCopy,
  FaDiamond,
  FaLeftLong,
  FaLocationCrosshairs,
  FaMagnet,
  FaScissors,
  FaSnowflake,
  FaTrash,
} from 'react-icons/fa6';
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';

function Btn({
  onClick,
  disabled,
  active,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded disabled:opacity-30 disabled:hover:bg-transparent ${
        active ? 'bg-violet-600 text-white hover:bg-violet-500' : 'text-fg-muted hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

export function TimelineToolbar() {
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const selectedClipIds = useProjectStore((s) => s.selectedClipIds);
  const currentTime = useProjectStore((s) => s.currentTime);
  const project = useProjectStore((s) => s.project);
  const splitClipAtTime = useProjectStore((s) => s.splitClipAtTime);
  const splitKeepSide = useProjectStore((s) => s.splitKeepSide);
  const insertFreezeFrame = useProjectStore((s) => s.insertFreezeFrame);
  const addMarker = useProjectStore((s) => s.addMarker);
  const keyframeAllAt = useProjectStore((s) => s.keyframeAllAt);
  const deleteSelectedClips = useProjectStore((s) => s.deleteSelectedClips);
  const duplicateSelectedClips = useProjectStore((s) => s.duplicateSelectedClips);
  const rippleDeleteEnabled = useProjectStore((s) => s.rippleDeleteEnabled);
  const toggleRippleDelete = useProjectStore((s) => s.toggleRippleDelete);
  const snapEnabled = useProjectStore((s) => s.snapEnabled);
  const toggleSnap = useProjectStore((s) => s.toggleSnap);
  const autoScrollEnabled = useProjectStore((s) => s.autoScrollEnabled);
  const toggleAutoScroll = useProjectStore((s) => s.toggleAutoScroll);

  const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);
  const bindings = getBindings();
  const key = (id: string) => (bindings[id] ? ` (${bindings[id]})` : '');

  const hasSelection = selectedClipIds.length > 0;
  const canSplit = !!clip && currentTime > clip.start + 0.02 && currentTime < clip.start + clip.duration - 0.02;
  const canFreeze = canSplit && clip?.kind === 'video';
  const canKeyframe = !!clip && 'transform' in clip;

  return (
    <div className="flex items-center gap-0.5 border-r border-border pr-2">
      <Btn
        onClick={toggleSnap}
        active={snapEnabled}
        title={`Snapping: ${snapEnabled ? 'ON' : 'OFF'} — clips snap to other clip edges, the playhead, and markers while dragging (hold Alt to invert)${key('toggleSnap')}`}
      >
        <FaMagnet size={12} />
      </Btn>
      <Btn
        onClick={toggleRippleDelete}
        active={rippleDeleteEnabled}
        title={`Ripple delete: ${rippleDeleteEnabled ? 'ON' : 'OFF'} — when on, deleting a clip pulls everything after it (on the same track) into the gap${key('toggleRippleDelete')}`}
      >
        <FaLeftLong size={12} />
      </Btn>
      <Btn
        onClick={toggleAutoScroll}
        active={autoScrollEnabled}
        title={`Auto-scroll: ${autoScrollEnabled ? 'ON' : 'OFF'} — keeps the playhead in view while playing or scrubbing, so you don't have to scroll manually${key('toggleAutoScroll')}`}
      >
        <FaLocationCrosshairs size={12} />
      </Btn>
      <Btn onClick={() => selectedClipId && splitClipAtTime(selectedClipId, currentTime)} disabled={!canSplit} title={`Split at playhead${key('splitAtPlayhead')}`}>
        <FaScissors size={12} />
      </Btn>
      <Btn
        onClick={() => selectedClipId && splitKeepSide(selectedClipId, currentTime, 'left')}
        disabled={!canSplit}
        title={`Split & keep left${key('splitKeepLeft')}`}
      >
        <FiChevronsLeft size={14} />
      </Btn>
      <Btn
        onClick={() => selectedClipId && splitKeepSide(selectedClipId, currentTime, 'right')}
        disabled={!canSplit}
        title={`Split & keep right${key('splitKeepRight')}`}
      >
        <FiChevronsRight size={14} />
      </Btn>
      <Btn onClick={() => selectedClipId && void insertFreezeFrame(selectedClipId, currentTime)} disabled={!canFreeze} title={`Insert freeze frame${key('freezeFrame')}`}>
        <FaSnowflake size={12} />
      </Btn>
      <Btn
        onClick={() => clip && keyframeAllAt(clip.id, currentTime - clip.start)}
        disabled={!canKeyframe}
        title={`Add keyframe at playhead${key('addKeyframe')}`}
      >
        <FaDiamond size={11} />
      </Btn>
      <Btn onClick={() => addMarker(currentTime)} title={`Add bookmark at playhead${key('addMarker')}`}>
        <FaBookmark size={12} />
      </Btn>
      <Btn onClick={duplicateSelectedClips} disabled={!hasSelection} title={`Duplicate selected${key('duplicateClip')}`}>
        <FaCopy size={12} />
      </Btn>
      <Btn onClick={deleteSelectedClips} disabled={!hasSelection} title={`Delete selected${key('deleteClip')}`}>
        <FaTrash size={12} />
      </Btn>
    </div>
  );
}
