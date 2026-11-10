# E-Stop Valet Parking · svp.com.mx

Sitio estático (HTML + CSS + JS, sin framework ni build). Producción: hosting compartido LiteSpeed con PHP.

## Desarrollo local

```bash
npm install                 # solo herramientas de desarrollo (Playwright, Sharp)
npm run serve               # http://localhost:8000
npm test                    # pruebas Playwright (usa Chromium de Playwright, o Brave/Chrome locales)
npm run test:cwv            # Core Web Vitals de laboratorio, aislado (mediana de 3 rondas)
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
- `equipo.html` → FormSubmit `contacto@svp.com.mx` (multipart, CV adjunto, `_next` → `?result=success`)
- `cotizar.html` → sin backend: arma el mensaje y abre `wa.me/523338704157`

Los scripts PHP viven solo en el servidor: aún no están versionados.
El formulario de empleo **no usa PHP**: envía a FormSubmit (verificado en producción).

## Analítica e integraciones de Google (inventario, nov 2026)

Revisado sin acceso a las cuentas de Google Ads/GTM: solo el código del sitio y el `gtm.js` público.

| # | Elemento | Dónde | Detalle |
|---|---|---|---|
| 1 | Etiqueta de Google Ads `AW-16538094770` (gtag.js) | `index.html`, al final del body | Fragmento escrito a mano |
| 1b | La misma etiqueta `AW-16538094770` | Dentro de GTM (se dispara en gtm.init) | **Duplicada** con la 1 |
| 2 | Conversión Ads `…/9RWKCITp2M4ZELKZ_c09` | GTM | Clic en enlace cuya URL contiene «whatsapp» |
| 2b | Conversión Ads `…/5Sn4CIfp2M4ZELKZ_c09` | GTM | Clic en enlace cuya URL contiene «cotizar» |
| 2c | Vinculador de conversiones (cookie `_gcl_aw`) | GTM, todas las cargas | Atribución de clics de anuncios |
| 3 | Google Analytics (GA4/UA) | — | **No existe** |
| 4 | Contenedor GTM `GTM-PMX8X4DW` | Solo `index.html` (head + noscript) | Solo contiene las etiquetas de Ads |
| 5 | Eventos propios del rediseño en `dataLayer` | `js/sitio.js`, `js/cotizacion.js`, `js/empleo.js` | Ver tabla de eventos; hoy ninguna etiqueta los consume |
| 6 | Scripts externos | `gtm.js` (150 KB gzip) + `gtag/js` (161 KB gzip) | 311 KB: más que el resto de la Home (223 KB) |
| 7 | Dependencias funcionales | — | **Ninguna**: el sitio funciona igual con GTM/Ads bloqueados (así corren todas las pruebas) |

Eventos propios (sin datos personales; prefijo `estop_` para no coincidir con disparadores existentes):

| Evento | Cuándo | Parámetros |
|---|---|---|
| `estop_clic_cotizar` | Clic en un enlace a `cotizar.html` | `origen`, `servicio` |
| `estop_whatsapp_abierto` | Se abre WhatsApp (enlace o formulario). **No es una cotización recibida** | `origen` |
| `estop_formulario_cotizacion_completado` | El formulario de cotización pasó la validación y abrió WhatsApp (una vez por mensaje) | `servicio`, `tipo_negocio`, `envio_confirmado: false` |
| `estop_solicitud_empleo_completada` | FormSubmit aceptó la solicitud y redirigió con `?result=success` (una vez por sesión) | — |

Los enlaces de WhatsApp del sitio usan `api.whatsapp.com/send?phone=…` para que la conversión 2 siga
funcionando mientras exista. El formulario abre `wa.me` con `window.open` y no la dispara.

**Si se eliminan GTM y la etiqueta de Ads** (bloques «Google Tag Manager» y «Google tag (gtag.js)» de
`index.html`): se dejan de contar las conversiones 2/2b, se pierde la atribución de anuncios (`_gcl_aw`) y
las audiencias de remarketing. No se rompe ninguna funcionalidad. Los eventos `estop_*` quedan inertes.

## Pendiente de validación con el cliente (no publicar sin confirmar)

Cifras de la antigua página Nosotros: más de 30,000 automóviles al mes, más de 130 empleados,
10,000+ lugares, 95 % de satisfacción, 25,000 usuarios mensuales (contradice los 30,000/mes),
«más de 20 años», «la mejor empresa en el ramo» y la razón social vigente.

**Aviso de privacidad (requiere asesoría legal; el texto se publica tal cual):** es un «Aviso Legal» de
plantilla española (cita la LOPDGDD de España, no la LFPDPPP de México); dice «Jonatan es el responsable»
aunque el titular es Carlos Bachelani Salido; remite a una «Política de Cookies» inexistente aunque la Home
carga Google Ads/GTM; no menciona los datos que se recaban (nombre, correo, celular, CV), sus finalidades,
los encargados (FormSubmit en EE. UU., hosting/PHP, WhatsApp/Meta), los derechos ARCO ni el domicilio completo.

## Despliegue

**No subir:** `node_modules/`, `tests/`, `test-results/`, `scripts/`, `partials/`, `dev/`, `assets/fotos/`,
`package.json`, `package-lock.json`, `playwright.config.js`, `.gitignore`, `README.md`.

**Preview en Vercel:** `.vercelignore` aplica esta misma lista y `vercel.json` desactiva los despliegues automáticos por Git. Los formularios PHP no funcionan en Vercel (no hay PHP).

Subir el resto (páginas `.html`, `css/`, `js/`, `assets/`, `main.js`). Antes, respaldar el servidor.
`index.html` contiene Google Tag Manager (GTM-PMX8X4DW) y Google Ads (AW-16538094770): conservarlos.
