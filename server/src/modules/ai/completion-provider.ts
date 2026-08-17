export interface CompletionContext {
  prefix: string;
  suffix: string;
  filePath: string;
  languageId: string;
  otherTabs?: { filePath: string; content: string }[];
}

export interface CompletionProvider {
  getCompletion(context: CompletionContext, apiKey?: string): Promise<string[]>;
}

export class MockOpenAICompletionProvider implements CompletionProvider {
  public async getCompletion(context: CompletionContext, apiKey?: string): Promise<string[]> {
    console.log(`[MockOpenAI] Received completion request for: ${context.filePath}`);
    
    const { prefix } = context;
    const cleanPrefix = prefix.trim();

    if (cleanPrefix.endsWith('function hello() {') || cleanPrefix.endsWith('function hello()')) {
      return ['\n  console.log("Hello, OpenAI!");\n}'];
    }
    if (cleanPrefix.endsWith('const add = (a, b) =>')) {
      return [' a + b;'];
    }

    return [' // Suggestion from OpenAI'];
  }
}

export class MockAnthropicCompletionProvider implements Promise<any>, CompletionProvider {
  // Promise interface implementation to satisfy type safety checks if needed
  [Symbol.toStringTag]: string = 'MockAnthropicCompletionProvider';
  
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this).then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<any | TResult> {
    return Promise.resolve(this).catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<any> {
    return Promise.resolve(this).finally(onfinally);
  }

  public async getCompletion(context: CompletionContext, apiKey?: string): Promise<string[]> {
    console.log(`[MockAnthropic] Received completion request for: ${context.filePath}`);
    
    const { prefix } = context;
    const cleanPrefix = prefix.trim();

    if (cleanPrefix.endsWith('function hello() {') || cleanPrefix.endsWith('function hello()')) {
      return ['\n  console.log("Hello, Anthropic!");\n}'];
    }
    if (cleanPrefix.endsWith('const add = (a, b) =>')) {
      return [' a + b;'];
    }

    return [' // Suggestion from Anthropic'];
  }
}
