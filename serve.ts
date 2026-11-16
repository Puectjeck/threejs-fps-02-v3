// serve.ts — a tiny static server for play-testing: node serve.ts, then
// open http://localhost:8080. Serves game/ only, no network calls.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = join(import.meta.dirname, 'game');
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css',
};
createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  const file = join(root, path === '/' ? 'index.html' : path);
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(8080, () => console.log('NEON BREACH: PROTOCOL at http://localhost:8080'));
