import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import wasm from 'vite-plugin-wasm';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.CAPACITOR_BUILD ? './' : '/project-calliope/',
  plugins: [
    vue(),
    wasm()
  ],
  server: {
    proxy: {
      '/api/deezer': {
        target: 'https://api.deezer.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/deezer/, ''),
      },
    },
  },
});