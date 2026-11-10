// Servidor SMTP mínimo para pruebas: exige AUTH (PLAIN/LOGIN) y guarda cada mensaje en memoria.
// No reenvía nada a Internet.
const net = require('net');

function crearServidorSmtp({ usuario, contrasena }) {
  const mensajes = [];
  const intentosAuth = [];
  const servidor = net.createServer((s) => {
    let buffer = '', enDatos = false, autenticado = false, esperandoLogin = null, actual = null, loginUsuario = '';
    const enviar = (l) => s.write(l + '\r\n');
    enviar('220 smtp-captura listo');
    s.on('data', (d) => {
      buffer += d.toString('binary');
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        if (enDatos) {
          const fin = buffer.indexOf('\r\n.\r\n');
          if (fin < 0) return;
          actual.datos = Buffer.from(buffer.slice(0, fin), 'binary').toString('utf8');
          buffer = buffer.slice(fin + 5);
          mensajes.push(actual); actual = null; enDatos = false;
          enviar('250 OK mensaje recibido');
          continue;
        }
        const linea = buffer.slice(0, i); buffer = buffer.slice(i + 2);
        const cmd = linea.toUpperCase();
        if (esperandoLogin === 'usuario') { loginUsuario = Buffer.from(linea, 'base64').toString(); esperandoLogin = 'clave'; enviar('334 UGFzc3dvcmQ6'); continue; }
        if (esperandoLogin === 'clave') {
          const clave = Buffer.from(linea, 'base64').toString(); esperandoLogin = null;
          autenticado = loginUsuario === usuario && clave === contrasena; intentosAuth.push({ usuario: loginUsuario, ok: autenticado });
          enviar(autenticado ? '235 Autenticado' : '535 Credenciales inválidas'); continue;
        }
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) { s.write('250-smtp-captura\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n'); }
        else if (cmd.startsWith('AUTH PLAIN')) {
          const [, u, c] = Buffer.from(linea.split(' ')[2] || '', 'base64').toString().split('\0');
          autenticado = u === usuario && c === contrasena; intentosAuth.push({ usuario: u, ok: autenticado });
          enviar(autenticado ? '235 Autenticado' : '535 Credenciales inválidas');
        }
        else if (cmd.startsWith('AUTH LOGIN')) { esperandoLogin = 'usuario'; enviar('334 VXNlcm5hbWU6'); }
        else if (cmd.startsWith('MAIL FROM')) { if (!autenticado) { enviar('530 Autenticación requerida'); continue; } actual = { de: linea.slice(10), para: [] }; enviar('250 OK'); }
        else if (cmd.startsWith('RCPT TO')) { actual?.para.push(linea.slice(8)); enviar('250 OK'); }
        else if (cmd === 'DATA') { enDatos = true; enviar('354 Fin con <CRLF>.<CRLF>'); }
        else if (cmd === 'QUIT') { enviar('221 Adiós'); s.end(); }
        else if (cmd === 'RSET' || cmd === 'NOOP') enviar('250 OK');
        else enviar('502 No implementado');
      }
    });
    s.on('error', () => {});
  });
  return {
    mensajes, intentosAuth,
    iniciar: (puerto) => new Promise((r) => servidor.listen(puerto, '127.0.0.1', r)),
    cerrar: () => new Promise((r) => servidor.close(r)),
  };
}

// Extrae partes MIME simples (cabeceras + cuerpo) de un mensaje
function partesMime(raw) {
  const m = raw.match(/boundary="?([^";\r\n]+)"?/);
  if (!m) return [{ cabeceras: raw.split('\r\n\r\n')[0], cuerpo: raw.split('\r\n\r\n').slice(1).join('\r\n\r\n') }];
  return raw.split('--' + m[1]).slice(1, -1).flatMap((p) => (p.includes('boundary=') ? partesMime(p) : [{ cabeceras: p.split('\r\n\r\n')[0], cuerpo: p.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim() }]));
}

module.exports = { crearServidorSmtp, partesMime };
