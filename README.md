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
| `assets/fotos/` | Originales de fotografía (no se despliegan) y créditos: ver `CREDITOS.md` y su README |
| `dev/sistema.html` | Hoja de componentes (interna, no se despliega) |
| `tests/` | Pruebas Playwright: contratos de formularios, enlaces, responsive, sistema |

## Formularios (no cambiar sin actualizar las pruebas)

- `evento.html` → `send_mail_evento.php` (POST)
- `negocio.html` → `send_mail_negocio.php` (POST)
- `equipo.html` → FormSubmit `contacto@svp.com.mx` (multipart, CV adjunto)

Los scripts PHP viven solo en el servidor: aún no están versionados.

## Analítica (GTM-PMX8X4DW · Google Ads AW-16538094770)

Etiquetas cargadas **solo en `index.html`** (igual que en producción). Configuración revisada del
contenedor (gtm.js público, nov 2026):

| Etiqueta | Disparador |
|---|---|
| Conversión Ads `…/9RWKCITp2M4ZELKZ_c09` | Clic en enlace cuya URL **contiene «whatsapp»** |
| Conversión Ads `…/5Sn4CIfp2M4ZELKZ_c09` | Clic en enlace cuya URL **contiene «cotizar»** |
| Etiqueta de Google + vinculador de conversiones | Todas las cargas |

Por eso los enlaces de WhatsApp del sitio usan `https://api.whatsapp.com/send?phone=…` (contiene
«whatsapp»). El formulario de cotización abre `wa.me` con `window.open` y **no** dispara esa conversión.

Eventos propios en `dataLayer` (`js/sitio.js`, `js/cotizacion.js`), sin datos personales; ningún
disparador actual los escucha:

| Evento | Cuándo | Parámetros |
|---|---|---|
| `estop_clic_cotizar` | Clic en un enlace a `cotizar.html` | `origen`, `servicio` |
| `estop_whatsapp_abierto` | Se abre WhatsApp (enlace o formulario) | `origen` |
| `estop_formulario_cotizacion_completado` | El formulario pasó la validación y abrió WhatsApp (una vez por mensaje) | `servicio`, `tipo_negocio`, `envio_confirmado: false` |

`estop_formulario_cotizacion_completado` **no** confirma que el mensaje se haya enviado.
Para medirlos hay que configurarlos en GTM (y cargar GTM en `cotizar.html`, revisando antes que la
regla «contiene cotizar» no duplique conversiones dentro de esa página).

## Pendiente de validación con el cliente (no publicar sin confirmar)

Cifras de la antigua página Nosotros: más de 30,000 automóviles al mes, más de 130 empleados,
10,000+ lugares, 95 % de satisfacción, 25,000 usuarios mensuales (contradice los 30,000/mes),
«más de 20 años», «la mejor empresa en el ramo» y la razón social vigente.

## Despliegue

**No subir:** `node_modules/`, `tests/`, `test-results/`, `scripts/`, `partials/`, `dev/`, `assets/fotos/`,
`package.json`, `package-lock.json`, `playwright.config.js`, `.gitignore`, `README.md`.

**Preview en Vercel:** `.vercelignore` aplica esta misma lista y `vercel.json` desactiva los despliegues automáticos por Git. Los formularios PHP no funcionan en Vercel (no hay PHP).

Subir el resto (páginas `.html`, `css/`, `js/`, `assets/`, `main.js`). Antes, respaldar el servidor.
`index.html` contiene Google Tag Manager (GTM-PMX8X4DW) y Google Ads (AW-16538094770): conservarlos.
