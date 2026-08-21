// Guardar un solo campo no debe borrar sus hermanos: es el fallo clásico de
// fusionar objetos anidados, y aquí se perdería el contacto o la empresa.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const HOGAR = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-fusion-'));
process.env.HOME = HOGAR;

const CONFIG = require('../lib/config');

test('guardar un campo anidado conserva los hermanos', () => {
  CONFIG.guardar({ usuario: { nombre: 'Ana Ruiz', empresa: 'Acme', contacto: 'ana@ejemplo.com' } });
  CONFIG.guardar({ usuario: { nombre: 'Ana Ruiz Pérez' } });
  const c = CONFIG.leer();
  assert.strictEqual(c.usuario.nombre, 'Ana Ruiz Pérez');
  assert.strictEqual(c.usuario.empresa, 'Acme', 'la empresa no debía perderse');
  assert.strictEqual(c.usuario.contacto, 'ana@ejemplo.com', 'el contacto no debía perderse');
});

test('guardar una rama no toca las demás', () => {
  CONFIG.guardar({ marca: { acento: '#123456' } });
  const c = CONFIG.leer();
  assert.strictEqual(c.marca.acento, '#123456');
  assert.strictEqual(c.usuario.empresa, 'Acme');
  assert.strictEqual(c.motor.tipo, 'claude-cli', 'los valores por defecto siguen ahí');
});

test('con nombre, la app ya se considera configurada', () => {
  assert.strictEqual(CONFIG.configurado(), true);
});

test('lo guardado se puede volver a leer del disco', () => {
  const escrito = JSON.parse(fs.readFileSync(path.join(HOGAR, '.config', 'escriba', 'config.json'), 'utf8'));
  assert.strictEqual(escrito.usuario.empresa, 'Acme');
});
