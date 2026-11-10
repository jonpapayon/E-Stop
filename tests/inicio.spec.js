// Fase 1B · Home rediseñada. Sin envíos reales: la analítica se intercepta (se registra
// que el navegador la solicita, pero la petición se aborta para no contaminar datos).
const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const OUT = path.join(RAIZ, 'test-results', 'inicio');
fs.mkdirSync(OUT, { recursive: true });
const log = (n, d) => fs.writeFileSync(path.join(OUT, n + '.json'), JSON.stringify(d, null, 2));
const ANALITICA = /googletagmanager\.com|google-analytics\.com|doubleclick\.net/;

let analitica = [];
test.beforeEach(async ({ page }) => {
  analitica = [];
  await page.route(ANALITICA, (r) => { analitica.push(r.request().url()); r.abort('blockedbyclient'); });
});

// FAQs publicadas originalmente (antes del rediseño), para comparar contenido
const original = execSync('git show f27ac64:index.html', { cwd: RAIZ }).toString();
const limpiar = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const FAQS = [...original.matchAll(/<details>\s*<summary>(.*?)<\/summary>\s*<p>(.*?)<\/p>/gs)].map((m) => [limpiar(m[1]), limpiar(m[2])]);

test('analítica: GTM y Google Ads presentes y ejecutándose', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForLoadState('load');
  const head = await page.evaluate(() => document.head.innerHTML);
  const html = await page.content();
  expect(head).toContain("'GTM-PMX8X4DW'");                                   // GTM en <head>
  expect(html).toContain('https://www.googletagmanager.com/gtag/js?id=AW-16538094770');
  expect(html).toContain("gtag('config', 'AW-16538094770')");
  expect(html).toContain('https://www.googletagmanager.com/ns.html?id=GTM-PMX8X4DW'); // noscript
  const dl = await page.evaluate(() => (window.dataLayer || []).map((e) => (e && e.event) || (e && e[0]) || typeof e));
  expect(dl).toContain('gtm.js');
  expect(dl).toContain('config');
  expect(analitica.some((u) => u.includes('gtm.js?id=GTM-PMX8X4DW'))).toBe(true);
  expect(analitica.some((u) => u.includes('gtag/js?id=AW-16538094770'))).toBe(true);
  // Bloques idénticos byte a byte a los de producción
  const actual = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  for (const [a, b] of [['<!-- Google Tag Manager -->', '<!-- End Google Tag Manager -->'], ['<!-- Google tag (gtag.js) -->', '<!-- End Google Tag Manager (noscript) -->']]) {
    const x = original.slice(original.indexOf(a), original.indexOf(b) + b.length), y = actual.slice(actual.indexOf(a), actual.indexOf(b) + b.length);
    expect(y, a).toBe(x);
  }
  log('analitica', { dataLayer: dl, solicitudes: analitica });
});

test('SEO y Open Graph', async ({ page }) => {
  await page.goto('/index.html');
  const m = await page.evaluate(() => {
    const q = (s, a = 'content') => document.querySelector(s)?.getAttribute(a);
    return {
      lang: document.documentElement.lang, title: document.title,
      description: q('meta[name="description"]'), canonical: q('link[rel="canonical"]', 'href'),
      og: Object.fromEntries([...document.querySelectorAll('meta[property^="og:"]')].map((e) => [e.getAttribute('property'), e.content])),
      tw: Object.fromEntries([...document.querySelectorAll('meta[property^="twitter:"]')].map((e) => [e.getAttribute('property'), e.content])),
      h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
      niveles: [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => +h.tagName[1]),
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent),
      imgSinAlt: document.querySelectorAll('img:not([alt])').length,
    };
  });
  expect(m.lang).toBe('es');
  expect(m.title).toBe('E-Stop Valet Parking - Inicio');
  expect(m.description).toContain('valet parking en Guadalajara');
  expect(m.canonical).toBe('https://svp.com.mx/');
  for (const k of ['og:type', 'og:url', 'og:title', 'og:description', 'og:image']) expect(m.og[k], k).toBeTruthy();
  for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) expect(m.tw[k], k).toBeTruthy();
  expect(fs.existsSync(path.join(RAIZ, decodeURIComponent(new URL(m.og['og:image']).pathname)))).toBe(true);
  expect(m.h1).toHaveLength(1);
  expect(m.h1[0].toLowerCase()).toContain('valet parking en guadalajara');
  for (let i = 1; i < m.niveles.length; i++) expect(m.niveles[i] - m.niveles[i - 1], `salto de encabezado en posición ${i}`).toBeLessThanOrEqual(1);
  const ld = JSON.parse(m.ld[0]);
  expect(ld['@type']).toBe('LocalBusiness');
  expect(ld.telephone).toBe('+52 33 3870 4157');
  expect(ld.address.streetAddress).toContain('Justo Sierra 3233');
  expect(m.imgSinAlt).toBe(0);
  log('seo', m);
});

test('FAQs: las 10 preguntas y respuestas originales, accesibles y animadas', async ({ page }) => {
  expect(FAQS).toHaveLength(10);
  await page.goto('/index.html#preguntas');
  const items = page.locator('#preguntas .acordeon details');
  await expect(items).toHaveCount(10);
  for (let i = 0; i < 10; i++) {
    const q = limpiar(await items.nth(i).locator('summary > span:nth-child(2)').innerHTML());
    const a = limpiar(await items.nth(i).locator('.acordeon__cuerpo').innerHTML());
    // Solo se permiten correcciones ortográficas de la Etapa 0 (comparación sin tildes ni signos)
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ¿?¡!,.:;]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    expect(norm(q), `pregunta ${i + 1}`).toBe(norm(FAQS[i][0]).replace('si le el', 'si el'));
    expect(norm(a).length, `respuesta ${i + 1}`).toBeGreaterThan(norm(FAQS[i][1]).length * 0.97);
  }
  // Teclado: Enter abre, Espacio cierra. Se registra la llamada a animate() (robusto bajo carga)
  await page.evaluate(() => { window.__animaciones = 0; const o = Element.prototype.animate; Element.prototype.animate = function (...a) { if (this.classList.contains('acordeon__cuerpo')) window.__animaciones++; return o.apply(this, a); }; });
  const s = items.nth(2).locator('summary');
  await s.focus();
  await page.keyboard.press('Enter');
  await expect(items.nth(2)).toHaveAttribute('open', '');
  const animando = await page.evaluate(() => window.__animaciones > 0);
  await page.waitForTimeout(500);
  await expect(items.nth(2).locator('.acordeon__cuerpo')).toBeVisible();
  await page.keyboard.press(' ');
  await expect(items.nth(2)).not.toHaveAttribute('open', '');
  expect(animando, 'la apertura está animada').toBe(true);
});

test('servicios, módulos, WhatsApp y teléfono', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html');
  const servicios = await page.$$eval('#servicios .bloque, #servicios .fila', (a) => a.map((e) => ({ t: e.querySelector('h3').textContent.trim(), href: e.getAttribute('href') })));
  expect(servicios).toEqual([
    { t: 'Eventos', href: './cotizar.html?tipo=evento' },
    { t: 'Restaurantes', href: './cotizar.html?tipo=restaurante' },
    { t: 'Oficinas', href: './cotizar.html?tipo=oficina' },
    { t: 'Hospitales', href: './cotizar.html?tipo=hospital' },
    { t: 'Centros comerciales', href: './cotizar.html?tipo=centro-comercial' },
  ]);
  await expect(page.locator('#titulo-modulos')).toContainText('Nuestro módulo');
  await expect(page.locator('.modulos')).toContainText('resguardar las llaves y pertenencias');
  await expect(page.locator('.modulos')).toContainText('climas lluviosos');
  // WhatsApp: flotante en escritorio, barra en móvil
  await expect(page.locator('.wa-flotante')).toBeVisible();
  await expect(page.locator('.barra-movil')).toBeHidden();
  const wa = await page.$$eval('a[href*="whatsapp"], a[href*="wa.me"]', (a) => [...new Set(a.map((e) => e.href))]);
  expect(wa).toEqual(['https://api.whatsapp.com/send?phone=523338704157&text=Hola%2C%20quiero%20informaci%C3%B3n%20sobre%20sus%20servicios.']);
  const tel = await page.$$eval('a[href^="tel:"]', (a) => [...new Set(a.map((e) => e.getAttribute('href')))]);
  expect(tel).toEqual(['tel:+523338704157']);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.wa-flotante')).toBeHidden();
  await expect(page.locator('.barra-movil')).toBeVisible();
  await expect(page.locator('.barra-movil a[href^="tel:"]')).toBeVisible();
  await expect(page.locator('.barra-movil a[href*="whatsapp"]')).toBeVisible();
});

test('enlaces: todos los internos responden y las anclas existen', async ({ page, request }) => {
  await page.goto('/index.html');
  const links = await page.$$eval('a[href]', (a) => a.map((e) => ({ href: e.getAttribute('href'), abs: e.href })));
  const internos = {}, anclas = new Set(), externos = new Set();
  for (const l of links) {
    if (l.abs.startsWith('http://localhost')) {
      const u = new URL(l.abs);
      if (u.hash) anclas.add(`${u.pathname}${u.hash}`);
      const k = u.origin + u.pathname;
      if (!(k in internos)) internos[k] = (await request.get(k)).status();
    } else if (!/^(tel:|mailto:)/.test(l.href)) externos.add(l.abs);
  }
  for (const a of anclas) {
    const [p, h] = a.split('#');
    await page.goto(p);
    expect(await page.locator('#' + h).count(), a).toBe(1);
  }
  log('enlaces', { total: links.length, internos, anclas: [...anclas], externos: [...externos] });
  expect(Object.entries(internos).filter(([, s]) => s !== 200)).toEqual([]);
});

test('interacciones: cabecera, menú, revelados, hover', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html');
  const cab = page.locator('.cabecera');
  await expect(cab).not.toHaveClass(/is-solida/);
  await page.mouse.wheel(0, 1200); await page.waitForTimeout(400);
  await expect(cab).toHaveClass(/is-solida/);
  await expect(cab).toHaveClass(/is-oculta/);           // se oculta al bajar
  await page.mouse.wheel(0, -300); await page.waitForTimeout(400);
  await expect(cab).not.toHaveClass(/is-oculta/);       // reaparece al subir
  // Revelados: recorrer toda la página y comprobar que todo se ha mostrado
  const total = await page.locator('.revelar').count();
  for (let y = 0; y < 30; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
  await page.waitForTimeout(600);
  expect(await page.locator('.revelar.is-visible').count()).toBe(total);
  // Hover en fila de servicio y en el ticket
  await page.locator('#servicios .fila').first().scrollIntoViewIfNeeded();
  const antes = await page.locator('#servicios .fila').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.locator('#servicios .fila').first().hover(); await page.waitForTimeout(700);
  const despues = await page.locator('#servicios .fila').first().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(despues).not.toBe(antes);
  const t0 = await page.locator('.ticket').evaluate((e) => getComputedStyle(e).transform);
  await page.locator('.ticket').hover(); await page.waitForTimeout(1200);
  expect(await page.locator('.ticket').evaluate((e) => getComputedStyle(e).transform)).not.toBe(t0);
  // Menú móvil en la Home (volver arriba: la cabecera se oculta al bajar)
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.hamburguesa').click();
  await expect(page.locator('#menu-movil')).toBeVisible();
  await page.locator('#menu-movil a', { hasText: 'Preguntas' }).click();
  await expect(page.locator('#menu-movil')).toBeHidden();
  await expect(page).toHaveURL(/#preguntas$/);
});

test('hero: fotografía con dirección de arte, sin el Audi, con créditos', async ({ page }) => {
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  expect(html.toLowerCase()).not.toContain('audi');
  expect(html).toContain('Quentin Martinez');
  expect(fs.readFileSync(path.join(RAIZ, 'assets/fotos/CREDITOS.md'), 'utf8')).toContain('pexels.com/photo/sleek-white-sports-car-in-dark-garage-setting-33268786');
  const casos = [[1440, 900, 'foto-escritorio-'], [1920, 1080, 'foto-escritorio-'], [390, 844, 'foto-movil-']];
  for (const [w, h, esperado] of casos) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/index.html?h=' + w);
    const img = page.locator('.hero__foto img');
    await expect.poll(() => img.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    const src = await img.evaluate((i) => i.currentSrc);
    expect(src, `${w}px`).toContain(esperado);
    expect(src, 'formato moderno').toMatch(/\.(avif|webp)$/);
    // El titular queda por encima de la foto y dentro del velo (legibilidad)
    const z = await page.evaluate(() => [getComputedStyle(document.querySelector('.hero__cuerpo')).zIndex, getComputedStyle(document.querySelector('.hero__velo')).zIndex]);
    expect(+z[0]).toBeGreaterThan(+z[1]);
  }
  // Móvil: la foto queda debajo de los botones (no los tapa)
  const r = await page.evaluate(() => { const f = document.querySelector('.hero__foto').getBoundingClientRect(); return { cta: document.querySelector('.hero .grupo-botones').getBoundingClientRect().bottom, opaca: f.top + f.height * 0.38 }; });
  expect(r.opaca, 'la parte opaca de la foto empieza debajo de los botones').toBeGreaterThan(r.cta);   // la máscara funde el 38% superior
});

test('módulo isométrico: geometría, cotas, animación y microinteracción', async ({ page }) => {
  expect(fs.existsSync(path.join(RAIZ, 'assets/icons/modulo.svg')), 'el dibujo anterior se eliminó').toBe(false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html');
  expect(await page.locator('.modulo-trazo').count()).toBe(0);
  const arte = page.locator('.modulos__arte');
  await expect(arte.locator('svg.iso title')).toHaveText(/Vista isométrica/);
  await expect(arte.locator('.iso__cota')).toHaveCount(3);
  await expect(arte.locator('.iso-etiqueta')).toHaveCount(3);
  await arte.scrollIntoViewIfNeeded();
  await page.waitForTimeout(3200);                                    // fin de la coreografía
  expect(await arte.locator('.iso__modulo').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  expect(parseFloat(await arte.locator('.iso__cajon polyline').evaluate((e) => getComputedStyle(e).strokeDashoffset))).toBeLessThan(0.02);
  // Pasar sobre el punto 02 resalta su cota
  const anillo = arte.locator('.iso__cota[data-cota="2"] .anillo');
  const antes = await anillo.evaluate((e) => getComputedStyle(e).transform);
  await page.locator('li[data-punto="2"]').hover(); await page.waitForTimeout(700);
  expect(await anillo.evaluate((e) => getComputedStyle(e).transform)).not.toBe(antes);
  // Paralaje por puntero
  await arte.hover({ position: { x: 20, y: 20 } }); await page.waitForTimeout(200);
  expect(await arte.evaluate((e) => e.style.getPropertyValue('--px'))).not.toBe('');
});

test('movimiento reducido: contenido visible sin animaciones', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.route(ANALITICA, (r) => r.abort());
  await page.goto('http://localhost:8765/index.html');
  await page.waitForTimeout(300);
  expect(await page.locator('.revelar:not(.is-visible)').count()).toBe(0);
  const op = await page.locator('.hero__titular .linea > span').first().evaluate((e) => getComputedStyle(e).transform);
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(op);
  await ctx.close();
});

test('consola limpia, sin desbordamiento en 9 anchos, peso de página', async ({ page }) => {
  test.setTimeout(120000);
  const errores = [], bytes = {};
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|blockedbyclient/.test(m.text())) errores.push(m.text()); });
  page.on('response', async (r) => { if (r.url().startsWith('http://localhost')) { try { bytes[r.url()] = (await r.body()).length; } catch {} } });
  const desborde = [];
  for (const w of [320, 375, 390, 414, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/index.html?w=' + w);
    await page.evaluate(() => document.querySelectorAll('.revelar').forEach((e) => e.classList.add('is-visible')));
    await page.waitForTimeout(250);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) desborde.push(`${w}px → ${sw}px`);
  }
  // Peso con caché vacía (1 carga en escritorio, todo cargado)
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const k in bytes) delete bytes[k];
  await page.goto('/index.html?peso');
  for (let y = 0; y < 25; y++) { await page.mouse.wheel(0, 800); await page.waitForTimeout(60); }
  await page.waitForLoadState('networkidle');
  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  const porTipo = {};
  for (const [u, b] of Object.entries(bytes)) { const ext = new URL(u).pathname.split('.').pop(); porTipo[ext] = (porTipo[ext] || 0) + b; }
  log('rendimiento', { totalKB: Math.round(total / 1024), porTipoKB: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, Math.round(v / 1024)])), desborde, errores });
  expect(errores).toEqual([]);
  expect(desborde).toEqual([]);
  expect(total / 1024, 'peso total de la Home en KB').toBeLessThan(650);
});

test('capturas de revisión (escritorio y móvil)', async ({ page }) => {
  test.setTimeout(120000);
  for (const [n, w, h] of [['1440', 1440, 900], ['390', 390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/index.html'); await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(OUT, `${n}-00-hero.png`) });
    const n_sec = await page.locator('main > section').count();
    for (let i = 1; i < n_sec; i++) {
      const sec = page.locator('main > section').nth(i);
      await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(900);
      await page.evaluate(() => document.querySelectorAll('.revelar').forEach((e) => e.classList.add('is-visible')));
      await page.evaluate((el) => scrollTo(0, el.getBoundingClientRect().top + scrollY - (innerWidth < 900 ? 64 : 0)), await sec.elementHandle());
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `${n}-${String(i).padStart(2, '0')}.png`) });
    }
  }
});
