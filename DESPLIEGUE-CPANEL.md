# Despliegue en el hosting cPanel del cliente

Arquitectura: sitio estático (HTML/CSS/JS) + PHP solo para formularios. **Sin bases de datos.**

| Formulario | Procesamiento |
|---|---|
| Cotización (`cotizar.html`) | JavaScript arma el mensaje y abre WhatsApp (`wa.me/523338704157`). Sin servidor |
| Únete a nuestro equipo (`equipo.html`) | `enviar-solicitud.php` → valida → envía por **SMTP autenticado** (PHPMailer) con el CV adjunto |
| Evento / Negocio (`evento.html`, `negocio.html`) | `send_mail_evento.php` / `send_mail_negocio.php` **que ya existen en el servidor** (no están en este repositorio) |

> El Preview de Vercel es solo para demostración visual y pruebas frontend: **Vercel no ejecuta PHP**.
> Allí los formularios PHP muestran un aviso de «vista previa» y no envían nada.

## Datos necesarios del cliente

| Dato | Ejemplo | Dónde se obtiene |
|---|---|---|
| Acceso a cPanel (o FTP/SFTP) | usuario + contraseña o llave | Proveedor de hosting |
| Versión de PHP disponible | 8.1 / 8.2 / 8.3 (mínimo 7.4) | cPanel › «Select PHP Version» / «MultiPHP Manager» |
| Servidor SMTP | `mail.svp.com.mx` | cPanel › «Email Accounts» › «Connect Devices» |
| Puerto y seguridad | 465 (SSL) o 587 (STARTTLS) | Mismo lugar |
| Cuenta que envía (usuario SMTP) | p. ej. `formularios@svp.com.mx` (crear una dedicada) | cPanel › «Email Accounts» |
| Contraseña de esa cuenta | — | El cliente la crea; **nunca** se guarda en el repositorio |
| Buzón que recibe las solicitudes | p. ej. `contacto@svp.com.mx` o uno de RR. HH. | Decisión del cliente |
| ¿El hosting permite SMTP autenticado desde PHP? | sí / no | Proveedor (si no, se usa `transporte => 'mail'`) |
| Registros SPF y DKIM del dominio activos | — | cPanel › «Email Deliverability» (evita que caigan en spam) |
| Copia de `send_mail_evento.php` y `send_mail_negocio.php` | — | Del servidor actual, para versionarlos y no sobrescribirlos |

## Pasos

1. **Respaldo** completo de `public_html` actual (cPanel › «Backup» o descargar la carpeta).
2. **PHP**: versión ≥ 7.4 (recomendado 8.2+). En «MultiPHP INI Editor» del dominio:
   `upload_max_filesize = 10M`, `post_max_size = 12M`, `file_uploads = On`.
   Con los valores por defecto de PHP (2M/8M) los CV de más de 2 MB se rechazan (el sitio lo explica al usuario).
3. **Subir a `public_html`** (y nada más):
   `*.html`, `css/`, `js/`, `assets/` (sin `assets/fotos/`), `enviar-solicitud.php`, `lib/` (con su `.htaccess`).
   **No subir:** `node_modules/`, `tests/`, `test-results/`, `scripts/`, `partials/`, `dev/`, `config/`,
   `assets/fotos/`, `package*.json`, `playwright.config.js`, `vercel.json`, `.vercelignore`, `README.md`, `DESPLIEGUE-CPANEL.md`.
   **No borrar** `send_mail_evento.php` ni `send_mail_negocio.php` del servidor.
4. **Configuración de correo fuera de la carpeta pública**:
   crear `/home/USUARIO/estop-privado/` (hermana de `public_html`), copiar ahí `config/correo.ejemplo.php`
   como `correo.php`, rellenar los datos SMTP y dar permisos `600`.
   (`enviar-solicitud.php` lo busca en `../estop-privado/correo.php`; también acepta la variable de entorno `ESTOP_CONFIG_CORREO`.)
5. **Prueba en el servidor** (con autorización del cliente):
   - enviar una solicitud de `equipo.html` **con** un PDF y otra **sin** archivo;
   - comprobar que llegan al buzón con el adjunto, `Reply-To` del candidato y el asunto «Nueva solicitud de empleo - svp.com.mx»;
   - probar un error (p. ej. archivo .exe renombrado) y ver el mensaje en la página;
   - si no llega: revisar `error_log` del dominio (los mensajes empiezan por `[E-Stop empleo]` y no incluyen datos personales).
6. Conservar las etiquetas de **Google Tag Manager / Google Ads** de `index.html` tal cual (decisión pendiente del cliente).

## Seguridad del backend de empleo

- Solo acepta `POST`. Valida nombre, correo y celular en el servidor (además del navegador).
- CV opcional: `.pdf`, `.doc`, `.docx`, máximo 10 MB, y se comprueba la **firma real del archivo**
  (un archivo renombrado a `.pdf` se rechaza).
- Campo trampa contra bots (`empresa_web`). Encabezados de correo protegidos por PHPMailer.
- **No se guarda nada**: el archivo solo vive en el directorio temporal de PHP durante la petición.
- `lib/` y `config/` bloquean el acceso web con `.htaccess`; las credenciales viven fuera de `public_html`.

## Dependencia de servidor

PHPMailer 6.10.0 (LGPL-2.1), incluido en `lib/phpmailer/` (3 archivos, sin Composer).
