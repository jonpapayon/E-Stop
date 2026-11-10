#!/usr/bin/env node
/* Copia los parciales compartidos (partials/*.html) dentro de cada página HTML.
   El resultado sigue siendo HTML estático: no hay paso de build en producción.

   Marcadores en la página:
     <!-- parcial:cabecera activo="nosotros" -->  …contenido generado…  <!-- /parcial:cabecera -->
   Atributos opcionales:
     activo="x"  → añade aria-current="page" a los enlaces con data-nav="x"
     raiz="../"  → prefijo de rutas para páginas en subcarpetas
   Uso:
     node scripts/sync-partials.mjs          actualiza las páginas
     node scripts/sync-partials.mjs --check  sólo verifica (sale con 1 si hay diferencias) */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const comprobar = process.argv.includes('--check');
const paginas = ['.', 'dev']
  .filter((d) => existsSync(join(raiz, d)))
  .flatMap((d) => readdirSync(join(raiz, d)).filter((f) => f.endsWith('.html')).map((f) => join(raiz, d, f)));

const MARCA = /<!-- parcial:([a-z-]+)((?:\s+[a-z]+="[^"]*")*)\s*-->[\s\S]*?<!-- \/parcial:\1 -->/g;
const attrs = (s) => Object.fromEntries([...s.matchAll(/([a-z]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

function render(nombre, a) {
  const archivo = join(raiz, 'partials', `${nombre}.html`);
  if (!existsSync(archivo)) throw new Error(`No existe el parcial "${nombre}"`);
  let html = readFileSync(archivo, 'utf8').trim().replaceAll('{{raiz}}', a.raiz ?? '');
  if (a.activo) html = html.replaceAll(`data-nav="${a.activo}"`, `data-nav="${a.activo}" aria-current="page"`);
  return html;
}

let cambios = [], usos = 0;
for (const p of paginas) {
  const original = readFileSync(p, 'utf8');
  const nuevo = original.replace(MARCA, (_, nombre, s) => {
    usos++;
    return `<!-- parcial:${nombre}${s} -->\n${render(nombre, attrs(s))}\n<!-- /parcial:${nombre} -->`;
  });
  if (nuevo !== original) {
    cambios.push(relative(raiz, p));
    if (!comprobar) writeFileSync(p, nuevo);
  }
}

if (comprobar) {
  if (cambios.length) { console.error(`Parciales desactualizados en: ${cambios.join(', ')}\nEjecuta: npm run partials`); process.exit(1); }
  console.log(`Parciales sincronizados (${usos} usos en ${paginas.length} páginas).`);
} else {
  console.log(cambios.length ? `Actualizadas: ${cambios.join(', ')}` : `Sin cambios (${usos} usos).`);
}
