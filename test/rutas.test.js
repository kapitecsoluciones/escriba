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
