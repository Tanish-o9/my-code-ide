import { DebugAdapterService } from './debug-adapter.service';
import { Workspace } from '../workspaces/workspace.model';
import mongoose from 'mongoose';

async function runTest() {
  console.log('--- STARTING DAP BACKEND TEST ---');
  
  // Connect mock MongoDB memory or local db to satisfy Mongoose requirements
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloud-ide-test';
  await mongoose.connect(mongoUri);
  console.log('[Test] Connected to MongoDB');

  // Create temporary mock workspace
  const workspaceId = new mongoose.Types.ObjectId().toString();
  const mockWorkspace = new Workspace({
    _id: workspaceId,
    name: 'DAP Test Workspace',
    ownerId: new mongoose.Types.ObjectId(),
    storagePath: './scratch/dap-test-workspace',
    template: 'node',
    containerStatus: 'stopped',
  });
  await mockWorkspace.save();
  console.log('[Test] Created mock workspace in database');

  try {
    const sessionId = 'debug-test-session-123';
    console.log('[Test] Starting debug adapter session...');
    
    // Create debug session (this will write the node-dap-adapter.js and spawn it)
    const session = await DebugAdapterService.createSession(
      workspaceId,
      sessionId,
      'node',
      mockWorkspace.ownerId.toString()
    );

    console.log('[Test] Debug session spawned. Running DAP initialize handshake...');

    // Wait for output response to initialize request
    const initResponsePromise = new Promise<any>((resolve) => {
      session.adapterProcess.stdout?.once('data', (data) => {
        resolve(data.toString());
      });
    });

    // Write initialize request
    const initReq = {
      type: 'request',
      seq: 1,
      command: 'initialize',
      arguments: {
        clientID: 'test-client',
        adapterID: 'node'
      }
    };
    
    const initJson = JSON.stringify(initReq);
    session.adapterProcess.stdin?.write(`Content-Length: ${Buffer.byteLength(initJson)}\r\n\r\n${initJson}`);
    
    const initResp = await initResponsePromise;
    console.log('[Test] Received initialize response from adapter:', initResp);

    if (initResp.includes('"command":"initialize"') && initResp.includes('"success":true')) {
      console.log('✔ Initialize handshake SUCCESSFUL!');
    } else {
      throw new Error('❌ Initialize handshake failed: response invalid.');
    }

    // Clean up
    console.log('[Test] Cleaning up session...');
    DebugAdapterService.closeSession(sessionId);
    await Workspace.findByIdAndDelete(workspaceId);
    console.log('✔ Cleanup complete.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Test failed with error:', err.message);
    await Workspace.findByIdAndDelete(workspaceId);
    process.exit(1);
  }
}

runTest();
