import { create } from 'zustand';

const STORAGE_KEY = 'nyxvideo:layout';

interface LayoutValues {
  sidebarWidth: number;
  inspectorWidth: number;
  timelineHeight: number;
}

const DEFAULTS: LayoutValues = {
  sidebarWidth: 320,
  inspectorWidth: 288,
  timelineHeight: 288,
};

function loadStored(): LayoutValues {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function persist(values: LayoutValues) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
}

interface LayoutState extends LayoutValues {
  setSidebarWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
  setTimelineHeight: (h: number) => void;
  resetLayout: () => void;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...loadStored(),

  setSidebarWidth: (w) => {
    set({ sidebarWidth: w });
    persist({ sidebarWidth: w, inspectorWidth: get().inspectorWidth, timelineHeight: get().timelineHeight });
  },
  setInspectorWidth: (w) => {
    set({ inspectorWidth: w });
    persist({ sidebarWidth: get().sidebarWidth, inspectorWidth: w, timelineHeight: get().timelineHeight });
  },
  setTimelineHeight: (h) => {
    set({ timelineHeight: h });
    persist({ sidebarWidth: get().sidebarWidth, inspectorWidth: get().inspectorWidth, timelineHeight: h });
  },
  resetLayout: () => {
    set(DEFAULTS);
    persist(DEFAULTS);
  },
}));
