// Pruebas de la atribución de voces: es el diferenciador del producto y lo que
// más silenciosamente se puede romper, porque un fallo aquí no truena, solo
// atribuye las frases a quien no las dijo.
const { test } = require('node:test');
const assert = require('node:assert');
const V = require('../lib/voces');

test('un SRT vacío no devuelve segmentos', () => {
  assert.deepStrictEqual(V.parsearSrt(''), []);
});

test('lee un SRT con coma en los milisegundos', () => {
  const seg = V.parsearSrt('1\n00:00:01,500 --> 00:00:04,000\nBuenos días.\n');
  assert.strictEqual(seg.length, 1);
  assert.strictEqual(seg[0].desde, 1.5);
  assert.strictEqual(seg[0].hasta, 4);
  assert.strictEqual(seg[0].texto, 'Buenos días.');
});

test('lee un SRT con punto en los milisegundos', () => {
  const seg = V.parsearSrt('1\n00:00:01.500 --> 00:00:04.000\nBuenos días.\n');
  assert.strictEqual(seg.length, 1);
  assert.strictEqual(seg[0].desde, 1.5);
});

test('junta en una sola línea el texto partido en varias', () => {
  const seg = V.parsearSrt('1\n00:00:00,000 --> 00:00:03,000\nprimera línea\nsegunda línea\n');
  assert.strictEqual(seg[0].texto, 'primera línea segunda línea');
});

test('descarta los bloques sin marca de tiempo en vez de reventar', () => {
  const seg = V.parsearSrt('esto no es un bloque\n\n1\n00:00:00,000 --> 00:00:02,000\nHola.\n');
  assert.strictEqual(seg.length, 1);
});

test('la hora se convierte bien más allá de un minuto', () => {
  const seg = V.parsearSrt('1\n01:02:03,250 --> 01:02:05,000\nTexto.\n');
  assert.strictEqual(seg[0].desde, 3723.25);
});

// --- el margen de 2 dB: el corazón de la decisión ---
test('con las voces encimadas se hereda el hablante anterior', () => {
  // 1 dB de diferencia está por debajo del margen
  const quien = V.decidir({ dbMic: -20, dbSistema: -21, previo: 'Ana', nombreUsuario: 'Yo', nombreOtro: 'Cliente' });
  assert.strictEqual(quien, 'Ana');
});

test('con una voz claramente más fuerte se elige a esa', () => {
  assert.strictEqual(
    V.decidir({ dbMic: -18, dbSistema: -30, previo: 'Cliente', nombreUsuario: 'Yo', nombreOtro: 'Cliente' }), 'Yo');
  assert.strictEqual(
    V.decidir({ dbMic: -30, dbSistema: -18, previo: 'Yo', nombreUsuario: 'Yo', nombreOtro: 'Cliente' }), 'Cliente');
});

test('el margen se aplica justo en el límite', () => {
  const dentro = V.decidir({ dbMic: -20, dbSistema: -21.9, previo: 'Ana', nombreUsuario: 'Yo', nombreOtro: 'Cliente' });
  const fuera  = V.decidir({ dbMic: -20, dbSistema: -22.1, previo: 'Ana', nombreUsuario: 'Yo', nombreOtro: 'Cliente' });
  assert.strictEqual(dentro, 'Ana', 'por debajo del margen debe heredar');
  assert.strictEqual(fuera, 'Yo', 'por encima del margen debe decidir por energía');
  assert.strictEqual(V.MARGEN_DB, 2);
});

test('sin hablante anterior no hay nada que heredar', () => {
  const quien = V.decidir({ dbMic: -20, dbSistema: -20, previo: null, nombreUsuario: 'Yo', nombreOtro: 'Cliente' });
  assert.strictEqual(quien, 'Cliente');
});

// --- agrupación de turnos ---
test('junta frases seguidas del mismo hablante en un turno', () => {
  const segs = [
    { desde: 0, texto: 'Hola.' }, { desde: 2, texto: 'Qué tal.' }, { desde: 4, texto: 'Bien.' }
  ];
  const turnos = V.agrupar(segs, (s) => (s.desde < 4 ? 'Ana' : 'Beto'));
  assert.strictEqual(turnos.length, 2);
  assert.strictEqual(turnos[0].texto, 'Hola. Qué tal.');
  assert.strictEqual(turnos[1].quien, 'Beto');
  assert.strictEqual(turnos[0].desde, 0);
});

test('sin segmentos no hay turnos', () => {
  assert.deepStrictEqual(V.agrupar([], () => 'Ana'), []);
});

test('un solo hablante produce un solo turno', () => {
  const segs = [{ desde: 0, texto: 'Uno.' }, { desde: 1, texto: 'Dos.' }];
  const turnos = V.agrupar(segs, () => 'Ana');
  assert.strictEqual(turnos.length, 1);
});

test('la energía de un tramo sin muestras devuelve silencio', () => {
  assert.strictEqual(V.energiaEn([], 0, 5), -120);
});
