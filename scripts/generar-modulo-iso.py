#!/usr/bin/env python3
"""Genera la ilustración isométrica del módulo (sección «Módulos y sombrillas» de la Home).

Geometría por proyección isométrica exacta (30°): nada dibujado a mano.
Salida: el <svg> en línea y las posiciones (%) de las etiquetas HTML de las cotas.
Uso:  python3 scripts/generar-modulo-iso.py > /tmp/modulo.html
"""
import math

W, H = 600, 750               # lienzo 4:5 (igual que el panel)
OX, OY, S = 330, 585, 66      # origen en pantalla y escala
C, SN = math.cos(math.radians(30)), math.sin(math.radians(30))

def iso(x, y, z=0.0):
    return (OX + (x - y) * C * S, OY + (x + y) * SN * S - z * S * 1.15)

def pts(*p):
    return ' '.join(f'{a:.1f},{b:.1f}' for a, b in (iso(*q) for q in p))

def line(a, b, **kw):
    (x1, y1), (x2, y2) = iso(*a), iso(*b)
    attrs = ' '.join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" pathLength="1" {attrs}/>'

o = []
o.append(f'<svg class="iso" viewBox="0 0 {W} {H}" role="img" aria-labelledby="iso-titulo" focusable="false">')
o.append('<title id="iso-titulo">Vista isométrica abstracta de un módulo de valet parking con sombrilla, dentro de un cajón de estacionamiento</title>')
o.append('<defs><radialGradient id="iso-fade" cx="50%" cy="72%" r="62%"><stop offset="0" stop-color="#fff"/><stop offset=".75" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
         '<mask id="iso-mask"><rect width="100%" height="100%" fill="url(#iso-fade)"/></mask></defs>')

# 1 · Retícula isométrica del suelo
o.append('<g class="iso__reticula" mask="url(#iso-mask)">')
for k in [i * 0.8 for i in range(-6, 7)]:
    o.append(line((k, -5), (k, 5), style=f'--i:{abs(k):.1f}'))
    o.append(line((-5, k), (5, k), style=f'--i:{abs(k):.1f}'))
o.append('</g>')

# 2 · Cajón de estacionamiento (U) alrededor del módulo
o.append('<g class="iso__cajon">')
o.append(f'<polyline pathLength="1" points="{pts((2.1, -1.25), (-1.45, -1.25), (-1.45, 1.25), (2.1, 1.25))}"/>')
o.append('</g>')

# 3 · Sombra proyectada
o.append(f'<polygon class="iso__sombra" points="{pts((-0.9, 0.6), (0.9, 0.6), (2.5, 1.6), (0.7, 1.6))} {pts((0.9, -0.6))}"/>')

# 4 · Sombrilla (estructura alámbrica, detrás del módulo)
mx, my, zc = -2.75, -0.55, 3.55
o.append('<g class="iso__sombrilla">')
o.append(line((mx, my, 0), (mx, my, zc), **{'class': 'iso__mastil'}))
a, b = 0.95, 0.95
cuad = [(mx - a, my - b, zc), (mx + a, my - b, zc), (mx + a, my + b, zc), (mx - a, my + b, zc)]
cuad_b = [(x, y, zc - 0.12) for x, y, _ in cuad]
o.append(f'<polygon class="iso__toldo" points="{pts(*cuad)}"/>')
o.append(f'<polyline class="iso__toldo-canto" points="{pts(cuad[3], cuad_b[3], cuad_b[2], cuad_b[1], cuad[1])}"/>')
for c in cuad:                               # varillas hasta el mástil
    o.append(line((mx, my, zc + 0.35), c, **{'class': 'iso__varilla'}))
o.append('</g>')

# 5 · Módulo: monolito con tres caras, banda de marca y compartimento
x0, x1, y0, y1, z1 = -0.9, 0.9, -0.6, 0.6, 3.2
o.append('<g class="iso__modulo">')
o.append(f'<polygon class="cara-y" points="{pts((x0, y1, 0), (x1, y1, 0), (x1, y1, z1), (x0, y1, z1))}"/>')
o.append(f'<polygon class="cara-x" points="{pts((x1, y0, 0), (x1, y1, 0), (x1, y1, z1), (x1, y0, z1))}"/>')
o.append(f'<polygon class="cara-z" points="{pts((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))}"/>')
# encimera: placa ligeramente volada
e = 0.08
o.append(f'<polygon class="iso__encimera" points="{pts((x0 - e, y1 + e, z1), (x1 + e, y1 + e, z1), (x1 + e, y0 - e, z1), (x1 + e, y0 - e, z1 + 0.1), (x1 + e, y1 + e, z1 + 0.1), (x0 - e, y1 + e, z1 + 0.1))}"/>')
o.append(f'<polygon class="cara-z" points="{pts((x0 - e, y0 - e, z1 + 0.1), (x1 + e, y0 - e, z1 + 0.1), (x1 + e, y1 + e, z1 + 0.1), (x0 - e, y1 + e, z1 + 0.1))}"/>')
# banda de marca (personalizable) en ambas caras visibles
zb0, zb1 = 2.35, 2.75
o.append('<g class="iso__banda">')
o.append(f'<polygon points="{pts((x0, y1, zb0), (x1, y1, zb0), (x1, y1, zb1), (x0, y1, zb1))}"/>')
o.append(f'<polygon class="sombra" points="{pts((x1, y0, zb0), (x1, y1, zb0), (x1, y1, zb1), (x1, y0, zb1))}"/>')
o.append('</g>')
# compartimento de resguardo (cara frontal izquierda)
o.append(f'<polygon class="iso__hueco" points="{pts((-0.55, y1, 0.95), (0.55, y1, 0.95), (0.55, y1, 1.75), (-0.55, y1, 1.75))}"/>')
o.append(line((-0.55, y1, 1.75), (0.55, y1, 1.75), **{'class': 'iso__filo'}))
# arista luminosa
o.append(line((x1, y1, 0), (x1, y1, z1), **{'class': 'iso__arista'}))
o.append('</g>')

# 6 · Cotas: punto en la geometría → línea → etiqueta (las etiquetas son HTML)
cotas = [
    (1, (0.0, y1, 1.35), 'izq', 40),     # resguardo
    (2, (x1, 0.0, 2.55), 'der', 560),    # banda de marca
    (3, (mx + a, my - b, zc), 'der', 560),  # sombrilla (esquina derecha del toldo)
]
etiquetas = []
o.append('<g class="iso__cotas">')
for n, p, lado, xf in cotas:
    px, py = iso(*p)
    o.append(f'<g class="iso__cota" data-cota="{n}"><line x1="{px:.1f}" y1="{py:.1f}" x2="{xf}" y2="{py:.1f}" pathLength="1"/>'
             f'<circle cx="{px:.1f}" cy="{py:.1f}" r="4.5"/><circle class="anillo" cx="{px:.1f}" cy="{py:.1f}" r="11"/></g>')
    etiquetas.append((n, lado, xf / W * 100, py / H * 100))
o.append('</g></svg>')

print('\n'.join(o))
print('<!-- etiquetas: ' + '; '.join(f'{n}:{lado}:{x:.2f}%:{y:.2f}%' for n, lado, x, y in etiquetas) + ' -->')
