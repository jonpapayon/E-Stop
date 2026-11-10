<?php
/**
 * E-Stop · Solicitud de empleo (equipo.html → este script).
 *
 * - Recibe nombre, correo, celular y, opcionalmente, el CV.
 * - Valida datos y archivo (extensión + firma real del archivo + tamaño).
 * - Envía la solicitud al correo de la empresa por SMTP autenticado (PHPMailer).
 * - Sin base de datos. El CV solo existe en el directorio temporal de PHP durante la
 *   petición (PHP lo elimina al terminar): no se guarda ningún archivo.
 * - Responde con redirección: equipo.html?result=success | ?result=error&motivo=…
 *
 * Configuración: archivo PHP FUERA de public_html (ver config/correo.ejemplo.php y
 * DESPLIEGUE-CPANEL.md). Requiere PHP 7.4+.
 */
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

require __DIR__ . '/lib/phpmailer/Exception.php';
require __DIR__ . '/lib/phpmailer/PHPMailer.php';
require __DIR__ . '/lib/phpmailer/SMTP.php';

const PAGINA   = 'equipo.html';
const MAX_CV   = 10 * 1024 * 1024; // 10 MB
// Extensión permitida → firma (magic bytes) que debe tener el archivo
const FIRMAS_CV = [
    'pdf'  => "%PDF",
    'docx' => "PK\x03\x04",
    'doc'  => "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1",
];
// Tipo MIME explícito del adjunto (el archivo temporal de PHP no tiene extensión)
const MIME_CV = [
    'pdf'  => 'application/pdf',
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc'  => 'application/msword',
];

function volver(string $resultado, string $motivo = ''): void
{
    $q = 'result=' . $resultado . ($motivo !== '' ? '&motivo=' . rawurlencode($motivo) : '');
    header('Location: ' . PAGINA . '?' . $q, true, 303);
    exit;
}

function limpiar(string $s, int $max): string
{
    $s = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $s) ?? '';   // sin saltos ni caracteres de control
    $s = trim(preg_replace('/\s+/u', ' ', $s) ?? '');
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function cargarConfig(): ?array
{
    $rutas = array_filter([
        getenv('ESTOP_CONFIG_CORREO') ?: null,                       // opcional: ruta por variable de entorno
        dirname(__DIR__) . '/estop-privado/correo.php',             // recomendado: fuera de public_html
    ]);
    foreach ($rutas as $ruta) {
        if (is_file($ruta)) {
            $cfg = require $ruta;
            return is_array($cfg) ? $cfg : null;
        }
    }
    return null;
}

/* ---------- Petición ---------- */
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST', true, 405);
    exit('Método no permitido');
}

// Si el cuerpo supera post_max_size, PHP descarta $_POST y $_FILES
if (empty($_POST) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    volver('error', 'tamano');
}

// Trampa para bots: campo oculto que una persona nunca rellena
if (trim((string) ($_POST['empresa_web'] ?? '')) !== '') {
    volver('success');
}

$nombre  = limpiar((string) ($_POST['name'] ?? ''), 80);
$correo  = limpiar((string) ($_POST['email'] ?? ''), 120);
$celular = preg_replace('/^\+?52/', '', preg_replace('/[\s\-().]/', '', (string) ($_POST['phone'] ?? '')) ?? '') ?? '';

if ((function_exists('mb_strlen') ? mb_strlen($nombre) : strlen($nombre)) < 3
    || !filter_var($correo, FILTER_VALIDATE_EMAIL)
    || !preg_match('/^\d{10}$/', $celular)) {
    volver('error', 'validacion');
}

/* ---------- CV (opcional) ---------- */
$cv = null;
if (isset($_FILES['cv']) && is_array($_FILES['cv']) && ($_FILES['cv']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
    $f = $_FILES['cv'];
    if (in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || (int) $f['size'] > MAX_CV) {
        volver('error', 'tamano');
    }
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
        volver('error', 'archivo');
    }
    $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
    if (!isset(FIRMAS_CV[$ext])) {
        volver('error', 'archivo');
    }
    $firma = (string) file_get_contents($f['tmp_name'], false, null, 0, strlen(FIRMAS_CV[$ext]));
    if ($firma !== FIRMAS_CV[$ext]) {
        volver('error', 'archivo');                                  // la extensión no corresponde al contenido
    }
    // Nombre seguro para el adjunto: «CV - Nombre Apellido.pdf» (sin rutas ni caracteres raros)
    $base = preg_replace('/[^\p{L}\p{N} .-]+/u', '', $nombre) ?: 'candidato';
    $cv = ['ruta' => $f['tmp_name'], 'nombre' => 'CV - ' . $base . '.' . $ext, 'mime' => MIME_CV[$ext]];
}

/* ---------- Envío ---------- */
$cfg = cargarConfig();
if ($cfg === null || empty($cfg['destinatario']) || empty($cfg['remitente'])) {
    error_log('[E-Stop empleo] Falta la configuración de correo (estop-privado/correo.php).');
    volver('error', 'envio');
}

$h = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$telefonoVisible = substr($celular, 0, 2) . ' ' . substr($celular, 2, 4) . ' ' . substr($celular, 6);

try {
    $mail = new PHPMailer(true);
    $mail->CharSet = PHPMailer::CHARSET_UTF8;
    if (($cfg['transporte'] ?? 'smtp') === 'smtp') {
        $mail->isSMTP();
        $mail->Host       = (string) $cfg['smtp_host'];
        $mail->Port       = (int) ($cfg['smtp_puerto'] ?? 587);
        $mail->SMTPAuth   = true;
        $mail->Username   = (string) $cfg['smtp_usuario'];
        $mail->Password   = (string) $cfg['smtp_contrasena'];
        $seg = $cfg['smtp_seguridad'] ?? 'tls';
        $mail->SMTPSecure = $seg === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : ($seg === 'tls' ? PHPMailer::ENCRYPTION_STARTTLS : '');
        $mail->SMTPAutoTLS = $seg !== 'ninguna';
        $mail->Timeout    = 20;
    } else {
        $mail->isMail();                                            // alternativa si el hosting no permite SMTP autenticado
    }
    $mail->setFrom((string) $cfg['remitente'], (string) ($cfg['remitente_nombre'] ?? 'Sitio web E-Stop'));
    $mail->addAddress((string) $cfg['destinatario']);
    $mail->addReplyTo($correo, $nombre);
    $mail->Subject = 'Nueva solicitud de empleo - svp.com.mx';
    $mail->isHTML(true);
    $mail->Body = '<h2 style="font-family:Arial,sans-serif">Nueva solicitud de empleo</h2>'
        . '<table style="font-family:Arial,sans-serif;font-size:15px;border-collapse:collapse">'
        . '<tr><td style="padding:6px 16px 6px 0;color:#666">Nombre</td><td><strong>' . $h($nombre) . '</strong></td></tr>'
        . '<tr><td style="padding:6px 16px 6px 0;color:#666">Correo</td><td><a href="mailto:' . $h($correo) . '">' . $h($correo) . '</a></td></tr>'
        . '<tr><td style="padding:6px 16px 6px 0;color:#666">Celular</td><td><a href="tel:+52' . $h($celular) . '">' . $h($telefonoVisible) . '</a></td></tr>'
        . '<tr><td style="padding:6px 16px 6px 0;color:#666">Currículum</td><td>' . ($cv ? 'Adjunto: ' . $h($cv['nombre']) : 'No adjuntó archivo') . '</td></tr>'
        . '</table><p style="font-family:Arial,sans-serif;color:#888;font-size:12px">Enviado desde el formulario «Únete a nuestro equipo» de svp.com.mx. Responde a este correo para contestar al candidato.</p>';
    $mail->AltBody = "Nueva solicitud de empleo\n\nNombre: {$nombre}\nCorreo: {$correo}\nCelular: {$telefonoVisible}\nCurrículum: "
        . ($cv ? "adjunto ({$cv['nombre']})" : 'no adjuntó archivo') . "\n\nEnviado desde svp.com.mx";
    if ($cv) {
        $mail->addAttachment($cv['ruta'], $cv['nombre'], PHPMailer::ENCODING_BASE64, $cv['mime']);
    }
    $mail->send();
} catch (PHPMailerException $e) {
    error_log('[E-Stop empleo] Error de envío: ' . $e->getMessage());   // sin datos del candidato en el registro
    volver('error', 'envio');
}

volver('success');
