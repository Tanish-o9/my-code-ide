import { Router } from 'express';
import { requireWorkspaceAccess } from '../../middleware/workspace-auth.middleware';
import { AICredential } from '../ai/ai.model';
import { decrypt } from '../../utils/crypto';

const router = Router({ mergeParams: true });

router.post('/translate', requireWorkspaceAccess('editor') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required.' });
      return;
    }

    const credential = await AICredential.findOne({ workspaceId });
    const apiKey = credential ? decrypt(credential.apiKey) : 'mock-key';
    const providerId = credential?.providerId || 'openai';

    const isWindows = process.platform === 'win32';
    const shellType = isWindows ? 'PowerShell' : 'Bash';

    const systemPrompt = `You are a terminal command translator. Convert the user's natural language request into a single executable shell command for ${shellType}.
Return ONLY the raw executable command. Do NOT wrap it in markdown code fences, do NOT include explanations, just output the command string.`;

    const userPrompt = `Request: ${prompt}`;

    let command = '';
    if (!apiKey || apiKey === 'mock-key') {
      // Mock Fallbacks for testing
      const lower = prompt.toLowerCase();
      if (lower.includes('express')) {
        command = 'npm install express';
      } else if (lower.includes('python')) {
        command = isWindows ? 'python main.py' : 'python3 main.py';
      } else if (lower.includes('react')) {
        command = 'npx create-react-app my-app';
      } else if (lower.includes('django')) {
        command = 'python -m pip install django && python manage.py runserver';
      } else if (lower.includes('docker')) {
        command = 'docker build -t my-image .';
      } else {
        command = `echo "Mock translated: ${prompt}"`;
      }
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
            max_tokens: 128,
            messages: [{ role: 'user', content: userPrompt }],
            system: systemPrompt
          })
        });
        const data = await response.json() as any;
        command = data.content?.[0]?.text?.trim() || '';
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
            max_tokens: 128
          })
        });
        const data = await response.json() as any;
        command = data.choices?.[0]?.message?.content?.trim() || '';
      }
    }

    res.json({ command });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Command translation failed.' });
  }
});

router.post('/explain-failure', requireWorkspaceAccess('viewer') as any, async (req, res) => {
  try {
    const { workspaceId } = req.params as any;
    const { command, exitCode, output } = req.body;

    const credential = await AICredential.findOne({ workspaceId });
    const apiKey = credential ? decrypt(credential.apiKey) : 'mock-key';
    const providerId = credential?.providerId || 'openai';

    const systemPrompt = `You are a DevOps expert diagnosing terminal command failures.
Examine the failed command, exit code, and terminal logs. Explain why it failed and suggest exactly what to run to fix it.
Format in concise, clean Markdown.`;

    const userPrompt = `Failed Command: ${command}
Exit Code: ${exitCode}
Terminal Logs:
${output}`;

    let explanation = '';
    if (!apiKey || apiKey === 'mock-key') {
      explanation = `### AI Failure Diagnosis

The command \`${command}\` failed with exit code **${exitCode}**.

**Potential Causes**:
1. Missing package binaries or dependencies in the active path.
2. Configuration mismatch or port already in use.

**Troubleshooting Steps**:
- Verify python/npm installation.
- Check permissions or docker container state.`;
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
            max_tokens: 512,
            messages: [{ role: 'user', content: userPrompt }],
            system: systemPrompt
          })
        });
        const data = await response.json() as any;
        explanation = data.content?.[0]?.text || '';
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
            max_tokens: 512
          })
        });
        const data = await response.json() as any;
        explanation = data.choices?.[0]?.message?.content || '';
      }
    }

    res.json({ explanation });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failure diagnosis failed.' });
  }
});

export default router;
