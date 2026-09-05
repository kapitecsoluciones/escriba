const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { instalar, lineaDeTiempo, invariantes } = require('../lib/ejemplo');

const fixture = path.join(__dirname, '..', 'build', 'ejemplo');
const leerJson = archivo => JSON.parse(fs.readFileSync(archivo, 'utf8'));
const sello = '2026-09-05_120000';

function entorno(t) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-ejemplo-test-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const base = path.join(raiz, 'reuniones');
  const recursos = path.join(raiz, 'recursos');
  const fuera = path.join(raiz, 'fuera');
  fs.mkdirSync(recursos);
  fs.mkdirSync(fuera);
  // Bytes distintos descubren una copia que intercambie las pistas sin requerir síntesis en CI.
  fs.writeFileSync(path.join(recursos, 'microfono.m4a'), Buffer.from([0, 1, 255, 2]));
  fs.writeFileSync(path.join(recursos, 'sistema.m4a'), Buffer.from([3, 0, 254, 4]));
  fs.copyFileSync(path.join(fixture, 'expediente.md'), path.join(recursos, 'expediente.md'));
  return { base, recursos, fuera, sello };
}

test('ejemplo: línea de tiempo ordenada, sin solapes y con la pausa del turno anterior', () => {
  const guion = [
    { quien: 'tu', pausaDespues: 0.75 },
    { quien: 'cliente', pausaDespues: 1 },
    { quien: 'tu', pausaDespues: 0.6 }
  ];
  const copia = structuredClone(guion);
  const duraciones = [2, 4, 3];
  const linea = lineaDeTiempo(guion, duraciones);
  assert.deepEqual(linea, [
    { quien: 'tu', desde: 0, hasta: 2 },
    { quien: 'cliente', desde: 2.75, hasta: 6.75 },
    { quien: 'tu', desde: 7.75, hasta: 10.75 }
  ]);
  assert.ok(linea.every((turno, i) => !i || turno.desde >= linea[i - 1].hasta));
  assert.deepEqual(guion, copia);
  assert.deepEqual(duraciones, [2, 4, 3]);
});

test('ejemplo: rechaza duraciones y turnos inválidos', () => {
  const turno = { quien: 'tu', pausaDespues: 0.8 };
  assert.throws(() => lineaDeTiempo([turno], [1, 2]), /Cada turno/);
  for (const duracion of [0, -1, NaN, Infinity]) {
    assert.throws(() => lineaDeTiempo([turno], [duracion]), /inválidos/);
  }
  assert.throws(() => lineaDeTiempo([{ ...turno, quien: 'otro' }], [1]), /inválidos/);
  assert.throws(() => lineaDeTiempo([{ ...turno, pausaDespues: -1 }], [1]), /inválidos/);
});

test('ejemplo: invariantes detectan solapes, islas consecutivas y reparto sin pausas', () => {
  assert.deepEqual(invariantes([
    { quien: 'tu', desde: 0, hasta: 3 },
    { quien: 'cliente', desde: 2, hasta: 6 },
    { quien: 'cliente', desde: 7, hasta: 10 }
  ]), { solapes: 1, alternancia: false, islaMaxima: 8, fraccionCliente: 0.7 });
  assert.equal(invariantes([
    { quien: 'tu', desde: 0, hasta: 2 },
    { quien: 'cliente', desde: 7, hasta: 10 }
  ]).fraccionCliente, 0.6);
  assert.deepEqual(invariantes([]), { solapes: 0, alternancia: true, islaMaxima: 0, fraccionCliente: 0 });
  assert.throws(() => invariantes([{ quien: 'tu', desde: 0, hasta: NaN }]), /Intervalo inválido/);
});

test('ejemplo: fixture real alterna, no se solapa, limita las islas y reparte las voces', () => {
  const linea = leerJson(path.join(fixture, 'linea-de-tiempo.json'));
  const guion = leerJson(path.join(fixture, 'guion.json'));
  assert.equal(linea.length, guion.length);
  const resultado = invariantes(linea);
  assert.equal(resultado.solapes, 0);
  assert.equal(resultado.alternancia, true);
  assert.ok(resultado.islaMaxima <= 40, `Isla demasiado larga: ${resultado.islaMaxima}`);
  assert.ok(resultado.fraccionCliente >= 0.45 && resultado.fraccionCliente <= 0.75,
    `Reparto incorrecto: ${resultado.fraccionCliente}`);
  for (let i = 0; i < linea.length; i++) {
    assert.equal(linea[i].quien, guion[i].quien);
    if (!i) assert.equal(linea[i].desde, 0);
    else assert.ok(Math.abs(linea[i].desde - linea[i - 1].hasta - guion[i - 1].pausaDespues) < 1e-6);
  }
  const total = linea.at(-1).hasta + guion.at(-1).pausaDespues;
  assert.ok(total >= 130 && total <= 175, `Duración fuera del objetivo aproximado: ${total}`);
  for (const nombre of ['microfono.m4a', 'sistema.m4a']) {
    const bytes = fs.statSync(path.join(fixture, nombre)).size;
    assert.ok(bytes > 1000 && bytes < 2_000_000);
  }
});

test('ejemplo: instalar copia las pistas y crea los metadatos y el expediente', t => {
  const opciones = entorno(t);
  const resultado = instalar(opciones);
  const cliente = path.join(opciones.base, 'ejemplo-acme');
  assert.deepEqual(resultado, { carpeta: path.join(cliente, sello), slug: 'ejemplo-acme', nombre: 'Ejemplo · Acme' });
  assert.deepEqual(leerJson(path.join(cliente, '.cliente.json')),
    { nombre: 'Ejemplo · Acme', expediente: path.join(cliente, 'expediente.md'), ejemplo: true });
  assert.deepEqual(leerJson(path.join(resultado.carpeta, '.reunion.json')), { modo: 'llamada', ejemplo: true });
  for (const archivo of ['microfono.m4a', 'sistema.m4a']) {
    assert.deepEqual(fs.readFileSync(path.join(resultado.carpeta, archivo)), fs.readFileSync(path.join(opciones.recursos, archivo)));
  }
  assert.equal(fs.readFileSync(path.join(cliente, 'expediente.md'), 'utf8'),
    fs.readFileSync(path.join(opciones.recursos, 'expediente.md'), 'utf8'));
  assert.deepEqual(fs.readdirSync(resultado.carpeta).sort(), ['.reunion.json', 'microfono.m4a', 'sistema.m4a']);
  assert.deepEqual(fs.readdirSync(opciones.base), ['ejemplo-acme']);
  assert.deepEqual(fs.readdirSync(opciones.fuera), []);
});

test('ejemplo: otro sello crea otra reunión y conserva los cambios del cliente', t => {
  const opciones = entorno(t);
  const primera = instalar(opciones);
  const cliente = path.dirname(primera.carpeta);
  fs.writeFileSync(path.join(cliente, 'expediente.md'), 'Notas agregadas por quien prueba.');
  const datos = { nombre: 'Ejemplo revisado', expediente: path.join(cliente, 'expediente.md'), ejemplo: true };
  fs.writeFileSync(path.join(cliente, '.cliente.json'), JSON.stringify(datos));
  const segunda = instalar({ ...opciones, sello: '2026-09-05_120001' });
  assert.notEqual(primera.carpeta, segunda.carpeta);
  assert.ok(fs.existsSync(path.join(primera.carpeta, 'microfono.m4a')));
  assert.ok(fs.existsSync(path.join(segunda.carpeta, 'sistema.m4a')));
  assert.equal(fs.readFileSync(path.join(cliente, 'expediente.md'), 'utf8'), 'Notas agregadas por quien prueba.');
  assert.deepEqual(leerJson(path.join(cliente, '.cliente.json')), datos);
  assert.deepEqual(fs.readdirSync(opciones.base), ['ejemplo-acme']);
});

test('ejemplo: el mismo sello falla sin pisar ningún archivo', t => {
  const opciones = entorno(t);
  const { carpeta } = instalar(opciones);
  const pista = path.join(carpeta, 'microfono.m4a');
  fs.writeFileSync(pista, 'Audio conservado');
  const antes = fs.readdirSync(carpeta).map(archivo => [archivo, fs.readFileSync(path.join(carpeta, archivo))]);
  assert.throws(() => instalar(opciones), /Ya existe una reunión con el sello/);
  for (const [archivo, contenido] of antes) assert.deepEqual(fs.readFileSync(path.join(carpeta, archivo)), contenido);
});

test('ejemplo: rechaza rutas en el sello y enlaces que escaparían de base', t => {
  const opciones = entorno(t);
  for (const invalido of ['../fuera', '../../fuera/nueva', opciones.fuera, '', '2026-09-05_120000/otra', '2026-09-05_120000\n']) {
    assert.throws(() => instalar({ ...opciones, sello: invalido }), /Sello inválido/);
  }
  assert.equal(fs.existsSync(opciones.base), false);
  const cliente = path.join(opciones.base, 'ejemplo-acme');
  fs.mkdirSync(opciones.base);
  fs.symlinkSync(opciones.fuera, cliente, 'dir');
  assert.throws(() => instalar(opciones), /enlaces simbólicos/);
  assert.deepEqual(fs.readdirSync(opciones.fuera), []);
  fs.unlinkSync(cliente);
  fs.mkdirSync(cliente);
  for (const nombre of [sello, 'expediente.md', '.cliente.json']) {
    const enlace = path.join(cliente, nombre);
    fs.symlinkSync(path.join(opciones.fuera, 'ausente'), enlace);
    assert.throws(() => instalar(opciones), /enlaces simbólicos/);
    assert.deepEqual(fs.readdirSync(opciones.fuera), []);
    fs.unlinkSync(enlace);
  }
  fs.rmdirSync(cliente);
  fs.rmdirSync(opciones.base);
  fs.symlinkSync(opciones.fuera, opciones.base, 'dir');
  assert.throws(() => instalar(opciones), /enlaces simbólicos/);
  assert.deepEqual(fs.readdirSync(opciones.fuera), []);
});

test('ejemplo: un fallo de escritura atómica permite reintentar el sello', t => {
  const opciones = entorno(t);
  const renombrar = fs.renameSync;
  t.mock.method(fs, 'renameSync', (origen, destino) => {
    if (path.basename(destino) === '.reunion.json') throw new Error('Fallo de disco simulado');
    return renombrar(origen, destino);
  });
  assert.throws(() => instalar(opciones), /Fallo de disco simulado/);
  assert.equal(fs.existsSync(path.join(opciones.base, 'ejemplo-acme', sello)), false);
  t.mock.restoreAll();
  assert.ok(fs.existsSync(path.join(instalar(opciones).carpeta, '.reunion.json')));
});

test('ejemplo: guion sin asuntos económicos ni fecha del logotipo', () => {
  const guion = leerJson(path.join(fixture, 'guion.json'));
  const normalizar = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const fecha = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|semana|mes|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\d/;
  assert.ok(guion.length >= 14 && guion.length <= 16);
  for (let i = 0; i < guion.length; i++) {
    const turno = guion[i];
    const texto = normalizar(turno.texto);
    assert.doesNotMatch(texto, /\b(precio|costo|presupuesto|cotizacion)\b/);
    assert.equal(turno.quien, i % 2 ? 'cliente' : 'tu');
    assert.ok(turno.pausaDespues >= 0.6 && turno.pausaDespues <= 1.2);
    assert.ok(turno.texto.split(/\s+/).length <= 90);
    for (const frase of texto.split(/[.!?]/)) {
      if (/\blogotipo\b/.test(frase)) assert.doesNotMatch(frase, fecha);
    }
    if (/\blogotipo\b/.test(texto) && turno.quien === 'tu') {
      const respuesta = normalizar(guion[i + 1].texto).split(/[.!?]/).slice(0, 2).join('.');
      assert.match(respuesta, /direccion.*(todavia|aun) no.*aprueba/);
      assert.doesNotMatch(respuesta, fecha);
    }
  }
});

test('no se instala encima de un cliente real que use el mismo slug', () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
  const E = require('../lib/ejemplo');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-ej-real-'));
  const recursos = path.join(__dirname, '..', 'build', 'ejemplo');
  fs.mkdirSync(path.join(base, 'ejemplo-acme'), { recursive: true });
  fs.writeFileSync(path.join(base, 'ejemplo-acme', '.cliente.json'), JSON.stringify({ nombre: 'Ejemplo Acme (real)' }));
  assert.throws(() => E.instalar({ recursos, base, sello: '2026-09-05_120000' }), /no es el de ejemplo/);
  assert.ok(!fs.existsSync(path.join(base, 'ejemplo-acme', '2026-09-05_120000')));
  // el nuestro sí se reutiliza
  fs.writeFileSync(path.join(base, 'ejemplo-acme', '.cliente.json'), JSON.stringify({ nombre: 'Ejemplo · Acme', ejemplo: true }));
  assert.ok(E.instalar({ recursos, base, sello: '2026-09-05_120000' }).carpeta);
  fs.rmSync(base, { recursive: true, force: true });
});
