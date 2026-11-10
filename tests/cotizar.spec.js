// Cotización por WhatsApp (cotizar.html). No se abre WhatsApp: window.open se intercepta
// y se inspecciona la URL exacta que se habría abierto.
const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const NUMERO = '523338704157';

async function preparar(page, w = 1440, h = 900) {
  await page.addInitScript(() => { window.__abiertos = []; window.open = (u, t, f) => { window.__abiertos.push({ u, t, f }); return null; }; });
  await page.route(/googletagmanager|google-analytics|doubleclick/, (r) => r.abort());
  await page.setViewportSize({ width: w, height: h });
}
const abiertos = (page) => page.evaluate(() => window.__abiertos);
const enDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

test('carga limpia, número oficial y sin desbordamiento (320–1920)', async ({ page }) => {
  await preparar(page);
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto('/cotizar.html');
  expect(await page.getAttribute('#form-cotizacion', 'data-whatsapp')).toBe(NUMERO);
  // Mismo número que el resto del sitio
  const sitio = await page.$$eval('a[href*="whatsapp"], a[href*="wa.me"]', (a) => [...new Set(a.map((e) => { const u = new URL(e.href); return u.searchParams.get('phone') || u.pathname.slice(1); }))]);
  expect(sitio).toEqual([NUMERO]);
  expect(await page.locator('h1').count()).toBe(1);
  const desborde = [];
  for (const w of [320, 375, 390, 414, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.locator('input[name="servicio"][value="negocio"]').check({ force: true });
    await page.locator('label.chip:has(input[value="sí"])').click();
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (sw > w) desborde.push(`${w}: ${sw}`);
  }
  expect(desborde).toEqual([]);
  expect(errores).toEqual([]);
});

test('validación: envío vacío bloqueado, errores accesibles y foco en el primer campo', async ({ page }) => {
  await preparar(page);
  await page.goto('/cotizar.html');
  await page.locator('.cot__boton').click();
  await expect(page.locator('#cot-errores')).toBeVisible();
  await expect(page.locator('#cot-errores')).toHaveText('Revisa 1 campo antes de enviar.');
  await expect(page.locator('#err-servicio')).toHaveText(/evento o para un negocio/);
  await expect(page.locator('input[name="servicio"]').first()).toHaveAttribute('aria-invalid', 'true');
  expect(await page.evaluate(() => document.activeElement.name)).toBe('servicio');
  expect(await abiertos(page)).toEqual([]);

  // Evento: fecha y nombre obligatorios; números fuera de rango
  await page.locator('label.servicio__opcion:has(input[value="evento"])').click();
  await page.fill('#dias', '99');
  await page.fill('#invitados', '0');
  await page.locator('.cot__boton').click();
  await expect(page.locator('#cot-errores')).toHaveText('Revisa 4 campos antes de enviar.');
  await expect(page.locator('#err-fecha')).toHaveText('Indica la fecha del evento.');
  await expect(page.locator('#err-dias')).toContainText('entre 1 y 60');
  await expect(page.locator('#err-invitados')).toContainText('número válido');
  await expect(page.locator('#err-nombre')).toHaveText('Escribe tu nombre.');
  expect(await page.evaluate(() => document.activeElement.id)).toBe('fecha');
  // Fecha pasada
  await page.fill('#fecha', enDias(-3));
  await page.locator('.cot__boton').click();
  await expect(page.locator('#err-fecha')).toHaveText('La fecha no puede ser anterior a hoy.');
  // Los errores se limpian al corregir
  await page.fill('#fecha', enDias(10)); await page.fill('#dias', '2'); await page.fill('#invitados', '120'); await page.fill('#nombre', 'Ana');
  await expect(page.locator('#cot-errores')).toBeHidden();
  await expect(page.locator('#err-fecha')).toBeEmpty();
  expect(await abiertos(page)).toEqual([]);   // corregir no envía: hay que pulsar el botón
  // Negocio: tipo obligatorio
  await page.locator('label.servicio__opcion:has(input[value="negocio"])').click();
  await page.locator('.cot__boton').click();
  await expect(page.locator('#err-tipoNegocio')).toHaveText('Elige el tipo de negocio.');
  expect(await abiertos(page)).toEqual([]);
});

test('evento: mensaje completo, acentos y caracteres especiales bien codificados', async ({ page }) => {
  await preparar(page);
  await page.goto('/cotizar.html?tipo=evento');
  await expect(page.locator('input[name="servicio"][value="evento"]')).toBeChecked();
  const fecha = enDias(21);
  await page.fill('#fecha', fecha);
  await page.fill('#dias', '2');
  await page.fill('#invitados', '1500');
  await page.fill('#lugar', 'Jardín Los Álamos #12, Zapopan');
  await page.locator('label.chip:has(input[value="sí"])').click();
  await page.fill('#cajones', '60');
  await page.fill('#nombre', 'María José Peña Ñúñez');
  await page.fill('#mensaje', 'Acceso por Niños Héroes & Juárez (50% techado) + 2 rampas?\n¿Llevan sombrillas? 🚗 "VIP"/staff');
  await page.locator('.cot__boton').click();

  const ab = await abiertos(page);
  expect(ab).toHaveLength(1);
  expect(ab[0].t).toBe('_blank');
  expect(ab[0].f).toBe('noopener');
  const url = ab[0].u;
  expect(url.startsWith(`https://wa.me/${NUMERO}?text=`)).toBe(true);
  const crudo = url.split('?text=')[1];
  // Codificación: sin espacios ni caracteres reservados sin escapar
  expect(crudo).not.toMatch(/[ &#?"\n]/);
  for (const [car, cod] of [['ñ', '%C3%B1'], ['Ñ', '%C3%91'], ['á', '%C3%A1'], ['é', '%C3%A9'], ['ú', '%C3%BA'], ['¿', '%C2%BF'], ['&', '%26'], ['#', '%23'], ['%', '%25'], ['+', '%2B'], ['?', '%3F'], ['/', '%2F'], ['"', '%22'], ['\n', '%0A'], ['🚗', '%F0%9F%9A%97']]) {
    expect(crudo, `codificación de ${JSON.stringify(car)}`).toContain(cod);
  }
  const fechaLarga = await page.evaluate((iso) => { const [y, m, d] = iso.split('-').map(Number); const f = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return f[0].toUpperCase() + f.slice(1); }, fecha);
  const esperado = [
    'Hola, quiero cotizar valet parking con E-Stop.', '',
    '*Servicio:* Evento',
    `*Fecha:* ${fechaLarga}`,
    '*Días:* 2',
    '*Invitados:* 1,500 aprox.',
    '*Lugar:* Jardín Los Álamos #12, Zapopan',
    '*Estacionamiento en el lugar:* Sí, 60 cajones',
    '*Nombre:* María José Peña Ñúñez', '',
    '*Comentarios:*',
    'Acceso por Niños Héroes & Juárez (50% techado) + 2 rampas?\n¿Llevan sombrillas? 🚗 "VIP"/staff', '',
    '_Enviado desde svp.com.mx_',
  ].join('\n');
  expect(decodeURIComponent(crudo)).toBe(esperado);
  expect(new URL(url).searchParams.get('text')).toBe(esperado);     // como lo leerá WhatsApp
  // La vista previa muestra exactamente el mismo texto
  expect(await page.locator('[data-vista]').textContent()).toBe(esperado);
  // Confirmación y enlace de respaldo por si el navegador bloquea la ventana
  await expect(page.locator('[data-listo]')).toBeVisible();
  expect(await page.getAttribute('[data-enlace-wa]', 'href')).toBe(url);
});

test('negocio: preselección por URL, días, horario nocturno y campos del otro servicio excluidos', async ({ page }) => {
  await preparar(page);
  await page.goto('/cotizar.html?tipo=evento');
  await page.fill('#lugar', 'NO DEBE APARECER');                    // dato de evento
  await page.goto('/cotizar.html?tipo=hospital');
  await expect(page.locator('input[name="servicio"][value="negocio"]')).toBeChecked();
  await expect(page.locator('input[name="tipoNegocio"][value="hospital"]')).toBeChecked();
  await expect(page.locator('[data-grupo="evento"]')).toBeHidden();
  for (const d of ['lunes', 'martes', 'miércoles', 'jueves', 'viernes']) await page.locator(`label.chip:has(input[value="${d}"])`).click();
  await page.fill('#horaInicio', '20:00');
  await page.fill('#horaFin', '03:00');
  await page.fill('#ubicacion', 'Av. López Mateos Sur 2375');
  await page.locator('label.chip:has(input[value="no"])').click();
  await expect(page.locator('[data-cajones]')).toBeHidden();
  await page.fill('#nombre', 'Dirección Administrativa');
  // Cambiar a evento y volver: lo escrito en un grupo oculto no se envía
  await page.locator('label.servicio__opcion:has(input[value="evento"])').click();
  await page.fill('#lugar', 'Salón temporal');
  await page.locator('label.servicio__opcion:has(input[value="negocio"])').click();
  await page.locator('.cot__boton').click();
  const texto = new URL((await abiertos(page))[0].u).searchParams.get('text');
  expect(texto).toBe([
    'Hola, quiero cotizar valet parking con E-Stop.', '',
    '*Servicio:* Negocio',
    '*Tipo de negocio:* Hospital',
    '*Días de servicio:* Lunes a viernes',
    '*Horario:* 20:00 a 03:00 (cruza la medianoche)',
    '*Ubicación:* Av. López Mateos Sur 2375',
    '*Estacionamiento en el lugar:* No',
    '*Nombre:* Dirección Administrativa', '',
    '_Enviado desde svp.com.mx_',
  ].join('\n'));
  expect(texto).not.toContain('Salón temporal');
  expect(texto).not.toContain('Fecha');
});

test('teclado: selector de servicio con flechas y envío con Enter', async ({ page }) => {
  await preparar(page);
  await page.goto('/cotizar.html');
  await page.locator('input[name="servicio"][value="evento"]').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('input[name="servicio"][value="evento"]')).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('input[name="servicio"][value="negocio"]')).toBeChecked();
  await page.locator('input[name="tipoNegocio"][value="oficina"]').focus();
  await page.keyboard.press('Space');
  await page.locator('#nombre').fill('Luis');
  await page.keyboard.press('Enter');
  expect(await abiertos(page)).toHaveLength(1);
});

test('móvil: orden campos → vista previa → botón, botón a todo el ancho y envío', async ({ page }) => {
  await preparar(page, 390, 844);
  await page.goto('/cotizar.html?tipo=restaurante');
  const caja = async (s) => page.locator(s).boundingBox();
  const campos = await caja('.cot__campos'), ticket = await caja('.cot__ticket'), boton = await caja('.cot__boton');
  expect(ticket.y).toBeGreaterThan(campos.y + campos.height - 2);
  expect(boton.y).toBeGreaterThan(ticket.y + ticket.height - 2);
  expect(boton.width).toBeGreaterThan(390 - 2 * 24);
  expect(boton.height).toBeGreaterThanOrEqual(56);                // objetivo táctil cómodo
  await expect(page.locator('.barra-movil')).toBeVisible();
  // Objetivos táctiles de chips ≥ 44px
  const chip = await caja('label.chip:has(input[value="lunes"]) span');
  expect(chip.height).toBeGreaterThanOrEqual(44);
  await page.fill('#nombre', 'Restaurante Prueba');
  await page.locator('.cot__boton').click();
  const texto = new URL((await abiertos(page))[0].u).searchParams.get('text');
  expect(texto).toContain('*Tipo de negocio:* Restaurante');
});

test('integración: CTAs de la Home llevan al formulario y los formularios PHP siguen intactos', async ({ page }) => {
  await preparar(page);
  await page.goto('/index.html');
  await page.waitForTimeout(1600);
  await page.locator('.hero a.boton').first().click();
  await expect(page).toHaveURL(/cotizar\.html\?tipo=evento$/);
  await expect(page.locator('input[name="servicio"][value="evento"]')).toBeChecked();
  await page.goto('/index.html#servicios');
  await page.locator('#servicios a.fila', { hasText: 'Centros comerciales' }).click();
  await expect(page.locator('input[name="tipoNegocio"][value="centro-comercial"]')).toBeChecked();
  // Enlaces alternativos a los formularios por correo
  await page.goto('/cotizar.html');
  await expect(page.locator('.cot__alterno a[href="./evento.html"]')).toBeVisible();
  await expect(page.locator('.cot__alterno a[href="./negocio.html"]')).toBeVisible();
  // evento.html y negocio.html: único cambio permitido desde la Etapa 0 = enlace de WhatsApp a api.whatsapp.com
  const diff = execSync('git diff -U0 f27ac64 -- evento.html negocio.html', { cwd: RAIZ }).toString()
    .split('\n').filter((l) => /^[+-](?![+-])/.test(l));
  expect(diff.length).toBeGreaterThan(0);
  for (const l of diff) expect(l, l).toMatch(/wa\.me\/523338704157|api\.whatsapp\.com\/send\?phone=523338704157/);
  for (const p of ['evento.html', 'negocio.html']) {
    await page.goto('/' + p);
    expect(await page.getAttribute(p === 'evento.html' ? '#form-evento' : '#form-negocios', 'action')).toBe(p === 'evento.html' ? 'send_mail_evento.php' : 'send_mail_negocio.php');
  }
});
