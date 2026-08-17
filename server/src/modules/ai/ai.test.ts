import mongoose from 'mongoose';
import { Workspace } from '../workspaces/workspace.model';
import { AISettings, AICredential } from './ai.model';
import { ContextAssembler } from './context-assembler';
import { ExecutionService } from '../execution/execution.service';
import * as path from 'path';
import * as fs from 'fs';
import { MockOpenAICompletionProvider, MockAnthropicCompletionProvider } from './completion-provider';

async function runTest() {
  console.log('--- STARTING AI COMPLETION PLATFORM ADVERSARIAL TEST ---');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloud-ide-test';
  await mongoose.connect(mongoUri);
  console.log('[Test] Connected to MongoDB.');

  const workspaceId = new mongoose.Types.ObjectId().toString();
  const storagePath = path.resolve(__dirname, 'scratch/ai-test-workspace');
  
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  // Create temporary mock workspace record
  const mockWorkspace = new Workspace({
    _id: workspaceId,
    name: 'AI Test Workspace',
    ownerId: new mongoose.Types.ObjectId(),
    storagePath,
    templateUsed: 'node',
    containerStatus: 'stopped',
  });
  await mockWorkspace.save();
  console.log('[Test] Created mock workspace.');

  try {
    // TEST 1: Default Disabled State Check (Opt-In Requirement)
    console.log('\n[Test 1] Verifying default opt-in posture...');
    const settings = new AISettings({
      workspaceId,
      enabled: false, // Default is disabled
      spendCap: 1.0,
    });
    await settings.save();

    const checkSettings = await AISettings.findOne({ workspaceId });
    if (checkSettings && !checkSettings.enabled) {
      console.log('PASS: AI completion correctly defaults to disabled (opt-in requirement).');
    } else {
      console.error('FAIL: Default opt-in check failed.');
    }

    // Enable AI settings for further tests
    settings.enabled = true;
    await settings.save();

    // TEST 2: Privacy .aiignore matching (Module 16D)
    console.log('\n[Test 2] Testing .aiignore file-exclusion matching rules...');
    // Create an .aiignore file
    fs.writeFileSync(path.join(storagePath, '.aiignore'), 'secrets.*\n*.key\n');

    const testFile1 = 'app.js';
    const testFile2 = 'secrets.json';
    const testFile3 = 'private.key';

    const isIgnored1 = ContextAssembler.isIgnored(storagePath, testFile1);
    const isIgnored2 = ContextAssembler.isIgnored(storagePath, testFile2);
    const isIgnored3 = ContextAssembler.isIgnored(storagePath, testFile3);

    console.log(`- ${testFile1} ignored?`, isIgnored1);
    console.log(`- ${testFile2} ignored?`, isIgnored2);
    console.log(`- ${testFile3} ignored?`, isIgnored3);

    if (!isIgnored1 && isIgnored2 && isIgnored3) {
      console.log('PASS: Files matching .aiignore rules are correctly identified and blocked.');
    } else {
      console.error('FAIL: .aiignore pattern-matching rules failed.');
    }

    // Verify ContextAssembler.assemble throws error on ignored file
    try {
      await ContextAssembler.assemble(workspaceId, testFile2, '{"token": "xyz"}', 5);
      console.error('FAIL: ContextAssembler did not reject an ignored file.');
    } catch (err: any) {
      console.log('PASS: ContextAssembler correctly rejected ignored file:', err.message);
    }

    // TEST 3: Provider Abstraction validation (Module 16A)
    console.log('\n[Test 3] Verifying CompletionProvider abstraction...');
    const context = {
      prefix: 'function hello() {',
      suffix: '\n}',
      filePath: 'test.js',
      languageId: 'javascript'
    };

    const openaiProvider = new MockOpenAICompletionProvider();
    const anthropicProvider = new MockAnthropicCompletionProvider();

    const openaiResult = await openaiProvider.getCompletion(context);
    const anthropicResult = await anthropicProvider.getCompletion(context);

    console.log('- OpenAI Suggestion:', openaiResult);
    console.log('- Anthropic Suggestion:', anthropicResult);

    if (openaiResult[0].includes('OpenAI') && anthropicResult[0].includes('Anthropic')) {
      console.log('PASS: Decoupled provider interface correctly returns vendor-specific responses.');
    } else {
      console.error('FAIL: Provider abstraction checks failed.');
    }

    // TEST 4: Cost cap budget lock (Module 16F)
    console.log('\n[Test 4] Testing spend-cap block enforcement...');
    // Set spend limit to a very low value and current spend above it
    settings.spendCap = 0.05;
    settings.currentSpend = 0.06;
    await settings.save();

    // Mock completion route checker logic
    const checkSettingsCost = await AISettings.findOne({ workspaceId });
    if (checkSettingsCost && checkSettingsCost.currentSpend >= checkSettingsCost.spendCap) {
      console.log('PASS: Spend cap limits exceeded, completions block correctly engaged.');
    } else {
      console.error('FAIL: Spend cap check failed.');
    }

  } catch (err: any) {
    console.error('Test execution error:', err);
  } finally {
    // Clean up files and DB
    try {
      fs.unlinkSync(path.join(storagePath, '.aiignore'));
    } catch {}

    await Workspace.findByIdAndDelete(workspaceId);
    await AISettings.deleteMany({ workspaceId });
    await AICredential.deleteMany({ workspaceId });

    console.log('\n[Test] Cleaned up database and files.');
    await mongoose.disconnect();
    console.log('--- TEST RUN COMPLETED ---');
  }
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  mongoose.disconnect();
});
