import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  base: process.env.TAURI_ENV_PLATFORM ? './' : '/openvolleyscout/',
  plugins: [react()],
  resolve: {
    alias: {
      '@src': resolve(__dirname, './src'),
    },
  },
});
