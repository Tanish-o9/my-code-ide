export interface LanguageExecutionConfig {
  languageId: string;
  type: 'interpreted' | 'compiled' | 'static-preview';
  extensions: string[];
  interpreterCommand?: string;
  compileCommand?: string;
  runCommand?: string;
  defaultEntryPoint?: string;
}

export class LanguageExecutionRegistry {
  private static registry = new Map<string, LanguageExecutionConfig>();

  static {
    // 1. JavaScript/Node
    this.register({
      languageId: 'javascript',
      type: 'interpreted',
      extensions: ['js', 'jsx', 'mjs', 'cjs'],
      interpreterCommand: 'node',
      defaultEntryPoint: 'index.js'
    });

    // 2. TypeScript
    this.register({
      languageId: 'typescript',
      type: 'interpreted',
      extensions: ['ts', 'tsx'],
      interpreterCommand: 'npx ts-node',
      defaultEntryPoint: 'index.ts'
    });

    // 3. Python
    this.register({
      languageId: 'python',
      type: 'interpreted',
      extensions: ['py'],
      interpreterCommand: 'python3',
      defaultEntryPoint: 'main.py'
    });

    // 4. Shell
    this.register({
      languageId: 'shell',
      type: 'interpreted',
      extensions: ['sh', 'bash'],
      interpreterCommand: 'bash',
      defaultEntryPoint: 'run.sh'
    });

    // 5. C++ (Compiled language template)
    this.register({
      languageId: 'cpp',
      type: 'compiled',
      extensions: ['cpp', 'cc', 'cxx', 'h', 'hpp'],
      compileCommand: 'g++ -O3 {file} -o {binary}',
      runCommand: '{binary}',
      defaultEntryPoint: 'main.cpp'
    });

    // 6. HTML (Static Preview template)
    this.register({
      languageId: 'html',
      type: 'static-preview',
      extensions: ['html', 'htm'],
      defaultEntryPoint: 'index.html'
    });

    // 7. CSS (Static Preview helper)
    this.register({
      languageId: 'css',
      type: 'static-preview',
      extensions: ['css'],
      defaultEntryPoint: 'style.css'
    });

    // 8. Java
    this.register({
      languageId: 'java',
      type: 'interpreted', // Modern Java allows 'java File.java' directly
      extensions: ['java'],
      interpreterCommand: 'java',
      defaultEntryPoint: 'Main.java'
    });

    // 9. C
    this.register({
      languageId: 'c',
      type: 'compiled',
      extensions: ['c'],
      compileCommand: 'gcc -O3 {file} -o {binary}',
      runCommand: '{binary}',
      defaultEntryPoint: 'main.c'
    });

    // 10. Go
    this.register({
      languageId: 'go',
      type: 'interpreted',
      extensions: ['go'],
      interpreterCommand: 'go run',
      defaultEntryPoint: 'main.go'
    });

    // 11. Rust
    this.register({
      languageId: 'rust',
      type: 'compiled',
      extensions: ['rs'],
      compileCommand: 'rustc {file} -o {binary}',
      runCommand: '{binary}',
      defaultEntryPoint: 'main.rs'
    });

    // 12. PHP
    this.register({
      languageId: 'php',
      type: 'interpreted',
      extensions: ['php'],
      interpreterCommand: 'php',
      defaultEntryPoint: 'index.php'
    });

    // 13. Ruby
    this.register({
      languageId: 'ruby',
      type: 'interpreted',
      extensions: ['rb'],
      interpreterCommand: 'ruby',
      defaultEntryPoint: 'main.rb'
    });
  }

  public static register(config: LanguageExecutionConfig): void {
    this.registry.set(config.languageId, config);
  }

  public static get(languageId: string): LanguageExecutionConfig | null {
    return this.registry.get(languageId) || null;
  }

  public static getByExtension(ext: string): LanguageExecutionConfig | null {
    const cleanExt = ext.replace(/^\./, '').toLowerCase();
    for (const config of this.registry.values()) {
      if (config.extensions.includes(cleanExt)) {
        return config;
      }
    }
    return null;
  }
}
