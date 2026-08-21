// Pruebas del conversor de Markdown. Las tres primeras existen porque el
// conversor se colgaba para siempre con estas entradas, y la minuta la escribe
// un LLM: tarde o temprano manda una tabla cortada a la mitad.
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const MD = require('../lib/md');

const RAPIDO = { timeout: 6000 };
const RUTA_MD = path.join(__dirname, '..', 'lib', 'md.js');

// Un bucle infinito es síncrono y bloquea el hilo, así que el `timeout` de
// node:test nunca llegaría a dispararse: la prueba se colgaría en lugar de
// fallar, y con ella el CI entero. En un proceso aparte el sistema lo mata y
// la prueba falla limpiamente en unos segundos.
function convertirSinColgarse(texto) {
  return execFileSync(process.execPath,
    ['-e', 'process.stdout.write(require(process.argv[1]).convertir(process.argv[2]))', RUTA_MD, texto],
    { timeout: 4000, killSignal: 'SIGKILL', encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

test('no se cuelga con un encabezado de cinco almohadillas', RAPIDO, () => {
  assert.match(convertirSinColgarse('##### Subtítulo'), /Subtítulo/);
});

test('no se cuelga con una almohadilla sin espacio', RAPIDO, () => {
  assert.match(convertirSinColgarse('#Sinespacio'), /Sinespacio/);
});

test('no se cuelga con una tabla cortada a la mitad', RAPIDO, () => {
  const truncada = 'Acuerdos de la reunión\n| Compromiso | Responsable |';
  const html = convertirSinColgarse(truncada);
  assert.match(html, /Compromiso/);
  assert.match(html, /Responsable/);
});

// Estas dos son las que de verdad ejercitan la red de seguridad de la rama de
// párrafo: una línea que empieza por guiones pero no es un separador válido no
// la consume ninguna rama anterior, y sin la red el conversor no avanza nunca.
test('no se cuelga con guiones seguidos de texto', RAPIDO, () => {
  assert.match(convertirSinColgarse('---texto'), /texto/);
});

test('no se cuelga con un separador que lleva texto detrás', RAPIDO, () => {
  assert.match(convertirSinColgarse('--- fin de la minuta'), /fin de la minuta/);
});

test('un separador limpio sigue siendo una línea horizontal', RAPIDO, () => {
  assert.match(MD.convertir('---'), /<hr>/);
});

test('una tabla completa se convierte en tabla', RAPIDO, () => {
  const html = MD.convertir('| Compromiso | Quién |\n|---|---|\n| Mandar la cotización | Acme |');
  assert.match(html, /<table>/);
  assert.match(html, /<th>Compromiso<\/th>/);
  assert.match(html, /<td>Mandar la cotización<\/td>/);
  // la fila separadora no debe aparecer como contenido
  assert.doesNotMatch(html, /<td>---<\/td>/);
});

test('escapa el HTML que venga en el texto del LLM', RAPIDO, () => {
  const html = MD.convertir('El cliente dijo <script>alert(1)</script> y "punto & aparte"');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
});

test('el párrafo con datos de contacto se marca como tarjeta', RAPIDO, () => {
  const html = MD.convertir('Ana Ruiz · ana@ejemplo.com · +52 55 1234 5678');
  assert.match(html, /class="contact"/);
});

test('un párrafo normal no se marca como contacto', RAPIDO, () => {
  assert.doesNotMatch(MD.convertir('Se acordó revisar el presupuesto.'), /class="contact"/);
});

test('texto vacío devuelve cadena vacía', RAPIDO, () => {
  assert.strictEqual(MD.convertir(''), '');
});

test('listas y numeraciones se convierten', RAPIDO, () => {
  assert.match(MD.convertir('- uno\n- dos'), /<ul><li>uno<\/li><li>dos<\/li><\/ul>/);
  assert.match(MD.convertir('1. uno\n2. dos'), /<ol>/);
});

test('el texto con negritas conserva el énfasis', RAPIDO, () => {
  assert.match(MD.convertir('**Acuerdo:** entregar el lunes'), /<strong>Acuerdo:<\/strong>/);
});

// lib/md.js se carga de dos maneras: con require() en el proceso principal y con
// una etiqueta <script> en la ventana. En el segundo caso, cualquier declaración
// de primer nivel se vuelve global — y un `function esc` global choca con el
// `const esc` de app.js, lo que tumba ese archivo entero por redeclaración,
// antes de que nada llegue a registrar el error. Costó una app que no arrancaba.
test('cargado como <script> no deja nada suelto salvo MD', RAPIDO, () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const caja = {};
  vm.createContext(caja);
  vm.runInContext(fs.readFileSync(RUTA_MD, 'utf8'), caja);
  assert.deepStrictEqual(Object.keys(caja), ['MD'],
    'solo debe exponerse MD: cualquier otro nombre choca con los de app.js');
  assert.strictEqual(typeof caja.MD.convertir, 'function');
  assert.match(caja.MD.convertir('**hola**'), /<strong>hola<\/strong>/);
});

test('cargado con require() expone convertir', RAPIDO, () => {
  assert.strictEqual(typeof MD.convertir, 'function');
});
