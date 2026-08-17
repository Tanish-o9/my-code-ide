import * as path from 'path';
import { createRequire } from 'module';

const extensionRequire = typeof require === 'function' 
  ? require 
  : createRequire(typeof __filename !== 'undefined' ? __filename : '');

// Sequence generator for requests initiated by the extension host
let seqCounter = 1;
const pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
const registeredCommands = new Map<string, (...args: any[]) => any>();

// Override console methods to redirect output to parent process
const originalLog = console.log;
const originalError = console.error;

console.log = (...args: any[]) => {
  if (process.send) {
    process.send({ type: 'output', category: 'stdout', text: args.join(' ') });
  } else {
    originalLog(...args);
  }
};

console.error = (...args: any[]) => {
  if (process.send) {
    process.send({ type: 'output', category: 'stderr', text: args.join(' ') });
  } else {
    originalError(...args);
  }
};

// Global API object provided to extensions
const antigravityAPI = {
  commands: {
    registerCommand: (id: string, handler: (...args: any[]) => any) => {
      registeredCommands.set(id, handler);
      sendRequest('commands.register', { id });
    }
  },
  workspace: {
    readFile: (filePath: string): Promise<string> => {
      return sendRequest('workspace.readFile', { filePath });
    },
    writeFile: (filePath: string, content: string): Promise<void> => {
      return sendRequest('workspace.writeFile', { filePath, content });
    }
  },
  ui: {
    createStatusBarItem: (id: string, text: string, tooltip?: string): Promise<void> => {
      return sendRequest('ui.createStatusBarItem', { id, text, tooltip });
    },
    createSidebarPanel: (id: string, title: string, dataProvider?: any): Promise<void> => {
      return sendRequest('ui.createSidebarPanel', { id, title, dataProvider });
    }
  }
};

// Attach API globally so extension scripts can consume it
(global as any).antigravity = antigravityAPI;

// Helper to send a request to the parent process and wait for a response
function sendRequest(method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = seqCounter++;
    pendingRequests.set(id, { resolve, reject });
    if (process.send) {
      process.send({ type: 'request', id, method, params });
    } else {
      reject(new Error('Extension host IPC is not initialized.'));
    }
  });
}

// Listen to messages from the parent process
process.on('message', async (msg: any) => {
  if (!msg || typeof msg !== 'object') return;

  const { type, id, method, params, result, error } = msg;

  if (type === 'response') {
    // A response to a request sent by the extension host
    const pending = pendingRequests.get(id);
    if (pending) {
      pendingRequests.delete(id);
      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(result);
      }
    }
  } else if (type === 'request') {
    // A request initiated by the parent process
    try {
      if (method === 'activate') {
        const { entryPath } = params;
        // Resolve absolute path and load the extension code
        const resolvedPath = path.resolve(entryPath);
        const extension = extensionRequire(resolvedPath);
        if (typeof extension.activate === 'function') {
          await Promise.resolve(extension.activate());
        }
        sendResponse(id, { success: true });
      } else if (method === 'executeCommand') {
        const { commandId, args } = params;
        const handler = registeredCommands.get(commandId);
        if (!handler) {
          throw new Error(`Command ${commandId} is not registered in this host.`);
        }
        const cmdResult = await Promise.resolve(handler(...(args || [])));
        sendResponse(id, cmdResult);
      } else {
        throw new Error(`Method ${method} is not supported on extension host.`);
      }
    } catch (err: any) {
      sendError(id, err.message || 'Unknown handler error');
    }
  }
});

// Helper to send responses back to the parent process
function sendResponse(id: number, result: any) {
  if (process.send) {
    process.send({ type: 'response', id, result });
  }
}

function sendError(id: number, error: string) {
  if (process.send) {
    process.send({ type: 'response', id, error });
  }
}

// Graceful deactivation
process.on('SIGTERM', () => {
  console.log('Extension host received SIGTERM, exiting gracefully.');
  process.exit(0);
});
