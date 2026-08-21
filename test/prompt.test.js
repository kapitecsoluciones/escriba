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

test('con dossier lo incluye entre etiquetas', () => {
  const p = PROMPT.construir({ ...BASE, dossier: 'Acme lleva dos años con nosotros.' });
  assert.match(p, /<dossier>/);
  assert.match(p, /Acme lleva dos años con nosotros\./);
});

test('un dossier enorme se recorta a 60 000 caracteres', () => {
  const gigante = 'a'.repeat(90000);
  const p = PROMPT.construir({ ...BASE, dossier: gigante });
  const dentro = p.split('<dossier>')[1].split('</dossier>')[0];
  assert.strictEqual(dentro.trim().length, 60000);
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
