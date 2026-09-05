// Nombre legible del cliente a partir del nombre de archivo o de carpeta.
const { test } = require('node:test');
const assert = require('node:assert');
const { titulo } = require('../lib/rutas');

test('quita la extensión y capitaliza', () => {
  assert.strictEqual(titulo('acme.md'), 'Acme');
});

test('quita el sufijo de país al final', () => {
  assert.strictEqual(titulo('acme-mx.md'), 'Acme');
});

test('"mx" solo se descarta al final; en otra posición es una sigla', () => {
  assert.strictEqual(titulo('mx-acme'), 'MX Acme');
});

test('las siglas conocidas van en mayúsculas', () => {
  assert.strictEqual(titulo('acme-crm'), 'Acme CRM');
  assert.strictEqual(titulo('demo-seo-pos'), 'Demo SEO POS');
});

test('descarta la fecha pegada al nombre', () => {
  assert.strictEqual(titulo('acme-20260115'), 'Acme');
});

test('acepta guion bajo igual que guion', () => {
  assert.strictEqual(titulo('cliente_demo'), 'Cliente Demo');
});

// Comportamiento conocido, no deseado: un cliente que se llame solo "mx" acaba
// sin nombre, y clientes() lo descarta en silencio. Queda fijado aquí para que,
// si algún día se arregla, esta prueba avise en vez de romperse sin explicación.
test('un slug que se queda vacío devuelve cadena vacía', () => {
  assert.strictEqual(titulo('mx'), '');
});

test('no revienta con cadena vacía', () => {
  assert.strictEqual(titulo(''), '');
});

test('guardarMetaReunion conserva el motor y añade las citas sin pisar lo demás', () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-meta-'));
  const cfgDir = path.join(base, 'cfg'); fs.mkdirSync(cfgDir);
  const carpeta = path.join(base, 'reuniones', 'acme', '2026-01-15_1030');
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(carpeta, '.reunion.json'), JSON.stringify({ modo: 'llamada' }));
  const previo = process.env.HOME;
  try {
    // rutas lee la base desde la config; se la damos en un HOME temporal
    process.env.HOME = base;
    fs.mkdirSync(path.join(base, '.config', 'escriba'), { recursive: true });
    fs.writeFileSync(path.join(base, '.config', 'escriba', 'config.json'), JSON.stringify({ rutas: { reuniones: path.join(base, 'reuniones') } }));
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/rutas')];
    const RR = require('../lib/rutas');
    RR.guardarMetaReunion(carpeta, { motor: { id: 'api', nombre: 'API' }, citas: { total: 3, descartadas: '1' } });
    const meta = JSON.parse(fs.readFileSync(path.join(carpeta, '.reunion.json'), 'utf8'));
    assert.deepStrictEqual(meta, { modo: 'llamada', motor: { id: 'api', nombre: 'API' }, citas: { total: 3, descartadas: 1 } });
    assert.throws(() => RR.guardarMetaReunion(path.join(base, 'fuera'), { citas: { total: 1 } }), /fuera de la carpeta/);
  } finally {
    process.env.HOME = previo;
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/rutas')];
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('una redacción nueva sin citas borra el conteo de la versión anterior', () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-meta2-'));
  const carpeta = path.join(base, 'reuniones', 'acme', '2026-01-15_1030');
  fs.mkdirSync(carpeta, { recursive: true });
  const previo = process.env.HOME;
  try {
    process.env.HOME = base;
    fs.mkdirSync(path.join(base, '.config', 'escriba'), { recursive: true });
    fs.writeFileSync(path.join(base, '.config', 'escriba', 'config.json'), JSON.stringify({ rutas: { reuniones: path.join(base, 'reuniones') } }));
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/rutas')];
    const RR = require('../lib/rutas');
    RR.guardarMotorReunion(carpeta, { id: 'api', nombre: 'API' }, { total: 5, descartadas: 0 });
    RR.guardarMotorReunion(carpeta, { id: 'ollama', nombre: 'Ollama' }, null);
    const meta = JSON.parse(fs.readFileSync(path.join(carpeta, '.reunion.json'), 'utf8'));
    assert.strictEqual(meta.citas, undefined);
    assert.strictEqual(meta.motor.id, 'ollama');
  } finally {
    process.env.HOME = previo;
    delete require.cache[require.resolve('../lib/config')];
    delete require.cache[require.resolve('../lib/rutas')];
    fs.rmSync(base, { recursive: true, force: true });
  }
});
