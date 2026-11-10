# Fotografía auténtica del cliente

El rediseño usa temporalmente un hero tipográfico y el Audi existente (decisión C).
**No se usan fotos de stock que aparenten mostrar instalaciones, personal o equipo de E-Stop.**

Cuando el cliente entregue fotografías reales:

1. Copiarlas a `assets/fotos/originales/` con el nombre del hueco (tabla abajo), p. ej. `hero.jpg`.
2. Ejecutar `npm run imagenes`. Se generan en `assets/img/fotos/` las variantes
   `nombre-640|1024|1600|2400.avif|webp|jpg` (nunca se amplía una foto más pequeña).
3. En la página, sustituir el marcador `<div class="foto foto--vacia" data-hueco="…">` por:

```html
<picture class="foto">
  <source type="image/avif" srcset="assets/img/fotos/hero-1024.avif 1024w, assets/img/fotos/hero-1600.avif 1600w, assets/img/fotos/hero-2400.avif 2400w" sizes="100vw">
  <source type="image/webp" srcset="assets/img/fotos/hero-1024.webp 1024w, assets/img/fotos/hero-1600.webp 1600w, assets/img/fotos/hero-2400.webp 2400w" sizes="100vw">
  <img src="assets/img/fotos/hero-1600.jpg" alt="Descripción real de la escena" width="1600" height="1067" loading="lazy" decoding="async">
</picture>
```

## Huecos previstos

| Nombre | Dónde | Mínimo recomendado | Contenido sugerido (real) |
|---|---|---|---|
| `hero` | Inicio, cabecera | 2400 × 1600, horizontal | Operación nocturna o recepción de vehículos, con espacio negativo a la izquierda para el titular |
| `operacion-evento` | Inicio, servicios / Eventos | 1600 × 2000, vertical | Valet recibiendo un vehículo en un evento |
| `modulo` | Inicio, módulos y sombrillas | 1600 × 2000, vertical | Módulo real personalizado instalado en un cliente |
| `equipo` | Nosotros | 2400 × 1400, horizontal | Personal uniformado (con autorización de las personas que aparezcan) |
| `estacionamiento` | Nosotros, historia | 2400 × 1400, horizontal | Estacionamiento operado por E-Stop |

Recomendaciones: luz natural o nocturna con contraste, sin filtros fuertes, encuadres limpios.
Las fotos con personas requieren su consentimiento para uso comercial.
