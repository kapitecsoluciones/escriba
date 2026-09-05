// El índice en memoria: búsqueda por palabras, título de la reunión, clientes
// por reciente con pendientes, y que se reconstruya solo cuando cambia el disco.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const HOGAR = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-indice-'));
const REUNIONES = path.join(HOGAR, 'Reuniones');
fs.mkdirSync(path.join(HOGAR, '.config', 'escriba'), { recursive: true });
fs.mkdirSync(REUNIONES, { recursive: true });
fs.writeFileSync(path.join(HOGAR, '.config', 'escriba', 'config.json'),
  JSON.stringify({ usuario: { nombre: 'Ana Ruiz' }, rutas: { reuniones: REUNIONES, dossiers: path.join(HOGAR, 'contexto') } }));
process.env.HOME = HOGAR;

const INDICE = require('../lib/indice');
const ATOMICO = require('../lib/atomico');

// una reunión = carpeta YYYY-MM-DD_HHMMSS con minuta.md y mezcla.txt
function reunion(slug, id, minuta, transcripcion) {
  const dir = path.join(REUNIONES, slug, id);
  fs.mkdirSync(dir, { recursive: true });
  if (minuta != null) ATOMICO.escribirAtomico(path.join(dir, 'minuta.md'), minuta);
  if (transcripcion != null) ATOMICO.escribirAtomico(path.join(dir, 'mezcla.txt'), transcripcion);
  return dir;
}
const MINUTA_ACME = `**Acme · 10 de marzo de 2026 · 52 minutos**

## Lo que quedó definido

**El catálogo en línea se reorganiza por línea de producto.** Hoy los productos aparecen mezclados.

## Compromisos

| Compromiso | Responsable | Fecha |
|---|---|---|
| Reorganizar el catálogo | Nosotros | Marzo |
| Definir la política de cancelaciones | Acme | Por definir |
`;
reunion('acme', '2026-03-10_101500', MINUTA_ACME, 'hablamos del precio y de la política de envíos');
reunion('acme', '2026-01-05_090000', '**Acme · 5 de enero de 2026 · 20 minutos**\n\n## Arranque\n\n**Se definió el alcance del piloto.**\n\n| Compromiso | Responsable | Fecha |\n|---|---|---|\n| Enviar el contrato | Nosotros | Enero |\n', 'primera llamada');
reunion('borealis', '2026-02-01_150000', '# Renovación del contrato anual\n\n**Borealis · 1 de febrero de 2026 · 30 minutos**\n\nSe habló del precio del mantenimiento.', null);
fs.mkdirSync(path.join(REUNIONES, 'nortec'), { recursive: true });   // sin reuniones

test('el título: el primer encabezado propio; si no, la primera negrita que no es la línea de meta', () => {
  assert.strictEqual(INDICE.tituloReunion(MINUTA_ACME), 'El catálogo en línea se reorganiza por línea de producto');
  assert.strictEqual(INDICE.tituloReunion('# Renovación del contrato anual\n\n**Borealis · 1 de febrero · 30 minutos**'), 'Renovación del contrato anual');
  // un encabezado genérico no es título
  assert.strictEqual(INDICE.tituloReunion('# Minuta\n\n**Acme · 10 de marzo de 2026 · 52 minutos**\n\n**Acordamos el piloto.**'), 'Acordamos el piloto');
  assert.strictEqual(INDICE.tituloReunion('**Acme · 10 de marzo de 2026 · 52 minutos**\n\nSolo texto.'), null);
  assert.strictEqual(INDICE.tituloReunion(null), null);
});

test('busca por palabras, en AND y sin importar el orden ni los acentos', () => {
  const r1 = INDICE.buscar('producto catalogo');
  assert.strictEqual(r1.total, 1);
  assert.strictEqual(r1.resultados[0].slug, 'acme');
  assert.strictEqual(r1.resultados[0].titulo, 'El catálogo en línea se reorganiza por línea de producto');
  assert.deepStrictEqual(r1.palabras, ['producto', 'catalogo']);
  // "hablamos del precio" estaba solo en la transcripción
  const r2 = INDICE.buscar('hablamos del precio');
  assert.strictEqual(r2.total, 1);
  assert.strictEqual(r2.resultados[0].campo, 'transcripción');
  // una palabra que no está en ningún sitio tira el resultado aunque las demás sí
  assert.strictEqual(INDICE.buscar('catalogo zzzz').total, 0);
  // cada palabra puede estar en un campo distinto
  assert.strictEqual(INDICE.buscar('catálogo envíos').total, 1);
  // menos de tres letras: nada
  assert.strictEqual(INDICE.buscar('ca').total, 0);
});

test('los resultados van del más reciente al más antiguo', () => {
  const r = INDICE.buscar('precio');   // acme (marzo, en la transcripción) y borealis (febrero)
  assert.deepStrictEqual(r.resultados.map(x => x.slug), ['acme', 'borealis']);
});

test('el fragmento sale de la minuta cuando ahí caen las palabras', () => {
  const r = INDICE.buscar('cancelaciones');
  assert.strictEqual(r.resultados[0].campo, 'minuta');
  assert.match(r.resultados[0].fragmento, /política de cancelaciones/);
});

test('los clientes van por reunión más reciente, los que no tienen ninguna al final, y traen pendientes', () => {
  const cs = INDICE.clientes();
  assert.deepStrictEqual(cs.map(c => c.nombre), ['Acme', 'Borealis', 'Nortec']);
  const acme = cs[0];
  assert.strictEqual(acme.ultima, '2026-03-10_101500');
  assert.strictEqual(acme.reuniones, 2);
  assert.strictEqual(acme.pendientes, 3);   // 2 de marzo + 1 de enero
  assert.strictEqual(cs[2].ultima, null);
  assert.strictEqual(cs[2].pendientes, 0);
});

test('los pendientes de un cliente salen de todas sus reuniones, con la reunión de origen', () => {
  const p = INDICE.pendientes('acme');
  assert.deepStrictEqual(p.map(x => x.reunion), ['2026-03-10_101500', '2026-03-10_101500', '2026-01-05_090000']);
});

test('el índice se reconstruye solo cuando cambia algo en disco', () => {
  const f1 = INDICE.firma();
  INDICE.buscar('catalogo');
  assert.strictEqual(INDICE.firma(), f1, 'buscar no cambia la firma');
  // una minuta nueva escrita como la escribe la app (atómica: temporal + rename)
  reunion('nortec', '2026-04-01_120000', '**Nortec · 1 de abril de 2026 · 15 minutos**\n\n**Palabra inconfundible: zanahoria.**', null);
  assert.notStrictEqual(INDICE.firma(), f1, 'crear una reunión cambia la firma');
  assert.strictEqual(INDICE.buscar('zanahoria').total, 1, 'se encuentra sin avisar al índice');
  // editar una minuta existente también (cambia la fecha de la carpeta por el rename)
  const f2 = INDICE.firma();
  ATOMICO.escribirAtomico(path.join(REUNIONES, 'acme', '2026-01-05_090000', 'minuta.md'), '**Acme · 5 de enero**\n\n**Ahora dice remolacha.**');
  assert.notStrictEqual(INDICE.firma(), f2);
  assert.strictEqual(INDICE.buscar('remolacha').total, 1);
  assert.strictEqual(INDICE.clientes()[0].nombre, 'Nortec', 'nortec pasa a ser el más reciente');
});

test('el conteo es honesto: el total no es el tope de 40', () => {
  for (let i = 1; i <= 45; i++) {
    reunion('borealis', `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}_${String(100000 + i)}`,
      `**Borealis · reunión ${i}**\n\nSe habló de la palabra jacaranda.`, null);
  }
  const r = INDICE.buscar('jacaranda');
  assert.strictEqual(r.total, 45);
  assert.strictEqual(r.resultados.length, 40);
});

test('con 100 reuniones largas, una tecla tarda menos de 50 ms una vez construido el índice', () => {
  const relleno = 'palabra '.repeat(8000);   // ~64 KB de transcripción por reunión
  for (let i = 1; i <= 100; i++) {
    reunion('acme', `2024-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}_${String(100000 + i)}`,
      `**Acme · reunión ${i}**\n\n**Acuerdo número ${i}.**`, relleno + ` girasol${i} ` + relleno);
  }
  INDICE.buscar('girasol');   // construye
  const t0 = process.hrtime.bigint();
  for (const t of ['gira', 'giras', 'girasol', 'girasol 7', 'acuerdo girasol']) INDICE.buscar(t);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 5;
  console.log(`    búsqueda con 100 reuniones largas: ${ms.toFixed(1)} ms por tecla`);
  assert.ok(ms < 50, `cada búsqueda tardó ${ms.toFixed(1)} ms`);
  assert.strictEqual(INDICE.buscar('girasol100').total, 1);   // 'girasol7' también casa con girasol70…79: es subcadena a propósito
});

test('el título nunca sale de las notas internas', () => {
  const m = '**Acme · 5 de septiembre de 2026 · 2 min 35 s**\n\n## Lo que quedó definido\n\nPárrafo sin negritas.\n\n## Notas internas (no enviar)\n\n**Lo que NO se dijo**\n\n- Nadie habló del precio.\n';
  assert.notStrictEqual(INDICE.tituloReunion(m), 'Lo que NO se dijo');
  assert.strictEqual(INDICE.tituloReunion(m), null);
});
