import mongoose from 'mongoose';
import { Workspace } from '../workspaces/workspace.model';
import { ExecutionService } from './execution.service';
import * as path from 'path';
import * as fs from 'fs';

async function runTest() {
  console.log('--- STARTING MULTI-LANGUAGE EXECUTION PIPELINE TEST ---');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloud-ide-test';
  await mongoose.connect(mongoUri);
  console.log('[Test] Connected to MongoDB.');

  const workspaceId = new mongoose.Types.ObjectId().toString();
  const storagePath = path.resolve(__dirname, 'scratch/execution-test-workspace');
  
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  // Create temporary mock workspace record
  const mockWorkspace = new Workspace({
    _id: workspaceId,
    name: 'Execution Test Workspace',
    ownerId: new mongoose.Types.ObjectId(),
    storagePath,
    templateUsed: 'cpp',
    containerStatus: 'stopped',
  });
  await mockWorkspace.save();
  console.log('[Test] Created mock workspace.');

  // Create mock files
  // 1. Python source
  const pyPath = 'hello.py';
  fs.writeFileSync(path.join(storagePath, pyPath), 'print("Hello Python!")');

  // 2. Correct C++ source
  const cppPath = 'hello.cpp';
  fs.writeFileSync(path.join(storagePath, cppPath), `
#include <iostream>
int main() {
    std::cout << "Hello C++ Execution!" << std::endl;
    return 0;
}
  `);

  // 3. Broken C++ source (Syntax error)
  const brokenCppPath = 'broken.cpp';
  fs.writeFileSync(path.join(storagePath, brokenCppPath), `
#include <iostream>
int main() {
    std::cout << "Broken compilation" // Missing semicolon
    return 0;
}
  `);

  try {
    // TEST 1: Python execution (Interpreted)
    console.log('\n[Test 1] Running Python file hello.py...');
    const pyResult = await ExecutionService.run(workspaceId, pyPath);
    console.log(`Result:`, pyResult);
    if (pyResult.runCommand && pyResult.runCommand.includes('hello.py')) {
      console.log('PASS: Python direct execution command mapped correctly.');
    } else {
      console.error('FAIL: Python command mapping was incorrect.');
    }

    // TEST 2: Correct C++ compile-and-run (Compiled success case)
    console.log('\n[Test 2] Compiling and running valid C++ hello.cpp...');
    const cppResult = await ExecutionService.run(workspaceId, cppPath);
    console.log(`Result:`, cppResult);
    const expectedBinaryExt = process.platform === 'win32' ? 'hello.cpp.exe' : 'hello.bin';
    if (cppResult.runCommand && cppResult.runCommand.includes(expectedBinaryExt)) {
      console.log('PASS: C++ compiled successfully and returned run command.');
    } else {
      console.error('FAIL: C++ compilation or command mapping failed.');
    }

    // TEST 3: Broken C++ compile-and-run (Compiled failure case - compiler error gating)
    console.log('\n[Test 3] Compiling syntax-broken C++ broken.cpp...');
    const brokenResult = await ExecutionService.run(workspaceId, brokenCppPath);
    console.log(`Result:`, brokenResult);
    if (!brokenResult.runCommand && brokenResult.compileLog) {
      console.log('PASS: Broken compilation halted pipeline and returned compiler error logs.');
      console.log('--- Compiler Logs Captured: ---\n', brokenResult.compileLog);
    } else {
      console.error('FAIL: Pipeline did not halt on compilation failure.');
    }

  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    // Clean up files and DB
    try {
      fs.unlinkSync(path.join(storagePath, 'hello.py'));
      fs.unlinkSync(path.join(storagePath, 'hello.cpp'));
      fs.unlinkSync(path.join(storagePath, 'hello.bin'));
    } catch {}
    try {
      fs.unlinkSync(path.join(storagePath, 'broken.cpp'));
      fs.unlinkSync(path.join(storagePath, 'broken.bin'));
    } catch {}

    await Workspace.findByIdAndDelete(workspaceId);
    console.log('\n[Test] Cleaned up database and files.');
    await mongoose.disconnect();
    console.log('--- TEST RUN COMPLETED ---');
  }
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  mongoose.disconnect();
});
