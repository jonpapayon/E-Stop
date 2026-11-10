<?php
/**
 * PLANTILLA de configuración de correo para enviar-solicitud.php (sin datos reales).
 *
 * En el hosting cPanel del cliente:
 *   1. Copiar este archivo a  /home/USUARIO/estop-privado/correo.php
 *      (carpeta HERMANA de public_html, nunca dentro de public_html).
 *   2. Rellenar los valores con los datos SMTP que entregue el cliente.
 *   3. Permisos recomendados: 600 (solo lectura/escritura del propietario).
 *
 * Datos que hay que pedir al cliente: ver DESPLIEGUE-CPANEL.md › «Datos necesarios del cliente».
 */
return [
    // 'smtp' (recomendado: SMTP autenticado) o 'mail' (función mail() de PHP, si el hosting no permite SMTP)
    'transporte'       => 'smtp',

    'smtp_host'        => 'mail.EJEMPLO.com',     // p. ej. el servidor de correo del dominio en cPanel
    'smtp_puerto'      => 587,                    // 587 con 'tls' (STARTTLS) · 465 con 'ssl'
    'smtp_seguridad'   => 'tls',                  // 'tls' | 'ssl' | 'ninguna' (solo pruebas locales)
    'smtp_usuario'     => 'CUENTA@EJEMPLO.com',   // cuenta de correo del dominio que envía
    'smtp_contrasena'  => 'CAMBIAR',              // contraseña de esa cuenta (nunca en el repositorio)

    'remitente'        => 'CUENTA@EJEMPLO.com',   // debe ser una cuenta del dominio (SPF/DKIM)
    'remitente_nombre' => 'Sitio web E-Stop',
    'destinatario'     => 'DESTINO@EJEMPLO.com',  // buzón que recibe las solicitudes de empleo
];
