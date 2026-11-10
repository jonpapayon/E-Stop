// Prueba REAL del backend PHP de empleo: el navegador envía el formulario a enviar-solicitud.php
// ejecutado por PHP (php -S), que manda el correo por SMTP autenticado a un servidor local de captura.
// Se omite si PHP no está instalado. No sale ningún correo a Internet.
const { test, expect } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crearServidorSmtp, partesMime } = require('./utilidades/smtp-captura');

const RAIZ = path.join(__dirname, '..');
const PHP = (() => { try { return execSync('command -v php', { shell: '/bin/zsh' }).toString().trim(); } catch { return ''; } })();
const PUERTO_PHP = 8770, PUERTO_SMTP = 2525;
const BASE = `http://127.0.0.1:${PUERTO_PHP}`;
const CRED = { usuario: 'formularios@estop.test', contrasena: 'clave-de-prueba' };
test.describe.configure({ mode: 'serial' });

let smtp, servidorPhp, dir;
function arrancarPhp(env, ini = ['-d', 'upload_max_filesize=10M', '-d', 'post_max_size=12M']) {
  return new Promise((ok, mal) => {
    const p = spawn(PHP, [...ini, '-S', `127.0.0.1:${PUERTO_PHP}`, '-t', RAIZ], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.registro = '';
    const leer = (d) => { p.registro += d; if (/Development Server .* started/.test(String(d))) ok(p); };
    p.stdout.on('data', leer); p.stderr.on('data', leer);
    p.on('error', mal); setTimeout(() => ok(p), 2500);
  });
}
const config = (extra = {}) => {
  const f = path.join(dir, `correo-${Date.now()}-${Math.random().toString(36).slice(2)}.php`);
  const c = { transporte: 'smtp', smtp_host: '127.0.0.1', smtp_puerto: PUERTO_SMTP, smtp_seguridad: 'ninguna', smtp_usuario: CRED.usuario, smtp_contrasena: CRED.contrasena,
    remitente: 'formularios@estop.test', remitente_nombre: 'Sitio web E-Stop', destinatario: 'rrhh@estop.test', ...extra };
  fs.writeFileSync(f, '<?php return ' + JSON.stringify(c).replace(/\{/g, '[').replace(/\}/g, ']').replace(/":/g, '" =>') + ';');
  return f;
};
async function conPhp(env, fn, ini) { servidorPhp = await arrancarPhp(env, ini); try { await fn(); } finally { servidorPhp.kill(); await new Promise((r) => setTimeout(r, 300)); } }
const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1'), Buffer.alloc(300 * 1024, 0x41), Buffer.from('\n%%EOF\n')]);   // ~300 KB
async function llenar(page, archivo) {
  await page.fill('#name', 'María José Peña');
  await page.fill('#email', 'maria.pena@example.com');
  await page.fill('#phone', '33 1234 5678');
  if (archivo) await page.setInputFiles('#cv', archivo);
}

test.beforeAll(async () => {
  test.skip(!PHP, 'PHP no está instalado: la prueba real del backend se omite');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estop-php-'));
  smtp = crearServidorSmtp(CRED); await smtp.iniciar(PUERTO_SMTP);
});
test.afterAll(async () => { await smtp?.cerrar(); });

test('envío real: SMTP autenticado, datos correctos y CV adjunto íntegro', async ({ page }) => {
  test.skip(!PHP, 'sin PHP');
  const tmpAntes = fs.readdirSync(os.tmpdir()).filter((f) => /^php/.test(f)).length;
  await conPhp({ ESTOP_CONFIG_CORREO: config() }, async () => {
    await page.goto(`${BASE}/equipo.html`);
    await llenar(page, { name: 'Currículum María.pdf', mimeType: 'application/pdf', buffer: pdf });
    await page.locator('[data-enviar]').click();
    await expect(page).toHaveURL(/equipo\.html\?result=success$/);
    await expect(page.locator('[data-confirmacion]')).toBeVisible();
  });
  expect(smtp.intentosAuth.at(-1)).toEqual({ usuario: CRED.usuario, ok: true });
  const m = smtp.mensajes.at(-1);
  expect(m.de).toContain('formularios@estop.test');
  expect(m.para.join()).toContain('rrhh@estop.test');
  expect(m.datos).toMatch(/^Reply-To: =\?utf-8\?.*<maria\.pena@example\.com>|^Reply-To: .*maria\.pena@example\.com/mi);
  expect(m.datos).toMatch(/^Subject: Nueva solicitud de empleo - svp\.com\.mx/m);
  const partes = partesMime(m.datos);
  const texto = partes.find((p) => /text\/plain/i.test(p.cabeceras));
  const plano = /base64/i.test(texto.cabeceras) ? Buffer.from(texto.cuerpo.replace(/\s+/g, ''), 'base64').toString('utf8') : texto.cuerpo.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  expect(Buffer.from(plano, 'latin1').toString('utf8') + plano).toMatch(/Mar(í|Ã­)a Jos(é|Ã©) Pe(ñ|Ã±)a/);
  expect(plano).toContain('maria.pena@example.com');
  expect(plano).toContain('33 1234 5678');
  const adj = partes.find((p) => /Content-Disposition: attachment/i.test(p.cabeceras));
  expect(adj, 'hay adjunto').toBeTruthy();
  expect(adj.cabeceras).toMatch(/filename=.*CV - Mar.*\.pdf|filename\*?=/i);
  expect(adj.cabeceras).toMatch(/application\/pdf/i);
  expect(Buffer.from(adj.cuerpo.replace(/\s+/g, ''), 'base64').equals(pdf), 'el CV llega byte a byte').toBe(true);
  // Sin almacenamiento: no quedan archivos subidos en el temporal ni en el proyecto
  expect(fs.readdirSync(os.tmpdir()).filter((f) => /^php/.test(f)).length).toBeLessThanOrEqual(tmpAntes);
  expect(execSync('git status --porcelain --untracked-files=all', { cwd: RAIZ }).toString()).not.toMatch(/\.pdf|uploads?\//i);
});

test('envío sin CV (el CV es opcional)', async ({ page }) => {
  test.skip(!PHP, 'sin PHP');
  const antes = smtp.mensajes.length;
  await conPhp({ ESTOP_CONFIG_CORREO: config() }, async () => {
    await page.goto(`${BASE}/equipo.html`);
    await llenar(page);
    await page.locator('[data-enviar]').click();
    await expect(page).toHaveURL(/result=success$/);
  });
  expect(smtp.mensajes.length).toBe(antes + 1);
  expect(smtp.mensajes.at(-1).datos).not.toMatch(/Content-Disposition: attachment/i);
});

test('el servidor rechaza datos inválidos, archivos falsos y bots sin enviar correo', async ({ page, request }) => {
  test.skip(!PHP, 'sin PHP');
  const antes = smtp.mensajes.length;
  await conPhp({ ESTOP_CONFIG_CORREO: config() }, async () => {
    const post = (campos) => request.post(`${BASE}/enviar-solicitud.php`, { multipart: campos, maxRedirects: 0 });
    const destino = (r) => r.headers().location;
    // Validación en servidor (sin depender del JavaScript del navegador)
    expect(destino(await post({ name: 'Al', email: 'x@example.com', phone: '3312345678' }))).toBe('equipo.html?result=error&motivo=validacion');
    expect(destino(await post({ name: 'Ana Ruiz', email: 'no-es-correo', phone: '3312345678' }))).toBe('equipo.html?result=error&motivo=validacion');
    expect(destino(await post({ name: 'Ana Ruiz', email: 'a@example.com', phone: '123' }))).toBe('equipo.html?result=error&motivo=validacion');
    // Extensión permitida pero contenido falso (una imagen renombrada a .pdf)
    const png = Buffer.from('89504E470D0A1A0A0000000D49484452', 'hex');
    expect(destino(await post({ name: 'Ana Ruiz', email: 'a@example.com', phone: '3312345678', cv: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: png } }))).toBe('equipo.html?result=error&motivo=archivo');
    // Extensión no permitida
    expect(destino(await post({ name: 'Ana Ruiz', email: 'a@example.com', phone: '3312345678', cv: { name: 'cv.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') } }))).toBe('equipo.html?result=error&motivo=archivo');
    // Trampa para bots: responde «éxito» pero no envía nada
    expect(destino(await post({ name: 'Bot Bot', email: 'b@example.com', phone: '3312345678', empresa_web: 'spam.com' }))).toBe('equipo.html?result=success');
    // Solo POST
    expect((await request.get(`${BASE}/enviar-solicitud.php`)).status()).toBe(405);
    // El navegador muestra el motivo del error
    await page.goto(`${BASE}/equipo.html?result=error&motivo=archivo`);
    await expect(page.locator('[data-resumen]')).toContainText('El currículum no es válido');
  });
  expect(smtp.mensajes.length, 'ningún correo enviado').toBe(antes);
});

test('archivo mayor a 10 MB y límites de PHP del hosting', async ({ request }) => {
  test.skip(!PHP, 'sin PHP');
  const grande = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(10.5 * 1024 * 1024, 0x41)]);
  const campos = { name: 'Ana Ruiz', email: 'a@example.com', phone: '3312345678', cv: { name: 'cv.pdf', mimeType: 'application/pdf', buffer: grande } };
  await conPhp({ ESTOP_CONFIG_CORREO: config() }, async () => {
    const r = await request.post(`${BASE}/enviar-solicitud.php`, { multipart: campos, maxRedirects: 0 });
    expect(r.headers().location).toBe('equipo.html?result=error&motivo=tamano');
  });
  // Con los límites por defecto de PHP (2 MB / 8 MB) un CV de 3 MB también se rechaza con un mensaje claro:
  // por eso el despliegue exige subir upload_max_filesize/post_max_size en cPanel (ver DESPLIEGUE-CPANEL.md).
  await conPhp({ ESTOP_CONFIG_CORREO: config() }, async () => {
    const tres = { ...campos, cv: { ...campos.cv, buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(3 * 1024 * 1024, 0x41)]) } };
    const r = await request.post(`${BASE}/enviar-solicitud.php`, { multipart: tres, maxRedirects: 0 });
    expect(r.headers().location).toBe('equipo.html?result=error&motivo=tamano');
  }, []);
});

test('fallos de envío: contraseña SMTP incorrecta o sin configuración → error controlado', async ({ request }) => {
  test.skip(!PHP, 'sin PHP');
  const campos = { name: 'Ana Ruiz', email: 'a@example.com', phone: '3312345678' };
  await conPhp({ ESTOP_CONFIG_CORREO: config({ smtp_contrasena: 'incorrecta' }) }, async () => {
    const r = await request.post(`${BASE}/enviar-solicitud.php`, { multipart: campos, maxRedirects: 0 });
    expect(r.headers().location).toBe('equipo.html?result=error&motivo=envio');
  });
  expect(smtp.intentosAuth.at(-1).ok).toBe(false);
  await conPhp({ ESTOP_CONFIG_CORREO: path.join(dir, 'no-existe.php') }, async () => {
    const r = await request.post(`${BASE}/enviar-solicitud.php`, { multipart: campos, maxRedirects: 0 });
    expect(r.headers().location).toBe('equipo.html?result=error&motivo=envio');
    expect(servidorPhp.registro).not.toMatch(/Ana Ruiz|a@example\.com/);   // el registro de errores no expone datos personales
  });
});

test('lib/ y config/ protegidos con .htaccess (Apache/LiteSpeed en cPanel)', () => {
  for (const d of ['lib', 'config']) expect(fs.readFileSync(path.join(RAIZ, d, '.htaccess'), 'utf8')).toMatch(/Require all denied/);
  expect(fs.existsSync(path.join(RAIZ, 'config', 'correo.php')), 'nunca credenciales reales en el repositorio').toBe(false);
});
