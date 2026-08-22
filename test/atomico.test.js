// Invariante: tras una escritura fallida, el archivo conserva el contenido
// VIEJO entero y no queda basura en la carpeta.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { escribirAtomico, anexarAtomico } = require('../lib/atomico');
const carpeta = () => fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-atom-'));

test('escribe y no deja temporales', () => {
  const dir = carpeta(), f = path.join(dir, 'minuta.md');
  escribirAtomico(f, '# Minuta\n');
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '# Minuta\n');
  assert.deepStrictEqual(fs.readdirSync(dir), ['minuta.md']);
});

test('si el rename falla, el contenido viejo sobrevive entero', (t) => {
  const dir = carpeta(), f = path.join(dir, 'config.json');
  escribirAtomico(f, '{"usuario":{"nombre":"Ana"}}');
  t.mock.method(fs, 'renameSync', () => { const e = new Error('ENOSPC'); e.code = 'ENOSPC'; throw e; });
  assert.throws(() => escribirAtomico(f, '{"usuario":{"nombre":"Beatriz"}}'), /ENOSPC/);
  t.mock.restoreAll();
  assert.strictEqual(fs.readFileSync(f, 'utf8'), '{"usuario":{"nombre":"Ana"}}');
  assert.deepStrictEqual(fs.readdirSync(dir), ['config.json'], 'el temporal debía limpiarse');
});

test('conserva los permisos del archivo que reemplaza', () => {
  const dir = carpeta(), f = path.join(dir, 'config.json');
  escribirAtomico(f, '{}'); fs.chmodSync(f, 0o600);
  escribirAtomico(f, '{"a":1}');
  assert.strictEqual(fs.statSync(f).mode & 0o777, 0o600);
});

test('anexar concatena y crea el archivo si no estaba', () => {
  const dir = carpeta(), f = path.join(dir, 'memoria.md');
  anexarAtomico(f, 'primera\n'); anexarAtomico(f, 'segunda\n');
  assert.strictEqual(fs.readFileSync(f, 'utf8'), 'primera\nsegunda\n');
  assert.deepStrictEqual(fs.readdirSync(dir), ['memoria.md']);
});

test('el temporal vive en la misma carpeta que el destino', (t) => {
  const dir = carpeta(), f = path.join(dir, 'minuta.md');
  let visto = null; const real = fs.renameSync;
  t.mock.method(fs, 'renameSync', (de, a) => { visto = de; return real(de, a); });
  escribirAtomico(f, 'x'); t.mock.restoreAll();
  assert.strictEqual(path.dirname(visto), dir, 'desde /tmp el rename cruzaría volúmenes');
});

test('acepta un Buffer', () => {
  const dir = carpeta(), f = path.join(dir, 'x.pdf');
  escribirAtomico(f, Buffer.from([0x25, 0x50, 0x44, 0x46]));
  assert.strictEqual(fs.readFileSync(f).toString('latin1'), '%PDF');
});
