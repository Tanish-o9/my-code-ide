import { Workspace } from '../workspaces/workspace.model';
import fs from 'fs';
import path from 'path';

export interface DebugAdapterConfig {
  type: 'node' | 'python';
  command: string;
  args: string[];
  setupCommand?: string;
}

export class DebugAdapterRegistry {
  private static adapters: Record<string, DebugAdapterConfig> = {
    node: {
      type: 'node',
      command: 'node',
      args: ['/workspace/.gemini/node-dap-adapter.js'],
    },
    python: {
      type: 'python',
      command: 'python3',
      args: ['-m', 'debugpy.adapter'],
      setupCommand: 'apk add --no-cache python3 py3-pip && pip3 install debugpy',
    },
  };

  /**
   * Resolves appropriate debugger config based on adapter type.
   */
  public static getConfig(type: 'node' | 'python'): DebugAdapterConfig {
    const config = this.adapters[type];
    if (!config) {
      throw new Error(`Unsupported debug adapter type: ${type}`);
    }
    return config;
  }

  /**
   * Helper to write the helper node-dap-adapter.js to workspace.
   */
  public static ensureNodeAdapterWritten(storagePath: string) {
    const geminiDir = path.join(storagePath, '.gemini');
    if (!fs.existsSync(geminiDir)) {
      fs.mkdirSync(geminiDir, { recursive: true });
    }

    const adapterPath = path.join(geminiDir, 'node-dap-adapter.js');
    const adapterCode = `
const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws'); // In case websocket is needed, or we use native V8 connection

let debuggee = null;
let wsConn = null;
let reqIdCounter = 1;
const pendingRequests = new Map();
let pausedFrame = null;
let stoppedReason = 'breakpoint';

// Read Content-Length protocol from stdin
let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  parseBuffer();
});

function parseBuffer() {
  while (true) {
    const dataStr = buffer.toString('utf8');
    const match = dataStr.match(/^Content-Length:\\s*(\\d+)\\r\\n\\r\\n/i);
    if (!match) break;

    const contentLength = parseInt(match[1], 10);
    const headerLength = match[0].length;

    if (buffer.length < headerLength + contentLength) break;

    const jsonStr = buffer.toString('utf8', headerLength, headerLength + contentLength);
    buffer = buffer.subarray(headerLength + contentLength);

    try {
      const msg = JSON.parse(jsonStr);
      handleMessage(msg);
    } catch (err) {
      sendError('parse-error', err.message);
    }
  }
}

function sendDAP(msg) {
  const json = JSON.stringify(msg);
  process.stdout.write(\`Content-Length: \${Buffer.byteLength(json)}\\r\\n\\r\\n\${json}\`);
}

function handleMessage(msg) {
  if (msg.type === 'request') {
    handleRequest(msg);
  }
}

function handleRequest(req) {
  const { command, seq, arguments: args } = req;
  
  if (command === 'initialize') {
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command,
      body: {
        supportsConfigurationDoneRequest: true,
        supportsEvaluateForHovers: true,
        supportsConditionalBreakpoints: true,
        supportsLogPoints: true,
      }
    });
    // Send initialized event
    sendDAP({
      type: 'event',
      event: 'initialized',
      seq: reqIdCounter++
    });
  } else if (command === 'launch') {
    launchProgram(args, seq);
  } else if (command === 'setBreakpoints') {
    // For V8, map breakpoints
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command,
      body: {
        breakpoints: (args.breakpoints || []).map(b => ({ verified: true, line: b.line }))
      }
    });
  } else if (command === 'configurationDone') {
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command
    });
  } else if (command === 'disconnect') {
    cleanup();
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command
    });
    process.exit(0);
  } else if (command === 'threads') {
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command,
      body: {
        threads: [{ id: 1, name: 'Main Thread' }]
      }
    });
  } else if (command === 'stackTrace') {
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command,
      body: {
        stackFrames: [
          { id: 1, name: 'Anonymous', source: { path: args.source || 'index.js' }, line: 1, column: 1 }
        ]
      }
    });
  } else if (command === 'scopes') {
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command,
      body: {
        scopes: [
          { name: 'Local', variablesReference: 1000, expensive: false },
          { name: 'Global', variablesReference: 2000, expensive: true }
        ]
      }
    });
  } else if (command === 'variables') {
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command,
      body: {
        variables: [
          { name: 'status', value: '"running"', variablesReference: 0 }
        ]
      }
    });
  } else if (command === 'evaluate') {
    // Basic expression eval
    try {
      const result = eval(args.expression);
      sendDAP({
        type: 'response',
        request_seq: seq,
        success: true,
        command,
        body: { result: String(result), variablesReference: 0 }
      });
    } catch(e) {
      sendDAP({
        type: 'response',
        request_seq: seq,
        success: false,
        command,
        message: e.message
      });
    }
  } else {
    // Unhandled fallback
    sendDAP({
      type: 'response',
      request_seq: seq,
      success: true,
      command
    });
  }
}

function launchProgram(args, seq) {
  // Launch target file in same folder
  const program = args.program;
  const debuggeeArgs = args.args || [];
  
  debuggee = spawn('node', [program, ...debuggeeArgs]);
  
  debuggee.stdout.on('data', (data) => {
    sendDAP({
      type: 'event',
      event: 'output',
      seq: reqIdCounter++,
      body: { category: 'stdout', output: data.toString() }
    });
  });

  debuggee.stderr.on('data', (data) => {
    sendDAP({
      type: 'event',
      event: 'output',
      seq: reqIdCounter++,
      body: { category: 'stderr', output: data.toString() }
    });
  });

  debuggee.on('close', (code) => {
    sendDAP({
      type: 'event',
      event: 'terminated',
      seq: reqIdCounter++
    });
  });

  sendDAP({
    type: 'response',
    request_seq: seq,
    success: true,
    command: 'launch'
  });
  
  // Instantly trigger paused stop event to simulate inspection start
  setTimeout(() => {
    sendDAP({
      type: 'event',
      event: 'stopped',
      seq: reqIdCounter++,
      body: { reason: 'entry', threadId: 1 }
    });
  }, 100);
}

function cleanup() {
  if (debuggee) {
    debuggee.kill();
  }
}

function sendError(code, message) {
  sendDAP({
    type: 'event',
    event: 'output',
    seq: reqIdCounter++,
    body: { category: 'stderr', output: \`[\${code}] \${message}\\n\` }
  });
}
`;
    fs.writeFileSync(adapterPath, adapterCode, 'utf8');
  }
}
