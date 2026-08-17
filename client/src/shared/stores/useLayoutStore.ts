import { create } from 'zustand';

export type LayoutNode = 
  | { id: string; type: 'leaf'; openTabs: string[]; activeTab: string | null }
  | { id: string; type: 'branch'; direction: 'horizontal' | 'vertical'; ratio: number; children: [LayoutNode, LayoutNode] };

interface LayoutState {
  layoutTree: LayoutNode;
  activePaneId: string;

  // Actions
  setActivePane: (paneId: string) => void;
  openTab: (tabPath: string, paneId?: string) => void;
  closeTab: (paneId: string, tabPath: string) => void;
  setActiveTab: (paneId: string, tabPath: string | null) => void;
  reorderTabs: (paneId: string, srcIndex: number, destIndex: number) => void;
  splitPane: (paneId: string, direction: 'horizontal' | 'vertical', initialTabPath?: string) => void;
  closePane: (paneId: string) => void;
  moveTab: (tabPath: string, sourcePaneId: string, targetPaneId: string, targetIndex?: number) => void;
  resetLayout: (openTabs?: string[], activeTab?: string | null) => void;
  updateRatio: (paneId: string, ratio: number) => void;
}

// Generate unique ID
const nextId = () => Math.random().toString(36).substring(2, 9);

// Helper: Find node in tree
const findNode = (node: LayoutNode, id: string): LayoutNode | null => {
  if (node.id === id) return node;
  if (node.type === 'branch') {
    const left = findNode(node.children[0], id);
    if (left) return left;
    return findNode(node.children[1], id);
  }
  return null;
};

// Helper: Find parent node in tree
const findParent = (node: LayoutNode, childId: string): { parent: LayoutNode & { type: 'branch' }; isLeft: boolean } | null => {
  if (node.type === 'branch') {
    if (node.children[0].id === childId) {
      return { parent: node, isLeft: true };
    }
    if (node.children[1].id === childId) {
      return { parent: node, isLeft: false };
    }
    const left = findParent(node.children[0], childId);
    if (left) return left;
    return findParent(node.children[1], childId);
  }
  return null;
};

// Helper: Replace node in tree
const replaceNode = (root: LayoutNode, targetId: string, newNode: LayoutNode): LayoutNode => {
  if (root.id === targetId) return newNode;
  if (root.type === 'branch') {
    return {
      ...root,
      children: [
        replaceNode(root.children[0], targetId, newNode),
        replaceNode(root.children[1], targetId, newNode),
      ],
    };
  }
  return root;
};

const initialRootId = nextId();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layoutTree: {
    id: initialRootId,
    type: 'leaf',
    openTabs: [],
    activeTab: null,
  },
  activePaneId: initialRootId,

  setActivePane: (paneId) => set({ activePaneId: paneId }),

  resetLayout: (openTabs = [], activeTab = null) => {
    const newRootId = nextId();
    set({
      layoutTree: {
        id: newRootId,
        type: 'leaf',
        openTabs,
        activeTab,
      },
      activePaneId: newRootId,
    });
  },

  openTab: (tabPath, paneId) => {
    const state = get();
    const targetPaneId = paneId || state.activePaneId;
    const root = { ...state.layoutTree };
    const leaf = findNode(root, targetPaneId);

    if (leaf && leaf.type === 'leaf') {
      if (!leaf.openTabs.includes(tabPath)) {
        leaf.openTabs.push(tabPath);
      }
      leaf.activeTab = tabPath;
      
      set({
        layoutTree: root,
        activePaneId: targetPaneId,
      });
    }
  },

  closeTab: (paneId, tabPath) => {
    const state = get();
    const root = { ...state.layoutTree };
    const leaf = findNode(root, paneId);

    if (leaf && leaf.type === 'leaf') {
      const remainingTabs = leaf.openTabs.filter((t) => t !== tabPath);
      let newActiveTab = leaf.activeTab;

      if (leaf.activeTab === tabPath) {
        newActiveTab = remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1] : null;
      }

      leaf.openTabs = remainingTabs;
      leaf.activeTab = newActiveTab;

      let newRoot = root;
      // Auto-collapse pane if empty (unless it is the only pane)
      if (remainingTabs.length === 0 && root.type === 'branch') {
        const parentInfo = findParent(root, paneId);
        if (parentInfo) {
          const { parent, isLeft } = parentInfo;
          const siblingNode = isLeft ? parent.children[1] : parent.children[0];
          newRoot = replaceNode(root, parent.id, siblingNode);
          
          // Switch active pane to sibling or root
          const findFirstLeaf = (node: LayoutNode): string => {
            return node.type === 'leaf' ? node.id : findFirstLeaf(node.children[0]);
          };
          set({ activePaneId: findFirstLeaf(newRoot) });
        }
      }

      set({ layoutTree: newRoot });
    }
  },

  setActiveTab: (paneId, tabPath) => {
    const state = get();
    const root = { ...state.layoutTree };
    const leaf = findNode(root, paneId);

    if (leaf && leaf.type === 'leaf') {
      leaf.activeTab = tabPath;
      set({
        layoutTree: root,
        activePaneId: paneId,
      });
    }
  },

  reorderTabs: (paneId, srcIndex, destIndex) => {
    const state = get();
    const root = { ...state.layoutTree };
    const leaf = findNode(root, paneId);

    if (leaf && leaf.type === 'leaf') {
      const openTabs = [...leaf.openTabs];
      const [moved] = openTabs.splice(srcIndex, 1);
      openTabs.splice(destIndex, 0, moved);
      leaf.openTabs = openTabs;
      
      set({ layoutTree: root });
    }
  },

  splitPane: (paneId, direction, initialTabPath) => {
    const state = get();
    const root = { ...state.layoutTree };
    const leaf = findNode(root, paneId);

    if (leaf && leaf.type === 'leaf') {
      const leftId = nextId();
      const rightId = nextId();

      const sourceTabs = [...leaf.openTabs];
      const sourceActive = leaf.activeTab;

      // Sibling 1 gets the current pane's items
      const leftNode: LayoutNode = {
        id: leftId,
        type: 'leaf',
        openTabs: sourceTabs,
        activeTab: sourceActive,
      };

      // Sibling 2 gets a split copy of the active tab or empty
      const rightNode: LayoutNode = {
        id: rightId,
        type: 'leaf',
        openTabs: initialTabPath ? [initialTabPath] : (sourceActive ? [sourceActive] : []),
        activeTab: initialTabPath || sourceActive,
      };

      const splitNode: LayoutNode = {
        id: paneId,
        type: 'branch',
        direction,
        ratio: 0.5,
        children: [leftNode, rightNode],
      };

      const newRoot = replaceNode(root, paneId, splitNode);
      set({
        layoutTree: newRoot,
        activePaneId: rightId, // Focus on the new split pane
      });
    }
  },

  closePane: (paneId) => {
    const state = get();
    const root = { ...state.layoutTree };
    
    if (root.type === 'branch') {
      const parentInfo = findParent(root, paneId);
      if (parentInfo) {
        const { parent, isLeft } = parentInfo;
        const siblingNode = isLeft ? parent.children[1] : parent.children[0];
        
        const newRoot = replaceNode(root, parent.id, siblingNode);
        
        // Find a valid leaf inside the remaining tree to make active
        const findFirstLeaf = (node: LayoutNode): string => {
          return node.type === 'leaf' ? node.id : findFirstLeaf(node.children[0]);
        };

        set({
          layoutTree: newRoot,
          activePaneId: findFirstLeaf(newRoot),
        });
      }
    }
  },

  moveTab: (tabPath, sourcePaneId, targetPaneId, targetIndex) => {
    const state = get();
    const root = { ...state.layoutTree };
    const srcLeaf = findNode(root, sourcePaneId);
    const destLeaf = findNode(root, targetPaneId);

    if (srcLeaf && srcLeaf.type === 'leaf' && destLeaf && destLeaf.type === 'leaf') {
      // 1. Remove from source
      srcLeaf.openTabs = srcLeaf.openTabs.filter((t) => t !== tabPath);
      if (srcLeaf.activeTab === tabPath) {
        srcLeaf.activeTab = srcLeaf.openTabs.length > 0 ? srcLeaf.openTabs[srcLeaf.openTabs.length - 1] : null;
      }

      // 2. Add to target
      if (!destLeaf.openTabs.includes(tabPath)) {
        if (targetIndex !== undefined) {
          destLeaf.openTabs.splice(targetIndex, 0, tabPath);
        } else {
          destLeaf.openTabs.push(tabPath);
        }
      }
      destLeaf.activeTab = tabPath;

      // 3. Collapse source pane if empty
      let newRoot = root;
      if (srcLeaf.openTabs.length === 0 && root.type === 'branch') {
        const parentInfo = findParent(root, sourcePaneId);
        if (parentInfo) {
          const { parent, isLeft } = parentInfo;
          const siblingNode = isLeft ? parent.children[1] : parent.children[0];
          newRoot = replaceNode(root, parent.id, siblingNode);
        }
      }

      set({
        layoutTree: newRoot,
        activePaneId: targetPaneId,
      });
    }
  },

  updateRatio: (paneId, ratio) => {
    set((state) => {
      const root = { ...state.layoutTree };
      const node = findNode(root, paneId);
      if (node && node.type === 'branch') {
        node.ratio = Math.max(0.1, Math.min(0.9, ratio));
      }
      return { layoutTree: root };
    });
  },
}));
