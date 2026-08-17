import mongoose from 'mongoose';
import { Workspace } from '../workspaces/workspace.model';
import { PackageManagerRegistry } from './package-registry';
import { PackageManagerService } from './package-manager.service';
import * as path from 'path';
import * as fs from 'fs';

async function runTest() {
  console.log('--- STARTING PACKAGE MANAGER REGISTRY & SECURITY TEST ---');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloud-ide-test';
  await mongoose.connect(mongoUri);
  console.log('[Test] Connected to MongoDB.');

  const workspaceId = new mongoose.Types.ObjectId().toString();
  const storagePath = path.resolve(__dirname, 'scratch/package-test-workspace');
  
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  // Create temporary mock workspace record
  const mockWorkspace = new Workspace({
    _id: workspaceId,
    name: 'Package Test Workspace',
    ownerId: new mongoose.Types.ObjectId(),
    storagePath,
    templateUsed: 'node',
    containerStatus: 'stopped',
  });
  await mockWorkspace.save();
  console.log('[Test] Created mock workspace.');

  try {
    // TEST 1: Clear single manifest detection (package.json -> npm)
    console.log('\n[Test 1] Testing single manifest package.json detection...');
    fs.writeFileSync(path.join(storagePath, 'package.json'), '{}');
    const result1 = PackageManagerRegistry.detect(storagePath);
    console.log('Result 1:', result1);
    if (result1.detected === 'npm') {
      console.log('PASS: Successfully resolved package.json manifest to npm.');
    } else {
      console.error('FAIL: Manifest resolution failed.');
    }

    // TEST 2: Disambiguation by lockfile (package.json + yarn.lock -> yarn)
    console.log('\n[Test 2] Testing lockfile disambiguation (package.json + yarn.lock)...');
    fs.writeFileSync(path.join(storagePath, 'yarn.lock'), '');
    const result2 = PackageManagerRegistry.detect(storagePath);
    console.log('Result 2:', result2);
    if (result2.detected === 'yarn') {
      console.log('PASS: Successfully resolved yarn.lock to Yarn.');
    } else {
      console.error('FAIL: Lockfile resolution failed.');
    }

    // TEST 3: Ambiguity detection (package-lock.json + yarn.lock)
    console.log('\n[Test 3] Testing competing lockfiles ambiguity (package-lock.json + yarn.lock)...');
    fs.writeFileSync(path.join(storagePath, 'package-lock.json'), '');
    const result3 = PackageManagerRegistry.detect(storagePath);
    console.log('Result 3:', result3);
    if (result3.detected === null && result3.ambiguous.includes('npm') && result3.ambiguous.includes('yarn')) {
      console.log('PASS: Correctly flagged package manager ambiguity.');
    } else {
      console.error('FAIL: Ambiguity detection failed.');
    }

    // TEST 4: Secure Private Registry credentials injection (Module 39G)
    console.log('\n[Test 4] Storing and resolving private registry tokens...');
    // We clean up competing lockfiles to allow Command Resolution
    fs.unlinkSync(path.join(storagePath, 'package-lock.json'));
    
    const mockToken = 'secret-registry-token-12345';
    await PackageManagerService.setCredentials(workspaceId, 'yarn', 'https://registry.yarnpkg.com', mockToken);
    
    const commandResult = await PackageManagerService.getCommand(workspaceId, 'add', 'lodash');
    console.log('Resolved Command details:', commandResult);
    if (commandResult.command === 'yarn add lodash' && commandResult.registryEnv?.NPM_TOKEN === mockToken) {
      console.log('PASS: Successfully generated add command and decrypted credentials env.');
    } else {
      console.error('FAIL: Private registry command formatting or credentials decryption failed.');
    }

  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    // Clean up files and DB
    try {
      fs.unlinkSync(path.join(storagePath, 'package.json'));
      fs.unlinkSync(path.join(storagePath, 'yarn.lock'));
    } catch {}

    await Workspace.findByIdAndDelete(workspaceId);
    const { PackageManagerCredential } = require('./package-manager.service');
    await PackageManagerCredential.deleteMany({ workspaceId });

    console.log('\n[Test] Cleaned up database and files.');
    await mongoose.disconnect();
    console.log('--- TEST RUN COMPLETED ---');
  }
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  mongoose.disconnect();
});
