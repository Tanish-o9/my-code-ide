import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/useAuthStore';

// Resolve host URL from location or default
const SOCKET_URL = 'http://localhost:5000';

let fsSocket: Socket | null = null;
let terminalSocket: Socket | null = null;
let aiSocket: Socket | null = null;
let collabSocket: Socket | null = null;
let debugSocket: Socket | null = null;
let extensionsSocket: Socket | null = null;

/**
 * Returns a singleton Socket.IO instance for the /ws/filesystem namespace.
 */
export const getFsSocket = (): Socket => {
  if (!fsSocket) {
    fsSocket = io(`${SOCKET_URL}/ws/filesystem`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  // Attach latest token for handshake auth validation
  fsSocket.auth = { token: useAuthStore.getState().accessToken };
  return fsSocket;
};

/**
 * Returns a singleton Socket.IO instance for the /ws/terminal namespace.
 */
export const getTerminalSocket = (): Socket => {
  if (!terminalSocket) {
    terminalSocket = io(`${SOCKET_URL}/ws/terminal`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  // Attach latest token for handshake auth validation
  terminalSocket.auth = { token: useAuthStore.getState().accessToken };
  return terminalSocket;
};

/**
 * Returns a singleton Socket.IO instance for the /ws/ai namespace.
 */
export const getAiSocket = (): Socket => {
  if (!aiSocket) {
    aiSocket = io(`${SOCKET_URL}/ws/ai`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  // Attach latest token for handshake auth validation
  aiSocket.auth = { token: useAuthStore.getState().accessToken };
  return aiSocket;
};

/**
 * Returns a singleton Socket.IO instance for the /ws/collaboration namespace.
 */
export const getCollabSocket = (): Socket => {
  if (!collabSocket) {
    collabSocket = io(`${SOCKET_URL}/ws/collaboration`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  // Attach latest token for handshake auth validation
  collabSocket.auth = { token: useAuthStore.getState().accessToken };
  return collabSocket;
};

/**
 * Returns a singleton Socket.IO instance for the /ws/debug namespace.
 */
export const getDebugSocket = (): Socket => {
  if (!debugSocket) {
    debugSocket = io(`${SOCKET_URL}/ws/debug`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  // Attach latest token for handshake auth validation
  debugSocket.auth = { token: useAuthStore.getState().accessToken };
  return debugSocket;
};

export const getExtensionsSocket = (): Socket => {
  if (!extensionsSocket) {
    extensionsSocket = io(`${SOCKET_URL}/ws/extensions`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  // Attach latest token for handshake auth validation
  extensionsSocket.auth = { token: useAuthStore.getState().accessToken };
  return extensionsSocket;
};

let lspSocket: Socket | null = null;

/**
 * Returns a singleton Socket.IO instance for the /ws/lsp namespace.
 */
export const getLspSocket = (): Socket => {
  if (!lspSocket) {
    lspSocket = io(`${SOCKET_URL}/ws/lsp`, {
      withCredentials: true,
      autoConnect: false,
    });
  }
  // Attach latest token for handshake auth validation
  lspSocket.auth = { token: useAuthStore.getState().accessToken };
  return lspSocket;
};
