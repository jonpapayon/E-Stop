// Auditoría final Etapa 0. Sin envíos reales: todo POST se intercepta y se responde localmente.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PAGES = ['index.html', 'nosotros.html', 'cotizar.html', 'evento.html',
  'negocio.html', 'equipo.html', 'privacidad.html', '404.html'];
const OUT = path.join(__dirname, '..', 'test-results', 'auditoria');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

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

const log = (name, data) => fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(data, null, 2));

const BLOCK = /googletagmanager\.com|google-analytics\.com|doubleclick\.net/;
let realOutbound = []; // cualquier petición externa no permitida
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://localhost')) return route.continue();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.continue(); // solo lectura de fuentes
    if (BLOCK.test(u)) return route.abort('blockedbyclient');
    // Cualquier otra salida (formsubmit, etc.) se bloquea salvo que un test la intercepte antes
    realOutbound.push(`${route.request().method()} ${u}`);
    return route.abort('blockedbyclient');
  });
});

// PDF mínimo válido (1 página) generado en memoria
function makePdf() {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>'];
  let s = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const off = [];
  objs.forEach((o, i) => { off.push(Buffer.byteLength(s, 'latin1')); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(s, 'latin1');
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(s, 'latin1');
}

function captureForm(page, pattern, redirect) {
  const cap = { count: 0 };
  return page.route(pattern, async route => {
    const r = route.request();
    if (r.method() !== 'POST') return route.abort();
    cap.count++; cap.method = r.method(); cap.url = r.url();
    cap.contentType = r.headers()['content-type'] || ''; cap.buf = r.postDataBuffer() || Buffer.alloc(0);
    await route.fulfill({ status: 302, headers: { location: redirect } });
  }).then(() => cap);
}

// ---------- 2. Formularios PHP (contrato cliente) ----------
for (const [pageName, formSel, php, extra] of [
  ['evento.html', '#form-evento', 'send_mail_evento.php', {}],
  ['negocio.html', '#form-negocios', 'send_mail_negocio.php', { radio: '#restaurante' }],
]) {
  test(`PHP ${pageName}: contrato del formulario → ${php}`, async ({ page }) => {
    await page.goto('/' + pageName);
    const form = page.locator(formSel);
    const info = await form.evaluate(f => ({
      action: f.action, method: f.method, enctype: f.enctype,
      fields: [...f.elements].filter(e => e.name).map(e => ({ name: e.name, type: e.type, required: e.required })),
      unnamed: [...f.elements].filter(e => !e.name && !['submit', 'button', 'fieldset'].includes(e.type)).length,
    }));
    expect(info.action).toBe(`http://localhost:8765/${php}`);
    expect(info.method).toBe('post');
    expect(info.unnamed).toBe(0);

    // Envío vacío bloqueado por required
    let sentEmpty = false;
    await page.route('**/' + php, r => { sentEmpty = true; r.abort(); });
    await form.locator('button[type=submit]').click();
    await page.waitForTimeout(300);
    expect(sentEmpty).toBe(false);
    await page.unroute('**/' + php);

    // Envío válido interceptado
    const cap = await captureForm(page, '**/' + php, `http://localhost:8765/${pageName}?result=success`);
    if (extra.radio) await page.check(extra.radio);
    await page.fill('#name', 'Auditoría Playwright');
    await page.fill('#email', 'auditoria@example.com');
    await page.fill('#phone', '3312345678');
    await form.locator('button[type=submit]').click();
    await expect(page).toHaveURL(/result=success/);
    await expect(page.locator('#alert')).toBeVisible();
    const sent = Object.fromEntries(new URLSearchParams(cap.buf.toString('utf8')));
    expect(cap.count).toBe(1);
    expect(cap.contentType).toContain('application/x-www-form-urlencoded');
    log(`php-${pageName}`, { info, sent, contentType: cap.contentType, url: cap.url });
  });
}

test('PHP negocio: aviso de error con ?result=error', async ({ page }) => {
  await page.goto('/negocio.html?result=error');
  await expect(page.locator('#alert')).toHaveClass(/alert-danger/);
  await expect(page.locator('#alert')).toContainText('Hubo un problema');
});

// ---------- 3. Empleo: PDF + destinatario ----------
test('Empleo: adjunta PDF íntegro a FormSubmit con destinatario correcto', async ({ page }) => {
  const pdf = makePdf();
  fs.writeFileSync(path.join(OUT, 'cv-prueba.pdf'), pdf);
  await page.goto('/equipo.html');
  const form = page.locator('#form-equipo');

  let sentEmpty = false;
  await page.route('https://formsubmit.co/**', r => { sentEmpty = true; r.abort(); });
  await form.locator('button[type=submit]').click();
  await page.waitForTimeout(300);
  expect(sentEmpty).toBe(false);
  await page.unroute('https://formsubmit.co/**');

  const cap = await captureForm(page, 'https://formsubmit.co/**', 'http://localhost:8765/equipo.html?result=success');
  await page.fill('#name', 'Auditoría Playwright');
  await page.fill('#email', 'auditoria@example.com');
  await page.fill('#phone', '3312345678');
  await page.setInputFiles('#cv', path.join(OUT, 'cv-prueba.pdf'));
  await form.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/result=success/);

  expect(cap.count).toBe(1);
  expect(cap.url).toBe('https://formsubmit.co/contacto@svp.com.mx');
  expect(cap.contentType).toMatch(/^multipart\/form-data; boundary=/);
  const boundary = cap.contentType.split('boundary=')[1];
  const parts = cap.buf.toString('latin1').split('--' + boundary).slice(1, -1).map(p => {
    const [head, ...rest] = p.split('\r\n\r\n');
    return { head: head.trim(), body: rest.join('\r\n\r\n').replace(/\r\n$/, '') };
  });
  const names = parts.map(p => (p.head.match(/name="([^"]+)"/) || [])[1]);
  const cv = parts.find(p => /name="cv"/.test(p.head));
  expect(cv.head).toContain('filename="cv-prueba.pdf"');
  expect(cv.head).toContain('Content-Type: application/pdf');
  // Comparación binaria directa sobre el buffer crudo de la petición
  const idx = cap.buf.indexOf(pdf);
  fs.writeFileSync(path.join(OUT, 'raw-body.bin'), cap.buf);
  log('pdf-debug', { pdfLen: pdf.length, parsedLen: Buffer.from(cv.body, 'latin1').length, rawIndexOfPdf: idx,
    bodyStart: Buffer.from(cv.body, 'latin1').subarray(0, 24).toString('hex'), pdfStart: pdf.subarray(0, 24).toString('hex') });
  // Chromium no expone a la interceptación los bytes de archivos leídos de disco: se verifican en el test de red.
  const field = n => (parts.find(p => p.head.includes(`name="${n}"`)) || {}).body;
  expect(field('_next')).toBe('https://svp.com.mx/equipo.html?result=success');
  await expect(page.locator('#alert')).toContainText('Recibimos tu solicitud');
  log('empleo', { url: cap.url, contentType: cap.contentType, parts: names,
    pdfBytes: pdf.length, cvHead: cv.head, next: field('_next'), subject: field('_subject') });
});


// Recepción REAL por red (servidor local que hace de FormSubmit): el navegador serializa el PDF desde disco.
test('Empleo: el navegador envía el PDF desde disco por red (servidor local de captura)', async ({ page }) => {
  const http = require('http');
  const pdf = makePdf();
  fs.writeFileSync(path.join(OUT, 'cv-disco.pdf'), pdf);
  let got = null;
  const srv = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c));
    req.on('end', () => {
      got = { method: req.method, url: req.url, ct: req.headers['content-type'], body: Buffer.concat(chunks) };
      res.writeHead(302, { location: 'http://localhost:8765/equipo.html?result=success' }); res.end();
    });
  });
  await new Promise(r => srv.listen(8766, '127.0.0.1', r));
  try {
    await page.goto('/equipo.html');
    const realAction = await page.locator('#form-equipo').evaluate(f => f.action);
    expect(realAction).toBe('https://formsubmit.co/contacto@svp.com.mx');
    // Solo en la prueba: se apunta el form al receptor local, conservando enctype y campos
    await page.locator('#form-equipo').evaluate(f => { f.action = 'http://localhost:8766/contacto@svp.com.mx'; });
    await page.fill('#name', 'Auditoría Playwright');
    await page.fill('#email', 'auditoria@example.com');
    await page.fill('#phone', '3312345678');
    await page.setInputFiles('#cv', path.join(OUT, 'cv-disco.pdf'));
    await page.locator('#form-equipo button[type=submit]').click();
    await expect(page).toHaveURL(/result=success/);
  } finally { srv.close(); }
  expect(got.method).toBe('POST');
  expect(got.ct).toMatch(/^multipart\/form-data; boundary=/);
  const idx = got.body.indexOf(pdf);
  const head = got.body.subarray(Math.max(0, idx - 200), idx).toString('latin1');
  log('empleo-red', { bytesRecibidos: got.body.length, pdfBytes: pdf.length, pdfEncontradoEnOffset: idx, cabeceraParte: head.trim().split('\r\n').slice(-3) });
  expect(idx, 'PDF íntegro en el cuerpo recibido').toBeGreaterThan(0);
  expect(head).toContain('name="cv"; filename="cv-disco.pdf"');
  expect(head).toContain('Content-Type: application/pdf');
});

// ---------- 4. Enlaces ----------
test('Enlaces: internos 200, WhatsApp, teléfono, navegación', async ({ page, request }) => {
  const report = { internal: {}, wa: {}, tel: {}, external: new Set(), anchors: 0 };
  for (const p of PAGES) {
    await page.goto('/' + p);
    const links = await page.$$eval('a[href]', as => as.map(a => ({ href: a.getAttribute('href'), abs: a.href, text: a.textContent.trim() })));
    report.anchors += links.length;
    for (const l of links) {
      if (l.abs.startsWith('http://localhost')) {
        const u = l.abs.split('#')[0];
        if (!(u in report.internal)) report.internal[u] = (await request.get(u)).status();
      } else if (l.href.startsWith('tel:')) report.tel[p] = l.href;
      else if (/^https:\/\/(api\.whatsapp\.com\/send|wa\.me\/)/.test(l.abs)) {
        // Enlaces del sitio: api.whatsapp.com (activa la conversión GTM «contiene whatsapp»); formulario: wa.me
        const u = new URL(l.abs);
        if (u.hostname === 'wa.me' && !u.searchParams.get('text')) continue;   // respaldo del formulario (se rellena al enviar)
        report.wa[p] = { phone: u.searchParams.get('phone') || u.pathname.slice(1), text: u.searchParams.get('text') };
      } else report.external.add(l.abs);
    }
  }
  report.external = [...report.external];
  log('enlaces', report);
  const broken = Object.entries(report.internal).filter(([, s]) => s !== 200).map(([u, s]) => `${s} ${u}`);
  const withFooter = PAGES; // las 8 tienen footer y WhatsApp salvo equipo/privacidad/404 (WhatsApp)
  for (const p of withFooter) expect(report.tel[p], `tel en ${p}`).toBe('tel:+523338704157');
  for (const v of Object.values(report.wa)) {
    expect(v.phone).toBe('523338704157');
    expect(v.text).toBe('Hola, quiero información sobre sus servicios.');
  }
  // Navegación por menú en escritorio
  await page.goto('/index.html');
  await page.locator('.cabecera .nav, header nav').first().getByRole('link', { name: 'Nosotros', exact: true }).click();
  await expect(page).toHaveURL(/nosotros\.html$/);
  // «Cotizar» es el botón de la cabecera en el diseño nuevo (enlace del menú en el anterior)
  await page.locator('.cabecera__cta, header nav a[href$="cotizar.html"]').first().click();
  await expect(page).toHaveURL(/cotizar\.html$/);
  // Volver al inicio: logotipo (diseño nuevo) o enlace «Inicio» (diseño anterior)
  await page.locator('.cabecera__logo, header .logo-container a').first().click();
  await expect(page).toHaveURL(/index\.html$/);
  await page.goto('/cotizar.html');
  await page.locator('a[href="./negocio.html"]').first().click();
  await expect(page).toHaveURL(/negocio\.html$/);
  expect(broken, 'enlaces internos rotos').toEqual([]);
});

// ---------- 5. Consola + responsive ----------
test('Consola y responsive en 6 anchos × 8 páginas', async ({ page }) => {
  test.setTimeout(150000);
  const widths = [320, 375, 414, 768, 1024, 1440];
  const res = { console: [], overflow: [], menu: [], dupIds: [] };
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') res.console.push(`[${m.type()}] ${page.url().split('/').pop()}: ${m.text()}`); });
  page.on('pageerror', e => res.console.push(`[pageerror] ${page.url()}: ${e.message}`));
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    for (const p of PAGES) {
      await page.goto('/' + p); await page.waitForLoadState('load');
      const m = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth;
        const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
        const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
        const nav = document.querySelector('nav');
        const navR = nav ? nav.getBoundingClientRect() : null;
        return { sw, dup, navRight: navR ? navR.right : null };
      });
      if (m.sw > w) res.overflow.push(`${p} @${w}: ${m.sw}px`);
      if (w === 375 && m.dup.length) res.dupIds.push(`${p}: ${m.dup.join(',')}`);
      if (m.navRight !== null && m.navRight > w + 1 && w > 450) res.menu.push(`${p} @${w}: nav se sale (${m.navRight}px)`);
      if (w === 375 || w === 1440) await page.screenshot({ path: path.join(OUT, 'shots', `${p.replace('.html', '')}-${w}.png`), fullPage: true });
    }
  }
  // menú hamburguesa en móvil, en todas las páginas con header
  await page.setViewportSize({ width: 375, height: 800 });
  for (const p of PAGES) {
    await page.goto('/' + p);
    const { abre: vis, cierra: hid } = await probarMenu(page);
    if (!(vis && hid)) res.menu.push(`${p}: menú móvil falla (abre=${vis}, cierra=${hid})`);
  }
  res.outbound = realOutbound;
  log('responsive-consola', res);
  expect(res.overflow).toEqual([]);
  expect(res.console.filter(c => !/blockedbyclient|ERR_BLOCKED_BY_CLIENT/i.test(c))).toEqual([]);
  expect(res.menu).toEqual([]);
});
