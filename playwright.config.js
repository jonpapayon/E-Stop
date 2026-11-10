// Pruebas del sitio (solo desarrollo). Sirve la raíz del repo con un servidor estático.
// Navegador: el Chromium de Playwright si está instalado (npx playwright install chromium);
// si no, Brave/Chrome locales. Se puede forzar con NAVEGADOR=/ruta/al/ejecutable.
const { defineConfig, chromium } = require('@playwright/test');
const fs = require('fs');

const PORT = Number(process.env.PORT || 8765);
const candidatos = [
  process.env.NAVEGADOR,
  (() => { try { return chromium.executablePath(); } catch { return null; } })(),
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = candidatos.find((p) => fs.existsSync(p));

module.exports = defineConfig({
  testDir: './tests',
  outputDir: './test-results/artefactos',
  timeout: 30000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: `node scripts/servidor.mjs ${PORT}`,   // gzip + 404 reales (ver scripts/servidor.mjs)
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: false,
  },
});
