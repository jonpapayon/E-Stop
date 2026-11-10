/* Cotización por WhatsApp (sin backend): valida, arma un mensaje legible y abre wa.me.
   El número se lee del atributo data-whatsapp del formulario (única fuente). */
(() => {
  const form = document.getElementById('form-cotizacion');
  if (!form) return;
  const NUMERO = form.dataset.whatsapp;
  const $ = (s, c = form) => c.querySelector(s);
  const $$ = (s, c = form) => [...c.querySelectorAll(s)];
  const vista = $('[data-vista]'), resumen = $('#cot-errores'), listo = $('[data-listo]');
  const valor = (n) => (form.elements[n] && 'value' in form.elements[n] ? String(form.elements[n].value).trim() : '');
  const marcado = (n) => $(`input[name="${n}"]:checked`)?.value || '';
  const etiquetaDe = (n) => $(`input[name="${n}"]:checked`)?.closest('label')?.querySelector('span')?.textContent.trim() || '';
  let intentado = false;
  const tocados = new Set();

  /* ---------- Mostrar/ocultar grupos según el servicio ---------- */
  function actualizarGrupos() {
    const s = marcado('servicio');
    $$('[data-grupo]').forEach((g) => {
      const visible = s && (g.dataset.grupo === 'comun' || g.dataset.grupo === s);
      g.hidden = !visible;
      g.disabled = !visible;                       // los campos ocultos no se validan ni se envían
    });
    const cajones = $('[data-cajones]');
    const conEst = marcado('estacionamiento') === 'sí';
    cajones.hidden = !conEst; $('#cajones').disabled = !conEst;
  }

  /* ---------- Utilidades de formato ---------- */
  const hoyISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fechaLarga = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const f = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return f.charAt(0).toUpperCase() + f.slice(1);
  };
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const diasTexto = (lista) => {
    if (!lista.length) return '';
    if (lista.length === 7) return 'Todos los días';
    if (lista.join() === DIAS.slice(0, 5).join()) return 'Lunes a viernes';
    if (lista.join() === DIAS.slice(0, 6).join()) return 'Lunes a sábado';
    const t = lista.map((d) => d[0].toUpperCase() + d.slice(1));
    return t.length > 1 ? `${t.slice(0, -1).join(', ')} y ${t.at(-1)}` : t[0];
  };
  const entero = (s) => (/^\d+$/.test(s) ? Number(s) : NaN);

  /* ---------- Mensaje (formato de WhatsApp: *negrita*, _cursiva_) ---------- */
  function construirMensaje() {
    const s = marcado('servicio');
    const l = ['Hola, quiero cotizar valet parking con E-Stop.', ''];
    const fila = (k, v) => { if (v) l.push(`*${k}:* ${v}`); };
    fila('Servicio', s === 'evento' ? 'Evento' : s === 'negocio' ? 'Negocio' : '');
    if (s === 'evento') {
      fila('Fecha', valor('fecha') ? fechaLarga(valor('fecha')) : '');
      const d = entero(valor('dias')); fila('Días', d > 1 ? `${d}` : '');
      fila('Invitados', valor('invitados') ? `${Number(valor('invitados')).toLocaleString('es-MX')} aprox.` : '');
      fila('Lugar', valor('lugar'));
    }
    if (s === 'negocio') {
      fila('Tipo de negocio', etiquetaDe('tipoNegocio'));
      fila('Días de servicio', diasTexto($$('input[name="diasServicio"]:checked').map((i) => i.value)));
      const hi = valor('horaInicio'), hf = valor('horaFin');
      fila('Horario', hi && hf ? `${hi} a ${hf}${hf <= hi ? ' (cruza la medianoche)' : ''}` : hi ? `desde ${hi}` : hf ? `hasta ${hf}` : '');
      fila('Ubicación', valor('ubicacion'));
    }
    const est = marcado('estacionamiento');
    if (est) fila('Estacionamiento en el lugar', est === 'sí' && valor('cajones') ? `Sí, ${Number(valor('cajones')).toLocaleString('es-MX')} cajones` : est.charAt(0).toUpperCase() + est.slice(1));
    fila('Nombre', valor('nombre'));
    const msg = valor('mensaje');
    if (msg) { l.push('', '*Comentarios:*', msg); }
    l.push('', '_Enviado desde svp.com.mx_');
    return l.join('\n');
  }
  const enlaceWhatsApp = () => `https://wa.me/${NUMERO}?text=${encodeURIComponent(construirMensaje())}`;

  /* ---------- Validación ---------- */
  function errores() {
    const e = {};
    const s = marcado('servicio');
    if (!s) e.servicio = 'Elige si es para un evento o para un negocio.';
    if (s === 'evento') {
      if (!valor('fecha')) e.fecha = 'Indica la fecha del evento.';
      else if (valor('fecha') < hoyISO()) e.fecha = 'La fecha no puede ser anterior a hoy.';
      const d = valor('dias'); if (d && !(entero(d) >= 1 && entero(d) <= 60)) e.dias = 'Escribe un número de días entre 1 y 60.';
      const i = valor('invitados'); if (i && !(entero(i) >= 1 && entero(i) <= 100000)) e.invitados = 'Escribe un número válido de invitados.';
    }
    if (s === 'negocio' && !marcado('tipoNegocio')) e.tipoNegocio = 'Elige el tipo de negocio.';
    if (s && marcado('estacionamiento') === 'sí') { const c = valor('cajones'); if (c && !(entero(c) >= 1 && entero(c) <= 10000)) e.cajones = 'Escribe un número válido de cajones.'; }
    if (s) { const n = valor('nombre'); if (n.length < 2) e.nombre = n ? 'El nombre es demasiado corto.' : 'Escribe tu nombre.'; }
    return e;
  }

  function pintarErrores(todos) {
    const e = errores();
    ['servicio', 'fecha', 'dias', 'invitados', 'tipoNegocio', 'cajones', 'nombre'].forEach((k) => {
      const msg = (todos || tocados.has(k)) ? e[k] || '' : '';
      const p = document.getElementById('err-' + k);
      if (p) p.textContent = msg;
      const campos = form.elements[k] instanceof RadioNodeList ? [...form.elements[k]] : [form.elements[k]].filter(Boolean);
      campos.forEach((c) => c.setAttribute('aria-invalid', msg ? 'true' : 'false'));
      (campos[0]?.closest('.campo, .opciones, fieldset'))?.classList.toggle('is-error', !!msg);
    });
    return e;
  }

  /* ---------- Vista previa en vivo ---------- */
  function actualizar() {
    actualizarGrupos();
    vista.textContent = construirMensaje();
    $('[data-contador]').textContent = valor('mensaje').length;
    if (intentado) {
      const e = pintarErrores(true);
      if (!Object.keys(e).length) resumen.hidden = true;
    } else pintarErrores(false);
  }

  form.addEventListener('input', actualizar);
  form.addEventListener('change', (ev) => { if (ev.target.name) tocados.add(ev.target.name); actualizar(); });
  form.addEventListener('focusout', (ev) => { if (ev.target.name && ev.target.value) { tocados.add(ev.target.name); pintarErrores(false); } });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    intentado = true;
    const e = pintarErrores(true);
    const claves = Object.keys(e);
    if (claves.length) {
      resumen.hidden = false;
      resumen.textContent = claves.length === 1 ? 'Revisa 1 campo antes de enviar.' : `Revisa ${claves.length} campos antes de enviar.`;
      const primero = form.elements[claves[0]];
      (primero instanceof RadioNodeList ? primero[0] : primero)?.focus({ preventScroll: false });
      listo.hidden = true;
      return;
    }
    resumen.hidden = true;
    const url = enlaceWhatsApp();
    $('[data-enlace-wa]').href = url;
    listo.hidden = false;
    window.open(url, '_blank', 'noopener');
  });

  /* ---------- Preselección desde la URL: ?tipo=evento|negocio|restaurante|… ---------- */
  const tipo = new URLSearchParams(location.search).get('tipo');
  const NEGOCIOS = ['restaurante', 'oficina', 'hospital', 'centro-comercial', 'otro'];
  if (tipo === 'evento' || tipo === 'negocio' || NEGOCIOS.includes(tipo)) {
    $(`input[name="servicio"][value="${tipo === 'evento' ? 'evento' : 'negocio'}"]`).checked = true;
    if (NEGOCIOS.includes(tipo)) $(`input[name="tipoNegocio"][value="${tipo}"]`).checked = true;
  }
  $('#fecha').min = hoyISO();
  actualizar();

  // Exponer para pruebas automatizadas (solo lectura)
  window.__cotizacion = { construirMensaje, enlaceWhatsApp };
})();
