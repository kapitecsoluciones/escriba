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
  assert.strictEqual(c.motor.tipo, 'automatico');
  assert.ok(c.rutas.reuniones.length > 0);
});

test('sin nombre, la app se considera sin configurar', () => {
  assert.strictEqual(CONFIG.configurado(), false);
});

// Antes el fallback era silencioso: la app arrancaba con valores por defecto,
// la carpeta de reuniones apuntaba a otro sitio y todos los clientes
// desaparecían sin explicación. Ahora el original se aparta y se avisa.
test('el config corrupto se aparta en vez de perderse, y la app puede decirlo', () => {
  CONFIG.leer();
  const roto = CONFIG.corrupcion();
  assert.ok(roto, 'la app debía enterarse');
  const original = path.join(HOGAR, '.config', 'escriba', 'config.json');
  assert.strictEqual(fs.existsSync(original), false, 'el dañado no sigue en su sitio');
  assert.strictEqual(fs.readFileSync(roto.respaldo, 'utf8'), '{ esto no es json', 'se conserva tal cual');
});
