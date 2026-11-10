// Analítica: eventos propios en dataLayer y compatibilidad con el contenedor GTM existente.
// Nada sale a Google: GTM/Ads se bloquean y la navegación a WhatsApp se aborta.
//
// Configuración real del contenedor GTM-PMX8X4DW (revisada en su gtm.js público, nov 2026):
//   - Conversión Ads 16538094770/9RWKCITp2M4ZELKZ_c09 → gtm.linkClick con URL que CONTIENE «whatsapp»
//   - Conversión Ads 16538094770/5Sn4CIfp2M4ZELKZ_c09 → gtm.linkClick con URL que CONTIENE «cotizar»
//   - Etiqueta de Google AW-16538094770 (gtm.init) y vinculador de conversiones (gtm.js)
const { test, expect } = require('@playwright/test');

const DISPARADORES_GTM = ['gtm.js', 'gtm.init', 'gtm.linkClick'];

async function preparar(page, w = 1440, h = 900) {
  await page.setViewportSize({ width: w, height: h });
  await page.context().route(/googletagmanager|google-analytics|doubleclick|googleadservices/, (r) => r.abort());
  await page.context().route(/whatsapp\.com|wa\.me/, (r) => r.abort());
  // Registro de todo lo que se empuja a dataLayer (sobrevive a la navegación)
  const eventos = [];
  await page.exposeFunction('__registrar', (e) => eventos.push(JSON.parse(e)));
  await page.addInitScript(() => {
    const dl = window.dataLayer = window.dataLayer || [];
    const push = dl.push.bind(dl);
    dl.push = (...args) => { args.forEach((a) => { try { window.__registrar(JSON.stringify(a && a.length !== undefined && typeof a !== 'string' ? { __args: [...a] } : a)); } catch {} }); return push(...args); };
    window.open = (u) => { window.__abierto = u; return null; };
  });
  return eventos;
}
const propios = (ev) => ev.filter((e) => e && typeof e.event === 'string' && e.event.startsWith('estop_'));

test('los enlaces del sitio siguen activando las conversiones existentes de Google Ads', async ({ page }) => {
  await preparar(page);
  for (const p of ['index.html', 'cotizar.html', 'nosotros.html']) {
    await page.goto('/' + p);
    const enlaces = await page.$$eval('a[href]', (as) => as.map((a) => ({ href: a.href, cls: a.className, enFormulario: !!a.closest('.cot__listo') })));
    // Todo enlace de WhatsApp del sitio contiene «whatsapp» (regla del contenedor) salvo el respaldo del formulario
    const wa = enlaces.filter((a) => /whatsapp\.com|wa\.me/.test(a.href));
    for (const a of wa.filter((x) => !x.enFormulario)) expect(a.href, `${p}: ${a.cls}`).toContain('whatsapp');
    for (const a of wa) expect(new URL(a.href).searchParams.get('phone') || new URL(a.href).pathname.slice(1)).toBe('523338704157');
    // Los CTAs de cotización contienen «cotizar»
    expect(enlaces.filter((a) => /cotizar\.html/.test(a.href)).length).toBeGreaterThan(0);
  }
  // El formulario abre WhatsApp con window.open (no es un clic en enlace): no dispara la conversión «whatsapp»
  await page.goto('/cotizar.html?tipo=oficina');
  await page.fill('#nombre', 'Prueba');
  await page.locator('.cot__boton').click();
  expect(await page.evaluate(() => window.__abierto)).toMatch(/^https:\/\/wa\.me\/523338704157\?text=/);
});

test('clic en solicitar cotización: evento con origen y servicio (escritorio)', async ({ page }) => {
  const ev = await preparar(page);
  await page.goto('/index.html');
  await page.waitForTimeout(1600);
  await page.locator('.hero a.boton').first().click();               // Cotizar evento (hero)
  await page.waitForURL(/cotizar\.html/);
  await page.goto('/index.html#servicios');
  await page.locator('#servicios a.fila', { hasText: 'Hospitales' }).click();
  await page.waitForURL(/tipo=hospital/);
  await page.locator('.cabecera__cta').click();                       // Cotizar (cabecera)
  await page.waitForURL(/cotizar\.html$/);
  const c = propios(ev).filter((e) => e.event === 'estop_clic_cotizar');
  expect(c).toEqual([
    { event: 'estop_clic_cotizar', origen: 'hero', servicio: 'evento' },
    { event: 'estop_clic_cotizar', origen: 'servicios', servicio: 'hospital' },
    { event: 'estop_clic_cotizar', origen: 'cabecera', servicio: '' },
  ]);
});

test('apertura de WhatsApp desde cada punto de contacto (escritorio y móvil)', async ({ page }) => {
  const ev = await preparar(page);
  await page.goto('/index.html');
  await page.locator('.wa-flotante').click();
  await page.locator('#preguntas .preguntas__ayuda a[href*="whatsapp"]').click();
  await page.locator('.pie a[href*="whatsapp"]').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(400);
  await page.locator('.barra-movil a[href*="whatsapp"]').click();
  await page.locator('.hamburguesa').click(); await page.waitForTimeout(600);
  await page.locator('.menu-movil a[href*="whatsapp"]').click();
  await page.waitForTimeout(300);
  const w = propios(ev).filter((e) => e.event === 'estop_whatsapp_abierto').map((e) => e.origen);
  expect(w).toEqual(['flotante', 'preguntas', 'pie', 'barra_movil', 'menu_movil']);
  // Cotizar desde la barra móvil (el clic en el enlace del menú ya lo cerró)
  await expect(page.locator('#menu-movil')).toBeHidden();
  await page.locator('.barra-movil__cotizar').click();
  await page.waitForURL(/cotizar\.html/);
  expect(propios(ev).filter((e) => e.event === 'estop_clic_cotizar').at(-1)).toEqual({ event: 'estop_clic_cotizar', origen: 'barra_movil', servicio: '' });
});

test('formulario completado: una vez por mensaje, separado de la apertura de WhatsApp, sin datos personales', async ({ page }) => {
  const ev = await preparar(page);
  await page.goto('/cotizar.html');
  // Envío inválido: ningún evento
  await page.locator('.cot__boton').click();
  expect(propios(ev)).toEqual([]);
  // Envío válido
  await page.locator('label.servicio__opcion:has(input[value="negocio"])').click();
  await page.locator('label.chip:has(input[value="restaurante"])').click();
  await page.fill('#nombre', 'Ximena Ruiz Ñúñez');
  await page.fill('#ubicacion', 'Av. Chapultepec 480');
  await page.fill('#mensaje', 'Comentario privado 123');
  await page.locator('.cot__boton').click();
  await page.locator('.cot__boton').click();                          // doble clic / reenvío idéntico
  await page.fill('#nombre', 'Ximena Ruiz');                           // cambia el mensaje
  await page.locator('.cot__boton').click();
  await page.locator('[data-enlace-wa]').click();                      // «¿No se abrió? Abrir WhatsApp»
  const p = propios(ev);
  expect(p).toEqual([
    { event: 'estop_formulario_cotizacion_completado', servicio: 'negocio', tipo_negocio: 'restaurante', envio_confirmado: false },
    { event: 'estop_whatsapp_abierto', origen: 'formulario' },
    { event: 'estop_whatsapp_abierto', origen: 'formulario' },
    { event: 'estop_formulario_cotizacion_completado', servicio: 'negocio', tipo_negocio: 'restaurante', envio_confirmado: false },
    { event: 'estop_whatsapp_abierto', origen: 'formulario' },
    { event: 'estop_whatsapp_abierto', origen: 'formulario_respaldo' },
  ]);
  // Sin datos personales en la capa de datos
  const todo = JSON.stringify(ev);
  for (const dato of ['Ximena', 'Ruiz', 'Chapultepec', 'Comentario privado']) expect(todo).not.toContain(dato);
});

test('los eventos propios no coinciden con disparadores existentes ni envían conversiones', async ({ page }) => {
  const ev = await preparar(page);
  await page.goto('/index.html');
  await page.locator('.wa-flotante').click();
  await page.goto('/cotizar.html?tipo=evento');
  const d = new Date(); d.setDate(d.getDate() + 9);
  await page.fill('#fecha', d.toISOString().slice(0, 10));
  await page.fill('#nombre', 'Prueba');
  await page.locator('.cot__boton').click();
  for (const e of propios(ev)) expect(DISPARADORES_GTM).not.toContain(e.event);
  // Ninguna llamada gtag('event', 'conversion', …) ni eventos «conversion» creados por el sitio
  const conv = ev.filter((e) => (e.__args && e.__args[0] === 'event' && e.__args[1] === 'conversion') || e.event === 'conversion');
  expect(conv).toEqual([]);
  // El snippet original sigue intacto en la Home: GTM (gtm.js) y gtag config
  expect(ev.some((e) => e.event === 'gtm.js')).toBe(true);
  expect(ev.some((e) => e.__args && e.__args[0] === 'config' && e.__args[1] === 'AW-16538094770')).toBe(true);
});
