import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['durango.dashboardrsrc.com.mx', '100.102.159.109', '.ngrok-free.dev', '.ngrok-free.app'],
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['durango.dashboardrsrc.com.mx', '100.102.159.109', '.ngrok-free.dev', '.ngrok-free.app'],
  },
});
