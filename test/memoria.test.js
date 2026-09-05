// La memoria de Escriba, por cliente. El bucle anterior —escribir en el
// expediente del usuario— nunca cerró ni una vez: el prompt leía los primeros
// 60.000 caracteres y dossier.js escribía al final, así que Escriba escribía
// exactamente donde el lector no mira.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const MEM = require('../lib/memoria');

const MINUTA = `**Acme · 21 de agosto de 2026 · 15 min**

## Lo que quedó definido

Se rediseña el catálogo por línea de producto antes de marzo.

El envío gratis baja de 800 a 499 pesos.

## Compromisos

| Compromiso | Responsable | Fecha |
|---|---|---|
| Mandar la cotización | Nosotros | 20 de enero |
| Confirmar el presupuesto | Acme | 25 de enero |

## Notas internas (no enviar)

### Lo que NO se dijo
- El precio nunca se mencionó.
- Los correos siguen pendientes.
`;

function clienteNuevo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-mem-'));
  fs.mkdirSync(path.join(dir, '2026-08-21_110000'), { recursive: true });
  return dir;
}

test('anota lo acordado aunque la minuta use encabezados normales', () => {
  const dir = clienteNuevo();
  const r = MEM.anotar({ dirCliente: dir, id: '2026-08-21_110000', fecha: '21 de agosto',
                         minuta: MINUTA, carpeta: path.join(dir, '2026-08-21_110000') });
  assert.strictEqual(r.ok, true);
  const m = MEM.leer(dir);
  assert.match(m, /Se rediseña el catálogo/,
    'el filtro anterior por líneas que empiezan en ** dejaba esto fuera');
  assert.match(m, /El envío gratis baja/);
});

test('guarda los compromisos con su estado, no solo prosa', () => {
  const dir = clienteNuevo();
  MEM.anotar({ dirCliente: dir, id: '2026-08-21_110000', fecha: '21 de agosto',
               minuta: MINUTA, carpeta: path.join(dir, '2026-08-21_110000') });
  const m = MEM.leer(dir);
  assert.match(m, /\[ \] Mandar la cotización — Nosotros · 20 de enero/,
    'las tablas de compromisos se descartaban enteras');
  assert.match(m, /\[ \] Confirmar el presupuesto — Acme/);
});

test('guarda lo que quedó sin resolver, que es el combustible del diferenciador', () => {
  const dir = clienteNuevo();
  MEM.anotar({ dirCliente: dir, id: '2026-08-21_110000', fecha: '21 de agosto',
               minuta: MINUTA, carpeta: path.join(dir, '2026-08-21_110000') });
  const m = MEM.leer(dir);
  assert.match(m, /El precio nunca se mencionó/);
  assert.match(m, /Quedó sin resolver/);
});

// La deduplicación por fecha del día hacía que la SEGUNDA reunión del mismo día
// con el mismo cliente no se anotara nunca, y sin decirlo.
test('dos reuniones el mismo día se anotan las dos', () => {
  const dir = clienteNuevo();
  const a = MEM.anotar({ dirCliente: dir, id: '2026-08-21_110000', fecha: '21 de agosto',
                         minuta: MINUTA, carpeta: path.join(dir, '2026-08-21_110000') });
  const b = MEM.anotar({ dirCliente: dir, id: '2026-08-21_154500', fecha: '21 de agosto',
                         minuta: MINUTA, carpeta: path.join(dir, '2026-08-21_154500') });
  assert.strictEqual(a.ok, true);
  assert.strictEqual(b.ok, true, 'la segunda del mismo día también entra');
  assert.strictEqual(MEM.leer(dir).match(/<!-- reunion:/g).length, 2);
});

test('la misma reunión no se anota dos veces', () => {
  const dir = clienteNuevo();
  const datos = { dirCliente: dir, id: '2026-08-21_110000', fecha: '21 de agosto',
                  minuta: MINUTA, carpeta: path.join(dir, '2026-08-21_110000') };
  MEM.anotar(datos);
  assert.deepStrictEqual(MEM.anotar(datos), { ok: false, motivo: 'ya registrada' });
});

test('borrar una reunión quita su bloque y deja los demás', () => {
  const dir = clienteNuevo();
  MEM.anotar({ dirCliente: dir, id: 'A', fecha: '1 de agosto', minuta: MINUTA, carpeta: path.join(dir, 'A') });
  MEM.anotar({ dirCliente: dir, id: 'B', fecha: '2 de agosto', minuta: MINUTA, carpeta: path.join(dir, 'B') });
  assert.strictEqual(MEM.quitar(dir, 'A'), true);
  const m = MEM.leer(dir);
  assert.doesNotMatch(m, /reunion:A/);
  assert.match(m, /reunion:B/);
  assert.match(m, /2 de agosto/);
});

test('quitar una reunión que no está no rompe nada', () => {
  const dir = clienteNuevo();
  assert.strictEqual(MEM.quitar(dir, 'no-existe'), false);
  assert.strictEqual(MEM.quitar('/tmp/no/existe', 'A'), false);
});

test('sin carpeta de cliente lo dice, no revienta', () => {
  assert.deepStrictEqual(MEM.anotar({ dirCliente: null, id: 'A', fecha: 'x', minuta: MINUTA, carpeta: '/tmp' }),
                         { ok: false, motivo: 'sin carpeta de cliente' });
});

// Qué le debes a este cliente hoy, juntando todas sus reuniones.
test('los pendientes juntan todas las reuniones sin repetir', () => {
  const dir = clienteNuevo();
  const c1 = path.join(dir, 'r1'), c2 = path.join(dir, 'r2');
  fs.mkdirSync(c1, { recursive: true }); fs.mkdirSync(c2, { recursive: true });
  const abiertos = MEM.pendientes([{ id: 'r1', carpeta: c1, minuta: MINUTA },
                                   { id: 'r2', carpeta: c2, minuta: MINUTA }]);
  assert.strictEqual(abiertos.length, 2, 'el mismo compromiso en dos reuniones cuenta una vez');
  require('../lib/minuta').marcar(c1, 'Mandar la cotización', true);
  const tras = MEM.pendientes([{ id: 'r1', carpeta: c1, minuta: MINUTA }]);
  assert.deepStrictEqual(tras.map(c => c.texto), ['Confirmar el presupuesto']);
});

// --- los fallos que encontró la revisión ---
test('un párrafo largo no deja fuera una frase corta que viene después', () => {
  assert.deepStrictEqual(MEM.resumirAcuerdos('x'.repeat(1300) + '\n\ncorto pero importante', 1200),
                         ['corto pero importante']);
});

test('volver a redactar reemplaza el bloque en vez de dejar el viejo', () => {
  const dir = clienteNuevo();
  const base = { dirCliente: dir, id: 'A', fecha: '1', carpeta: path.join(dir, 'A') };
  MEM.anotar({ ...base, minuta: MINUTA });
  const r = MEM.anotar({ ...base, minuta: MINUTA.replace('Se rediseña el catálogo', 'NUEVO ACUERDO'), reemplazar: true });
  assert.strictEqual(r.ok, true);
  const m = MEM.leer(dir);
  assert.match(m, /NUEVO ACUERDO/);
  assert.doesNotMatch(m, /Se rediseña el catálogo/, 'la versión descartada no puede quedarse');
  assert.strictEqual((m.match(/<!-- reunion:/g) || []).length, 1);
});

test('un id con --> no rompe el marcador', () => {
  const dir = clienteNuevo();
  MEM.anotar({ dirCliente: dir, id: 'x --> y', fecha: '1', minuta: MINUTA, carpeta: path.join(dir, 'x') });
  assert.doesNotMatch(MEM.leer(dir), /reunion:x --> y -->/);
});

test('las citas de audio no llegan a la memoria del cliente', () => {
  const dir = clienteNuevo();
  const conCitas = MINUTA.replace('Mandar la cotización |', 'Mandar la cotización [03:15] |')
                         .replace('El precio nunca se mencionó.', 'El precio nunca se mencionó. [07:40]');
  MEM.anotar({ dirCliente: dir, id: '2026-08-21_110000', fecha: '21 de agosto',
               minuta: conCitas, carpeta: path.join(dir, '2026-08-21_110000') });
  const m = MEM.leer(dir);
  assert.doesNotMatch(m, /\[\d{1,3}:\d{2}\]/);
  assert.match(m, /Mandar la cotización/);
  assert.match(m, /El precio nunca se mencionó\./);
});
