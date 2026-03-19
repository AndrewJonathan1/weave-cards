import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: '/index.html',
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        readme: 'readme.html',
      },
    },
  },
});
