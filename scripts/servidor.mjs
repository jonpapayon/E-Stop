#!/usr/bin/env node
/* Servidor estático de pruebas, sin dependencias. A diferencia de `python -m http.server`:
   - comprime con gzip (como el hosting de producción y Vercel) → métricas de rendimiento realistas;
   - sirve 404.html con estado 404 en cualquier ruta inexistente (como el hosting).
   Uso: node scripts/servidor.mjs [puerto]   (por defecto 8765) */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.argv[2] || 8765);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};
const COMPRIMIBLE = /^(text\/|application\/json|image\/svg)/;

createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = normalize(join(RAIZ, ruta));
  let cuerpo, estado = 200, tipo;
  try {
    if (!archivo.startsWith(RAIZ) || !(await stat(archivo)).isFile()) throw new Error('no');
    cuerpo = await readFile(archivo); tipo = TIPOS[extname(archivo).toLowerCase()] || 'application/octet-stream';
  } catch {
    estado = 404; cuerpo = await readFile(join(RAIZ, '404.html')); tipo = TIPOS['.html'];
  }
  const cab = { 'Content-Type': tipo, 'Cache-Control': 'no-cache' };
  if (COMPRIMIBLE.test(tipo) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { cuerpo = gzipSync(cuerpo); cab['Content-Encoding'] = 'gzip'; cab.Vary = 'Accept-Encoding'; }
  res.writeHead(estado, cab);
  res.end(req.method === 'HEAD' ? undefined : cuerpo);
}).listen(PUERTO, '127.0.0.1', () => console.log(`Servidor de pruebas en http://localhost:${PUERTO}`));
