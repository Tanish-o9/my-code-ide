import { create } from 'zustand';

export interface NavigationLocation {
  path: string;
  lineNumber: number;
  column: number;
}

interface NavigationState {
  backStack: NavigationLocation[];
  forwardStack: NavigationLocation[];
  lastEditLocation: NavigationLocation | null;
  
  pushLocation: (loc: NavigationLocation) => void;
  setLastEditLocation: (loc: NavigationLocation) => void;
  goBack: (openTab: (path: string) => void) => void;
  goForward: (openTab: (path: string) => void) => void;
  clearHistory: () => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  backStack: [],
  forwardStack: [],
  lastEditLocation: null,

  pushLocation: (loc) => {
    const { backStack } = get();
    // Don't push duplicates of current top position
    if (backStack.length > 0) {
      const top = backStack[backStack.length - 1];
      if (top.path === loc.path && Math.abs(top.lineNumber - loc.lineNumber) < 3) {
        return;
      }
    }
    // Limit stack size to 50
    const newBack = [...backStack, loc].slice(-50);
    set({ backStack: newBack, forwardStack: [] });
  },

  setLastEditLocation: (lastEditLocation) => set({ lastEditLocation }),

  goBack: (openTab) => {
    const { backStack, forwardStack } = get();
    if (backStack.length === 0) return;

    // Push current location to forwardStack first
    const editor = (window as any).activeMonacoEditor;
    const currentPath = (window as any).activeTabPath;
    if (editor && currentPath) {
      const pos = editor.getPosition();
      if (pos) {
        set({
          forwardStack: [...forwardStack, { path: currentPath, lineNumber: pos.lineNumber, column: pos.column }]
        });
      }
    }

    const prev = backStack[backStack.length - 1];
    set({ backStack: backStack.slice(0, -1) });

    openTab(prev.path);
    setTimeout(() => {
      const ed = (window as any).activeMonacoEditor;
      if (ed) {
        ed.setPosition({ lineNumber: prev.lineNumber, column: prev.column });
        ed.revealPositionInCenter({ lineNumber: prev.lineNumber, column: prev.column });
        ed.focus();
      }
    }, 80);
  },

  goForward: (openTab) => {
    const { backStack, forwardStack } = get();
    if (forwardStack.length === 0) return;

    // Push current location to backStack
    const editor = (window as any).activeMonacoEditor;
    const currentPath = (window as any).activeTabPath;
    if (editor && currentPath) {
      const pos = editor.getPosition();
      if (pos) {
        set({
          backStack: [...backStack, { path: currentPath, lineNumber: pos.lineNumber, column: pos.column }]
        });
      }
    }

    const nextLoc = forwardStack[forwardStack.length - 1];
    set({ forwardStack: forwardStack.slice(0, -1) });

    openTab(nextLoc.path);
    setTimeout(() => {
      const ed = (window as any).activeMonacoEditor;
      if (ed) {
        ed.setPosition({ lineNumber: nextLoc.lineNumber, column: nextLoc.column });
        ed.revealPositionInCenter({ lineNumber: nextLoc.lineNumber, column: nextLoc.column });
        ed.focus();
      }
    }, 80);
  },

  clearHistory: () => set({ backStack: [], forwardStack: [], lastEditLocation: null }),
}));
