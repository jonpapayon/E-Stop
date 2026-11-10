// Auditoría técnica transversal: accesibilidad (axe), SEO técnico, Core Web Vitals de laboratorio,
// imágenes, consola/red, enlaces y responsive en todas las páginas públicas.
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'test-results', 'calidad');
fs.mkdirSync(OUT, { recursive: true });
const PAGINAS = ['index.html', 'nosotros.html', 'cotizar.html', 'equipo.html', 'evento.html', 'negocio.html', 'privacidad.html', '404.html'];
const BLOQUEAR = /googletagmanager|google-analytics|doubleclick|googleadservices/;
const informe = (n, d) => fs.writeFileSync(path.join(OUT, n + '.json'), JSON.stringify(d, null, 2));

test.beforeEach(async ({ page }) => { await page.route(BLOQUEAR, (r) => r.abort()); });

test('accesibilidad: sin infracciones WCAG 2.1 A/AA graves o críticas (axe)', async ({ page }) => {
  test.setTimeout(120000);
  const res = {};
  for (const p of PAGINAS) {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/' + p);
      await page.evaluate(() => document.querySelectorAll('.revelar').forEach((e) => e.classList.add('is-visible')));
      await page.waitForTimeout(1200);                                  // fin de transiciones de entrada (contraste real)
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      res[`${p}@${w}`] = r.violations.map((v) => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length, ejemplo: v.nodes[0]?.target.join(' ') }));
    }
  }
  informe('axe', res);
  const graves = Object.entries(res).flatMap(([p, vs]) => vs.filter((v) => ['serious', 'critical'].includes(v.impacto)).map((v) => `${p}: ${v.id} (${v.nodos}) ${v.ejemplo}`));
  expect(graves).toEqual([]);
});

test('SEO técnico por página', async ({ page }) => {
  const res = {}, titulos = new Set();
  for (const p of PAGINAS) {
    await page.goto('/' + p);
    const m = await page.evaluate(() => ({
      lang: document.documentElement.lang, title: document.title.trim(),
      description: document.querySelector('meta[name="description"]')?.content || '',
      canonical: document.querySelector('link[rel="canonical"]')?.href || '',
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      h1: document.querySelectorAll('h1').length,
      saltos: (() => { const n = [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => +h.tagName[1]); return n.some((x, i) => i && x - n[i - 1] > 1); })(),
      imgSinAlt: document.querySelectorAll('img:not([alt])').length,
      enlacesSinTexto: [...document.querySelectorAll('a[href]')].filter((a) => !(a.textContent.trim() || a.getAttribute('aria-label') || a.querySelector('img[alt]:not([alt=""])'))).length,
      viewport: !!document.querySelector('meta[name="viewport"]'),
    }));
    res[p] = m;
    expect(m.lang, p).toBe('es');
    expect(m.title, p).not.toBe('');
    expect(titulos.has(m.title), `título duplicado: ${m.title}`).toBe(false); titulos.add(m.title);
    expect(m.description.length, p).toBeGreaterThan(50);
    expect(m.h1, p).toBe(1);
    expect(m.saltos, `${p}: salto de nivel de encabezado`).toBe(false);
    expect(m.imgSinAlt, p).toBe(0);
    expect(m.enlacesSinTexto, p).toBe(0);
    expect(m.viewport, p).toBe(true);
    if (p === '404.html') expect(m.robots).toContain('noindex');
    else expect(m.canonical, p).toBe(`https://svp.com.mx/${p}`.replace('/index.html', '/'));
  }
  informe('seo', res);
});

// Se ejecuta aparte y sin paralelismo para que la medición no compita por CPU: npm run test:cwv
test('Core Web Vitals de laboratorio (móvil, CPU ×4, red 4G lenta)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Métricas vía CDP solo en Chromium');
  test.skip(!process.env.CWV, 'Ejecutar con npm run test:cwv (aislado)');
  test.setTimeout(400000);
  const res = {};
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const muestras = {};
  for (let ronda = 0; ronda < 3; ronda++) for (const p of ['index.html', 'nosotros.html', 'cotizar.html', 'equipo.html', 'privacidad.html']) {
    await page.addInitScript(() => {
      window.__cwv = { lcp: 0, cls: 0, tbt: 0, fcp: 0, inp: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cwv.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cwv.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cwv.tbt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__cwv.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__cwv.inp = Math.max(window.__cwv.inp, e.duration); }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    });
    await page.goto('/' + p, { waitUntil: 'load' });
    await page.waitForTimeout(3500);
    await page.locator('.hamburguesa').click();                            // interacción para estimar INP
    await page.waitForTimeout(800);
    await page.locator('.hamburguesa').click();
    await page.waitForTimeout(600);
    const pesos = await page.evaluate(() => performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) + (performance.getEntriesByType('navigation')[0]?.transferSize || 0));
    const m = await page.evaluate(() => window.__cwv);
    (muestras[p] ||= []).push({ LCP_ms: Math.round(m.lcp), FCP_ms: Math.round(m.fcp), CLS: +m.cls.toFixed(3), TBT_ms: Math.round(m.tbt), INP_aprox_ms: Math.round(m.inp), transferidoKB: Math.round(pesos / 1024) });
  }
  // Mediana de 3 rondas por métrica
  const mediana = (a) => a.slice().sort((x, y) => x - y)[1];
  for (const [p, ms] of Object.entries(muestras)) res[p] = Object.fromEntries(Object.keys(ms[0]).map((k) => [k, mediana(ms.map((m) => m[k]))]));
  informe('cwv', res);
  for (const [p, m] of Object.entries(res)) {
    expect(m.CLS, `${p} CLS`).toBeLessThan(0.1);                          // «bueno»
    expect(m.LCP_ms, `${p} LCP`).toBeLessThan(2500);                       // «bueno» incluso con estrangulamiento
    expect(m.INP_aprox_ms, `${p} INP`).toBeLessThan(200);
  }
});

test('imágenes: formatos modernos, dimensiones declaradas y sin sobredimensionar', async ({ page }) => {
  test.setTimeout(120000);
  const res = [];
  for (const [w, h, dpr] of [[1440, 900, 1], [390, 844, 2]]) {
    const ctx = await page.context().browser().newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    const pg = await ctx.newPage();
    await pg.route(BLOQUEAR, (r) => r.abort());
    for (const p of PAGINAS) {
      await pg.goto('http://localhost:8765/' + p);
      for (let y = 0; y < 12; y++) { await pg.mouse.wheel(0, 900); await pg.waitForTimeout(60); }
      await pg.waitForLoadState('networkidle');
      const imgs = await pg.$$eval('img', (is) => is.filter((i) => i.complete && i.naturalWidth && i.getBoundingClientRect().width).map((i) => ({ src: (i.currentSrc || i.src).split('/').pop(), natural: i.naturalWidth, mostrada: Math.round(i.getBoundingClientRect().width), declarada: i.hasAttribute('width') && i.hasAttribute('height') })));
      for (const im of imgs) res.push({ pagina: p, w, dpr, ...im, factor: +(im.natural / (im.mostrada * dpr)).toFixed(2) });
    }
    await ctx.close();
  }
  informe('imagenes', res);
  for (const im of res) {
    expect(im.declarada, `${im.pagina} ${im.src} sin width/height`).toBe(true);
    expect(im.src, 'formato').toMatch(/\.(avif|webp|svg|png)$/);
    if (!im.src.endsWith('.svg') && im.mostrada > 60) expect(im.factor, `${im.pagina}@${im.w}x${im.dpr} ${im.src} sobredimensionada`).toBeLessThan(3.2);
  }
});

test('consola y red: sin errores ni peticiones fallidas en ninguna página', async ({ page }) => {
  const errores = [];
  page.on('pageerror', (e) => errores.push(`[js] ${page.url()}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|ERR_FAILED/.test(m.text())) errores.push(`[consola] ${page.url()}: ${m.text()}`); });
  // ERR_ABORTED = petición cancelada por la propia navegación entre páginas (no es un fallo del sitio)
  page.on('requestfailed', (r) => { if (!BLOQUEAR.test(r.url()) && !/ERR_ABORTED/.test(r.failure()?.errorText || '')) errores.push(`[red] ${r.failure()?.errorText} ${r.url()}`); });
  page.on('response', (r) => { if (r.url().startsWith('http://localhost') && r.status() >= 400) errores.push(`[${r.status()}] ${r.url()}`); });
  for (const p of PAGINAS) for (const q of ['', '?result=success', '?result=error']) {
    await page.goto('/' + p + q, { waitUntil: 'networkidle' });
  }
  expect(errores).toEqual([]);
});

test('navegación completa y enlaces internos/externos', async ({ page, request }) => {
  test.setTimeout(120000);
  const visitadas = new Set(), cola = ['/index.html'], internos = {}, externos = new Set(), anclas = [];
  while (cola.length) {
    const u = cola.shift();
    if (visitadas.has(u)) continue;
    visitadas.add(u);
    await page.goto(u);
    // Estructura compartida: salto, cabecera, pie, barra móvil
    for (const s of ['.salto', '.cabecera', '.pie', '.barra-movil']) expect(await page.locator(s).count(), `${u} ${s}`).toBe(1);
    for (const a of await page.$$eval('a[href]', (as) => as.map((e) => e.href))) {
      const url = new URL(a);
      if (url.origin === 'http://localhost:8765') {
        const k = url.pathname;
        if (url.hash) anclas.push(k + url.hash);
        if (!(k in internos)) internos[k] = (await request.get(k)).status();
        if (k.endsWith('.html') && !visitadas.has(k)) cola.push(k);
      } else if (/^https?:/.test(a)) externos.add(url.origin + url.pathname);
    }
  }
  for (const a of anclas) { const [p, h] = a.split('#'); await page.goto(p); expect(await page.locator('#' + h).count(), a).toBe(1); }
  // Externos: se comprueba que respondan (GET simple, sin enviar datos de formularios)
  const ext = {};
  for (const e of externos) { if (/formsubmit\.co/.test(e)) continue; try { const r = await request.get(e, { maxRedirects: 5, timeout: 15000 }); ext[e] = r.status(); } catch (err) { ext[e] = 'error: ' + err.message.split('\n')[0]; } }
  informe('enlaces', { paginas: [...visitadas], internos, externos: ext });
  expect(Object.entries(internos).filter(([, s]) => s !== 200)).toEqual([]);
  expect([...visitadas].sort()).toEqual(['/cotizar.html', '/equipo.html', '/evento.html', '/index.html', '/negocio.html', '/nosotros.html', '/privacidad.html']);
  for (const [e, s] of Object.entries(ext)) expect(typeof s === 'number' && s < 400, `${e} → ${s}`).toBe(true);
});

test('responsive: sin desbordamiento horizontal en 8 páginas × 7 anchos', async ({ page }) => {
  test.setTimeout(120000);
  const desborde = [];
  for (const w of [320, 375, 414, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of PAGINAS) {
      await page.goto('/' + p);
      await page.evaluate(() => document.querySelectorAll('.revelar').forEach((e) => e.classList.add('is-visible')));
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) desborde.push(`${p} @${w}: ${sw}`);
    }
  }
  expect(desborde).toEqual([]);
});
