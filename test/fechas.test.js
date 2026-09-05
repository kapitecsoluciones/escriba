// El nombre de la carpeta es la única fuente de cuándo pasó la reunión. Si el
// parseo se come la hora, el prompt se queda sin la ventana de lo grabado y la
// minuta no puede decir qué tramo falta.
const { test } = require('node:test');
const assert = require('node:assert');
const { fechaDeCarpeta, ventana } = require('../lib/fechas');

const RUTA = '/Users/x/Reuniones/fair-cup/2026-08-31_161813';

test('la fecha sale del nombre de la carpeta, no del día en que se procesa', () => {
  const d = fechaDeCarpeta(RUTA);
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 7);
  assert.strictEqual(d.getDate(), 31);
});

test('la hora del sello llega a la ventana', () => {
  const v = ventana(RUTA, 4315);
  assert.strictEqual(v.inicio, '16:18');
  assert.strictEqual(v.fin, '17:30');   // 1 h 11 min 55 s después
});

// Las carpetas anteriores a los segundos en el sello se llaman _HHMM. Son
// reuniones reales que se siguen reprocesando: no pueden perder la hora.
test('el formato viejo de cuatro dígitos también trae hora', () => {
  const v = ventana('/x/coller/2026-08-20_2229', 600);
  assert.strictEqual(v.inicio, '22:29');
  assert.strictEqual(v.fin, '22:39');
});

test('cruzar la medianoche no rompe la hora de fin', () => {
  assert.strictEqual(ventana('/x/y/2026-08-20_233000', 3600).fin, '00:30');
});

// Un audio importado o un ffprobe que falla dejan la duración en desconocida.
// Eso no puede tirar la hora de inicio, que sí se sabe.
test('sin duración conocida, queda el inicio y el fin va vacío', () => {
  const v = ventana(RUTA, null);
  assert.strictEqual(v.inicio, '16:18');
  assert.strictEqual(v.fin, null);
});

test('una carpeta sin sello de hora no inventa ventana', () => {
  assert.strictEqual(ventana('/x/y/2026-08-20', 600), null);
  assert.strictEqual(fechaDeCarpeta('/x/y/2026-08-20').getDate(), 20);
});

test('una hora imposible se trata como carpeta sin hora, no como las 99:61', () => {
  assert.strictEqual(ventana('/x/y/2026-08-20_9961', 600), null);
});

test('una ruta sin fecha no revienta', () => {
  assert.strictEqual(ventana('/x/y/borrador', 600), null);
  assert.ok(fechaDeCarpeta('/x/y/borrador') instanceof Date);
});

// La zona importa: el usuario puede grabar desde otro huso que la reunión (una
// Mac en Hermosillo escuchando un evento de la Ciudad de México). Sin nombrarla,
// las horas de la minuta se leen mal.
test('la ventana dice en qué zona están esas horas', () => {
  assert.strictEqual(ventana(RUTA, 4315).zona, Intl.DateTimeFormat().resolvedOptions().timeZone);
});

test('la fecha sale del nombre de la carpeta, no de una fecha más arriba en la ruta', () => {
  const F = require('../lib/fechas');
  const d = F.fechaDeCarpeta('/archivo/2020-01-01/acme/2026-08-20_120000');
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getHours(), 12);
});
