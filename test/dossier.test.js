// Solo lectura del expediente del usuario: lo único que Escriba hace con él
// hoy es limpiar los bloques que versiones anteriores llegaron a escribir.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { quitarDelDossier } = require('../lib/dossier');

function expediente(contenido) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-dossier-'));
  const archivo = path.join(dir, 'acme.md');
  fs.writeFileSync(archivo, contenido);
  return archivo;
}
const BLOQUE = (c) => `\n\n## 2026-01-15 — Reunión (Acme)\n\nMinuta completa: \`${c}/minuta.md\`\n\n**Lo acordado:**\n- x\n`;

test('quita el bloque de una reunión borrada y deja el resto', () => {
  const exp = expediente('# Acme\n\nCliente desde 2024.\n' + BLOQUE('/tmp/r/uno') + BLOQUE('/tmp/r/dos').replace('01-15', '02-20'));
  assert.strictEqual(quitarDelDossier(exp, '/tmp/r/uno'), true);
  const t = fs.readFileSync(exp, 'utf8');
  assert.doesNotMatch(t, /r\/uno/);
  assert.match(t, /r\/dos/);
  assert.match(t, /Cliente desde 2024\./);
});

test('quita el bloque aunque sea lo primero del archivo', () => {
  const exp = expediente(BLOQUE('/tmp/r/solo').replace(/^\n+/, ''));
  assert.strictEqual(quitarDelDossier(exp, '/tmp/r/solo'), true);
  assert.strictEqual(fs.readFileSync(exp, 'utf8').trim(), '');
});

test('si la reunión no está anotada, no toca nada y lo dice', () => {
  const exp = expediente('# Acme\n\nCliente desde 2024.\n');
  assert.strictEqual(quitarDelDossier(exp, '/tmp/r/x'), false);
  assert.match(fs.readFileSync(exp, 'utf8'), /Cliente desde 2024\./);
});

test('un expediente que no existe no rompe nada', () => {
  assert.strictEqual(quitarDelDossier('/tmp/no/existe/acme.md', '/tmp/r'), false);
  assert.strictEqual(quitarDelDossier(null, '/tmp/r'), false);
});
