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

test('sin logo del cliente cae al encabezado tipográfico, no al de otra marca', () => {
  const html = PDF.envolver({ cliente: 'Cliente Demo', fecha: 'hoy', cuerpoHtml: '', carpetaCliente: null });
  assert.match(html, /Cliente Demo<\/div>/);
  assert.doesNotMatch(html, /<img src="data:/);
});
