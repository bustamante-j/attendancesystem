import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: [
        'branding/attendly-logo.webp',
        'branding/favicon.ico',
        'branding/apple-touch-icon-180x180.png',
      ],
      manifest: {
        id: '/',
        name: 'Attendly – Attendance Management',
        short_name: 'Attendly',
        description: 'Secure QR-based event attendance management for schools and organizations.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        lang: 'en-PH',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['education', 'productivity', 'business'],
        icons: [
          {
            src: '/branding/pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: '/branding/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/branding/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/branding/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Events',
            short_name: 'Events',
            description: 'Open the event workspace',
            url: '/events',
            icons: [{ src: '/branding/pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Students',
            short_name: 'Students',
            description: 'Open the student directory',
            url: '/students',
            icons: [{ src: '/branding/pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
    }),
  ],
})
