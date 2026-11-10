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

/* 1 · Fotografía del hero (Pexels 33268786, Quentin Martinez · licencia Pexels).
   Retoque reproducible, el original no se modifica:
   - se ELIMINAN la placa del museo «Coligny Car Museum» y la ficha de Alfa Romeo del suelo
     (identifican un lugar y una marca reales; no deben sugerir relación con E-Stop);
   - se difumina el emblema de la parrilla (no implicar respaldo de la marca);
   - escritorio: se amplía el lienzo a la izquierda con el negro del fondo para dejar
     espacio negativo al titular; móvil: recorte vertical centrado en el frontal. */
const HERO = p('assets/fotos/originales/hero-pexels-33268786.jpg');
const NEGRO = { r: 13, g: 13, b: 14 };
async function heroFoto() {
  const { width: W, height: H } = await sharp(HERO).metadata();         // 8192 × 4608
  // Máscara alfa con borde suave: 255 dentro de la forma, degradado de «m» px hacia fuera
  const mascara = async (w, h, m, elipse = false) => {
    const W2 = w + 2 * m, H2 = h + 2 * m, buf = Buffer.alloc(W2 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      const dentro = elipse ? (((x - W2 / 2) / (w / 2)) ** 2 + ((y - H2 / 2) / (h / 2)) ** 2 <= 1) : (x >= m && x < m + w && y >= m && y < m + h);
      buf[y * W2 + x] = dentro ? 255 : 0;
    }
    return sharp(buf, { raw: { width: W2, height: H2, channels: 1 } }).blur(m / 2.2).extractChannel(0).raw().toBuffer();  // blur devuelve 3 canales
  };
  // Color de relleno: media de una franja de fondo junto a la zona (a la derecha)
  const muestra = async (r) => {
    const der = await sharp(HERO).extract({ left: r.x + r.w + 30, top: r.y, width: 60, height: r.h }).stats();
    const izq = await sharp(HERO).extract({ left: r.x - 90, top: r.y + Math.round(r.h / 2), width: 60, height: Math.round(r.h / 2) }).stats();
    return [0, 1, 2].map((i) => Math.round((der.channels[i].mean + izq.channels[i].mean) / 2));
  };
  const capas = [];
  const parches = [
    { x: 6145, y: 3125, w: 290, h: 200, m: 50 },   // placa «Coligny Car Museum»
    { x: 5965, y: 3295, w: 475, h: 430, m: 70 },   // ficha Alfa Romeo en el suelo
  ];
  for (const r of parches) {
    const [cr, cg, cb] = await muestra(r), a = await mascara(r.w, r.h, r.m);
    const W2 = r.w + 2 * r.m, H2 = r.h + 2 * r.m, rgba = Buffer.alloc(W2 * H2 * 4);
    for (let i = 0; i < W2 * H2; i++) { rgba[i * 4] = cr; rgba[i * 4 + 1] = cg; rgba[i * 4 + 2] = cb; rgba[i * 4 + 3] = a[i]; }
    capas.push({ input: rgba, raw: { width: W2, height: H2, channels: 4 }, left: r.x - r.m, top: r.y - r.m });
  }
  // Emblema: versión desenfocada y desaturada, fundida con máscara elíptica suave
  const e = { x: 5990, y: 2735, w: 95, h: 140, m: 34 };
  const zona = { left: e.x - e.m, top: e.y - e.m, width: e.w + 2 * e.m, height: e.h + 2 * e.m };
  const borroso = await sharp(HERO).extract(zona).blur(11).modulate({ saturation: 0, brightness: 0.9 }).removeAlpha().raw().toBuffer();
  const ae = await mascara(e.w, e.h, e.m, true), rgbe = Buffer.alloc(zona.width * zona.height * 4);
  for (let i = 0; i < zona.width * zona.height; i++) { rgbe[i * 4] = borroso[i * 3]; rgbe[i * 4 + 1] = borroso[i * 3 + 1]; rgbe[i * 4 + 2] = borroso[i * 3 + 2]; rgbe[i * 4 + 3] = ae[i]; }
  capas.push({ input: rgbe, raw: { width: zona.width, height: zona.height, channels: 4 }, left: zona.left, top: zona.top });
  const retocada = await sharp(HERO).composite(capas).jpeg({ quality: 95 }).toBuffer();

  // Escritorio 16:9: lienzo ampliado con el negro del fondo (+3000px izquierda, +900px arriba)
  // para que el auto quede abajo a la derecha y el titular siempre sobre negro.
  // (Dos pasos: en una sola cadena Sharp aplica extract antes que extend.)
  // Costuras: degradado del negro sobre las primeras franjas de la foto original (arriba e izquierda)
  const neg = `rgb(${NEGRO.r},${NEGRO.g},${NEGRO.b})`;
  const costuras = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${neg}"/><stop offset="1" stop-color="${neg}" stop-opacity="0"/></linearGradient>
    <linearGradient id="h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${neg}"/><stop offset="1" stop-color="${neg}" stop-opacity="0"/></linearGradient></defs>
    <rect width="${W}" height="1100" fill="url(#v)"/><rect width="1000" height="${H}" fill="url(#h)"/></svg>`);
  const fundida = await sharp(retocada).composite([{ input: costuras, top: 0, left: 0 }]).jpeg({ quality: 95 }).toBuffer();
  const ampliada = await sharp(fundida).extend({ left: 3000, top: 900, background: NEGRO }).jpeg({ quality: 95 }).toBuffer();
  const altoE = H + 900, anchoE = Math.round(altoE * 16 / 9);               // 9792 × 5508
  const escritorio = await sharp(ampliada).extract({ left: 0, top: 0, width: anchoE, height: altoE }).jpeg({ quality: 95 }).toBuffer();
  await variantes(escritorio, p('assets/img/hero/foto-escritorio'), [1280, 1920, 2560], { fallback: 'jpeg' });
  // Móvil: placa apaisada centrada en el frontal del auto (se funde desde negro en CSS)
  const movil = await sharp(retocada).extract({ left: 3700, top: 1650, width: 2800, height: 2250 }).jpeg({ quality: 95 }).toBuffer();
  await variantes(movil, p('assets/img/hero/foto-movil'), [640, 960, 1280], { fallback: 'jpeg' });
  // Vista de control del retoque (no se despliega)
  await sharp(retocada).extract({ left: 5500, top: 2500, width: 1400, height: 1300 }).resize({ width: 700 }).jpeg({ quality: 80 }).toFile(p('test-results/control-retoque-hero.jpg')).catch(() => {});
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
    await sharp(join(dir, f)).trim({ threshold: 10 }).resize({ width: 480, height: 112, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85, alphaQuality: 100 }).toFile(out);
    informe.push(`assets/img/clientes/${slug}.webp  ${kb(out)}${fondoOpaco ? '   ⚠ fondo opaco: revisar en tema oscuro' : ''}`);
  }
}

/* 3 · Fotografía auténtica del cliente (cuando exista) */
async function fotos() {
  const dir = p('assets/fotos/originales');
  if (!existsSync(dir)) return;
  // hero-pexels-*: fotografía de banco con retoque propio (heroFoto), nunca sin retocar
  for (const f of readdirSync(dir).filter((x) => /\.(jpe?g|png|webp|tiff?|heic)$/i.test(x) && !x.startsWith('hero-pexels-'))) {
    await variantes(join(dir, f), p('assets/img/fotos', parse(f).name.toLowerCase()), [640, 1024, 1600, 2400], { fallback: 'jpeg', preparar: (s) => s.rotate() });
  }
}

/* 5 · Textura de grano (ruido monocromo con alfa) para body::after */
async function grano() {
  const L = 64, px = Buffer.alloc(L * L * 2);
  let s = 1337; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);   // determinista
  for (let i = 0; i < L * L; i++) { const v = rnd(); px[i * 2] = v > .5 ? 255 : 0; px[i * 2 + 1] = Math.round(Math.abs(v - .5) * 2 * 255); }
  const out = p('assets/img/grano.png');
  await sharp(px, { raw: { width: L, height: L, channels: 2 } }).png({ compressionLevel: 9, palette: false }).toFile(out);
  informe.push(`assets/img/grano.png  ${kb(out)}`);
}

/* 4 · Logotipo de E-Stop (se muestra a 76–120px: 2× = 240px) */
async function logotipo() {
  mkdirSync(p('assets/img'), { recursive: true });
  for (const [f, op] of [['webp', (s) => s.webp({ quality: 90, alphaQuality: 100 })], ['png', (s) => s.png({ palette: true, quality: 95, compressionLevel: 9 })]]) {
    const out = p('assets/img', `logo-estop.${f}`);
    await op(sharp(p('assets/icons/LOGO-STOP-min 1.png')).resize({ width: 240 })).toFile(out);
    informe.push(`assets/img/logo-estop.${f}  ${kb(out)}`);
  }
}

await heroFoto();
await logotipo();
await grano();
await logos();
await fotos();
console.log(informe.join('\n'));
