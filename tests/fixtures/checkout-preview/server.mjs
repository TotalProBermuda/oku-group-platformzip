// Local-only UI fixture: no database, credentials, gateway or email provider.
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({
  root, configFile: false,
  esbuild: { jsx: 'automatic' },
  resolve: { alias: {
    '@': fileURLToPath(new URL('../../../src', import.meta.url)),
    'next/navigation': root + 'navigation.mjs',
    'next/link': root + 'link.jsx',
    'next-auth/react': root + 'auth.mjs',
  } },
  server: { host: '127.0.0.1', port: 3108, strictPort: true },
  plugins: [{ name: 'mock-bank', configureServer(server) {
    server.middlewares.use('/bank', (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<button onclick="parent.postMessage({type:\'oku-3ds-complete\'},location.origin);parent.postMessage({type:\'oku-3ds-complete\'},location.origin)">Complete simulated verification</button>');
    });
  } }],
});
await server.listen(); server.printUrls();
