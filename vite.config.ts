import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true, // 같은 와이파이의 태블릿에서 접속 가능 (npm run dev -- --host 와 동일)
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000, // three.js 단일 청크 경고 완화
  },
});
