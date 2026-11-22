import { defineConfig, type Plugin } from 'vite';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { Socket } from 'node:net';

// Polyfill socket.destroySoon for Bun compatibility with Vite's proxy
if (typeof process !== 'undefined' && process.versions && process.versions.bun) {
    if (!(Socket.prototype as any).destroySoon) {
        (Socket.prototype as any).destroySoon = Socket.prototype.destroy;
    }
}
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import vueDevTools from 'vite-plugin-vue-devtools';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Copies @meteocons/lottie/fill JSON files to public/meteocons/ so they can be
 * fetched at runtime by lottie-web via URL. This keeps them out of the Vite
 * bundle and out of the service worker precache manifest.
 */
function copyMeteocons(): Plugin {
    return {
        name: 'copy-meteocons',
        buildStart() {
            const src = 'node_modules/@meteocons/lottie/fill';
            const dest = 'public/meteocons';
            if (!existsSync(dest)) {
                mkdirSync(dest, { recursive: true });
                cpSync(src, dest, { recursive: true });
            }
        }
    };
}

// https://vitejs.dev/config/
export default defineConfig({
    server: {
        proxy: {
            // Directs any request starting with /api to your backend
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                ws: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
                configure: (proxy) => {
                    proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
                        if (socket && !(socket as any).destroySoon) {
                            (socket as any).destroySoon = (socket as any).destroy;
                        }
                    });
                    proxy.on('proxyRes', (_proxyRes, _req, res) => {
                        const socket = (res as any).socket || (res as any).connection;
                        if (socket && !(socket as any).destroySoon) {
                            (socket as any).destroySoon = (socket as any).destroy;
                        }
                    });
                    proxy.on('error', (_err, _req, res) => {
                        const socket = (res as any).socket || (res as any).connection;
                        if (socket && !(socket as any).destroySoon) {
                            (socket as any).destroySoon = (socket as any).destroy;
                        }
                    });
                }
            }
        }
    },
    build: {
        sourcemap: true
    },
    plugins: [
        copyMeteocons(),
        tailwindcss(),
        vue(),
        vueDevTools(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            injectManifest: {
                rollupFormat: 'iife'
            },
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            devOptions: {
                enabled: true,
                type: 'module'
            },
            manifest: {
                name: 'Legacy Calendar',
                short_name: 'Legacy Calendar',
                description: "Legacy's calendar",
                theme_color: '#000000',
                background_color: '#000000',
                display: 'standalone',
                start_url: '/',
                id: '/',
                orientation: 'portrait',
                // Launchers mask maskable icons to a squircle/circle, so their
                // artwork keeps the wordmarks inside the 80% safe zone.
                icons: [
                    {
                        src: 'icon.svg',
                        sizes: 'any',
                        type: 'image/svg+xml',
                        purpose: 'any'
                    },
                    {
                        src: 'icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: 'icon.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any'
                    },
                    {
                        src: 'icon-maskable-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'maskable'
                    },
                    {
                        src: 'icon-maskable-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            }
        })
    ]
});
