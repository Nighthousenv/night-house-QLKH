import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/night-house-QLKH/',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Chức năng HMR đã bị vô hiệu hóa trong AI Studio thông qua biến môi trường DISABLE_HMR.
      // Không chỉnh sửa – chức năng theo dõi tập tin đã bị vô hiệu hóa để tránh hiện tượng nhấp nháy trong quá trình chỉnh sửa.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
