const test = require('node:test');
const assert = require('node:assert/strict');
const { crearAutomatico } = require('../lib/motores/automatico');

function motor(id, nombre, { disponible = true, respuesta = '', error = null } = {}) {
  return {
    id, nombre,
    async disponible() { return disponible; },
    async redactar() {
      if (error) throw error;
      return respuesta;
    },
  };
}

test('si Claude falla antes de responder, continúa con Codex y reporta cuál funcionó', async () => {
  const intentos = [];
  const exitos = [];
  const automatico = crearAutomatico([
    motor('claude-cli', 'Claude Code', { error: new Error('sesión vencida') }),
    motor('codex-cli', 'Codex', { respuesta: 'Minuta escrita por Codex' }),
  ]);

  const texto = await automatico.redactar('prompt', {
    alIntentar: (m) => intentos.push(m.id),
    alExito: (m) => exitos.push(m.id),
  });

  assert.equal(texto, 'Minuta escrita por Codex');
  assert.deepEqual(intentos, ['claude-cli', 'codex-cli']);
  assert.deepEqual(exitos, ['codex-cli']);
});

test('una respuesta vacía no detiene la cadena', async () => {
  const automatico = crearAutomatico([
    motor('claude-cli', 'Claude Code', { respuesta: '   ' }),
    motor('codex-cli', 'Codex', { respuesta: 'Respuesta válida' }),
  ]);

  assert.equal(await automatico.redactar('prompt'), 'Respuesta válida');
});

test('cancelar detiene la cadena y no ejecuta el siguiente motor', async () => {
  const cancelado = Object.assign(new Error('Cancelado'), { cancelado: true });
  let ejecutoCodex = false;
  const codex = motor('codex-cli', 'Codex', { respuesta: 'No debe aparecer' });
  codex.redactar = async () => { ejecutoCodex = true; return 'No debe aparecer'; };
  const automatico = crearAutomatico([
    motor('claude-cli', 'Claude Code', { error: cancelado }),
    codex,
  ]);

  await assert.rejects(() => automatico.redactar('prompt'), (e) => e === cancelado);
  assert.equal(ejecutoCodex, false);
});

test('si ninguno responde, conserva los motivos de cada motor', async () => {
  const automatico = crearAutomatico([
    motor('claude-cli', 'Claude Code', { disponible: false }),
    motor('codex-cli', 'Codex', { error: new Error('sin autenticación') }),
  ]);

  await assert.rejects(
    () => automatico.redactar('prompt'),
    /Claude Code: no disponible[\s\S]*Codex: sin autenticación/
  );
});

test('está disponible cuando al menos un motor de la cadena lo está', async () => {
  const automatico = crearAutomatico([
    motor('claude-cli', 'Claude Code', { disponible: false }),
    motor('codex-cli', 'Codex', { disponible: true }),
  ]);

  assert.equal(await automatico.disponible(), true);
});

test('un error al comprobar disponibilidad no impide probar el siguiente motor', async () => {
  const roto = motor('claude-cli', 'Claude Code');
  roto.disponible = async () => { throw new Error('auth dañada'); };
  const automatico = crearAutomatico([
    roto,
    motor('codex-cli', 'Codex', { disponible: true }),
  ]);

  assert.equal(await automatico.disponible(), true);
});

test('probar informa qué motor respondió y convierte el fallo en resultado', async () => {
  const listo = crearAutomatico([motor('codex-cli', 'Codex', { respuesta: 'LISTO' })]);
  const roto = crearAutomatico([motor('codex-cli', 'Codex', { error: new Error('sin cuota') })]);

  assert.deepEqual(await listo.probar(), { ok: true, detalle: 'Codex: LISTO' });
  assert.equal((await roto.probar()).ok, false);
  assert.match((await roto.probar()).detalle, /sin cuota/);
});

test('AbortError y una señal ya abortada detienen el fallback', async () => {
  for (const primerError of [Object.assign(new Error('aborted'), { name: 'AbortError' }), new Error('falló')]) {
    const ac = new AbortController();
    if (primerError.name !== 'AbortError') ac.abort();
    let ejecutoSiguiente = false;
    const siguiente = motor('codex-cli', 'Codex', { respuesta: 'No debe aparecer' });
    siguiente.redactar = async () => { ejecutoSiguiente = true; return 'No debe aparecer'; };
    const automatico = crearAutomatico([
      motor('claude-cli', 'Claude Code', { error: primerError }),
      siguiente,
    ]);

    await assert.rejects(() => automatico.redactar('prompt', { senal: ac.signal }));
    assert.equal(ejecutoSiguiente, false);
  }
});

test('los observadores de progreso no cambian el motor elegido aunque lancen', async () => {
  for (const callback of ['alIntentar', 'alExito']) {
    let ejecutoSiguiente = false;
    const siguiente = motor('codex-cli', 'Codex', { respuesta: 'Motor incorrecto' });
    siguiente.redactar = async () => { ejecutoSiguiente = true; return 'Motor incorrecto'; };
    const automatico = crearAutomatico([
      motor('claude-cli', 'Claude Code', { respuesta: 'Motor correcto' }),
      siguiente,
    ]);

    const texto = await automatico.redactar('prompt', {
      [callback]: () => { throw new Error('la ventana se cerró'); },
    });

    assert.equal(texto, 'Motor correcto');
    assert.equal(ejecutoSiguiente, false);
  }
});

test('un motor bloqueado vence su plazo y deja paso al siguiente', async () => {
  let abortado = false;
  const bloqueado = motor('claude-cli', 'Claude Code');
  bloqueado.redactar = (_prompt, { senal }) => new Promise((_res, rej) => {
    senal.addEventListener('abort', () => {
      abortado = true;
      rej(Object.assign(new Error('Cancelado'), { cancelado: true }));
    }, { once: true });
  });
  const automatico = crearAutomatico([
    bloqueado,
    motor('codex-cli', 'Codex', { respuesta: 'Minuta por Codex' }),
  ], { timeoutMs: 20 });

  assert.equal(await automatico.redactar('prompt'), 'Minuta por Codex');
  assert.equal(abortado, true);
});

test('no inicia otro proveedor hasta que el anterior terminó de abortar', async () => {
  let anteriorVivo = true;
  const bloqueado = motor('claude-cli', 'Claude Code');
  bloqueado.redactar = (_prompt, { senal }) => new Promise((_res, rej) => {
    senal.addEventListener('abort', () => {
      setTimeout(() => {
        anteriorVivo = false;
        rej(Object.assign(new Error('Cancelado'), { cancelado: true }));
      }, 30);
    }, { once: true });
  });
  const siguiente = motor('codex-cli', 'Codex', { respuesta: 'Minuta por Codex' });
  siguiente.redactar = async () => {
    assert.equal(anteriorVivo, false, 'no deben solaparse dos proveedores tras un timeout');
    return 'Minuta por Codex';
  };
  const automatico = crearAutomatico([bloqueado, siguiente], { timeoutMs: 20 });

  assert.equal(await automatico.redactar('prompt'), 'Minuta por Codex');
});

test('cancelar durante la disponibilidad no espera el preflight ni prueba otro motor', async () => {
  let ejecutoSiguiente = false;
  const lento = motor('claude-cli', 'Claude Code');
  lento.disponible = () => new Promise(res => setTimeout(() => res(true), 300));
  const siguiente = motor('codex-cli', 'Codex', { respuesta: 'No debe aparecer' });
  siguiente.redactar = async () => { ejecutoSiguiente = true; return 'No debe aparecer'; };
  const automatico = crearAutomatico([lento, siguiente], { timeoutMs: 1000 });
  const ac = new AbortController();
  const inicio = Date.now();
  const pendiente = automatico.redactar('prompt', { senal: ac.signal });
  setTimeout(() => ac.abort(), 15);

  await assert.rejects(() => pendiente, /Cancelado/);
  assert.ok(Date.now() - inicio < 150, 'cancelar no debe esperar la comprobación lenta');
  assert.equal(ejecutoSiguiente, false);
});
