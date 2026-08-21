// Lo que se saca de una minuta ya redactada. El texto lo escribe un LLM, así que
// el formato varía: tablas con dos o tres columnas, encabezados distintos y, a
// veces, tablas cortadas a la mitad.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const M = require('../lib/minuta');

const MINUTA = `**Acme · 15 de enero de 2026 · 48 min**

## Lo que quedó definido

**Alcance:** rediseñar el catálogo.

## Compromisos

| Compromiso | Responsable | Fecha |
|---|---|---|
| Mandar la cotización | Nosotros | 20 de enero |
| Confirmar el presupuesto | Acme | 25 de enero |

## Notas internas (no enviar)

### Lo que NO se dijo
- No preguntaron por el precio.
- Quedó sin tocar la integración.

### Riesgos
| Riesgo interno | Alto |
`;

test('saca los compromisos de la tabla', () => {
  const c = M.extraer(MINUTA);
  assert.strictEqual(c.length, 2);
  assert.deepStrictEqual(c[0], { texto: 'Mandar la cotización', quien: 'Nosotros', cuando: '20 de enero' });
});

test('descarta encabezados y separadores', () => {
  const textos = M.extraer(MINUTA).map(c => c.texto);
  assert.ok(!textos.some(t => /^-+$/.test(t)));
  assert.ok(!textos.includes('Compromiso'));
});

// Esto es lo que separa una herramienta de trabajo de una fuga de información.
test('lo que está en notas internas NUNCA cuenta como compromiso', () => {
  const textos = M.extraer(MINUTA).map(c => c.texto);
  assert.ok(!textos.includes('Riesgo interno'),
    'la tabla de las notas internas no puede acabar en la lista del cliente');
});

test('una tabla de dos columnas también vale', () => {
  const c = M.extraer('| Qué | Quién |\n|---|---|\n| Llamar al proveedor | Ana |');
  assert.deepStrictEqual(c, [{ texto: 'Llamar al proveedor', quien: 'Ana', cuando: '' }]);
});

test('quita las negritas del texto', () => {
  const c = M.extraer('| A | B |\n|---|---|\n| **Mandar el contrato** | **Ana** |');
  assert.strictEqual(c[0].texto, 'Mandar el contrato');
  assert.strictEqual(c[0].quien, 'Ana');
});

test('sin tablas no hay compromisos, y no revienta', () => {
  assert.deepStrictEqual(M.extraer('Solo prosa, ninguna tabla.'), []);
  assert.deepStrictEqual(M.extraer(''), []);
  assert.deepStrictEqual(M.extraer(null), []);
});

// --- hallazgos ---
test('saca lo que NO se dijo de las notas internas', () => {
  assert.deepStrictEqual(M.hallazgos(MINUTA), [
    'No preguntaron por el precio.', 'Quedó sin tocar la integración.']);
});

test('se para al llegar a otra sección', () => {
  assert.strictEqual(M.hallazgos(MINUTA).length, 2, 'no debe arrastrar la sección de riesgos');
});

test('respeta el máximo pedido', () => {
  assert.strictEqual(M.hallazgos(MINUTA, 1).length, 1);
});

test('sin notas internas no hay hallazgos', () => {
  assert.deepStrictEqual(M.hallazgos('## Solo la minuta\n\n- una viñeta'), []);
});

// --- estado de hecho ---
test('marcar y desmarcar un compromiso persiste', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-comp-'));
  M.marcar(dir, 'Mandar la cotización', true);
  let lista = M.conEstado(MINUTA, dir);
  assert.strictEqual(lista[0].hecho, true);
  assert.strictEqual(lista[1].hecho, false);
  M.marcar(dir, 'Mandar la cotización', false);
  assert.strictEqual(M.conEstado(MINUTA, dir)[0].hecho, false);
});

test('la marca sobrevive a un cambio de tilde o de mayúsculas', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-comp2-'));
  M.marcar(dir, 'Mandar la cotización', true);
  assert.strictEqual(M.clave('MANDAR LA COTIZACION'), M.clave('Mandar la cotización'));
  assert.strictEqual(M.leerHechos(dir)[M.clave('mandar la cotizacion')], true);
});

test('una carpeta sin archivo de estado no revienta', () => {
  assert.deepStrictEqual(M.leerHechos('/tmp/no/existe/nada'), {});
  assert.strictEqual(M.conEstado(MINUTA, '/tmp/no/existe/nada')[0].hecho, false);
});
