// La configuración se lee una vez y se guarda en memoria, y las rutas se
// calculan al cargar el módulo: por eso cada escenario necesita su propio
// archivo de prueba con su HOME, en vez de varios casos en el mismo archivo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const HOGAR = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-corrupto-'));
fs.mkdirSync(path.join(HOGAR, '.config', 'escriba'), { recursive: true });
fs.writeFileSync(path.join(HOGAR, '.config', 'escriba', 'config.json'), '{ esto no es json');
process.env.HOME = HOGAR;

const CONFIG = require('../lib/config');

test('un config.json corrupto no revienta: se cae a los valores por defecto', () => {
  const c = CONFIG.leer();
  assert.strictEqual(c.usuario.nombre, '');
  assert.strictEqual(c.motor.tipo, 'claude-cli');
  assert.ok(c.rutas.reuniones.length > 0);
});

test('sin nombre, la app se considera sin configurar', () => {
  assert.strictEqual(CONFIG.configurado(), false);
});
