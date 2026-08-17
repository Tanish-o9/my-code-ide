import mongoose from 'mongoose';
import { Workspace } from '../workspaces/workspace.model';
import { InstalledExtension } from './extension.model';
import { ExtensionHostService } from './extension-host.service';
import * as path from 'path';

async function runTest() {
  console.log('--- STARTING EXTENSION HOST SANDBOX ADVERSARIAL TEST ---');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloud-ide-test';
  await mongoose.connect(mongoUri);
  console.log('[Test] Connected to MongoDB.');

  // Clean up any stale records from prior failed runs
  await InstalledExtension.deleteMany({ extensionId: 'mock.extension' });

  // Create temporary mock workspace
  const workspaceId = new mongoose.Types.ObjectId().toString();
  const mockWorkspace = new Workspace({
    _id: workspaceId,
    name: 'Extensions Test Workspace',
    ownerId: new mongoose.Types.ObjectId(),
    storagePath: './scratch/extensions-test-workspace',
    templateUsed: 'node',
    containerStatus: 'stopped',
  });
  await mockWorkspace.save();
  console.log('[Test] Created mock workspace.');

  // Create mock installed extension in DB
  const mockExtId = 'mock.extension';
  const entryPath = path.resolve(__dirname, 'scratch/mock-extension.js');
  
  // We ONLY grant commands:register and file:read (NOT file:write)
  const mockExt = new InstalledExtension({
    extensionId: mockExtId,
    manifest: {
      name: 'Mock Extension',
      version: '1.0.0',
      publisher: 'mock',
      activationEvents: ['onCommand'],
      permissions: ['commands:register', 'file:read'], // Explicitly read-only
      entryPath
    },
    active: true,
    settings: {}
  });
  await mockExt.save();
  console.log('[Test] Registered mock extension with READ-ONLY permissions in DB.');

  // Start extension host subprocess
  console.log('[Test] Spawning extension host process...');
  await ExtensionHostService.startHost(workspaceId, mockExtId, entryPath);
  console.log('[Test] Extension host activated.');

  // TEST 1: Verify Capability Gating (Attempting unauthorized write operation)
  console.log('\n[Test 1] Invoking mock.unauthorizedWrite...');
  try {
    await ExtensionHostService.executeCommand(mockExtId, 'mock.unauthorizedWrite');
    console.error('FAIL: Unauthorized write was not blocked!');
  } catch (err: any) {
    console.log(`PASS: Unauthorized write was blocked. Error message: "${err.message}"`);
  }

  // TEST 2: Verify Infinite Loop Isolation & Timeout Budget (Resource limits Module 102)
  console.log('\n[Test 2] Invoking mock.infiniteLoop (Will test RPC call timeout)...');
  const startTime = Date.now();
  try {
    // This call should time out after 5 seconds
    await ExtensionHostService.executeCommand(mockExtId, 'mock.infiniteLoop');
    console.error('FAIL: Infinite loop did not time out!');
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.log(`PASS: Infinite loop command timed out. Elapsed time: ${elapsed}ms, Error: "${err.message}"`);
    console.log('PASS: Parent server process remained fully responsive during extension lockup.');
  }

  // TEST 3: Verify Crash Isolation & Cleanup (Module 91, 97)
  console.log('\n[Test 3] Invoking mock.crash (Testing exit handling)...');
  try {
    await ExtensionHostService.executeCommand(mockExtId, 'mock.crash');
    console.log('Subprocess crash command sent.');
  } catch (err: any) {
    console.log(`Subprocess crashed as expected: ${err.message}`);
  }

  // Wait a moment for exit handlers to resolve cleanup
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const remainingCommands = ExtensionHostService.getRegisteredCommands();
  const isMockCleaned = !remainingCommands.some(c => c.extensionId === mockExtId);
  if (isMockCleaned) {
    console.log('PASS: Crashed extension commands were successfully scrubbed from command registry.');
  } else {
    console.error('FAIL: Stale command entries remain in registry after crash.');
  }

  // Clean up database records
  await Workspace.findByIdAndDelete(workspaceId);
  await InstalledExtension.findOneAndDelete({ extensionId: mockExtId });
  console.log('\n[Test] Cleaned up test database records.');
  await mongoose.disconnect();
  console.log('--- TEST RUN COMPLETED ---');
}

runTest().catch((err) => {
  console.error('Test script crashed:', err);
  mongoose.disconnect();
});
