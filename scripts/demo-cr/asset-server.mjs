/**
 * Servidor HTTPS local y mínimo para las imágenes SIMULADAS de la demo
 * (la app solo acepta fotos por `https` y desde el host de `R2_PUBLIC_URL`).
 *
 *   node scripts/demo-cr/asset-server.mjs <carpeta-assets> <key.pem> <cert.pem> [puerto=8443]
 *
 * Sirve archivos de la carpeta bajo `/cr-demo/…`. Solo escucha en 127.0.0.1.
 */
import https from 'node:https';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';

const [root, keyFile, certFile, portArg] = process.argv.slice(2);
if (!root || !keyFile || !certFile) throw new Error('Uso: asset-server.mjs <carpeta> <key> <cert> [puerto]');
const port = Number(portArg ?? 8443);
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

const server = https.createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
  const url = new URL(req.url ?? '/', 'https://localhost');
  const rel = decodeURIComponent(url.pathname).replace(/^\/cr-demo\//, '');
  const file = path.resolve(root, rel);
  if (!file.startsWith(path.resolve(root) + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error('no es archivo');
  } catch {
    res.writeHead(404).end('no encontrado');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' });
  createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => console.log(`Assets de la demo en https://localhost:${port}/cr-demo/ (${root})`));
