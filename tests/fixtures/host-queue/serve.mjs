import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const output = await mkdtemp(join(tmpdir(), 'oku-host-preview-'));
await build({ entryPoints: ['tests/fixtures/host-queue/entry.jsx'], outdir: output, bundle: true, jsx: 'automatic', alias: { '@': resolve('src') } });
createServer(async (req, res) => {
  res.setHeader('Content-Type', req.url === '/entry.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/entry.js' ? await readFile(join(output, 'entry.js')) : '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style><div id="root"></div><script src="/entry.js"></script>');
}).listen(3117, '127.0.0.1', () => console.log('Isolated host UI: http://127.0.0.1:3117/?reservationId=isolated-next-month'));
