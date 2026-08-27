// Qué cuenta como cliente. Antes la lista se armaba también con cada .md de la
// carpeta de expedientes, que es de contexto general: aparecían 20 entradas de
// las que solo 3 eran clientes de verdad. Ahora un cliente es una carpeta de
// ~/Reuniones, y el expediente se le enlaza.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const HOGAR = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-clientes-'));
const REUNIONES = path.join(HOGAR, 'Reuniones');
const EXPEDIENTES = path.join(HOGAR, 'contexto');
fs.mkdirSync(path.join(HOGAR, '.config', 'escriba'), { recursive: true });
fs.mkdirSync(REUNIONES, { recursive: true });
fs.mkdirSync(EXPEDIENTES, { recursive: true });
fs.writeFileSync(path.join(HOGAR, '.config', 'escriba', 'config.json'),
  JSON.stringify({ usuario: { nombre: 'Ana Ruiz' }, rutas: { reuniones: REUNIONES, dossiers: EXPEDIENTES } }));
process.env.HOME = HOGAR;

// carpetas de clientes reales
for (const d of ['acme', 'cliente-demo', '.oculta']) fs.mkdirSync(path.join(REUNIONES, d), { recursive: true });
// expedientes: dos de clientes, dos que son documentos de trabajo
for (const f of ['acme.md', 'proyecto-suelto.md', 'acme-sprint0-decision-matrix-20260519.md', 'notas-20260101.md'])
  fs.writeFileSync(path.join(EXPEDIENTES, f), '# ' + f);

const R = require('../lib/rutas');

test('la lista son las carpetas de reuniones, no los expedientes', () => {
  const nombres = R.clientes().map(c => c.nombre);
  assert.deepStrictEqual(nombres, ['Acme', 'Cliente Demo']);
  assert.ok(!nombres.includes('Proyecto Suelto'),
    'un expediente sin carpeta no es un cliente: eso llenaba la lista de proyectos');
});

test('las carpetas ocultas se ignoran', () => {
  assert.ok(!R.clientes().some(c => c.nombre.toLowerCase().includes('oculta')));
});

test('el expediente se enlaza solo cuando el nombre coincide', () => {
  const acme = R.clientes().find(c => c.nombre === 'Acme');
  assert.strictEqual(acme.dossier, path.join(EXPEDIENTES, 'acme.md'));
  const demo = R.clientes().find(c => c.nombre === 'Cliente Demo');
  assert.strictEqual(demo.dossier, null, 'sin coincidencia, se queda sin expediente');
});

test('un enlace hecho a mano gana sobre la coincidencia de nombre', () => {
  R.enlazarExpediente('acme', path.join(EXPEDIENTES, 'proyecto-suelto.md'));
  const acme = R.clientes().find(c => c.nombre === 'Acme');
  assert.strictEqual(acme.dossier, path.join(EXPEDIENTES, 'proyecto-suelto.md'));
  assert.strictEqual(R.expedienteEnlazado(path.join(REUNIONES, 'acme')),
                     path.join(EXPEDIENTES, 'proyecto-suelto.md'));
});

test('se puede quitar el enlace y vuelve la coincidencia por nombre', () => {
  R.enlazarExpediente('acme', null);
  assert.strictEqual(R.clientes().find(c => c.nombre === 'Acme').dossier,
                     path.join(EXPEDIENTES, 'acme.md'));
});

test('un enlace que apunta a un archivo borrado no se usa', () => {
  const fantasma = path.join(EXPEDIENTES, 'fantasma.md');
  fs.writeFileSync(fantasma, 'x');
  R.enlazarExpediente('cliente-demo', fantasma);
  assert.strictEqual(R.clientes().find(c => c.nombre === 'Cliente Demo').dossier, fantasma);
  fs.unlinkSync(fantasma);
  assert.strictEqual(R.clientes().find(c => c.nombre === 'Cliente Demo').dossier, null);
  R.enlazarExpediente('cliente-demo', null);
});

test('los documentos de trabajo no se ofrecen como expediente', () => {
  const nombres = R.expedientes().map(e => e.nombre);
  assert.ok(nombres.includes('Acme'));
  assert.ok(nombres.includes('Proyecto Suelto'));
  assert.ok(!nombres.some(n => /matrix/i.test(n)), 'una matriz de decisión no es un cliente');
  assert.ok(!nombres.some(n => /^Notas$/.test(n)), 'un documento fechado no es un cliente');
});

test('crear un cliente con expediente lo deja enlazado', () => {
  const c = R.crearCliente('Nuevo Amigo', path.join(EXPEDIENTES, 'proyecto-suelto.md'));
  assert.strictEqual(c.slug, 'nuevo-amigo');
  assert.ok(fs.existsSync(path.join(REUNIONES, 'nuevo-amigo')));
  const enLista = R.clientes().find(x => x.nombre === 'Nuevo Amigo');
  assert.ok(enLista, 'debe aparecer en la lista en cuanto se crea');
  assert.strictEqual(enLista.dossier, path.join(EXPEDIENTES, 'proyecto-suelto.md'));
});

test('crear un cliente sin expediente también funciona', () => {
  R.crearCliente('Otro Amigo');
  const c = R.clientes().find(x => x.nombre === 'Otro Amigo');
  assert.ok(c);
  assert.strictEqual(c.dossier, null);
});

test('los acentos y espacios se convierten en un slug usable', () => {
  const c = R.crearCliente('Café Ñandú S.A.');
  assert.strictEqual(c.slug, 'cafe-nandu-s-a');
  assert.ok(fs.existsSync(path.join(REUNIONES, c.slug)));
});

test('el nombre queda tal como se escribió, sin capitalizar cada palabra', () => {
  const c = R.crearCliente('Amigo del sitio web');
  assert.strictEqual(c.slug, 'amigo-del-sitio-web');
  const enLista = R.clientes().find(x => x.slug === 'amigo-del-sitio-web');
  assert.strictEqual(enLista.nombre, 'Amigo del sitio web',
    'reconstruirlo del nombre de carpeta daría "Amigo Del Sitio Web"');
});

test('una carpeta sin datos guardados sigue deduciendo el nombre', () => {
  fs.mkdirSync(path.join(REUNIONES, 'sin-datos-mx'), { recursive: true });
  assert.ok(R.clientes().some(c => c.nombre === 'Sin Datos'));
});

test('los datos del cliente no se cuentan como reunión', () => {
  R.enlazarExpediente('acme', path.join(EXPEDIENTES, 'acme.md'));
  fs.mkdirSync(path.join(REUNIONES, 'acme', '2026-01-15_1000'), { recursive: true });
  const rs = R.reuniones('acme');
  assert.strictEqual(rs.length, 1, 'el .cliente.json es un archivo, no una reunión');
  assert.strictEqual(rs[0].id, '2026-01-15_1000');
});

test('la reunión conserva y muestra qué motor escribió la minuta', () => {
  const carpeta = path.join(REUNIONES, 'acme', '2026-01-15_1000');
  fs.writeFileSync(path.join(carpeta, '.reunion.json'), JSON.stringify({ modo: 'llamada' }));

  R.guardarMotorReunion(carpeta, { id: 'codex-cli', nombre: 'Codex' });

  assert.deepStrictEqual(R.reuniones('acme')[0].motor, { id: 'codex-cli', nombre: 'Codex' });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(carpeta, '.reunion.json'), 'utf8')).modo, 'llamada');
});

// ---------- slug vacío: podía borrar la carpeta de OTRO cliente ----------
// Un nombre sin letras latinas dejaba el slug vacío, y `path.join(BASE(), '')`
// es la carpeta raíz: `reuniones('')` devolvía las carpetas de los demás
// clientes como si fueran reuniones, y "Borrar esta reunión" mandaba a la
// Papelera la carpeta completa de otro cliente. El guardia de ruta no protegía
// porque esas carpetas sí están dentro de la base.
test('un nombre sin letras latinas produce un slug usable, no vacío', () => {
  for (const n of ['###', '北京', '🙂', '¿?', '—']) {
    const slug = R.aSlug(n);
    assert.ok(slug.length > 0, `${n} dejó el slug vacío`);
    assert.match(slug, /^[a-z0-9-]+$/);
  }
});

test('el slug de un nombre normal sigue siendo legible', () => {
  assert.strictEqual(R.aSlug('Acme'), 'acme');
  assert.strictEqual(R.aSlug('Café Ñandú S.A.'), 'cafe-nandu-s-a');
});

test('el mismo nombre da siempre el mismo slug', () => {
  assert.strictEqual(R.aSlug('北京'), R.aSlug('北京'));
  assert.notStrictEqual(R.aSlug('北京'), R.aSlug('東京'));
});

test('un cliente sin letras latinas se crea y aparece con su nombre', () => {
  const c = R.crearCliente('北京');
  assert.ok(c.slug.length > 0);
  assert.ok(R.clientes().some(x => x.nombre === '北京'));
  assert.ok(!fs.existsSync(path.join(REUNIONES, '.cliente.json')),
    'nunca debe escribirse en la raíz de la carpeta de reuniones');
});

test('reuniones("") no puede devolver carpetas de clientes', () => {
  assert.deepStrictEqual(R.reuniones(''), []);
  assert.deepStrictEqual(R.reuniones(null), []);
  assert.deepStrictEqual(R.reuniones(undefined), []);
});

test('un nombre en blanco se rechaza', () => {
  assert.throws(() => R.crearCliente('   '), /nombre/i);
  assert.throws(() => R.crearCliente(''), /nombre/i);
});
