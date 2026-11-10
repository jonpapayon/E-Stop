// Solicitud de empleo (equipo.html). Envío real a FormSubmit NO se ejecuta: se intercepta,
// o se redirige a un receptor local para comprobar que el archivo viaja por red.
const { test, expect } = require('@playwright/test');
const http = require('http');

async function preparar(page, w = 1440, h = 900) {
  await page.setViewportSize({ width: w, height: h });
  await page.route(/googletagmanager|google-analytics|doubleclick/, (r) => r.abort());
}
const llenar = async (page) => { await page.fill('#name', 'Ana Lucía Ñúñez'); await page.fill('#email', 'ana@example.com'); await page.fill('#phone', '33 1234 5678'); };

test('contrato del formulario: backend PHP propio, multipart, trampa anti-bots', async ({ page }) => {
  await preparar(page);
  await page.goto('/equipo.html');
  const f = await page.locator('#form-equipo').evaluate((f) => ({ action: f.action, method: f.method, enctype: f.enctype, names: [...f.elements].filter((e) => e.name).map((e) => e.name) }));
  expect(f).toEqual({ action: 'http://localhost:8765/enviar-solicitud.php', method: 'post', enctype: 'multipart/form-data', names: ['empresa_web', 'name', 'email', 'phone', 'cv'] });
  // La trampa no es visible ni enfocable para personas
  expect(await page.locator('input[name="empresa_web"]').getAttribute('tabindex')).toBe('-1');
  await expect(page.locator('input[name="empresa_web"]')).not.toBeInViewport();
});

test('validación: obligatorios, formato de correo, celular de 10 dígitos, tipo y tamaño de CV', async ({ page }) => {
  await preparar(page);
  let enviados = 0;
  await page.route('**/enviar-solicitud.php', (r) => { enviados++; r.abort(); });
  await page.goto('/equipo.html');
  await page.locator('[data-enviar]').click();
  await expect(page.locator('[data-resumen]')).toHaveText('Revisa 3 campos antes de enviar.');
  await expect(page.locator('#err-name')).toHaveText('Escribe tu nombre.');
  await expect(page.locator('#err-email')).toHaveText('Escribe tu correo electrónico.');
  await expect(page.locator('#err-phone')).toHaveText('Escribe tu número de celular.');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('name');
  await page.fill('#name', 'Al'); await page.fill('#email', 'ana@correo'); await page.fill('#phone', '33 12 34');
  await page.setInputFiles('#cv', { name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('png') });
  await page.locator('[data-enviar]').click();
  await expect(page.locator('#err-name')).toHaveText('Escribe tu nombre completo.');
  await expect(page.locator('#err-email')).toContainText('Revisa el formato');
  await expect(page.locator('#err-phone')).toHaveText('Escribe un celular de 10 dígitos.');
  await expect(page.locator('#err-cv')).toContainText('PDF o Word');
  await expect(page.locator('#cv')).toHaveAttribute('aria-invalid', 'true');
  await page.setInputFiles('#cv', { name: 'cv-grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10.5 * 1024 * 1024, 1) });
  await page.locator('[data-enviar]').click();
  await expect(page.locator('#err-cv')).toContainText('el máximo es 10 MB');
  // +52 y separadores se aceptan; quitar el archivo limpia el error
  await llenar(page); await page.fill('#phone', '+52 (33) 1234-5678');
  await page.locator('[data-quitar]').click();
  await expect(page.locator('.archivo__nombre')).toHaveText('');
  await expect(page.locator('#err-cv')).toBeEmpty();
  await expect(page.locator('[data-resumen]')).toBeHidden();
  expect(enviados).toBe(0);
});

test('estado de carga y CV adjunto en el POST (interceptado)', async ({ page }) => {
  await preparar(page);
  let cap = null;
  await page.route('**/enviar-solicitud.php', async (r) => {
    cap = { method: r.request().method(), ct: r.request().headers()['content-type'] };
    await new Promise((res) => setTimeout(res, 800));                  // simula latencia para ver el estado de carga
    await r.fulfill({ status: 302, headers: { location: 'http://localhost:8765/equipo.html?result=success' } });
  });
  await page.goto('/equipo.html');
  await llenar(page);
  await page.setInputFiles('#cv', { name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 prueba') });
  await expect(page.locator('.archivo__nombre')).toHaveText(/cv\.pdf · \d+ KB/);
  // 1) Estado de carga: se retiene la navegación con un oyente posterior al del sitio
  await page.evaluate(() => { window.__retener = true; document.getElementById('form-equipo').addEventListener('submit', (e) => { if (window.__retener) e.preventDefault(); }); });
  await page.locator('[data-enviar]').click();
  await expect(page.locator('[data-enviar]')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('[data-enviar] [data-texto]')).toHaveText('Enviando solicitud y CV…');
  // 2) Envío real (interceptado): se libera la navegación
  await page.evaluate(() => { window.__retener = false; document.getElementById('form-equipo').requestSubmit(); });
  await expect(page).toHaveURL(/result=success/);
  expect(cap.method).toBe('POST');
  expect(cap.ct).toMatch(/^multipart\/form-data/);
});

test('el navegador envía el CV por red (receptor local en lugar del PHP)', async ({ page }) => {
  await preparar(page);
  const pdf = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');
  let recibido = null;
  const srv = http.createServer((req, res) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => { recibido = { ct: req.headers['content-type'], body: Buffer.concat(c) }; res.writeHead(302, { location: 'http://localhost:8765/equipo.html?result=success' }); res.end(); }); });
  await new Promise((r) => srv.listen(8767, '127.0.0.1', r));
  try {
    await page.goto('/equipo.html');
    await page.locator('#form-equipo').evaluate((f) => { f.action = 'http://localhost:8767/contacto@svp.com.mx'; });
    await llenar(page);
    await page.setInputFiles('#cv', { name: 'curriculum.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.locator('[data-enviar]').click();
    await expect(page).toHaveURL(/result=success/);
  } finally { srv.close(); }
  expect(recibido.ct).toMatch(/^multipart\/form-data; boundary=/);
  const i = recibido.body.indexOf(pdf);
  expect(i, 'PDF íntegro en el cuerpo').toBeGreaterThan(0);
  expect(recibido.body.subarray(Math.max(0, i - 200), i).toString('latin1')).toContain('name="cv"; filename="curriculum.pdf"');
  for (const campo of ['name="name"', 'name="email"', 'name="phone"', 'name="empresa_web"']) expect(recibido.body.toString('latin1')).toContain(campo);
});

test('confirmación tras el envío y evento de analítica una sola vez por sesión', async ({ page }) => {
  await preparar(page, 390, 844);
  await page.addInitScript(() => { window.dataLayer = []; });
  await page.goto('/equipo.html?result=success');
  await expect(page.locator('#form-equipo')).toBeHidden();
  await expect(page.locator('[data-confirmacion]')).toBeVisible();
  await expect(page.locator('#alert')).toContainText('Recibimos tu solicitud');
  await expect(page.locator('[data-confirmacion]')).toBeInViewport();
  const ev = async () => page.evaluate(() => window.dataLayer.filter((e) => e.event === 'estop_solicitud_empleo_completada').length);
  expect(await ev()).toBe(1);
  await page.reload();
  expect(await ev()).toBe(0);                                             // recarga: no se duplica
  // La página normal no dispara el evento
  await page.goto('/equipo.html');
  expect(await ev()).toBe(0);
});

test('móvil: sin desbordamiento, objetivos táctiles y orden lógico', async ({ page }) => {
  await preparar(page, 320, 700);
  await page.goto('/equipo.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const b = await page.locator('[data-enviar]').boundingBox();
  expect(b.height).toBeGreaterThanOrEqual(56);
  const interior = await page.locator('#form-equipo .form-acciones').boundingBox();
  expect(b.width).toBeGreaterThanOrEqual(interior.width - 1);           // a todo el ancho disponible
  const form = await page.locator('#form-equipo').boundingBox(), proceso = await page.locator('.form-pagina__lateral').boundingBox();
  expect(proceso.y).toBeGreaterThan(form.y);                             // primero el formulario, luego el contexto
});
