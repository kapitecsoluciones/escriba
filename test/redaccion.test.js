const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { redactarYGuardar } = require('../lib/redaccion');
const { crearAutomatico } = require('../lib/motores/automatico');

function motor(id, nombre, { respuesta, error } = {}) {
  return {
    id, nombre,
    async disponible() { return true; },
    async redactar() {
      if (error) throw error;
      return respuesta;
    },
  };
}

test('el fallback guarda la minuta y etiqueta el motor que realmente respondió', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-redaccion-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const guardados = [];
  const automatico = crearAutomatico([
    motor('claude-cli', 'Claude Code', { error: new Error('sin cuota') }),
    motor('codex-cli', 'Codex', { respuesta: 'Minuta por Codex' }),
  ]);

  const resultado = await redactarYGuardar({
    motor: automatico,
    prompt: 'reunión',
    carpeta,
    guardarMotor: (dir, usado) => {
      assert.equal(fs.readFileSync(path.join(dir, 'minuta.md'), 'utf8'), 'Minuta por Codex');
      guardados.push(usado.id);
    },
  });

  assert.equal(resultado.minuta, 'Minuta por Codex');
  assert.equal(resultado.motorUsado.id, 'codex-cli');
  assert.deepEqual(guardados, ['codex-cli']);
});

test('un motor directo queda etiquetado después de escribir la minuta', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-redaccion-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const guardados = [];
  const directo = motor('ollama', 'Ollama', { respuesta: 'Minuta local' });

  await redactarYGuardar({
    motor: directo, prompt: 'reunión', carpeta,
    guardarMotor: (_dir, usado) => guardados.push(usado.id),
  });

  assert.equal(fs.readFileSync(path.join(carpeta, 'minuta.md'), 'utf8'), 'Minuta local');
  assert.deepEqual(guardados, ['ollama']);
});

test('si todos los motores fallan no escribe minuta ni cambia su etiqueta', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-redaccion-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const automatico = crearAutomatico([
    motor('claude-cli', 'Claude Code', { error: new Error('sin sesión') }),
    motor('codex-cli', 'Codex', { error: new Error('sin cuota') }),
  ]);
  let guardoMotor = false;

  await assert.rejects(() => redactarYGuardar({
    motor: automatico, prompt: 'reunión', carpeta,
    guardarMotor: () => { guardoMotor = true; },
  }), /Ningún motor pudo redactar/);

  assert.equal(fs.existsSync(path.join(carpeta, 'minuta.md')), false);
  assert.equal(guardoMotor, false);
});

test('cancelar justo antes de guardar conserva la minuta anterior', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-redaccion-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const destino = path.join(carpeta, 'minuta.md');
  fs.writeFileSync(destino, 'Correcciones del usuario');
  const cancelado = Object.assign(new Error('Cancelado'), { cancelado: true });

  await assert.rejects(() => redactarYGuardar({
    motor: motor('codex-cli', 'Codex', { respuesta: 'Nueva minuta' }),
    prompt: 'reunión', carpeta,
    antesDeGuardar: () => { throw cancelado; },
  }), (e) => e === cancelado);

  assert.equal(fs.readFileSync(destino, 'utf8'), 'Correcciones del usuario');
  assert.equal(fs.existsSync(path.join(carpeta, 'minuta-anterior.md')), false);
});

test('al volver a redactar respalda la minuta anterior', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-redaccion-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  fs.writeFileSync(path.join(carpeta, 'minuta.md'), 'Versión corregida');

  await redactarYGuardar({
    motor: motor('codex-cli', 'Codex', { respuesta: 'Versión nueva' }),
    prompt: 'reunión', carpeta, guardarMotor: () => {},
  });

  assert.equal(fs.readFileSync(path.join(carpeta, 'minuta-anterior.md'), 'utf8'), 'Versión corregida');
  assert.equal(fs.readFileSync(path.join(carpeta, 'minuta.md'), 'utf8'), 'Versión nueva');
});

test('Automático no repite el preflight de toda la cadena antes de redactar', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-redaccion-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const automatico = crearAutomatico([
    motor('codex-cli', 'Codex', { respuesta: 'Minuta' }),
  ]);
  let preflightsExternos = 0;
  const comprobarCadena = automatico.disponible;
  automatico.disponible = async () => { preflightsExternos++; return comprobarCadena.call(automatico); };

  await redactarYGuardar({ motor: automatico, prompt: 'reunión', carpeta, guardarMotor: () => {} });

  assert.equal(preflightsExternos, 0);
});

test('un motor manual bloqueado vence el mismo plazo que Automático', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-redaccion-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  let abortado = false;
  const bloqueado = motor('codex-cli', 'Codex');
  bloqueado.redactar = (_prompt, { senal }) => new Promise((_res, rej) => {
    senal.addEventListener('abort', () => {
      abortado = true;
      rej(Object.assign(new Error('Cancelado'), { cancelado: true }));
    }, { once: true });
  });
  const limitePrueba = new Promise((_res, rej) => {
    setTimeout(() => rej(new Error('la prueba agotó su propio plazo')), 150);
  });

  await assert.rejects(() => Promise.race([
    redactarYGuardar({ motor: bloqueado, prompt: 'reunión', carpeta, timeoutMs: 20 }),
    limitePrueba,
  ]), /Codex excedió el tiempo máximo/);
  assert.equal(abortado, true);
  assert.equal(fs.existsSync(path.join(carpeta, 'minuta.md')), false);
});

test('si falla la metadata restaura la minuta anterior', async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-redaccion-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const destino = path.join(carpeta, 'minuta.md');
  const respaldo = path.join(carpeta, 'minuta-anterior.md');
  fs.writeFileSync(destino, 'Versión anterior');
  fs.writeFileSync(respaldo, 'Versión más antigua');

  await assert.rejects(() => redactarYGuardar({
    motor: motor('codex-cli', 'Codex', { respuesta: 'Versión parcial' }),
    prompt: 'reunión', carpeta,
    guardarMotor: () => { throw new Error('disco lleno guardando metadata'); },
  }), /disco lleno/);

  assert.equal(fs.readFileSync(destino, 'utf8'), 'Versión anterior');
  assert.equal(fs.readFileSync(respaldo, 'utf8'), 'Versión más antigua');
});
