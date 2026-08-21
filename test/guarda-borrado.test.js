// La ruta que se borra viene del renderer. Esta guarda es lo único que separa
// "borrar una reunión" de "mandar a la Papelera una carpeta cualquiera".
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { dentroDeBase } = require('../lib/rutas');

const BASE = '/Users/demo/Reuniones';

test('acepta una carpeta de reunión normal', () => {
  assert.strictEqual(dentroDeBase(path.join(BASE, 'acme', '2026-01-15_1000'), BASE), true);
});

test('rechaza la carpeta base misma', () => {
  assert.strictEqual(dentroDeBase(BASE, BASE), false);
  assert.strictEqual(dentroDeBase(BASE + '/', BASE), false);
});

test('rechaza cualquier ruta de fuera', () => {
  for (const fuera of ['/Users/demo/Documents', '/', '/Users/demo', '/System/Library']) {
    assert.strictEqual(dentroDeBase(fuera, BASE), false, fuera + ' no debía aceptarse');
  }
});

test('no se puede salir con ..', () => {
  assert.strictEqual(dentroDeBase(path.join(BASE, 'acme', '..', '..', 'Documents'), BASE), false);
  assert.strictEqual(dentroDeBase(BASE + '/../Documents', BASE), false);
});

test('un hermano con el mismo prefijo no cuela', () => {
  // "/Users/demo/ReunionesViejas" empieza igual que la base, pero no está dentro
  assert.strictEqual(dentroDeBase('/Users/demo/ReunionesViejas/x', BASE), false);
});

test('rechaza valores vacíos', () => {
  for (const v of ['', null, undefined]) assert.strictEqual(dentroDeBase(v, BASE), false);
});
