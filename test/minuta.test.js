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
  assert.deepStrictEqual(c[0], { texto: 'Mandar la cotización', quien: 'Nosotros', cuando: '20 de enero', t: null });
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
  assert.deepStrictEqual(c, [{ texto: 'Llamar al proveedor', quien: 'Ana', cuando: '', t: null }]);
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

// ---------- la frontera de confidencialidad ----------
// Todo lo que sale hacia el cliente se corta aquí. La primera versión usaba un
// `split(/##\s*Notas internas/i)`: con `**Notas internas**` no cortaba y los
// riesgos y lo dicho de terceros salían en el PDF. La segunda cortaba con
// cualquier línea que EMPEZARA por "notas internas", y partía minutas
// legítimas por la mitad sin avisar. Por eso estas pruebas tienen dos mitades:
// lo que debe cortar Y lo que no debe tocar.
const FORMAS = [
  '## Notas internas (no enviar)', '### Notas internas', '##Notas internas',
  '## NOTAS INTERNAS', '**Notas internas (no enviar)**', '# Notas internas',
  '## _Notas internas_', '**_Notas internas_**', '#### notas internas:',
  '## Notas Internas — no enviar',
  // las que el modelo escribe cuando se le pidió una lista numerada, o adorna
  '## 4. Notas internas (no enviar)', '## 📝 Notas internas', '### 🔒 Notas internas',
  '> ## Notas internas', '## [Interno] Notas internas', '## (uso interno) Notas internas',
  '**Notas internas:**',
];
for (const forma of FORMAS) {
  test(`corta las notas internas tituladas ${JSON.stringify(forma)}`, () => {
    const m = `Lo acordado con el cliente.\n\n${forma}\n\n- Lo que NO se dijo: el precio`;
    const r = M.paraCliente(m);
    assert.strictEqual(r.ok, true, `no debe BLOQUEAR: ${r.error || ''}`);
    assert.doesNotMatch(r.texto, /NO se dijo|precio/, 'las notas internas no pueden salir hacia el cliente');
    assert.match(r.texto, /Lo acordado con el cliente/);
  });
}

// Una frase que empieza por "notas internas" NO es un título. Cortar aquí
// escondía la mitad de la minuta sin decirlo: peor que el fallo original.
const FRASES_NORMALES = [
  'Acordamos X.\n\nNotas internas de Acme: el equipo revisará el anexo.\n\nSeguimos el jueves.',
  'Acordamos X.\n\n  Notas internas del cliente ya fueron entregadas.\n\nY el precio queda igual.',
  '**Acme · 21 ago · 45 min**\n\nSe habló de las\nnotas internas del proveedor y del precio.',
];
for (const m of FRASES_NORMALES) {
  test(`no corta una frase normal: ${JSON.stringify(m.slice(0, 40))}…`, () => {
    const r = M.paraCliente(m);
    assert.strictEqual(r.ok, true);
    assert.match(r.texto, /jueves|precio/, 'la minuta tiene que salir ENTERA');
  });
}

// Palabras sueltas en prosa no son señal de notas internas: bloqueaban minutas
// limpias sin ninguna salida para el usuario.
test('no bloquea prosa que menciona oportunidades o riesgos', () => {
  for (const m of ['Se revisaron las oportunidades comerciales del trimestre con el cliente.',
                   'Acordamos revisar riesgos o señales de saturación en el servidor.']) {
    assert.strictEqual(M.paraCliente(m).ok, true, m);
  }
});

// Falla cerrado solo con una señal inequívoca: un ENCABEZADO con el texto que
// pide el prompt, sin el título de la sección delante.
test('si hay un encabezado "Lo que NO se dijo" sin título de sección, NO exporta', () => {
  const r = M.paraCliente('Cuerpo.\n\n## Uso interno\n\n### Lo que NO se dijo\n- el precio');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /no se exporta|no se ve/i);
});

test('el guion bajo alrededor del título no rompe el corte', () => {
  const r = M.separar('cuerpo\n\n## _Notas internas_\n\nsecreto');
  assert.strictEqual(r.encontrado, true);
  assert.strictEqual(r.internas, 'secreto');
});

// La mirada adelante: "internacionales" no es "internas".
test('"Notas internacionales" como encabezado no corta', () => {
  assert.strictEqual(M.separar('## Notas internacionales\n\ncuerpo').encontrado, false);
  assert.strictEqual(M.separar('## Notas internas\n\ncuerpo').encontrado, true);
});

test('una minuta sin notas internas se exporta entera', () => {
  const r = M.paraCliente('Solo lo que se acordó con el cliente.');
  assert.strictEqual(r.ok, true);
  assert.match(r.texto, /Solo lo que se acordó/);
});

test('los compromisos y los hallazgos usan el mismo corte', () => {
  const m = 'Cuerpo\n\n| Compromiso | Quién |\n|---|---|\n| Enviar precio | Ana |\n\n' +
            '**Notas internas**\n\n### Lo que NO se dijo\n- nada del contrato\n\n' +
            '| Riesgo interno | Alto |';
  assert.deepStrictEqual(M.extraer(m).map(c => c.texto), ['Enviar precio']);
  assert.deepStrictEqual(M.hallazgos(m), ['nada del contrato']);
});

// ---- citas de audio (1.0): la cita viaja en la celda, nunca hacia el cliente
const CON_CITAS = `**Acme · 15 de enero de 2026 · 48 min**

## Lo que quedó definido

- Se rediseña el catálogo completo. [02:10]

## Compromisos

| Compromiso | Responsable | Fecha |
|---|---|---|
| Mandar la cotización [03:15] | Nosotros | 20 de enero |
| Confirmar el presupuesto | Acme | 25 de enero |

## Notas internas (no enviar)

### Lo que NO se dijo
- No preguntaron por el precio. [07:40]
- Quedó sin tocar la integración.
`;

test('extraer devuelve el compromiso sin la cita y con su instante', () => {
  const c = M.extraer(CON_CITAS);
  assert.deepStrictEqual(c[0], { texto: 'Mandar la cotización', quien: 'Nosotros', cuando: '20 de enero', t: 195 });
  assert.strictEqual(c[1].t, null);
});

test('la clave de un compromiso no cambia por la cita', () => {
  assert.strictEqual(M.clave('Mandar la cotización [03:15]'), M.clave('Mandar la cotización'));
});

test('lo que va al cliente no lleva ninguna cita', () => {
  const r = M.paraCliente(CON_CITAS);
  assert.ok(r.ok);
  assert.doesNotMatch(r.texto, /\[\d{1,3}:\d{2}\]/);
  assert.match(r.texto, /- Se rediseña el catálogo completo\.\n/);
  assert.match(r.texto, /\| Mandar la cotización \| Nosotros \|/);
});

test('los hallazgos salen limpios y con su instante aparte', () => {
  assert.deepStrictEqual(M.hallazgosConTiempo(CON_CITAS), [
    { texto: 'No preguntaron por el precio.', t: 460 },
    { texto: 'Quedó sin tocar la integración.', t: null },
  ]);
  assert.deepStrictEqual(M.hallazgos(CON_CITAS), ['No preguntaron por el precio.', 'Quedó sin tocar la integración.']);
});

test('un título de notas internas con cita sigue cortando (si no, lo privado saldría al cliente)', () => {
  const m = 'Acuerdo público.\n\n**Notas internas** [00:25]\n\n- El proveedor es incompetente.\n';
  const r = M.paraCliente(m);
  assert.ok(r.ok);
  assert.strictEqual(r.texto, 'Acuerdo público.');
  const r2 = M.paraCliente('Acuerdo.\n\n## Lo que NO se dijo [00:30]\n- algo\n');
  assert.strictEqual(r2.ok, false, 'la señal inequívoca también se reconoce con cita');
});

test('un compromiso viejo con horas entre corchetes conserva su marca de cumplido', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-clave-'));
  const viejo = '| Compromiso | Responsable | Fecha |\n|---|---|---|\n| Revisar [09:30] | Ana | lunes |\n';
  // así se guardaba antes de 1.0: clave sobre el texto tal cual
  fs.writeFileSync(path.join(dir, M.ARCHIVO), JSON.stringify({ 'revisar 09 30': true }));
  assert.strictEqual(M.conEstado(viejo, dir)[0].hecho, true);
  assert.strictEqual(M.conEstado(viejo, dir)[0].texto, 'Revisar');
});
