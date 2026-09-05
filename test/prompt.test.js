// El prompt es el criterio de la minuta. main.js parte el resultado por el
// encabezado literal "## Notas internas" para no mandar al cliente lo interno:
// si aquí cambia la redacción, ese filtro deja de funcionar en silencio.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-prompt-'));
const PROMPT = require('../lib/prompt');

const BASE = { cliente: 'Acme', fecha: '15 de enero de 2026', duracion: '48 min 00 s',
               transcripcion: 'Hola, buenos días.', dossier: null, conHablantes: false };

test('pide la sección de notas internas con el título exacto que espera main.js', () => {
  const p = PROMPT.construir(BASE);
  assert.match(p, /## Notas internas \(no enviar\)/);
  // el mismo corte que hace main.js sobre la minuta ya redactada
  assert.strictEqual('minuta\n## Notas internas (no enviar)\nx'.split(/##\s*Notas internas/i).length, 2);
});

test('sin dossier no inventa contexto del cliente', () => {
  const p = PROMPT.construir(BASE);
  assert.doesNotMatch(p, /<dossier>/);
  assert.doesNotMatch(p, /Contexto acumulado/);
});

test('con expediente lo incluye entre etiquetas', () => {
  const p = PROMPT.construir({ ...BASE, dossier: 'Acme lleva dos años con nosotros.' });
  assert.match(p, /<expediente>/);
  assert.match(p, /Acme lleva dos años con nosotros\./);
});

// Cortar por los primeros 60.000 tiraba justo la parte reciente. El bloque que
// Escriba escribía quedaba fuera de la ventana con UNA sola reunión.
test('un expediente enorme conserva el final, no solo el principio', () => {
  const gigante = 'INICIO' + 'a'.repeat(90000) + 'ESTADO DE HOY';
  const p = PROMPT.construir({ ...BASE, dossier: gigante });
  const dentro = p.split('<expediente>')[1].split('</expediente>')[0];
  assert.match(dentro, /INICIO/, 'debe conservar el principio');
  assert.match(dentro, /ESTADO DE HOY/, 'y sobre todo el final');
  assert.match(dentro, /recortado/);
  assert.ok(dentro.length < 61000);
});

// --- la memoria propia de Escriba ---
test('sin memoria, se le dice al modelo que no suponga historial', () => {
  const p = PROMPT.construir(BASE);
  assert.doesNotMatch(p, /<memoria>/);
  assert.match(p, /no supongas historial que no tienes/i);
});

test('con memoria, se le pide comprobar qué pendiente se retomó', () => {
  const p = PROMPT.construir({ ...BASE, memoria: '## 20 de agosto — Reunión\n- [ ] Mandar precio' });
  assert.match(p, /<memoria>/);
  assert.match(p, /Mandar precio/);
  assert.match(p, /volvió a quedar\s*\n?\s*sin resolver/i);
});

test('el nombre del cliente y la fecha llegan al prompt', () => {
  const p = PROMPT.construir(BASE);
  assert.match(p, /Acme/);
  assert.match(p, /15 de enero de 2026/);
  assert.match(p, /48 min 00 s/);
});

test('avisa al modelo cuando la transcripción trae hablantes', () => {
  const con = PROMPT.construir({ ...BASE, conHablantes: true });
  const sin = PROMPT.construir({ ...BASE, conHablantes: false });
  assert.notStrictEqual(con.length, sin.length);
});


// Si no se sabe quién habló, hay que decírselo al modelo. Callarse deja que
// reparta compromisos por su cuenta en un documento que se manda al cliente.
test('sin hablantes, avisa al modelo de que no invente atribuciones', () => {
  const p = PROMPT.construir({ ...BASE, conHablantes: false });
  assert.match(p, /No se sabe quién dijo cada cosa/i);
  assert.match(p, /No inventes atribuciones/i);
  assert.doesNotMatch(p, /así que es fiable/i,
    'no puede decirle que la separación es fiable cuando no hay separación');
});

test('con hablantes, sí le pide atribuir los compromisos', () => {
  const p = PROMPT.construir({ ...BASE, conHablantes: true });
  assert.match(p, /quién se comprometió a qué/i);
  assert.doesNotMatch(p, /No se sabe quién dijo cada cosa/i);
});

// --- la ventana de lo grabado ---
// Escriba ya sabía notar "la grabación se corta en plena intervención" y ese
// aviso no servía de nada: sin horas no se sabe qué tramo falta. La ventana es
// lo que lo vuelve accionable.
const HORARIO = { inicio: '16:18', fin: '17:30', zona: 'America/Hermosillo' };

test('con ventana, el prompt lleva las horas, la zona y pide decir qué tramo falta', () => {
  const p = PROMPT.construir({ ...BASE, horario: HORARIO });
  assert.match(p, /16:18/);
  assert.match(p, /17:30/);
  assert.match(p, /America\/Hermosillo/);
  assert.match(p, /tramo NO quedó grabado/i);
  assert.match(p, /no necesariamente la reunión completa/i);
});

test('sin ventana no se inventa horario ni se pide el tramo faltante', () => {
  const p = PROMPT.construir(BASE);
  assert.doesNotMatch(p, /tramo NO quedó grabado/i);
  assert.doesNotMatch(p, /hora local del equipo/i);
});

// Una duración desconocida deja el fin vacío. El prompt no puede quedar con un
// "a las undefined" ni con una frase colgando.
test('con inicio pero sin fin, la frase se sostiene sola', () => {
  const p = PROMPT.construir({ ...BASE, horario: { inicio: '09:05', fin: null, zona: 'America/Mexico_City' } });
  assert.match(p, /de las 09:05/);
  assert.doesNotMatch(p, /undefined|null/);
});
