import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';
import { writeFileSync, mkdirSync } from 'fs';
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Generate build timestamp for versioning (using LOCAL time, not UTC)
  const now = new Date();
  // Forzar zona horaria Mexico (UTC-6)
  const mexicoTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const year = String(mexicoTime.getUTCFullYear()).slice(2); // YY
  const month = String(mexicoTime.getUTCMonth() + 1).padStart(2, '0'); // MM
  const day = String(mexicoTime.getUTCDate()).padStart(2, '0'); // DD
  const hours = String(mexicoTime.getUTCHours()).padStart(2, '0'); // HH
  const minutes = String(mexicoTime.getUTCMinutes()).padStart(2, '0'); // MM
  const buildDate = `${year}${month}${day}`; // YYMMDD in local time
  const buildTime = `${hours}${minutes}`; // HHMM in local time
  
  return {
  define: {
    __APP_VERSION__: JSON.stringify('2.4.0'),
    __BUILD_TIMESTAMP__: JSON.stringify(`${buildDate}.${buildTime}`),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(), 
    mode === "development" && componentTagger(),
    // Generate version.json on build
    {
      name: 'version-generator',
      closeBundle() {
        const versionString = `v2.4.0-${buildDate}.${buildTime}`;
        const versionData = {
          version: versionString,
          buildTime: Date.now()
        };
        try {
          mkdirSync('dist', { recursive: true });
          writeFileSync('dist/version.json', JSON.stringify(versionData));
          console.log(`Generated version.json with version: ${versionString}`);
        } catch (e) {
          console.log('Could not write version.json:', e);
        }
      }
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      devOptions: {
        enabled: false
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              networkTimeoutSeconds: 10
            }
          },
          {
            urlPattern: /\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-resources',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      includeAssets: ['app-icon.png'],
      manifest: {
        name: 'SOZU Admin - Panel de Administración',
        short_name: 'SOZU Admin',
        description: 'Panel de administración para gestión de proyectos inmobiliarios SOZU',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'app-icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'app-icon.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'app-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    sourcemap: true,
    cssCodeSplit: true,
    cssMinify: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        passes: 2,
      },
    },
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'form-vendor': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'supabase': ['@supabase/supabase-js'],
          'query': ['@tanstack/react-query'],
        },
      },
    },
  },
};
});
