import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://cf.nascar.com",
  'connect-src https://cf.nascar.com',
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

// Only for production builds: the dev server needs a websocket for HMR.
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), cspPlugin()],
  // Every browser that runs ES2022 supports modulepreload, so the polyfill is dead weight.
  // Logos stay separate cached files instead of base64 in the JS every visitor downloads.
  build: { target: 'es2022', modulePreload: { polyfill: false }, assetsInlineLimit: 0 },
  test: { include: ['src/**/*.test.ts'] },
});
