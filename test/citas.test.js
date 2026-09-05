// Citas de audio: qué marca se emite, cuál sobrevive y qué sale al cliente.
const { test } = require('node:test');
const assert = require('node:assert');
const C = require('../lib/citas');

const seg = (desde, texto, dur = 5) => ({ desde, hasta: desde + dur, texto });

test('marcar: la primera marca siempre, y una nueva solo cada N segundos', () => {
  const r = C.marcar([seg(0, 'uno'), seg(6, 'dos'), seg(12, 'tres'), seg(26, 'cuatro'), seg(30, 'cinco')], { cada: 25 });
  assert.strictEqual(r.texto, '[00:00] uno dos tres\n[00:26] cuatro cinco');
  assert.deepStrictEqual([...r.marcas], ['00:00', '00:26']);
});

test('marcar: el cambio de hablante abre línea aunque no hayan pasado N segundos', () => {
  const turnos = [{ desde: 0, quien: 'Ana' }, { desde: 7, quien: 'Acme' }, { desde: 15, quien: 'Ana' }];
  const r = C.marcar([seg(0, 'hola'), seg(4, 'qué tal'), seg(8, 'bien'), seg(16, 'vamos')], { cada: 25, turnos });
  assert.strictEqual(r.texto, '[00:00] Ana: hola qué tal\n[00:08] Acme: bien\n[00:16] Ana: vamos');
  assert.deepStrictEqual([...r.marcas], ['00:00', '00:08', '00:16']);
});

test('marcar: sin turnos no hay nombres; segmentos vacíos se saltan; pasada la hora sigue en mm:ss', () => {
  const r = C.marcar([seg(3900.4, 'tarde'), seg(3901, '   '), seg(3960, 'más')], { cada: 25 });
  assert.strictEqual(r.texto, '[65:00] tarde\n[66:00] más');
  assert.ok(r.marcas.has('65:00') && r.marcas.has('66:00'));
});

test('marcar: los turnos desordenados no confunden al hablante', () => {
  const turnos = [{ desde: 20, quien: 'B' }, { desde: 0, quien: 'A' }];
  const r = C.marcar([seg(1, 'x'), seg(21, 'y')], { cada: 100, turnos });
  assert.strictEqual(r.texto, '[00:01] A: x\n[00:21] B: y');
});

test('validar: conserva solo las emitidas y cuenta las descartadas', () => {
  const marcas = new Set(['00:00', '03:15']);
  const min = '| Mandar la cotización [03:15] | Nosotros | jueves |\n- Nadie habló del precio [07:40]\n- Otra [00:00]';
  const r = C.validar(min, marcas);
  assert.strictEqual(r.texto, '| Mandar la cotización [03:15] | Nosotros | jueves |\n- Nadie habló del precio\n- Otra [00:00]');
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.descartadas, 1);
});

test('validar: sin marcas emitidas se descarta todo; [5:03] cuenta como [05:03]', () => {
  assert.strictEqual(C.validar('a [01:00] b', new Set()).texto, 'a b');
  const r = C.validar('a [5:03] b', new Set(['05:03']));
  assert.strictEqual(r.texto, 'a [05:03] b');
  assert.strictEqual(r.descartadas, 0);
});

test('sinCitas: quita todas las marcas y los huecos que dejan', () => {
  assert.strictEqual(C.sinCitas('Se acordó el alcance [02:10], y la fecha [02:40].'), 'Se acordó el alcance, y la fecha.');
  assert.strictEqual(C.sinCitas('| Entregar fotos [09:12] | Acme |'), '| Entregar fotos | Acme |');
  assert.strictEqual(C.sinCitas('[00:00] al inicio'), 'al inicio');
  assert.strictEqual(C.sinCitas('sin nada'), 'sin nada');
});

test('ultima y tiene: la última cita de una celda, en segundos', () => {
  assert.strictEqual(C.ultima('dos citas [01:00] y [02:30]'), 150);
  assert.strictEqual(C.ultima('ninguna'), null);
  assert.strictEqual(C.tiene('x [00:09]'), true);
  assert.strictEqual(C.tiene('x'), false);
  assert.strictEqual(C.tiene('y [00:09]'), true);   // el regex global no se queda pegado
});

test('formato y segundos van y vienen', () => {
  assert.strictEqual(C.formato(3723), '62:03');
  assert.strictEqual(C.segundos('62:03'), 3723);
  assert.strictEqual(C.segundos('[00:07]'), 7);
  assert.strictEqual(C.segundos('1:75'), null);
  assert.strictEqual(C.formato(-4), '00:00');
});

test('turnosDeDialogo lee "[mm:ss] Nombre:" e ignora cabecera y líneas sueltas', () => {
  const d = '<!-- escriba:dialogo:2 -->\n[00:00] Ana: hola\n[02:14] Acme: bien\nsin marca\n[06:23] Ana: sigo';
  assert.deepStrictEqual(C.turnosDeDialogo(d), [{ desde: 0, quien: 'Ana' }, { desde: 134, quien: 'Acme' }, { desde: 383, quien: 'Ana' }]);
  assert.deepStrictEqual(C.turnosDeDialogo(''), []);
});

test('gramática única: [h:mm:ss] y minutos de 4 cifras se retiran aunque no se hayan emitido', () => {
  assert.strictEqual(C.validar('a [01:02:03] b [1000:00] c', new Set(['1000:00'])).texto, 'a b [1000:00] c');
  assert.strictEqual(C.sinCitas('a [01:02:03] b [1000:00] c'), 'a b c');
  assert.strictEqual(C.formato(60000), '1000:00');
  assert.strictEqual(C.segundos('1000:00'), 60000);
});

test('ultima ignora una marca inválida al final y devuelve la válida anterior', () => {
  assert.strictEqual(C.ultima('x [01:00] [01:99]'), 60);
  assert.strictEqual(C.ultima('x [01:00] [00:00:05]'), 60);
});

test('sinCitas no deja paréntesis vacíos', () => {
  assert.strictEqual(C.sinCitas('Entregar fotos ([03:15]) el viernes'), 'Entregar fotos el viernes');
});

test('marcar: a los 25 segundos exactos ya toca marca nueva', () => {
  const r = C.marcar([seg(0, 'a'), seg(25, 'b')], { cada: 25 });
  assert.deepStrictEqual([...r.marcas], ['00:00', '00:25']);
});

test('sinCitas respeta las casillas "- [ ]" de una lista de tareas', () => {
  assert.strictEqual(C.sinCitas('- [ ] Entregar contrato [01:00]'), '- [ ] Entregar contrato');
  assert.strictEqual(C.sinCitas('- [x] Hecho'), '- [x] Hecho');
});
