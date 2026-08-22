// El logo propio y el acento: se copian a la configuración, se validan, y la
// vista previa dice exactamente lo que el PDF va a usar.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const HOGAR = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-marca-'));
process.env.HOME = HOGAR;
const CONFIG = require('../lib/config');
const MARCA = require('../lib/marca');
const PDF = require('../lib/pdf');

const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const origen = path.join(HOGAR, 'mi-logo.png'); fs.writeFileSync(origen, png);

test('instala el logo copiándolo a la carpeta de configuración y lo apunta en config', () => {
  const r = MARCA.instalarLogo(origen);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(path.dirname(r.ruta), path.join(CONFIG.DIR, 'marca'));
  assert.match(path.basename(r.ruta), /^logo-[a-z0-9]+\.png$/);
  assert.ok(fs.existsSync(r.ruta));
  assert.strictEqual(CONFIG.leer().marca.logo, r.ruta);
  // borrar el original no rompe nada: el PDF sigue con logo
  fs.unlinkSync(origen);
  assert.match(PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' }), /<header class="masthead"><img src="data:image\/png;base64,/);
});

test('la vista previa trae el logo en data URI, el emisor y el acento validado', () => {
  CONFIG.guardar({ usuario: { empresa: 'Estudio Norte' }, marca: { acento: 'rojo' } });
  const v = MARCA.vista();
  assert.match(v.logo, /^data:image\/png;base64,/);
  assert.strictEqual(v.emisor, 'Estudio Norte');
  assert.strictEqual(v.acento, '#B58A3E', 'un acento inválido cae al de fábrica');
  CONFIG.guardar({ marca: { acento: '#2367FB' } });
  assert.strictEqual(MARCA.vista().acento, '#2367FB');
});

test('cambiar de logo deja solo el nuevo; quitarlo borra el archivo y limpia config', () => {
  const svg = path.join(HOGAR, 'otro.svg'); fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  const r = MARCA.instalarLogo(svg);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(fs.readdirSync(path.join(CONFIG.DIR, 'marca')).filter(f => f.startsWith('logo')).map(f => path.extname(f)), ['.svg']);
  MARCA.quitarLogo();
  assert.strictEqual(CONFIG.leer().marca.logo, '');
  assert.deepStrictEqual(fs.readdirSync(path.join(CONFIG.DIR, 'marca')).filter(f => f.startsWith('logo')), []);
  assert.strictEqual(MARCA.vista().logo, null);
  assert.doesNotMatch(PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' }), /<img src="data:/);
});

test('rechaza lo que no es imagen, lo que pesa de más y lo que no existe, sin tocar el logo instalado', () => {
  // con un logo YA instalado: un rechazo no puede borrarlo ni cambiar la config
  const bueno = path.join(HOGAR, 'bueno.png'); fs.writeFileSync(bueno, png);
  const instalado = MARCA.instalarLogo(bueno).ruta;
  const antes = CONFIG.leer().marca.logo;
  assert.strictEqual(antes, instalado);
  const exe = path.join(HOGAR, 'virus.exe'); fs.writeFileSync(exe, 'x');
  assert.match(MARCA.instalarLogo(exe).error, /PNG, JPG, WebP o SVG/);
  const gordo = path.join(HOGAR, 'gordo.png'); fs.writeFileSync(gordo, Buffer.alloc(MARCA.TOPE + 1));
  assert.match(MARCA.instalarLogo(gordo).error, /máximo es 2 MB/);
  assert.match(MARCA.instalarLogo(path.join(HOGAR, 'no-existe.png')).error, /No se pudo leer/);
  assert.match(MARCA.instalarLogo(null).error, /PNG, JPG/);
  assert.strictEqual(CONFIG.leer().marca.logo, antes);
  assert.ok(fs.existsSync(instalado), 'el logo instalado sigue en disco');
  assert.strictEqual(fs.readdirSync(path.join(CONFIG.DIR, 'marca')).filter(f => /^logo/.test(f)).length, 1);
  MARCA.quitarLogo();
});

test('la vista aguanta config rara: "marca": null, y un logo a mano que pesa de más no se usa', () => {
  CONFIG.guardar({ marca: null });
  assert.doesNotThrow(() => MARCA.vista());
  assert.strictEqual(MARCA.vista().logo, null);
  assert.strictEqual(MARCA.vista().acento, '#B58A3E');
  const gordo = path.join(HOGAR, 'enorme.png'); fs.writeFileSync(gordo, Buffer.alloc(MARCA.TOPE + 1));
  CONFIG.guardar({ marca: { logo: gordo, acento: '#abc' } });
  const v = MARCA.vista();
  assert.strictEqual(v.logo, null, 'ni la vista previa ni el PDF cargan un logo de más de 2 MB');
  assert.strictEqual(v.acento, '#AABBCC', '#RGB se expande como en el PDF');
  assert.doesNotMatch(PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' }), /<img src="data:/);
  CONFIG.guardar({ marca: { logo: '', acento: '#B58A3E' } });
});

test('volver a elegir el logo ya instalado no lo pierde, y .PNG en mayúsculas vale', () => {
  const fuente = path.join(HOGAR, 'LOGO.PNG'); fs.writeFileSync(fuente, png);
  const r1 = MARCA.instalarLogo(fuente);
  assert.strictEqual(r1.ok, true);
  assert.match(path.basename(r1.ruta), /^logo-[a-z0-9]+\.png$/);
  // el usuario abre el diálogo y elige el mismo archivo que ya está instalado
  const r2 = MARCA.instalarLogo(r1.ruta);
  assert.strictEqual(r2.ok, true, JSON.stringify(r2));
  assert.notStrictEqual(r2.ruta, r1.ruta, 'se copia con nombre nuevo');
  assert.ok(fs.existsSync(r2.ruta));
  assert.strictEqual(fs.readFileSync(r2.ruta).length, png.length);
  assert.strictEqual(CONFIG.leer().marca.logo, r2.ruta);
  assert.deepStrictEqual(fs.readdirSync(path.join(CONFIG.DIR, 'marca')), [path.basename(MARCA.vista().logoRuta)], 'queda solo el nuevo');
  MARCA.quitarLogo();
});

test('acentoValido acepta #RRGGBB y #RGB, nada más; normalizarAcento expande y pone mayúsculas', () => {
  assert.ok(MARCA.acentoValido('#B58A3E')); assert.ok(MARCA.acentoValido('#aabbcc')); assert.ok(MARCA.acentoValido('#FFF'));
  for (const malo of ['B58A3E', 'red', '', null, '#GGGGGG', '#B58A3E;}', 'rgb(1,2,3)', '#fff} body{display:none} x{']) assert.ok(!MARCA.acentoValido(malo), String(malo));
  assert.strictEqual(MARCA.normalizarAcento('#abc'), '#AABBCC');
  assert.strictEqual(MARCA.normalizarAcento(' #b58a3e '), '#B58A3E');
});
