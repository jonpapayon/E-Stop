// Nosotros transformada: misma URL y menú, contenido solo del texto existente, cifras ocultas.
const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ORIGINAL = execSync('git show f27ac64:nosotros.html', { cwd: RAIZ }).toString();
const norm = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test.beforeEach(async ({ page }) => { await page.route(/googletagmanager|google-analytics|doubleclick/, (r) => r.abort()); });

test('URL, menú y SEO conservados', async ({ page }) => {
  const res = await page.goto('/nosotros.html');
  expect(res.status()).toBe(200);
  expect(await page.title()).toBe('E-Stop Valet Parking - Nosotros');
  expect(await page.getAttribute('meta[name="description"]', 'content')).toContain('valet parking en Guadalajara');
  expect(await page.getAttribute('link[rel="canonical"]', 'href')).toBe('https://svp.com.mx/nosotros.html');
  await expect(page.locator('.nav a[href$="nosotros.html"]')).toHaveAttribute('aria-current', 'page');
  await page.goto('/index.html');
  await page.locator('.nav a', { hasText: 'Nosotros' }).click();
  await expect(page).toHaveURL(/nosotros\.html$/);
  await expect(page.locator('h1')).toHaveCount(1);
});

test('sin cifras sin verificar, sin superlativos y sin fechas inventadas', () => {
  const html = fs.readFileSync(path.join(RAIZ, 'nosotros.html'), 'utf8');
  const texto = norm(html.replace(/<!--[\s\S]*?-->/g, ''));
  for (const p of [/30[.,]000/, /\b130\b/, /10[.,]000/, /\b95 ?%/, /25[.,]000/, /mejor empresa/i, /más de 20 años/i]) expect(texto, String(p)).not.toMatch(p);
  expect(html, 'cifras ni siquiera en el código fuente').not.toMatch(/30[.,]000|10[.,]000|25[.,]000|\b95 ?%/);
  const anios = [...texto.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => m[0]);
  expect([...new Set(anios)]).toEqual(['1999']);
});

test('el contenido proviene del texto existente del cliente', async ({ page }) => {
  await page.goto('/nosotros.html');
  const t = norm(await page.locator('main').innerHTML());
  const o = norm(ORIGINAL);
  // Frases literales del original (misión, historia y garantías)
  for (const f of [
    'estamos comprometidos en brindar un servicio de excelencia con profesionalismo y honestidad',
    'inició operaciones en 1999 en la ciudad de Guadalajara bajo el nombre de STOP Valet Parking de México SA de CV',
    'únicamente el servicio de acomodadores de estacionamiento',
    'Bajo contrato adquirimos todas nuestras responsabilidades, deslindando al 100% de toda responsabilidad a cada contratante.',
    'Contratamos una póliza de seguro con cobertura de responsabilidad civil en cada uno de los establecimientos donde prestamos nuestros servicios.',
    'Implementamos protocolos eficientes de seguridad que nos permiten reducir los riesgos de robo.',
    'Realizamos investigaciones laborales a todo nuestro personal.',
  ]) { expect(t, f).toContain(f); expect(o.replace('inicio operaciones', 'inició operaciones').replace('incursiono', 'incursionó'), `existe en el original: ${f}`).toContain(f); }
  // Valores completos y clientes
  await expect(page.locator('.valores__lista li')).toHaveCount(7);
  await expect(page.locator('.logos img')).toHaveCount(10);
  await expect(page.locator('.linea-tiempo .hito')).toHaveCount(4);
  const ctas = await page.$$eval('.cierre-emp a', (a) => a.map((e) => e.getAttribute('href')));
  expect(ctas).toEqual(['./cotizar.html?tipo=evento', './cotizar.html?tipo=negocio']);
  // Sin etiquetas de analítica nuevas (Nosotros no las tenía en producción)
  expect(fs.readFileSync(path.join(RAIZ, 'nosotros.html'), 'utf8')).not.toMatch(/GTM-|gtag\(/);
});

test('consola limpia, recursos completos y sin desbordamiento (320–1920)', async ({ page }) => {
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('response', (r) => { if (r.url().startsWith('http://localhost') && r.status() >= 400) errores.push(`${r.status()} ${r.url()}`); });
  const desborde = [];
  for (const w of [320, 375, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/nosotros.html?w=' + w);
    await page.evaluate(() => document.querySelectorAll('.revelar').forEach((e) => e.classList.add('is-visible')));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) desborde.push(`${w}: ${sw}`);
  }
  expect(desborde).toEqual([]);
  expect(errores).toEqual([]);
});
