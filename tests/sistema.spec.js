// Fase 1A: sistema de diseño. Verifica la hoja de componentes (dev/sistema.html),
// los parciales y que las páginas públicas no se hayan tocado en esta fase.
const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const OUT = path.join(RAIZ, 'test-results', 'sistema');
fs.mkdirSync(OUT, { recursive: true });
const URL = '/dev/sistema.html';

test.beforeEach(async ({ page }) => {
  await page.route(/googletagmanager\.com|google-analytics\.com|doubleclick\.net|fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
});

test('parciales sincronizados (npm run partials:check)', () => {
  expect(() => execSync('node scripts/sync-partials.mjs --check', { cwd: RAIZ, stdio: 'pipe' })).not.toThrow();
});

test('carga sin errores, fuentes autoalojadas y sin recursos rotos', async ({ page }) => {
  const errores = [], rotos = [], externos = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) rotos.push(`${r.status()} ${r.url()}`); });
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:')) externos.push(r.url()); });
  await page.goto(URL);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  const fuentes = await page.evaluate(() => ({
    archivo: document.fonts.check('800 40px Archivo'),
    inter: document.fonts.check('400 16px Inter'),
    mono: document.fonts.check('500 12px "JetBrains Mono"'),
    cargadas: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
  }));
  expect(errores).toEqual([]);
  expect(rotos).toEqual([]);
  expect(externos, 'sin peticiones a terceros').toEqual([]);
  expect(fuentes.archivo && fuentes.inter && fuentes.mono, JSON.stringify(fuentes)).toBe(true);
  expect(await page.getAttribute('html', 'lang')).toBe('es');
});

test('contraste WCAG de pares de color del sistema', async ({ page }) => {
  await page.goto(URL);
  const pares = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement), v = (n) => cs.getPropertyValue(n).trim();
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((a, c, i) => a + c * [.2126, .7152, .0722][i], 0); };
    const r = (a, b) => { const [x, y] = [lum(v(a)), lum(v(b))].sort((m, n) => n - m); return +((x + .05) / (y + .05)).toFixed(2); };
    return {
      'tiza/asfalto': r('--c-tiza', '--c-asfalto'), 'niebla/asfalto': r('--c-niebla', '--c-asfalto'),
      'niebla/grafito': r('--c-niebla', '--c-grafito'), 'asfalto/señal': r('--c-asfalto', '--c-senal'),
      'asfalto/cal': r('--c-asfalto', '--c-cal'), 'señal/asfalto': r('--c-senal', '--c-asfalto'),
    };
  });
  fs.writeFileSync(path.join(OUT, 'contraste.json'), JSON.stringify(pares, null, 2));
  for (const [par, ratio] of Object.entries(pares)) expect(ratio, par).toBeGreaterThanOrEqual(4.5);
});

test('menú móvil: abre, foco atrapado, Esc cierra y devuelve el foco', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  const boton = page.locator('.hamburguesa'), menu = page.locator('#menu-movil');
  await expect(menu).toBeHidden();
  await boton.click();
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  await expect(menu).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/menu-abierto/);
  await page.waitForTimeout(400);
  const dentro = await page.evaluate(() => document.getElementById('menu-movil').contains(document.activeElement) || document.activeElement.classList.contains('hamburguesa'));
  expect(dentro).toBe(true);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');           // el foco no se escapa
  expect(await page.evaluate(() => document.getElementById('menu-movil').contains(document.activeElement) || document.activeElement.classList.contains('hamburguesa'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => document.activeElement.classList.contains('hamburguesa'))).toBe(true);
});

test('acordeón, chips y campo de archivo funcionan', async ({ page }) => {
  await page.goto(URL);
  const d = page.locator('.acordeon details').first();
  await d.locator('summary').click();
  await expect(d).toHaveAttribute('open', '');
  await page.waitForTimeout(500);
  await d.locator('summary').click();
  await page.waitForTimeout(600);
  await expect(d).not.toHaveAttribute('open', '');
  await page.locator('.chip:has(input[value="hospital"])').click();
  expect(await page.locator('input[value="hospital"]').isChecked()).toBe(true);
  await page.setInputFiles('.archivo input[type=file]', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await expect(page.locator('.archivo__nombre')).toContainText('cv.pdf');
  await expect(page.locator('.archivo')).toHaveClass(/has-archivo/);
});

test('responsive: sin desbordamiento y capturas en 6 anchos', async ({ page }) => {
  const desborde = [];
  for (const w of [320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(URL + '?w=' + w);
    await page.evaluate(() => document.querySelectorAll('.revelar').forEach((e) => e.classList.add('is-visible')));
    await page.evaluate(() => document.fonts.ready);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) desborde.push(`${w}: ${sw}`);
    if ([390, 1440].includes(w)) {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(OUT, `sistema-${w}-portada.png`) });
      await page.screenshot({ path: path.join(OUT, `sistema-${w}-completa.png`), fullPage: true });
    }
  }
  expect(desborde).toEqual([]);
});

test('solo se modifican los archivos públicos autorizados por fase', () => {
  // 1A: ninguno · 1B: Home (index.html + css/inicio.css), enlace faqs de equipo.html y
  // eliminación de assets/icons/modulo.svg (pedida por el cliente)
  const AUTORIZADOS = ['index.html', 'equipo.html', 'css/inicio.css', 'assets/icons/modulo.svg',
    // 1C: formulario de cotización por WhatsApp
    'cotizar.html', 'css/cotizacion.css',
    // 1D: Nosotros transformada; enlaces de WhatsApp a api.whatsapp.com (conversión GTM existente)
    'nosotros.html', 'css/empresa.css', 'evento.html', 'negocio.html'];
  const cambios = execSync('git diff --name-only f27ac64 -- "*.html" css/ main.js assets/images assets/logos assets/icons', { cwd: RAIZ }).toString()
    .split('\n').filter((f) => f && !/^(dev|partials)\//.test(f) && f !== 'css/sistema.css' && !AUTORIZADOS.includes(f));
  const nuevosSinSeguir = execSync('git ls-files --others --exclude-standard -- "*.html"', { cwd: RAIZ }).toString().split('\n').filter((f) => f && !/^(dev|partials)\//.test(f));
  expect(cambios, 'archivos públicos modificados').toEqual([]);
  expect(nuevosSinSeguir, 'páginas públicas nuevas').toEqual([]);
});
