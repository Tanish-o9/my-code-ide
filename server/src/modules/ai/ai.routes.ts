import { Router } from 'express';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';
import { AISettings, AICredential } from './ai.model';
import { ContextAssembler } from './context-assembler';
import { MockOpenAICompletionProvider, MockAnthropicCompletionProvider } from './completion-provider';
import { decrypt } from '../../utils/crypto';
import { authMiddleware } from '../../middleware/auth.middleware';
import { EmbeddingsService } from './embeddings.service';

const router = Router({ mergeParams: true });
router.use(authMiddleware as any);

// In-memory rate limiter: Map of user key to timestamp arrays
const rateLimits = new Map<string, number[]>();

router.post('/complete', requireWorkspaceAccess('editor') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { filePath, text, cursorOffset, openTabs } = req.body;
    const userId = (req as any).user?.userId;

    if (!filePath || text === undefined || cursorOffset === undefined) {
      res.status(400).json({ error: 'filePath, text, and cursorOffset are required.' });
      return;
    }

    // 1. Rate Limiting Check (Max 30 requests per minute)
    const rateLimitKey = `${workspaceId}:${userId}`;
    const now = Date.now();
    const stamps = rateLimits.get(rateLimitKey) || [];
    const recentStamps = stamps.filter((t) => now - t < 60000);
    
    if (recentStamps.length >= 30) {
      res.status(429).json({ error: 'Rate limit exceeded. Maximum 30 AI completions per minute.' });
      return;
    }
    
    recentStamps.push(now);
    rateLimits.set(rateLimitKey, recentStamps);

    // 2. Fetch AI settings & Verify Opt-in
    let settings = await AISettings.findOne({ workspaceId });
    if (!settings || !settings.enabled) {
      res.status(403).json({ error: 'AI Code Completion is not enabled for this workspace. An administrator must enable it first.' });
      return;
    }

    // 3. Spend Cap Check (Module 16F)
    if (settings.currentSpend >= settings.spendCap) {
      res.status(402).json({ error: 'AI completion spend cap reached. Contact your administrator.' });
      return;
    }

    // 4. Assemble Context (Module 16C/16D - .aiignore check happens here)
    let context;
    try {
      context = await ContextAssembler.assemble(workspaceId, filePath, text, cursorOffset, openTabs);
    } catch (ignoreErr: any) {
      res.status(200).json({ suggestions: [] }); // Silently return no suggestions on ignored files
      return;
    }

    // 5. Select Provider & Fetch Key (Module 16A)
    const credential = await AICredential.findOne({ workspaceId });
    const providerId = credential?.providerId || 'openai';
    const decryptedKey = credential ? decrypt(credential.apiKey) : 'mock-key';

    const provider = providerId === 'anthropic' 
      ? new MockAnthropicCompletionProvider() 
      : new MockOpenAICompletionProvider();

    // 6. Get Completions suggestion
    const suggestions = await provider.getCompletion(context, decryptedKey);

    // 7. Update spend metrics (Mock cost per call: $0.002)
    settings.currentSpend += 0.002;
    settings.requestCount += 1;
    await settings.save();

    res.json({ suggestions });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI Completion failed.' });
  }
});

router.post('/chat', requireWorkspaceAccess('viewer') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { message, history } = req.body;

    if (!message) {
      res.status(400).json({ error: 'message is required.' });
      return;
    }

    // 1. Fetch relevant files/chunks from workspace using EmbeddingsService
    const relatedChunks = await EmbeddingsService.search(workspaceId, message, 5);
    const contextStr = relatedChunks
      .map((c) => `--- File: ${c.filePath} ---\n${c.text}`)
      .join('\n\n');

    // 2. Fetch AI settings & credentials
    const settings = await AISettings.findOne({ workspaceId });
    if (settings && settings.currentSpend >= settings.spendCap) {
      res.status(402).json({ error: 'AI completion spend cap reached.' });
      return;
    }

    const credential = await AICredential.findOne({ workspaceId });
    const providerId = credential?.providerId || 'openai';
    const apiKey = credential ? decrypt(credential.apiKey) : 'mock-key';

    // 3. Assemble chat payload with Context
    const systemPrompt = `You are Antigravity, a senior AI architect pair-programming inside the user's custom IDE.
Below is relevant context retrieved from the user's codebase workspace. Use it to answer questions, explain files, generate refactored code, or find bugs.

[Workspace Context]
${contextStr}

Format your output in GitHub-style Markdown. Be concise, precise, and avoid conversational fluff.`;

    const chatHistory = history || [];
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: message }
    ];

    // 4. Send query to API provider (OpenAI or Anthropic)
    let reply = '';
    if (!apiKey || apiKey === 'mock-key') {
      reply = `### Antigravity AI Codebase Reply

No active OpenAI/Anthropic API credentials found for this workspace. Below is a mock analysis of your request based on context chunks:

${relatedChunks.length > 0 ? `I found ${relatedChunks.length} matching files:
${relatedChunks.map(c => `- \`${c.filePath}\``).join('\n')}

Configure your OpenAI API key in settings to get real-time codebase-wide analysis.` : 'No matching files found in the workspace.'}`;
    } else {
      if (providerId === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: credential.modelName || 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            messages: messages.filter(m => m.role !== 'system'),
            system: systemPrompt
          })
        });
        const data = await response.json() as any;
        reply = data.content?.[0]?.text || 'No response from Anthropic API.';
      } else {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: credential.modelName || 'gpt-4o-mini',
            messages,
            max_tokens: 1024
          })
        });
        const data = await response.json() as any;
        reply = data.choices?.[0]?.message?.content || 'No response from OpenAI API.';
      }

      if (settings) {
        settings.currentSpend += 0.005;
        settings.requestCount += 1;
        await settings.save();
      }
    }

    res.json({ reply, relatedChunks: relatedChunks.map(c => c.filePath) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI Chat failed.' });
  }
});

router.post('/rewrite', requireWorkspaceAccess('editor') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { prompt, code, languageId } = req.body;

    if (!prompt || !code) {
      res.status(400).json({ error: 'prompt and code are required.' });
      return;
    }

    const credential = await AICredential.findOne({ workspaceId });
    const providerId = credential?.providerId || 'openai';
    const apiKey = credential ? decrypt(credential.apiKey) : 'mock-key';

    const systemPrompt = `You are an expert code editor. You receive a code snippet and an instruction prompt.
Your task is to edit the code according to the instruction.
Return ONLY the raw rewritten code. Do NOT wrap it in markdown code fences, do NOT include explanations. Just return the code.`;

    const userPrompt = `[Code Snippet (${languageId})]
${code}

[Instruction]
${prompt}`;

    let reply = '';
    if (!apiKey || apiKey === 'mock-key') {
      reply = `// AI edited: ${prompt}\n${code}`;
    } else {
      if (providerId === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: credential.modelName || 'claude-3-5-sonnet-20240620',
            max_tokens: 1024,
            messages: [{ role: 'user', content: userPrompt }],
            system: systemPrompt
          })
        });
        const data = await response.json() as any;
        reply = data.content?.[0]?.text || code;
      } else {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: credential.modelName || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            max_tokens: 1024
          })
        });
        const data = await response.json() as any;
        reply = data.choices?.[0]?.message?.content || code;
      }
    }

    res.json({ code: reply.trim() });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'AI rewrite failed.' });
  }
});

// Settings management (admin only)
router.post('/settings', requireWorkspaceAccess('admin') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { enabled, spendCap } = req.body;

    const settings = await AISettings.findOneAndUpdate(
      { workspaceId },
      { enabled, spendCap },
      { upsert: true, new: true }
    );

    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update settings.' });
  }
});

// Credentials setup (admin only)
router.post('/credentials', requireWorkspaceAccess('admin') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { providerId, apiKey, modelName } = req.body;

    if (!providerId || !apiKey) {
      res.status(400).json({ error: 'providerId and apiKey are required.' });
      return;
    }

    const { encrypt } = require('../../utils/crypto');
    const encryptedKey = encrypt(apiKey);

    await AICredential.findOneAndUpdate(
      { workspaceId },
      { providerId, apiKey: encryptedKey, modelName: modelName || 'mock-model' },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Provider credentials saved.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save credentials.' });
  }
});

export default router;
