// El expediente del cliente es la memoria de la app entre reuniones. Si una
// reunión borrada deja su referencia dentro, la próxima minuta se redacta
// citando una carpeta que ya no existe.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { actualizarDossier, quitarDelDossier } = require('../lib/dossier');

function nuevoExpediente(contenido = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-dossier-'));
  const archivo = path.join(dir, 'acme.md');
  fs.writeFileSync(archivo, contenido);
  return archivo;
}
const MINUTA = '**Acuerdo:** mandar la cotización el lunes\n\n## Notas internas (no enviar)\n\n- No preguntaron por el precio\n';

test('anota la reunión en el expediente', () => {
  const exp = nuevoExpediente('# Acme\n\nCliente desde 2024.\n');
  const r = actualizarDossier({ dossier: exp, cliente: 'Acme', fecha: '2026-01-15',
                                minuta: MINUTA, carpeta: '/tmp/reuniones/acme/2026-01-15_1000' });
  assert.strictEqual(r.ok, true);
  const texto = fs.readFileSync(exp, 'utf8');
  assert.match(texto, /## 2026-01-15 — Reunión \(Acme\)/);
  assert.match(texto, /mandar la cotización el lunes/);
  assert.match(texto, /No preguntaron por el precio/);
  assert.match(texto, /Cliente desde 2024\./, 'no debe pisar lo que ya había');
});

test('no anota dos veces la misma fecha', () => {
  const exp = nuevoExpediente('# Acme\n');
  const datos = { dossier: exp, cliente: 'Acme', fecha: '2026-01-15', minuta: MINUTA, carpeta: '/tmp/a/b' };
  actualizarDossier(datos);
  assert.deepStrictEqual(actualizarDossier(datos), { ok: false, motivo: 'ya registrada' });
});

test('sin expediente configurado lo dice, no revienta', () => {
  assert.deepStrictEqual(actualizarDossier({ dossier: null, cliente: 'Acme', fecha: '2026-01-15',
                                             minuta: MINUTA, carpeta: '/tmp/a/b' }),
                         { ok: false, motivo: 'sin dossier' });
});

// --- limpieza al borrar una reunión ---
test('borrar una reunión quita su bloque del expediente', () => {
  const exp = nuevoExpediente('# Acme\n\nCliente desde 2024.\n');
  actualizarDossier({ dossier: exp, cliente: 'Acme', fecha: '2026-01-15', minuta: MINUTA, carpeta: '/tmp/r/uno' });
  actualizarDossier({ dossier: exp, cliente: 'Acme', fecha: '2026-02-20', minuta: MINUTA, carpeta: '/tmp/r/dos' });
  assert.strictEqual(quitarDelDossier(exp, '/tmp/r/uno'), true);
  const texto = fs.readFileSync(exp, 'utf8');
  assert.doesNotMatch(texto, /2026-01-15/, 'el bloque borrado no debe quedar');
  assert.doesNotMatch(texto, /r\/uno/, 'la referencia a la carpeta no debe quedar');
  assert.match(texto, /2026-02-20/, 'la otra reunión debe seguir');
  assert.match(texto, /Cliente desde 2024\./, 'el encabezado del expediente debe seguir');
});

// Este es el caso que se escapaba: sin nada delante, la búsqueda del inicio
// del bloque devolvía -1 y la referencia se quedaba colgando en silencio.
test('quita el bloque aunque sea lo primero del archivo', () => {
  const exp = nuevoExpediente('');
  actualizarDossier({ dossier: exp, cliente: 'Acme', fecha: '2026-01-15', minuta: MINUTA, carpeta: '/tmp/r/solo' });
  // el bloque queda al principio, solo precedido de saltos de línea
  fs.writeFileSync(exp, fs.readFileSync(exp, 'utf8').replace(/^\n+/, ''));
  assert.strictEqual(quitarDelDossier(exp, '/tmp/r/solo'), true);
  const texto = fs.readFileSync(exp, 'utf8');
  assert.doesNotMatch(texto, /r\/solo/);
  assert.strictEqual(texto.trim(), '');
});

test('quitar una reunión que no está anotada devuelve false', () => {
  const exp = nuevoExpediente('# Acme\n\nCliente desde 2024.\n');
  assert.strictEqual(quitarDelDossier(exp, '/tmp/r/inexistente'), false);
  assert.match(fs.readFileSync(exp, 'utf8'), /Cliente desde 2024\./);
});

test('un expediente que no existe no rompe nada', () => {
  assert.strictEqual(quitarDelDossier('/tmp/no/existe/acme.md', '/tmp/r/uno'), false);
  assert.strictEqual(quitarDelDossier(null, '/tmp/r/uno'), false);
});
