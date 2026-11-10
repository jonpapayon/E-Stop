/* Solicitud de empleo: validación, estado de carga y confirmación.
   El envío sigue siendo un POST nativo multipart a FormSubmit (el CV viaja adjunto).
   No se usa fetch: así el flujo es idéntico al de producción y funciona sin JavaScript. */
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

  /* ---------- Confirmación tras el redireccionamiento de FormSubmit ---------- */
  const resultado = new URLSearchParams(location.search).get('result');
  if (resultado === 'success') {
    form.hidden = true;
    confirmacion.hidden = false;
    document.getElementById('alert').textContent = '¡Gracias! Recibimos tu solicitud. Nos pondremos en contacto pronto.';
    confirmacion.focus({ preventScroll: true });
    requestAnimationFrame(() => confirmacion.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    // Analítica: solicitud aceptada por el proveedor (una vez por sesión)
    try {
      if (!sessionStorage.getItem('estop_empleo_ok')) {
        (window.estopAnalitica || ((e, d) => (window.dataLayer = window.dataLayer || []).push({ event: e, ...d })))('estop_solicitud_empleo_completada', {});
        sessionStorage.setItem('estop_empleo_ok', '1');
      }
    } catch { /* almacenamiento no disponible: se omite la deduplicación */ }
    return;
  }

  form.noValidate = true;                               // validación propia (con JS); sin JS valida el navegador

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
    // Válido: se deja continuar el POST nativo y se muestra el estado de carga
    resumen.hidden = true;
    boton.setAttribute('aria-busy', 'true');
    boton.querySelector('[data-texto]').textContent = archivo.files.length ? 'Enviando solicitud y CV…' : 'Enviando solicitud…';
  });

  // Al volver con «Atrás» (bfcache) el botón no debe quedarse bloqueado
  addEventListener('pageshow', () => { boton.removeAttribute('aria-busy'); boton.querySelector('[data-texto]').textContent = 'Enviar solicitud'; });
})();
