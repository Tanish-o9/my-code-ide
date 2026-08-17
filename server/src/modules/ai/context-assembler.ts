import * as fs from 'fs';
import * as path from 'path';
import { Workspace } from '../workspaces/workspace.model';
import { CompletionContext } from './completion-provider';
import { getLanguageFromPath } from '../../utils/language';

export class ContextAssembler {
  /**
   * Compiles .aiignore rules into RegExp structures, reusing the filesystem ignore logic.
   */
  public static parseIgnoreRules(content: string): RegExp[] {
    const rules: RegExp[] = [];
    content.split('\n').forEach((line) => {
      const rule = line.trim();
      if (!rule || rule.startsWith('#')) return;

      let rStr = rule;
      const isDirOnly = rStr.endsWith('/');
      if (isDirOnly) {
        rStr = rStr.slice(0, -1);
      }

      let regexStr = rStr.replace(/[-\/\\^$*+?.()|[\]{}]/g, (m) => {
        if (m === '*') return '.*';
        if (m === '?') return '.';
        if (m === '/') return '\\/';
        return '\\' + m;
      });

      if (!rStr.startsWith('/')) {
        regexStr = '(^|\\/)' + regexStr;
      } else {
        regexStr = '^' + regexStr.slice(1);
      }

      if (isDirOnly) {
        regexStr += '\\/.*';
      } else {
        regexStr += '($|\\/.*)';
      }

      rules.push(new RegExp(regexStr));
    });
    return rules;
  }

  /**
   * Scans for .aiignore file and returns whether filePath is ignored.
   */
  public static isIgnored(workspaceDir: string, filePath: string): boolean {
    const aiignorePath = path.join(workspaceDir, '.aiignore');
    if (!fs.existsSync(aiignorePath)) {
      return false;
    }

    try {
      const content = fs.readFileSync(aiignorePath, 'utf8');
      const rules = this.parseIgnoreRules(content);
      const cleanRelativePath = filePath.replace(/\\/g, '/');
      return rules.some((rule) => rule.test(cleanRelativePath));
    } catch (err) {
      console.error('[ContextAssembler] Failed to read/parse .aiignore:', err);
      return false;
    }
  }

  /**
   * Assembles context around the cursor, reading other open tabs up to the token budget.
   */
  public static async assemble(
    workspaceId: string,
    filePath: string,
    text: string,
    cursorOffset: number,
    openTabs: string[] = [],
    tokenBudget: number = 2000
  ): Promise<CompletionContext> {
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found.');
    }

    // 1. Privacy gate: Check if active file is in .aiignore
    if (this.isIgnored(workspace.storagePath, filePath)) {
      throw new Error('File is ignored by .aiignore. Completions are disabled.');
    }

    // 2. Assemble primary context (prefix / suffix)
    const prefix = text.substring(0, cursorOffset);
    const suffix = text.substring(cursorOffset);
    const languageId = getLanguageFromPath(filePath);

    // 3. Assemble secondary context (surrounding tabs)
    const otherTabsContext: { filePath: string; content: string }[] = [];
    let remainingBudget = tokenBudget - (prefix.length + suffix.length);

    for (const tabPath of openTabs) {
      if (tabPath === filePath) continue;
      if (remainingBudget <= 0) break;

      // Privacy check: Don't read open tabs that are ignored!
      if (this.isIgnored(workspace.storagePath, tabPath)) continue;

      const fullTabPath = path.join(workspace.storagePath, tabPath);
      if (fs.existsSync(fullTabPath)) {
        try {
          const tabContent = fs.readFileSync(fullTabPath, 'utf8');
          // Take a slice of the tab content that fits the remaining budget
          const sliceLength = Math.min(tabContent.length, 500, remainingBudget);
          const slicedContent = tabContent.substring(0, sliceLength);
          
          otherTabsContext.push({
            filePath: tabPath,
            content: slicedContent
          });
          
          remainingBudget -= slicedContent.length;
        } catch (err) {
          console.warn(`[ContextAssembler] Failed to read secondary tab context ${tabPath}:`, err);
        }
      }
    }

    return {
      prefix,
      suffix,
      filePath,
      languageId,
      otherTabs: otherTabsContext
    };
  }
}
