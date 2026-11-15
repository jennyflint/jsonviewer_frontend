import { defineConfig, loadEnv } from 'vite';
import solid from 'vite-plugin-solid';
import tailwind from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [solid(), tailwind()],
    resolve: { alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) } },
    worker: { format: 'es' as const },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:8000', changeOrigin: false },
      },
    },
    build: { target: 'es2022', sourcemap: false },
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
      server: { deps: { inline: [/solid-js/, /@solidjs/, /@kobalte/] } },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/lib/api/schema.d.ts',
          'src/lib/workers/**',
          'src/test/**',
          'src/main.tsx',
          '**/*.test.{ts,tsx}',
          'src/**/*.d.ts',
        ],
        reporter: ['text-summary', 'json-summary', 'text'],
      },
    },
    // vitest resolves solid in browser mode
    ...(process.env.VITEST
      ? {
          resolve: {
            conditions: ['development', 'browser'],
            alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
          },
        }
      : {}),
  };
});
