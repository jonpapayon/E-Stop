/* Solicitud de empleo: validación, estado de carga, error y confirmación.
   El envío es un POST nativo multipart a enviar-solicitud.php (PHP en el hosting cPanel), que
   redirige con ?result=success | ?result=error&motivo=…  Funciona también sin JavaScript. */
(() => {
  const form = document.querySelector('[data-formulario-empleo]');
  if (!form) return;
  const confirmacion = document.querySelector('[data-confirmacion]');
  const resumen = form.querySelector('[data-resumen]');
  const boton = form.querySelector('[data-enviar]');
  const caja = form.querySelector('[data-archivo]');
  const archivo = form.querySelector('#cv');
  const quitar = form.querySelector('[data-quitar]');
  const MAX = 10 * 1024 * 1024;                       // límite de FormSubmit para adjuntos
  const TIPOS = /\.(pdf|docx?)$/i;
  let intentado = false;
  const tocados = new Set();

  /* ---------- Resultado devuelto por enviar-solicitud.php ---------- */
  const params = new URLSearchParams(location.search);
  const resultado = params.get('result');
  if (resultado === 'success') {
    form.hidden = true;
    confirmacion.hidden = false;
    document.getElementById('alert').textContent = '¡Gracias! Recibimos tu solicitud. Nos pondremos en contacto pronto.';
    confirmacion.focus({ preventScroll: true });
    requestAnimationFrame(() => confirmacion.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    // Analítica: el servidor aceptó y envió la solicitud (una vez por sesión)
    try {
      if (!sessionStorage.getItem('estop_empleo_ok')) {
        (window.estopAnalitica || ((e, d) => (window.dataLayer = window.dataLayer || []).push({ event: e, ...d })))('estop_solicitud_empleo_completada', {});
        sessionStorage.setItem('estop_empleo_ok', '1');
      }
    } catch { /* almacenamiento no disponible: se omite la deduplicación */ }
    return;
  }

  form.noValidate = true;                               // validación propia (con JS); sin JS validan el navegador y el servidor

  // Error devuelto por el servidor
  const MOTIVOS = {
    validacion: 'Revisa tus datos: nombre completo, correo válido y celular de 10 dígitos.',
    archivo: 'El currículum no es válido. Adjunta un PDF o un Word (.pdf, .doc, .docx).',
    tamano: 'El archivo es demasiado grande. El máximo es 10 MB.',
    envio: 'No pudimos enviar tu solicitud en este momento. Inténtalo más tarde o llámanos al 33 3870 4157.',
  };
  if (resultado === 'error') {
    resumen.hidden = false;
    resumen.textContent = MOTIVOS[params.get('motivo')] || MOTIVOS.envio;
    requestAnimationFrame(() => { resumen.scrollIntoView({ block: 'center' }); resumen.focus({ preventScroll: true }); });
  }

  const v = (id) => form.elements[id].value.trim();
  const digitos = (s) => s.replace(/[\s\-().]/g, '').replace(/^\+?52/, '');
  const reglas = {
    name: () => (v('name').length < 3 ? (v('name') ? 'Escribe tu nombre completo.' : 'Escribe tu nombre.') : ''),
    email: () => (!v('email') ? 'Escribe tu correo electrónico.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email')) ? '' : 'Revisa el formato del correo (ej. nombre@correo.com).'),
    phone: () => (!v('phone') ? 'Escribe tu número de celular.' : /^\d{10}$/.test(digitos(v('phone'))) ? '' : 'Escribe un celular de 10 dígitos.'),
    cv: () => {
      const f = archivo.files && archivo.files[0];
      if (!f) return '';
      if (!TIPOS.test(f.name)) return 'El currículum debe ser PDF o Word (.pdf, .doc, .docx).';
      if (f.size > MAX) return `El archivo pesa ${(f.size / 1048576).toFixed(1)} MB; el máximo es 10 MB.`;
      return '';
    },
  };

  function pintar(todos) {
    const errores = {};
    for (const [k, regla] of Object.entries(reglas)) {
      const msg = regla();
      if (msg) errores[k] = msg;
      const visible = todos || tocados.has(k) ? msg : '';
      document.getElementById('err-' + k).textContent = visible;
      form.elements[k].setAttribute('aria-invalid', visible ? 'true' : 'false');
      (k === 'cv' ? caja : form.elements[k].closest('.campo')).classList.toggle('is-error', !!visible);
    }
    return errores;
  }

  const revalidar = () => { if (intentado) { const e = pintar(true); if (!Object.keys(e).length) resumen.hidden = true; } };
  form.addEventListener('input', revalidar);
  form.addEventListener('change', revalidar);
  form.addEventListener('focusout', (ev) => { if (ev.target.name && ev.target.value) { tocados.add(ev.target.name); pintar(intentado); } });

  /* ---------- Archivo: nombre, tamaño, quitar y arrastrar ---------- */
  function actualizarArchivo() {
    tocados.add('cv');
    quitar.hidden = !(archivo.files && archivo.files.length);
    pintar(intentado);
  }
  archivo.addEventListener('change', actualizarArchivo);
  quitar.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    archivo.value = '';
    archivo.dispatchEvent(new Event('change', { bubbles: true }));    // sitio.js limpia el nombre mostrado
    archivo.focus();
  });
  ['dragenter', 'dragover'].forEach((t) => caja.addEventListener(t, () => caja.classList.add('is-arrastrando')));
  ['dragleave', 'drop'].forEach((t) => caja.addEventListener(t, () => caja.classList.remove('is-arrastrando')));

  /* ---------- Envío ---------- */
  form.addEventListener('submit', (ev) => {
    intentado = true;
    const errores = pintar(true);
    const claves = Object.keys(errores);
    if (claves.length) {
      ev.preventDefault();
      resumen.hidden = false;
      resumen.textContent = claves.length === 1 ? 'Revisa 1 campo antes de enviar.' : `Revisa ${claves.length} campos antes de enviar.`;
      form.elements[claves[0]].focus();
      return;
    }
    // Vista previa en Vercel: no hay PHP. Se muestra un aviso claro en lugar de un error del servidor.
    if (/\.vercel\.app$/.test(location.hostname)) {
      ev.preventDefault();
      resumen.hidden = false;
      resumen.classList.add('form-resumen--info');
      resumen.textContent = 'Vista previa: en el sitio publicado esta solicitud se envía por correo desde el servidor de E-Stop (PHP), con el CV adjunto. En esta demostración no se envió ningún dato.';
      resumen.focus();
      return;
    }
    // Válido: se deja continuar el POST nativo y se muestra el estado de carga
    resumen.classList.remove('form-resumen--info');
    resumen.hidden = true;
    boton.setAttribute('aria-busy', 'true');
    boton.querySelector('[data-texto]').textContent = archivo.files.length ? 'Enviando solicitud y CV…' : 'Enviando solicitud…';
  });

  // Al volver con «Atrás» (bfcache) el botón no debe quedarse bloqueado
  addEventListener('pageshow', () => { boton.removeAttribute('aria-busy'); boton.querySelector('[data-texto]').textContent = 'Enviar solicitud'; });
})();
