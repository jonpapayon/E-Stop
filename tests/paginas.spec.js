// Páginas de la fase 1E: privacidad, 404 y formularios PHP rediseñados.
const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

test.beforeEach(async ({ page }) => { await page.route(/googletagmanager|google-analytics|doubleclick/, (r) => r.abort()); });

test('privacidad: texto legal literal, 10 secciones e índice navegable', async ({ page }) => {
  const palabras = (html) => { const t = html.slice(html.indexOf('<main'), html.indexOf('</main>')).replace(/<[^>]+>/g, ' '); return (t.toLowerCase().match(/[0-9a-záéíóúñü@]+/g) || []); };
  const cuenta = (a) => a.reduce((m, w) => (m[w] = (m[w] || 0) + 1, m), {});
  const antes = cuenta(palabras(execSync('git show f27ac64:privacidad.html', { cwd: RAIZ }).toString()));
  const ahora = cuenta(palabras(fs.readFileSync(path.join(RAIZ, 'privacidad.html'), 'utf8')));
  // Ninguna palabra del original desaparece (salvo las que venían pegadas por falta de separadores)
  const pegadas = ['salidodomicilio', '3233teléfono', '4157correo'];
  const faltan = Object.entries(antes).filter(([w, n]) => !pegadas.includes(w) && (ahora[w] || 0) < n);
  expect(faltan).toEqual([]);
  await page.goto('/privacidad.html');
  await expect(page.locator('.prosa h2')).toHaveCount(10);
  await expect(page.locator('.titular dd')).toHaveText(['Carlos Bachelani Salido', 'Justo Sierra 3233', '33 3870 4157', 'contacto@svp.com.mx']);
  await page.locator('.indice a', { hasText: '7. Empleo de la tecnología' }).click();
  await expect(page).toHaveURL(/#s7$/);
  await expect(page.locator('#s7')).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/privacidad.html');
  await expect(page.locator('.indice')).not.toHaveAttribute('open', '');   // plegado en móvil
});

test('404: diseño propio, noindex y recursos con rutas absolutas', async ({ page }) => {
  const html = fs.readFileSync(path.join(RAIZ, '404.html'), 'utf8');
  const relativas = [...html.matchAll(/(?:href|src)="(\.\/[^"]*|(?!https?:|\/|#|tel:|mailto:)[^"]+)"/g)].map((m) => m[1]);
  expect(relativas, 'la 404 se sirve desde cualquier ruta').toEqual([]);
  await page.goto('/404.html');
  await expect(page.locator('h1')).toContainText('Este cajón');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await page.locator('.vacio a', { hasText: 'Volver al inicio' }).click();
  await expect(page).toHaveURL(/index\.html$/);
});

for (const [p, sel, php] of [['evento.html', '#form-evento', 'send_mail_evento.php'], ['negocio.html', '#form-negocios', 'send_mail_negocio.php']]) {
  test(`${p}: diseño nuevo con el contrato PHP intacto, avisos y alternativa por WhatsApp`, async ({ page }) => {
    await page.goto('/' + p);
    expect(await page.locator('link[href="./css/sistema.css"]').count()).toBe(1);
    expect(await page.locator(sel).getAttribute('action')).toBe(php);
    // Los mensajes de error no se muestran antes de interactuar
    expect(await page.locator('.campo__error:visible').count()).toBe(0);
    await page.locator(`${sel} button[type=submit]`).click();
    expect(await page.locator('.campo__error:visible').count()).toBeGreaterThan(0);   // validación nativa tras intentar enviar
    await expect(page.locator(`.contexto a[href="./cotizar.html?tipo=${p === 'evento.html' ? 'evento' : 'negocio'}"]`)).toBeVisible();
    await page.goto('/' + p + '?result=error');
    await expect(page.locator('#alert')).toHaveClass(/alert-danger/);
    await page.goto('/' + p + '?result=success');
    await expect(page.locator('#alert')).toHaveClass(/alert-success/);
  });
}

test('coherencia: todas las páginas públicas comparten sistema, parciales y fuentes', async ({ page }) => {
  for (const p of ['index.html', 'nosotros.html', 'cotizar.html', 'equipo.html', 'evento.html', 'negocio.html', 'privacidad.html', '404.html']) {
    const html = fs.readFileSync(path.join(RAIZ, p), 'utf8');
    expect(html, p).toMatch(/css\/sistema\.css/);
    expect(html, p).toMatch(/<!-- parcial:cabecera/);
    expect(html, p).toMatch(/<!-- parcial:pie/);
    expect(html, p).not.toMatch(/fonts\.googleapis|css\/global\.css|main\.js/);   // nada del diseño anterior
  }
});
