# E-Stop Valet Parking · svp.com.mx

Sitio estático (HTML + CSS + JS, sin framework ni build). Producción: hosting compartido LiteSpeed con PHP.

## Desarrollo local

```bash
npm install                 # solo herramientas de desarrollo (Playwright, Sharp)
npm run serve               # http://localhost:8000
npm test                    # pruebas Playwright (usa Chromium de Playwright, o Brave/Chrome locales)
npm run partials            # copia partials/*.html (cabecera, pie, barra móvil) en las páginas
npm run partials:check      # verifica que las páginas están sincronizadas
npm run imagenes            # regenera assets/img/ (AVIF/WebP) desde los originales
```

Abrir los archivos con doble clic (`file://`) no funciona bien: usa siempre un servidor.

## Estructura

| Ruta | Qué es |
|---|---|
| `*.html` | Páginas públicas |
| `css/sistema.css` | Sistema de diseño «Operación de precisión» (capas: reset, tokens, base, layout, componentes, utilidades) |
| `js/sitio.js` | Menú móvil, cabecera, revelados, acordeón, campo de archivo (sin dependencias) |
| `partials/` | Cabecera, pie y barra móvil compartidos (fuente única) |
| `assets/fuentes/` | Archivo, Inter y JetBrains Mono autoalojadas (SIL OFL 1.1) |
| `assets/img/` | Imágenes optimizadas generadas por `npm run imagenes` |
| `assets/fotos/` | Huecos para fotografía real del cliente (ver su README) |
| `dev/sistema.html` | Hoja de componentes (interna, no se despliega) |
| `tests/` | Pruebas Playwright: contratos de formularios, enlaces, responsive, sistema |

## Formularios (no cambiar sin actualizar las pruebas)

- `evento.html` → `send_mail_evento.php` (POST)
- `negocio.html` → `send_mail_negocio.php` (POST)
- `equipo.html` → FormSubmit `contacto@svp.com.mx` (multipart, CV adjunto)

Los scripts PHP viven solo en el servidor: aún no están versionados.

## Despliegue

**No subir:** `node_modules/`, `tests/`, `test-results/`, `scripts/`, `partials/`, `dev/`,
`package.json`, `package-lock.json`, `playwright.config.js`, `.gitignore`, `README.md`.

Subir el resto (páginas `.html`, `css/`, `js/`, `assets/`, `main.js`). Antes, respaldar el servidor.
`index.html` contiene Google Tag Manager (GTM-PMX8X4DW) y Google Ads (AW-16538094770): conservarlos.
