// La plantilla del PDF recibe texto que viene de un LLM y de nombres de cliente
// escritos a mano: todo lo interpolado tiene que ir escapado.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

const HOGAR = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-pdf-'));
process.env.HOME = HOGAR;
const CONFIG = require('../lib/config');
const PDF = require('../lib/pdf');

test('escapa el nombre del cliente', () => {
  const html = PDF.envolver({ cliente: 'Acme <script>alert(1)</script>', fecha: 'hoy', cuerpoHtml: '<p>x</p>' });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('escapa las comillas del nombre para no romper los atributos', () => {
  const html = PDF.envolver({ cliente: 'Acme "la buena"', fecha: 'hoy', cuerpoHtml: '' });
  assert.match(html, /&quot;la buena&quot;/);
});

// El orden de sustitución es frágil: ACENTO_SUAVE tiene que reemplazarse ANTES
// que ACENTO, o quedaría un "_SUAVE" suelto pegado al color.
test('el color de acento se sustituye entero, sin dejar restos', () => {
  CONFIG.guardar({ marca: { acento: '#123456' } });
  const html = PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' });
  assert.match(html, /--gold:#123456/);
  assert.match(html, /--gold-soft:#12345622/);
  assert.doesNotMatch(html, /ACENTO/);
  assert.doesNotMatch(html, /_SUAVE/);
});

test('el cuerpo ya convertido pasa tal cual', () => {
  const html = PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '<table><tr><td>ok</td></tr></table>' });
  assert.match(html, /<table><tr><td>ok<\/td><\/tr><\/table>/);
});

test('usa los encabezados por defecto si no se piden otros', () => {
  const html = PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' });
  assert.match(html, /Minuta de reunión/);
  assert.match(html, /Acuerdos y siguientes pasos/);
});

test('el expediente puede cambiar los encabezados', () => {
  const html = PDF.envolver({ cliente: 'Acme', fecha: '3 reuniones', cuerpoHtml: '',
                              eyebrow: 'Expediente del cliente', titulo: 'Historial de reuniones' });
  assert.match(html, /Expediente del cliente/);
  assert.match(html, /Historial de reuniones/);
});

// La cabecera: quien emite, grande a la izquierda; para quién, pequeño a la
// derecha. Antes iba al revés y el documento parecía emitido por el cliente.
test('sin logos: el emisor a la izquierda y "Para · cliente" a la derecha, nunca la marca de otro', () => {
  CONFIG.guardar({ usuario: { empresa: 'Estudio Norte' } });
  const html = PDF.envolver({ cliente: 'Cliente Demo', fecha: 'hoy', cuerpoHtml: '', carpetaCliente: null });
  assert.match(html, /class="emisor">Estudio Norte<\/div>/);
  assert.match(html, /class="para">Para<b>Cliente Demo<\/b>/);
  assert.doesNotMatch(html, /<img src="data:/);
  // el cliente no aparece como emisor
  assert.doesNotMatch(html, /class="emisor">Cliente Demo/);
});

test('el logo del cliente solo sale de SU carpeta, y el propio solo de Ajustes', () => {
  const carpeta = fs.mkdtempSync(path.join(HOGAR, 'cli-'));
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  fs.writeFileSync(path.join(carpeta, 'logo.png'), png);
  const conLogo = PDF.envolver({ cliente: 'Cliente Demo', fecha: 'hoy', cuerpoHtml: '', carpetaCliente: carpeta });
  assert.match(conLogo, /<img src="data:image\/png;base64,[^"]+" alt="Cliente Demo">/);
  assert.match(conLogo, /class="emisor">/, 'el emisor sigue siendo tipográfico');
  // otro cliente sin logo no hereda el de este
  const otro = PDF.envolver({ cliente: 'Otro', fecha: 'hoy', cuerpoHtml: '', carpetaCliente: fs.mkdtempSync(path.join(HOGAR, 'otro-')) });
  assert.doesNotMatch(otro, /<img src="data:image/);
  // el propio, desde Ajustes, va a la izquierda
  const propio = path.join(HOGAR, 'marca.png'); fs.writeFileSync(propio, png);
  CONFIG.guardar({ marca: { logo: propio } });
  const conPropio = PDF.envolver({ cliente: 'Otro', fecha: 'hoy', cuerpoHtml: '', carpetaCliente: null });
  assert.match(conPropio, /<header class="masthead"><img src="data:image\/png;base64,[^"]+" alt="Estudio Norte">/);
  CONFIG.guardar({ marca: { logo: '' } });
});

// Sin red el PDF salía en Arial con el espaciado calibrado para otra letra.
test('las fuentes van incrustadas; nada se carga de internet', () => {
  const html = PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' });
  assert.doesNotMatch(html, /googleapis|https?:\/\//);
  assert.match(html, /@font-face\{font-family:'Inter';[^}]*font-weight:100 900;src:url\(data:font\/woff2;base64,/);
  assert.match(html, /@font-face\{font-family:'Plus Jakarta Sans';[^}]*font-weight:800;src:url\(data:font\/woff2;base64,/);
});

// La misma escala que la ventana (pt = px × 0.75): 14 px → 10.5 pt, 17 → 12.75, 21 → 15.75.
test('comparte escala con la app', () => {
  const html = PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' });
  assert.match(html, /html,body\{[^}]*font-size:10\.5pt/);
  assert.match(html, /\nh2\{[^}]*font-size:12\.75pt/);
  assert.match(html, /h1:not\(\.doctitle\)\{[^}]*font-size:15\.75pt/);
});

// El acento iba al CSS del documento tal cual venía de config.json.
test('el acento solo entra al PDF como #RRGGBB; un valor raro cae al de fábrica y #RGB se expande', () => {
  CONFIG.guardar({ marca: { acento: '#fff} body{display:none} x{' } });
  let html = PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' });
  assert.doesNotMatch(html, /display:none\} x\{/);
  assert.match(html, /--gold:#B58A3E;/);
  CONFIG.guardar({ marca: { acento: '#fff' } });
  html = PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' });
  assert.match(html, /--gold:#FFFFFF;/);
  assert.match(html, /--gold-texto:#b8b8b8;/);
  CONFIG.guardar({ marca: { acento: '#B58A3E' } });
});

test('config con "marca": null no tumba el PDF', () => {
  CONFIG.guardar({ marca: null });
  const html = PDF.envolver({ cliente: 'Acme', fecha: 'hoy', cuerpoHtml: '' });
  assert.match(html, /--gold:#B58A3E;/);
  assert.doesNotMatch(html, /<img src="data:/);
  CONFIG.guardar({ marca: { logo: '', acento: '#B58A3E' } });
});
