// Ajustes guarda el bloque del motor completo, así que el modelo por defecto
// de entonces queda escrito en config.json. Al leer, el viejo se sube al actual
// y uno elegido a mano se respeta.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const HOGAR = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-modelo-'));
const DIR = path.join(HOGAR, '.config', 'escriba');
fs.mkdirSync(DIR, { recursive: true });
process.env.HOME = HOGAR;
delete process.env.ESCRIBA_CONFIG_DIR;

const escribir = (motor) => fs.writeFileSync(path.join(DIR, 'config.json'),
  JSON.stringify({ usuario: { nombre: 'Prueba' }, motor }));

test('el modelo que era por defecto se sube al actual', () => {
  escribir({ tipo: 'automatico', modeloApi: 'claude-sonnet-5', modeloOllama: 'llama3.1:8b', proveedor: 'anthropic' });
  delete require.cache[require.resolve('../lib/config')];
  const CONFIG = require('../lib/config');
  const m = CONFIG.leer().motor;
  assert.strictEqual(m.modeloApi, CONFIG.POR_DEFECTO.motor.modeloApi);
  assert.strictEqual(m.modeloApi, 'claude-sonnet-5-5');
  assert.strictEqual(m.modeloOllama, 'llama3.1:8b', 'lo demás del motor se conserva');
});

test('un modelo elegido a mano no se toca', () => {
  escribir({ tipo: 'api', modeloApi: 'claude-opus-5-5', proveedor: 'anthropic' });
  delete require.cache[require.resolve('../lib/config')];
  const CONFIG = require('../lib/config');
  assert.strictEqual(CONFIG.leer().motor.modeloApi, 'claude-opus-5-5');
});
