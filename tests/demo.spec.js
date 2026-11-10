// Comportamiento exclusivo de la demostración en Vercel (*.vercel.app), simulado de verdad:
// el navegador resuelve «demo-estop.vercel.app» al servidor local, así el código ve ese dominio.
const { test, expect, chromium } = require('@playwright/test');

// Los dominios .app están en la lista HSTS precargada (solo HTTPS): se levanta un servidor HTTPS
// local con certificado autofirmado (creado con openssl en una carpeta temporal).
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const PUERTO = 8443;
const HOST = `https://demo-estop.vercel.app:${PUERTO}`;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.jpg': 'image/jpeg' };
let navegador, contexto, servidor;
test.beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estop-tls-'));
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=demo-estop.vercel.app" -keyout "${dir}/k.pem" -out "${dir}/c.pem"`, { stdio: 'ignore' });
  servidor = https.createServer({ key: fs.readFileSync(`${dir}/k.pem`), cert: fs.readFileSync(`${dir}/c.pem`) }, (req, res) => {
    const f = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'https://x').pathname));
    if (!f.startsWith(RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  await new Promise((r) => servidor.listen(PUERTO, '127.0.0.1', r));
  const exe = test.info().project.use.launchOptions?.executablePath;
  navegador = await chromium.launch({ executablePath: exe, args: ['--host-resolver-rules=MAP demo-estop.vercel.app 127.0.0.1'] });
  contexto = await navegador.newContext({ ignoreHTTPSErrors: true });
});
test.afterAll(async () => { await navegador?.close(); servidor?.close(); });

for (const [p, sel, php] of [['evento.html', '#form-evento', 'send_mail_evento.php'], ['negocio.html', '#form-negocios', 'send_mail_negocio.php']]) {
  test(`${p} en Vercel: aviso de vista previa en lugar de un error (no hay PHP)`, async () => {
    const page = await contexto.newPage();
    let enviado = false;
    await page.route('**/' + php, (r) => { enviado = true; r.abort(); });
    await page.goto(`${HOST}/${p}`);
    await page.locator(`${sel} button[type=submit]`).click();             // vacío: validación nativa, sin aviso
    await expect(page.locator('#alert')).toBeEmpty();
    await page.fill('#name', 'Cliente Demo'); await page.fill('#email', 'demo@example.com'); await page.fill('#phone', '3312345678');
    await page.locator(`${sel} button[type=submit]`).click();
    await expect(page.locator('#alert')).toHaveClass(/alert-info/);
    await expect(page.locator('#alert')).toContainText('Vista previa');
    expect(enviado).toBe(false);
    await page.close();
  });
}

test('equipo.html en Vercel: aviso de vista previa (no hay PHP) y ningún envío', async () => {
  const page = await contexto.newPage();
  let enviado = false;
  await page.route('**/enviar-solicitud.php', (r) => { enviado = true; r.abort(); });
  await page.goto(`${HOST}/equipo.html`);
  expect(await page.locator('#form-equipo').getAttribute('action')).toBe('enviar-solicitud.php');
  await page.fill('#name', 'Cliente Demo'); await page.fill('#email', 'demo@example.com'); await page.fill('#phone', '3312345678');
  await page.locator('[data-enviar]').click();
  await expect(page.locator('[data-resumen]')).toContainText('Vista previa');
  await expect(page.locator('[data-resumen]')).toHaveClass(/form-resumen--info/);
  expect(enviado).toBe(false);
  await page.close();
});

test('fuera de Vercel nada cambia: los formularios envían a su PHP', async ({ page }) => {
  let enviado = false;
  await page.route('**/send_mail_evento.php', (r) => { enviado = true; r.fulfill({ status: 302, headers: { location: 'http://localhost:8765/evento.html?result=success' } }); });
  await page.goto('/evento.html');
  await page.fill('#name', 'Prueba'); await page.fill('#email', 'p@example.com'); await page.fill('#phone', '3312345678');
  await page.locator('#form-evento button[type=submit]').click();
  await expect(page).toHaveURL(/result=success/);
  expect(enviado).toBe(true);
});
