import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Svarna Jewels',
        short_name: 'Svarna',
        description: 'Discover timeless jewellery',
        theme_color: '#b45309',
        background_color: '#fffbeb',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^.*\/catalogue\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'catalogue-cache', expiration: { maxAgeSeconds: 3600 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@svarna/shared-types': path.resolve(
        __dirname,
        '../../packages/shared-types/src/index.ts',
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
