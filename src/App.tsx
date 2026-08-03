import { useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { LeftPanel } from './components/panels/LeftPanel';
import { PreviewStage } from './components/PreviewStage';
import { Inspector } from './components/Inspector';
import { Timeline } from './components/timeline/Timeline';
import { SilenceDetectionModal } from './components/modals/SilenceDetectionModal';
import { ChromaKeyModal } from './components/modals/ChromaKeyModal';
import { ExportModal } from './components/modals/ExportModal';
import { ProjectSettingsModal } from './components/modals/ProjectSettingsModal';
import { HotkeysModal } from './components/modals/HotkeysModal';
import { LandingPage } from './components/home/LandingPage';
import { ProjectsPage } from './components/home/ProjectsPage';
import { SiteTopBar } from './components/home/SiteTopBar';
import { usePlaybackClock } from './hooks/usePlaybackClock';
import { useHotkeys } from './hooks/useHotkeys';
import { useProjectStore } from './store/useProjectStore';
import { useLibraryStore } from './store/useLibraryStore';
import { flushSave } from './lib/persistence';
import { projectDuration } from './lib/time';

function EditorView() {
  usePlaybackClock();

  const togglePlay = useProjectStore((s) => s.togglePlay);
  const deleteSelectedClips = useProjectStore((s) => s.deleteSelectedClips);
  const duplicateSelectedClips = useProjectStore((s) => s.duplicateSelectedClips);
  const copySelectedClips = useProjectStore((s) => s.copySelectedClips);
  const pasteClipboard = useProjectStore((s) => s.pasteClipboard);
  const selectAllClips = useProjectStore((s) => s.selectAllClips);
  const toggleRippleDelete = useProjectStore((s) => s.toggleRippleDelete);
  const toggleSnap = useProjectStore((s) => s.toggleSnap);
  const toggleAutoScroll = useProjectStore((s) => s.toggleAutoScroll);
  const splitClipAtTime = useProjectStore((s) => s.splitClipAtTime);
  const splitKeepSide = useProjectStore((s) => s.splitKeepSide);
  const insertFreezeFrame = useProjectStore((s) => s.insertFreezeFrame);
  const addMarker = useProjectStore((s) => s.addMarker);
  const keyframeAllAt = useProjectStore((s) => s.keyframeAllAt);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const currentTime = useProjectStore((s) => s.currentTime);
  const setCurrentTime = useProjectStore((s) => s.setCurrentTime);
  const project = useProjectStore((s) => s.project);

  const duration = projectDuration(project);
  const step = 1 / project.fps;
  const selectedClip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);

  useHotkeys({
    undo: undo,
    redo: redo,
    playPause: togglePlay,
    stepBack: () => setCurrentTime(Math.max(0, currentTime - step)),
    stepForward: () => setCurrentTime(Math.min(duration, currentTime + step)),
    skipStart: () => setCurrentTime(0),
    skipEnd: () => setCurrentTime(duration),
    deleteClip: deleteSelectedClips,
    duplicateClip: duplicateSelectedClips,
    copyClip: copySelectedClips,
    pasteClip: pasteClipboard,
    selectAll: selectAllClips,
    toggleRippleDelete: toggleRippleDelete,
    toggleSnap: toggleSnap,
    toggleAutoScroll: toggleAutoScroll,
    splitAtPlayhead: () => selectedClipId && splitClipAtTime(selectedClipId, currentTime),
    splitKeepLeft: () => selectedClipId && splitKeepSide(selectedClipId, currentTime, 'left'),
    splitKeepRight: () => selectedClipId && splitKeepSide(selectedClipId, currentTime, 'right'),
    freezeFrame: () => selectedClipId && void insertFreezeFrame(selectedClipId, currentTime),
    addMarker: () => addMarker(currentTime),
    addKeyframe: () => selectedClip && keyframeAllAt(selectedClip.id, currentTime - selectedClip.start),
  });

  useEffect(() => {
    const onBeforeUnload = () => {
      void flushSave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-0 text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LeftPanel />
        <PreviewStage />
        <Inspector />
      </div>
      <Timeline />
      <SilenceDetectionModal />
      <ChromaKeyModal />
      <ExportModal />
      <ProjectSettingsModal />
      <HotkeysModal />
    </div>
  );
}

export default function App() {
  const view = useLibraryStore((s) => s.view);
  if (view === 'editor') return <EditorView />;
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-surface-0 text-fg">
      <SiteTopBar />
      {view === 'landing' ? <LandingPage /> : <ProjectsPage />}
    </div>
  );
}
