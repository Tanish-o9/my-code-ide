import { create } from 'zustand';

export type ActivityBarMode = 'explorer' | 'search' | 'git' | 'ai' | 'settings' | 'debug' | 'extensions' | 'docker';

interface UIState {
  theme: 'dark' | 'light';
  activePanel: ActivityBarMode | null;
  commandPaletteOpen: boolean;
  terminalOpen: boolean;
  terminalHeight: number;
  sidebarWidth: number;
  aiPanelWidth: number;
  aiPanelOpen: boolean;
  autoSave: 'off' | 'afterDelay' | 'onFocusChange';
  autoSaveDelay: number;
  multiCursorModifier: 'ctrlCmd' | 'alt';
  columnSelectionMode: boolean;
  
  // View & Appearance Settings
  menuBarVisible: boolean;
  activityBarVisible: boolean;
  sidebarVisible: boolean;
  statusBarVisible: boolean;
  tabsVisible: boolean;
  breadcrumbsVisible: boolean;
  minimapVisible: boolean;
  stickyScrollVisible: boolean;
  lineNumbersVisible: boolean;
  wordWrapMode: 'on' | 'off';
  zenMode: boolean;
  
  setTheme: (theme: 'dark' | 'light') => void;
  setActivePanel: (panel: ActivityBarMode | null) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTerminalOpen: (open: boolean) => void;
  toggleTerminal: () => void;
  setTerminalHeight: (height: number) => void;
  setSidebarWidth: (width: number) => void;
  setAiPanelWidth: (width: number) => void;
  setAiPanelOpen: (open: boolean) => void;
  toggleAiPanel: () => void;
  setAutoSave: (mode: 'off' | 'afterDelay' | 'onFocusChange') => void;
  setAutoSaveDelay: (delay: number) => void;
  setMultiCursorModifier: (modifier: 'ctrlCmd' | 'alt') => void;
  setColumnSelectionMode: (enabled: boolean) => void;
  
  // Setters for View & Appearance
  setMenuBarVisible: (visible: boolean) => void;
  setActivityBarVisible: (visible: boolean) => void;
  setSidebarVisible: (visible: boolean) => void;
  setStatusBarVisible: (visible: boolean) => void;
  setTabsVisible: (visible: boolean) => void;
  setBreadcrumbsVisible: (visible: boolean) => void;
  setMinimapVisible: (visible: boolean) => void;
  setStickyScrollVisible: (visible: boolean) => void;
  setLineNumbersVisible: (visible: boolean) => void;
  setWordWrapMode: (mode: 'on' | 'off') => void;
  setZenMode: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>((set) => {
  // Helper to load persisted values
  const getStoredBool = (key: string, def: boolean): boolean => {
    const val = localStorage.getItem(key);
    return val !== null ? val === 'true' : def;
  };

  return {
    theme: 'dark',
    activePanel: 'explorer',
    commandPaletteOpen: false,
    terminalOpen: true,
    terminalHeight: 220,
    sidebarWidth: 260,
    aiPanelWidth: 320,
    aiPanelOpen: true,
    autoSave: 'afterDelay',
    autoSaveDelay: 2000,
    multiCursorModifier: 'alt',
    columnSelectionMode: false,

    // Loaded states
    menuBarVisible: getStoredBool('menuBarVisible', true),
    activityBarVisible: getStoredBool('activityBarVisible', true),
    sidebarVisible: getStoredBool('sidebarVisible', true),
    statusBarVisible: getStoredBool('statusBarVisible', true),
    tabsVisible: getStoredBool('tabsVisible', true),
    breadcrumbsVisible: getStoredBool('breadcrumbsVisible', true),
    minimapVisible: getStoredBool('minimapVisible', true),
    stickyScrollVisible: getStoredBool('stickyScrollVisible', true),
    lineNumbersVisible: getStoredBool('lineNumbersVisible', true),
    wordWrapMode: (localStorage.getItem('wordWrapMode') as 'on' | 'off') || 'on',
    zenMode: getStoredBool('zenMode', false),

    setTheme: (theme) => set({ theme }),
    setActivePanel: (activePanel) => set((state) => ({ 
      activePanel: state.activePanel === activePanel ? null : activePanel 
    })),
    toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
    setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    setTerminalOpen: (terminalOpen) => set({ terminalOpen }),
    toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
    setTerminalHeight: (terminalHeight) => set({ terminalHeight }),
    setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
    setAiPanelWidth: (aiPanelWidth) => set({ aiPanelWidth }),
    setAiPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
    toggleAiPanel: () => set((state) => ({ aiPanelOpen: !state.aiPanelOpen })),
    setAutoSave: (autoSave) => set({ autoSave }),
    setAutoSaveDelay: (autoSaveDelay) => set({ autoSaveDelay }),
    setMultiCursorModifier: (multiCursorModifier) => set({ multiCursorModifier }),
    setColumnSelectionMode: (columnSelectionMode) => set({ columnSelectionMode }),

    // Setters implementation
    setMenuBarVisible: (menuBarVisible) => {
      localStorage.setItem('menuBarVisible', String(menuBarVisible));
      set({ menuBarVisible });
    },
    setActivityBarVisible: (activityBarVisible) => {
      localStorage.setItem('activityBarVisible', String(activityBarVisible));
      set({ activityBarVisible });
    },
    setSidebarVisible: (sidebarVisible) => {
      localStorage.setItem('sidebarVisible', String(sidebarVisible));
      set({ sidebarVisible });
    },
    setStatusBarVisible: (statusBarVisible) => {
      localStorage.setItem('statusBarVisible', String(statusBarVisible));
      set({ statusBarVisible });
    },
    setTabsVisible: (tabsVisible) => {
      localStorage.setItem('tabsVisible', String(tabsVisible));
      set({ tabsVisible });
    },
    setBreadcrumbsVisible: (breadcrumbsVisible) => {
      localStorage.setItem('breadcrumbsVisible', String(breadcrumbsVisible));
      set({ breadcrumbsVisible });
    },
    setMinimapVisible: (minimapVisible) => {
      localStorage.setItem('minimapVisible', String(minimapVisible));
      set({ minimapVisible });
    },
    setStickyScrollVisible: (stickyScrollVisible) => {
      localStorage.setItem('stickyScrollVisible', String(stickyScrollVisible));
      set({ stickyScrollVisible });
    },
    setLineNumbersVisible: (lineNumbersVisible) => {
      localStorage.setItem('lineNumbersVisible', String(lineNumbersVisible));
      set({ lineNumbersVisible });
    },
    setWordWrapMode: (wordWrapMode) => {
      localStorage.setItem('wordWrapMode', wordWrapMode);
      set({ wordWrapMode });
    },
    setZenMode: (zenMode) => {
      localStorage.setItem('zenMode', String(zenMode));
      set({ zenMode });
    },
  };
});
