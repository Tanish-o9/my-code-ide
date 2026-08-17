import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'monaco-editor/esm/vs/editor/editor.api.js': 'monaco-editor',
      'monaco-editor/esm/vs/editor/editor.api': 'monaco-editor',
    },
  },
});
