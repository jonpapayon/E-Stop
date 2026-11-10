#!/usr/bin/env node
/* Genera las imágenes optimizadas del sitio (AVIF/WebP, varios anchos) con Sharp.
   Herramienta de DESARROLLO: su salida (assets/img/) se versiona y se despliega;
   Sharp no se usa en producción. Los originales nunca se modifican.

   Uso: npm run imagenes
   Fotografía real del cliente: colócala en assets/fotos/originales/ (ver README allí). */
import sharp from 'sharp';
import { mkdirSync, readdirSync, existsSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, parse } from 'node:path';
import { fileURLToPath } from 'node:url';

const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => join(R, ...s);
const kb = (f) => `${Math.round(statSync(f).size / 1024)} KB`;
const informe = [];

async function variantes(entrada, salidaBase, anchos, { formatos = ['avif', 'webp'], fallback = null, preparar = (s) => s } = {}) {
  mkdirSync(dirname(salidaBase), { recursive: true });
  const meta = await sharp(entrada).metadata();
  for (const w of anchos) {
    if (w > meta.width) continue;                       // nunca ampliar
    for (const f of [...formatos, ...(fallback ? [fallback] : [])]) {
      const out = `${salidaBase}-${w}.${f === 'jpeg' ? 'jpg' : f}`;
      let s = preparar(sharp(entrada)).resize({ width: w, withoutEnlargement: true });
      s = f === 'avif' ? s.avif({ quality: 55, effort: 6 })
        : f === 'webp' ? s.webp({ quality: 78, effort: 6, alphaQuality: 90 })
        : f === 'png' ? s.png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
        : s.jpeg({ quality: 80, mozjpeg: true, progressive: true });
      await s.toFile(out);
      informe.push(`${out.replace(R + '/', '')}  ${kb(out)}`);
    }
  }
}

/* 1 · Audi del hero (temporal, decisión C). El PNG original trae «VALET PARKING» en
   blanco puro detrás del auto: se eliminan los píxeles casi blancos opacos. */
async function audiSinTexto() {
  const { data, info } = await sharp(p('assets/images/audi-hero.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0 && data[i] > 238 && data[i + 1] > 238 && data[i + 2] > 238) data[i + 3] = 0;
  }
  const limpio = await sharp(data, { raw: info }).trim({ threshold: 1 }).png().toBuffer();
  const { width } = await sharp(limpio).metadata();   // resolución real del auto: 897px
  await variantes(limpio, p('assets/img/hero/audi'), [480, 720, width], { fallback: 'png' });
}

/* 2 · Logotipos de clientes: recorte de márgenes y altura de 2× la de pantalla (56px → 112px) */
async function logos() {
  const dir = p('assets/logos'); mkdirSync(p('assets/img/clientes'), { recursive: true });
  for (const f of readdirSync(dir)) {
    const { name, ext } = parse(f), slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (ext === '.svg') { copyFileSync(join(dir, f), p('assets/img/clientes', `${slug}.svg`)); informe.push(`assets/img/clientes/${slug}.svg  (copia)`); continue; }
    const s = sharp(join(dir, f));
    const { hasAlpha } = await s.metadata();
    const stats = await s.stats();
    const fondoOpaco = !hasAlpha || stats.channels[3]?.min === 255;
    const out = p('assets/img/clientes', `${slug}.webp`);
    await sharp(join(dir, f)).trim({ threshold: 10 }).resize({ height: 112, withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 100 }).toFile(out);
    informe.push(`assets/img/clientes/${slug}.webp  ${kb(out)}${fondoOpaco ? '   ⚠ fondo opaco: revisar en tema oscuro' : ''}`);
  }
}

/* 3 · Fotografía auténtica del cliente (cuando exista) */
async function fotos() {
  const dir = p('assets/fotos/originales');
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => /\.(jpe?g|png|webp|tiff?|heic)$/i.test(x))) {
    await variantes(join(dir, f), p('assets/img/fotos', parse(f).name.toLowerCase()), [640, 1024, 1600, 2400], { fallback: 'jpeg', preparar: (s) => s.rotate() });
  }
}

await audiSinTexto();
await logos();
await fotos();
console.log(informe.join('\n'));
