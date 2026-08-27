const test = require('node:test');
const assert = require('node:assert/strict');
const { crearRegistro } = require('../lib/motores');

function motor(id, { respuesta = id, falla = false } = {}) {
  return {
    id, nombre: id, descripcion: id, privacidad: id,
    async disponible() { return true; },
    async redactar() { if (falla) throw new Error('falló'); return respuesta; },
  };
}

test('el modo automático usa Claude, Codex, Ollama y llave propia en ese orden', async () => {
  const intentos = [];
  const motores = [
    motor('claude-cli', { falla: true }),
    motor('codex-cli', { respuesta: 'respuesta de Codex' }),
    motor('ollama'),
    motor('api'),
  ];
  for (const m of motores) {
    const redactar = m.redactar;
    m.redactar = async (...args) => { intentos.push(m.id); return redactar(...args); };
  }
  const registro = crearRegistro({ motores, config: { leer: () => ({ motor: { tipo: 'automatico' } }) } });

  assert.equal(await registro.activo().redactar('prompt'), 'respuesta de Codex');
  assert.deepEqual(intentos, ['claude-cli', 'codex-cli']);
});

test('la cadena puede agotar Claude, Codex y Ollama antes de llegar a la API', async () => {
  const intentos = [];
  const motores = [
    motor('claude-cli', { falla: true }),
    motor('codex-cli', { falla: true }),
    motor('ollama', { falla: true }),
    motor('api', { respuesta: 'respuesta de API' }),
  ];
  for (const m of motores) {
    const redactar = m.redactar;
    m.redactar = async (...args) => { intentos.push(m.id); return redactar(...args); };
  }
  const registro = crearRegistro({ motores, config: { leer: () => ({ motor: { tipo: 'automatico' } }) } });

  assert.equal(await registro.activo().redactar('prompt'), 'respuesta de API');
  assert.deepEqual(intentos, ['claude-cli', 'codex-cli', 'ollama', 'api']);
});

test('Codex también puede elegirse directamente', () => {
  const codex = motor('codex-cli');
  const registro = crearRegistro({
    motores: [motor('claude-cli'), codex, motor('ollama'), motor('api')],
    config: { leer: () => ({ motor: { tipo: 'codex-cli' } }) },
  });

  assert.equal(registro.activo(), codex);
});

test('un identificador desconocido cae al modo automático', () => {
  const registro = crearRegistro({
    motores: [motor('claude-cli'), motor('codex-cli'), motor('ollama'), motor('api')],
    config: { leer: () => ({ motor: { tipo: 'motor-borrado' } }) },
  });

  assert.equal(registro.activo().id, 'automatico');
});

test('estado expone Automático y todos los motores directos a Ajustes', async () => {
  const motores = [motor('claude-cli'), motor('codex-cli'), motor('ollama'), motor('api')];
  const comprobaciones = new Map();
  for (const m of motores) {
    const disponible = m.disponible;
    m.disponible = async () => {
      comprobaciones.set(m.id, (comprobaciones.get(m.id) || 0) + 1);
      return disponible.call(m);
    };
  }
  const registro = crearRegistro({ motores });

  const estado = await registro.estado();

  assert.deepEqual(estado.map(m => m.id), ['automatico', 'claude-cli', 'codex-cli', 'ollama', 'api']);
  assert.ok(estado.every(m => m.disponible === true));
  assert.deepEqual(Object.fromEntries(comprobaciones), {
    'claude-cli': 1, 'codex-cli': 1, ollama: 1, api: 1,
  });
});
