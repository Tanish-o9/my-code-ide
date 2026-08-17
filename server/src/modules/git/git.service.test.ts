import mongoose from 'mongoose';
import { GitService } from './git.service';
import { Workspace } from '../workspaces/workspace.model';
import fs from 'fs';
import path from 'path';

/**
 * Self-contained script to test GitService shell command injection resilience.
 */
async function runTest() {
  console.log('[Test/GitInjection] Starting execution safety audit...');

  // Connect to local MongoDB
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cloud-ide';
  await mongoose.connect(mongoUri);
  console.log('[Test/GitInjection] Connected to MongoDB.');

  // Find or create a dummy workspace
  let workspace = await Workspace.findOne({ name: 'InjectionTestWorkspace' });
  if (!workspace) {
    workspace = await Workspace.create({
      name: 'InjectionTestWorkspace',
      storagePath: path.resolve('./injection-test-sandbox'),
      ownerId: new mongoose.Types.ObjectId(),
    });
  }

  // Ensure workspace directory exists
  if (!fs.existsSync(workspace.storagePath)) {
    fs.mkdirSync(workspace.storagePath, { recursive: true });
  }

  // Initialize dummy git repository
  console.log('[Test/GitInjection] Initializing dummy git repo...');
  await GitService.run(workspace.id, ['init']);

  // Target filename we want to make sure is NOT created
  const canaryFile = 'injected_leak_canary.txt';
  const canaryPath = path.join(workspace.storagePath, canaryFile);
  if (fs.existsSync(canaryPath)) {
    fs.unlinkSync(canaryPath);
  }

  // Attempt command injection via branch name argument
  // Semicolon and shell operations will try to execute on Unix/Windows shells
  const maliciousBranchName = `master; touch ${canaryFile}`;
  console.log(`[Test/GitInjection] Attempting branch checkout with payload: "${maliciousBranchName}"`);

  const result = await GitService.run(workspace.id, ['checkout', '-b', maliciousBranchName]);

  console.log('[Test/GitInjection] Command stderr output:', result.stderr.trim());
  console.log('[Test/GitInjection] Command exit code:', result.exitCode);

  // Check if canary file was created
  const fileCreated = fs.existsSync(canaryPath);

  if (fileCreated) {
    console.error('❌ FAILURE: Command injection vulnerability detected! The canary file was created.');
    fs.unlinkSync(canaryPath);
    process.exit(1);
  } else {
    console.log('✅ SUCCESS: Shell command injection was successfully prevented. Canary file does not exist.');
  }

  // Clean up
  try {
    fs.rmSync(workspace.storagePath, { recursive: true, force: true });
    await Workspace.deleteOne({ _id: workspace._id });
  } catch (err) {}

  await mongoose.disconnect();
  console.log('[Test/GitInjection] Audits complete.');
}

runTest().catch((err) => {
  console.error('[Test/GitInjection] Test runner failed:', err);
  process.exit(1);
});
