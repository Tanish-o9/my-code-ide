import { create } from 'zustand';

export interface RemoteCursor {
  userId: string;
  name: string;
  color: string;
  filePath: string;
  position: { lineNumber: number; column: number } | null;
  selection: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } | null;
}

interface CursorState {
  remoteCursors: Record<string, RemoteCursor>;
  updateCursor: (userId: string, cursor: RemoteCursor) => void;
  removeCursor: (userId: string) => void;
  clearCursors: () => void;
}

export const useCursorStore = create<CursorState>((set) => ({
  remoteCursors: {},
  updateCursor: (userId, cursor) =>
    set((state) => ({
      remoteCursors: { ...state.remoteCursors, [userId]: cursor },
    })),
  removeCursor: (userId) =>
    set((state) => {
      const copy = { ...state.remoteCursors };
      delete copy[userId];
      return { remoteCursors: copy };
    }),
  clearCursors: () => set({ remoteCursors: {} }),
}));
