/* E-Stop · comportamiento compartido (sin dependencias).
   Mejora progresiva: sin JS el sitio es navegable y los formularios funcionan. */
(() => {
  const html = document.documentElement;
  html.classList.add('js');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Analítica: eventos propios en dataLayer (GTM) ----------
     Solo se empujan eventos con prefijo «estop_»: ningún disparador actual del contenedor
     (gtm.js, gtm.init, gtm.linkClick) los escucha, así que no duplican conversiones.
     No se envían datos personales (nombre, comentarios, ubicación).
       estop_clic_cotizar        → clic en un enlace hacia cotizar.html {origen, servicio}
       estop_whatsapp_abierto    → se abre WhatsApp (enlace o formulario) {origen}
       estop_formulario_cotizacion_completado → el formulario pasó la validación y se abrió
                                    WhatsApp; NO confirma que el mensaje se haya enviado */
  const capa = (event, datos = {}) => { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ event, ...datos }); };
  window.estopAnalitica = capa;
  const ORIGENES = [['.wa-flotante', 'flotante'], ['.barra-movil', 'barra_movil'], ['.menu-movil', 'menu_movil'], ['.cabecera', 'cabecera'],
    ['.pie', 'pie'], ['.hero', 'hero'], ['#servicios', 'servicios'], ['.modulos', 'modulos'], ['#preguntas', 'preguntas'],
    ['.cierre', 'cierre'], ['.cot__listo', 'formulario_respaldo'], ['.cot__alterno', 'cotizar_alterno'], ['main', 'contenido']];
  const origenDe = (a) => a.dataset.origen || (ORIGENES.find(([s]) => a.closest(s)) || [0, 'otro'])[1];
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    let u; try { u = new URL(a.href, location.href); } catch { return; }
    if (/(^|\.)whatsapp\.com$|^wa\.me$/.test(u.hostname)) capa('estop_whatsapp_abierto', { origen: origenDe(a) });
    else if (/\/cotizar\.html$/.test(u.pathname) && u.origin === location.origin) capa('estop_clic_cotizar', { origen: origenDe(a), servicio: u.searchParams.get('tipo') || '' });
  }, true);

  /* ---------- Cabecera: sólida al hacer scroll, se oculta al bajar ---------- */
  const cabecera = document.querySelector('.cabecera');
  if (cabecera) {
    let ultimo = scrollY, pendiente = false;
    const actualizar = () => {
      const y = scrollY;
      cabecera.classList.toggle('is-solida', y > 24);
      const bajando = y > ultimo && y > 320;
      if (!html.classList.contains('menu-abierto')) cabecera.classList.toggle('is-oculta', bajando);
      ultimo = y; pendiente = false;
    };
    addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(actualizar); } }, { passive: true });
    actualizar();
  }

  /* ---------- Menú móvil accesible ---------- */
  const boton = document.querySelector('.hamburguesa');
  const menu = boton && document.getElementById(boton.getAttribute('aria-controls'));
  if (boton && menu) {
    const enfocables = () => [...menu.querySelectorAll('a, button')];
    const abrir = (estado) => {
      boton.setAttribute('aria-expanded', String(estado));
      boton.setAttribute('aria-label', estado ? 'Cerrar menú' : 'Abrir menú');
      menu.classList.toggle('is-abierto', estado);
      menu.toggleAttribute('inert', !estado);
      html.classList.toggle('menu-abierto', estado);
      if (estado) setTimeout(() => enfocables()[0]?.focus({ preventScroll: true }), 200);
      else boton.focus({ preventScroll: true });
    };
    menu.setAttribute('inert', '');
    boton.addEventListener('click', () => abrir(boton.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) abrir(false); });
    document.addEventListener('keydown', (e) => {
      if (!menu.classList.contains('is-abierto')) return;
      if (e.key === 'Escape') abrir(false);
      if (e.key === 'Tab') {                         // ciclo de foco dentro del menú + botón
        const lista = [boton, ...enfocables()], i = lista.indexOf(document.activeElement);
        const sig = e.shiftKey ? (i <= 0 ? lista.length - 1 : i - 1) : (i === lista.length - 1 ? 0 : i + 1);
        e.preventDefault(); lista[sig].focus();
      }
    });
    matchMedia('(min-width: 961px)').addEventListener('change', (m) => { if (m.matches && menu.classList.contains('is-abierto')) abrir(false); });
  }

  /* ---------- Revelado al entrar en pantalla ---------- */
  const revelables = document.querySelectorAll('.revelar');
  if (reducido || !('IntersectionObserver' in window)) {
    revelables.forEach((el) => el.classList.add('is-visible'));
  } else {
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revelables.forEach((el) => io.observe(el));
  }

  /* ---------- Acordeón con altura animada (sobre <details> nativo) ---------- */
  if (!reducido) document.querySelectorAll('.acordeon details').forEach((d) => {
    const resumen = d.querySelector('summary'), cuerpo = d.querySelector('.acordeon__cuerpo');
    if (!resumen || !cuerpo) return;
    let anim = null;
    resumen.addEventListener('click', (e) => {
      e.preventDefault();
      anim?.cancel();
      const abriendo = !d.open;
      if (abriendo) d.open = true;
      const h = cuerpo.scrollHeight;
      anim = cuerpo.animate(
        abriendo ? [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }] : [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
        { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
      cuerpo.style.overflow = 'hidden';
      anim.onfinish = () => { cuerpo.style.overflow = ''; if (!abriendo) d.open = false; anim = null; };
    });
  });

  /* ---------- Paralaje por capas con el puntero ([data-paralaje] → --px/--py en -1…1) ---------- */
  if (!reducido && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-paralaje]').forEach((el) => {
      let raf = 0;
      el.addEventListener('pointermove', (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
          el.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
        });
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--px', 0); el.style.setProperty('--py', 0); });
    });
  }

  /* ---------- Campo de archivo: muestra el nombre elegido ---------- */
  document.querySelectorAll('.archivo input[type="file"]').forEach((input) => {
    const caja = input.closest('.archivo'), nombre = caja.querySelector('.archivo__nombre');
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      caja.classList.toggle('has-archivo', !!f);
      const tam = f && (f.size < 1048576 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1048576).toFixed(1)} MB`);
      if (nombre) nombre.textContent = f ? `${f.name} · ${tam}` : '';
    });
  });
})();
