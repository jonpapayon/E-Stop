// Pruebas de la Etapa 0. Ninguna petición sale a servicios reales:
// GTM/Google Ads se bloquean (para no contaminar la analítica del cliente) y los
// envíos de formularios (PHP / FormSubmit) se interceptan y se inspeccionan.
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const PAGES = ['index.html', 'nosotros.html', 'cotizar.html', 'evento.html',
  'negocio.html', 'equipo.html', 'privacidad.html', '404.html'];
const SHOTS = path.join(__dirname, '..', 'test-results', 'capturas');
const SITE_DIR = path.join(__dirname, '..');

// Menú móvil: funciona con el diseño nuevo (.hamburguesa) y con el antiguo (#open/#close)
async function probarMenu(page) {
  if (await page.locator('.hamburguesa').count()) {
    const menu = page.locator('#menu-movil'), b = page.locator('.hamburguesa');
    const antes = await menu.isHidden();
    await b.click(); await page.waitForTimeout(700);
    const abre = await menu.isVisible();
    await b.click(); await page.waitForTimeout(700);
    return { abre: antes && abre, cierra: await menu.isHidden() };
  }
  const nav = page.locator('nav');
  await page.locator('#open').click(); const abre = await nav.isVisible();
  await page.locator('#close').click(); return { abre, cierra: await nav.isHidden() };
}


test.beforeEach(async ({ page }) => {
  await page.route(/googletagmanager\.com|google-analytics\.com|doubleclick\.net/, r => r.abort());
});

function trackLocal404(page) {
  const broken = [];
  page.on('response', r => {
    if (r.url().startsWith('http://localhost') && r.status() >= 400) broken.push(`${r.status()} ${r.url()}`);
  });
  return broken;
}

test.describe('Todas las páginas', () => {
  for (const p of PAGES) {
    test(`${p}: carga, idioma, recursos, enlaces de contacto`, async ({ page }) => {
      const broken = trackLocal404(page);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const res = await page.goto('/' + p);
      expect(res.status()).toBe(200);
      await page.waitForLoadState('load');
      expect(await page.getAttribute('html', 'lang')).toBe('es');
      expect(broken, 'recursos locales rotos').toEqual([]);
      expect(errors, 'errores JS').toEqual([]);
      expect(await page.locator('button a').count(), '<a> dentro de <button>').toBe(0);
      await expect(page.locator('body')).not.toContainText('Avsiso');

      // WhatsApp con código de país
      const wa = page.locator('a.btn-whatsapp');
      if (await wa.count()) {
        const href = await wa.getAttribute('href');
        expect(href).toMatch(/^https:\/\/wa\.me\/523338704157\?text=/);
        expect(await wa.getAttribute('aria-label')).toBeTruthy();
      }
      // Teléfono clicable en el footer
      if (await page.locator('footer').count()) {
        await expect(page.locator('footer a[href="tel:+523338704157"]')).toHaveText('33 3870 4157');
      }
      // Imágenes sin alt (atributo ausente)
      expect(await page.locator('img:not([alt])').count()).toBe(0);
    });
  }
});

test('index: og:image propia y CTAs navegan', async ({ page }) => {
  await page.goto('/index.html');
  const og = await page.getAttribute('meta[property="og:image"]', 'content');
  expect(og).not.toContain('metatags.io');
  expect(og).toMatch(/^https:\/\/svp\.com\.mx\//);
  // la imagen og existe en el repo
  expect(fs.existsSync(path.join(SITE_DIR,
    decodeURIComponent(new URL(og).pathname)))).toBe(true);
  // GTM y Google Ads siguen presentes (sincronizados desde producción)
  const html = await page.content();
  expect(html).toContain('GTM-PMX8X4DW');
  expect(html).toContain('AW-16538094770');

  // El CTA del hero es clicable en toda su área (no solo el texto)
  await page.waitForTimeout(1600); // fin de la animación de entrada
  const cta = page.locator('.hero a.boton').first();
  const box = await cta.boundingBox();
  await page.mouse.click(box.x + 4, box.y + box.height - 4); // esquina, fuera del texto
  await expect(page).toHaveURL(/cotizar\.html\?tipo=evento$/);
  await page.goto('/cotizar.html');
  await page.locator('a[href="./evento.html"]').click();
  await expect(page).toHaveURL(/evento\.html$/);
});

test('index: FAQs abren y cierran', async ({ page }) => {
  await page.goto('/index.html');
  const d = page.locator('details').first();
  await d.locator('summary').click();
  await expect(d).toHaveAttribute('open', '');
  await d.locator('summary').click();
  await expect(d).not.toHaveAttribute('open', '');
  expect(await page.locator('details').count()).toBe(10);
});

test('menú móvil abre y cierra', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/index.html');
  const r = await probarMenu(page);
  expect(r).toEqual({ abre: true, cierra: true });
});

// ---------- Formularios ----------
async function interceptPost(page, pattern, redirectTo) {
  const captured = {};
  await page.route(pattern, async route => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    captured.method = req.method();
    captured.url = req.url();
    captured.contentType = req.headers()['content-type'] || '';
    captured.body = req.postDataBuffer() ? req.postDataBuffer().toString('latin1') : '';
    await route.fulfill({ status: 302, headers: { location: redirectTo } });
  });
  return captured;
}

test('evento: validación de requeridos bloquea envío vacío', async ({ page }) => {
  let sent = false;
  await page.route('**/send_mail_evento.php', r => { sent = true; r.abort(); });
  await page.goto('/evento.html');
  await page.locator('#form-evento button[type=submit]').click();
  await page.waitForTimeout(500);
  expect(sent).toBe(false);
  expect(await page.locator('#name').evaluate(e => e.validity.valueMissing)).toBe(true);
});

test('evento: envía POST con los datos y muestra aviso de éxito', async ({ page }) => {
  const cap = await interceptPost(page, '**/send_mail_evento.php', '/evento.html?result=success');
  await page.goto('/evento.html');
  await page.fill('#name', 'Prueba Playwright');
  await page.fill('#email', 'prueba@example.com');
  await page.fill('#phone', '3300000000');
  await page.locator('#form-evento button[type=submit]').click();
  await expect(page).toHaveURL(/result=success/);
  expect(cap.method).toBe('POST');
  const body = new URLSearchParams(cap.body);
  expect(body.get('name')).toBe('Prueba Playwright');
  expect(body.get('email')).toBe('prueba@example.com');
  expect(body.get('phone')).toBe('3300000000');
  expect(body.get('tipo')).toBe('evento');
  await expect(page.locator('#alert')).toBeVisible();
  await expect(page.locator('#alert')).toContainText('enviado con éxito');
  await expect(page.locator('#alert')).toHaveClass(/alert-success/);
});

test('negocio: envía tipo de negocio corregido y muestra aviso de error', async ({ page }) => {
  const cap = await interceptPost(page, '**/send_mail_negocio.php', '/negocio.html?result=error');
  await page.goto('/negocio.html');
  await expect(page.locator('#alert')).toBeHidden(); // vacío = oculto
  await page.check('#restaurante');
  await page.fill('#name', 'Prueba Playwright');
  await page.fill('#email', 'prueba@example.com');
  await page.fill('#phone', '3300000000');
  await page.locator('#form-negocios button[type=submit]').click();
  await expect(page).toHaveURL(/result=error/);
  const body = new URLSearchParams(cap.body);
  expect(cap.method).toBe('POST');
  expect(body.get('tipoNegocio')).toBe('restaurante');
  await expect(page.locator('#alert')).toBeVisible();
  await expect(page.locator('#alert')).toHaveClass(/alert-danger/);
});

test('equipo: el CV viaja adjunto (multipart) a FormSubmit', async ({ page }) => {
  const cap = await interceptPost(page, 'https://formsubmit.co/**', 'http://localhost:8765/equipo.html?result=success');
  await page.goto('/equipo.html');
  await page.fill('#name', 'Prueba Playwright');
  await page.fill('#email', 'prueba@example.com');
  await page.fill('#phone', '3300000000');
  await page.setInputFiles('#cv', { name: 'cv-prueba.pdf', mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 CONTENIDO-DE-PRUEBA') });
  await page.locator('#form-equipo button[type=submit]').click();
  await expect(page).toHaveURL(/result=success/);
  expect(cap.method).toBe('POST');
  expect(cap.url).toBe('https://formsubmit.co/contacto@svp.com.mx');
  expect(cap.contentType).toContain('multipart/form-data');
  expect(cap.body).toContain('filename="cv-prueba.pdf"');
  expect(cap.body).toContain('CONTENIDO-DE-PRUEBA');
  expect(cap.body).toContain('https://svp.com.mx/equipo.html?result=success'); // _next absoluto
  await expect(page.locator('#alert')).toContainText('Recibimos tu solicitud');
});

// ---------- Capturas responsive (evidencia visual, no falla) ----------
test('capturas responsive', async ({ page }) => {
  test.setTimeout(120000);
  fs.mkdirSync(SHOTS, { recursive: true });
  const tag = process.env.SHOT_TAG || 'etapa0';
  const overflow = [];
  for (const w of [375, 768, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of ['index.html', 'nosotros.html', 'evento.html', 'negocio.html', 'equipo.html']) {
      await page.goto('/' + p);
      await page.waitForLoadState('load');
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      if (sw > w) overflow.push(`${p} @${w}px: scrollWidth ${sw}`);
      await page.screenshot({ path: path.join(SHOTS, `${tag}-${p.replace('.html', '')}-${w}.png`), fullPage: true });
    }
  }
  test.info().annotations.push({ type: 'overflow', description: overflow.join(' | ') || 'ninguno' });
  console.log('Desbordamiento horizontal:', overflow.length ? overflow : 'ninguno');
});
