const test = require('node:test');
const assert = require('node:assert/strict');
const { queFaltaParaRedactar, pasosInstalarOllama, avisoTamano, tamanoAprox } = require('../lib/motores/instalacion');

// ---------- queFaltaParaRedactar ----------

test('con algún motor disponible (arreglo de {id, disponible}) no falta nada', () => {
  const disponibles = [
    { id: 'claude-cli', disponible: false },
    { id: 'codex-cli', disponible: false },
    { id: 'ollama', disponible: true },
    { id: 'api', disponible: false },
  ];
  assert.equal(queFaltaParaRedactar({ disponibles }), null);
});

test('acepta también un arreglo de booleanos sueltos', () => {
  assert.equal(queFaltaParaRedactar({ disponibles: [false, false, true] }), null);
});

test('sin ningún motor disponible, señala que falta quién redacte y ofrece Ollama', () => {
  const disponibles = [
    { id: 'claude-cli', disponible: false },
    { id: 'codex-cli', disponible: false },
    { id: 'ollama', disponible: false },
    { id: 'api', disponible: false },
  ];
  const falta = queFaltaParaRedactar({ disponibles });
  assert.ok(falta);
  assert.equal(falta.que, 'Quién redacta la minuta');
  assert.match(falta.como, /Claude Code/);
  assert.match(falta.como, /Codex/);
  assert.match(falta.como, /Ollama/);
  assert.equal(falta.accion, 'ollama');
});

test('sin argumentos (undefined) se comporta como "nada disponible"', () => {
  const falta = queFaltaParaRedactar();
  assert.ok(falta);
  assert.equal(falta.accion, 'ollama');
});

test('con un arreglo vacío también falta motor', () => {
  const falta = queFaltaParaRedactar({ disponibles: [] });
  assert.ok(falta);
});

// ---------- pasosInstalarOllama ----------

test('sin brew: un solo paso informativo, sin comando y con el enlace a brew.sh', () => {
  const pasos = pasosInstalarOllama({ modelo: 'llama3.1:8b', brew: null, ollama: null });
  assert.equal(pasos.length, 1);
  assert.equal(pasos[0].cmd, null);
  assert.deepEqual(pasos[0].args, []);
  assert.match(pasos[0].descripcion, /https:\/\/brew\.sh/);
});

test('sin ollama (con brew): instalar, iniciar servicio y bajar el modelo, en ese orden', () => {
  const pasos = pasosInstalarOllama({ modelo: 'llama3.1:8b', brew: '/opt/homebrew/bin/brew', ollama: null });
  assert.equal(pasos.length, 3);

  assert.equal(pasos[0].cmd, '/opt/homebrew/bin/brew');
  assert.deepEqual(pasos[0].args, ['install', 'ollama']);

  assert.equal(pasos[1].cmd, '/opt/homebrew/bin/brew');
  assert.deepEqual(pasos[1].args, ['services', 'start', 'ollama']);

  // ollama todavía no existe en este escenario: se deja el nombre suelto para
  // que quien ejecute el paso lo busque de nuevo después de instalarlo.
  assert.equal(pasos[2].cmd, 'ollama');
  assert.deepEqual(pasos[2].args, ['pull', 'llama3.1:8b']);
});

test('ollama presente pero sin el modelo: solo iniciar el servicio y bajar el modelo', () => {
  const pasos = pasosInstalarOllama({ modelo: 'llama3.1:8b', brew: '/opt/homebrew/bin/brew', ollama: '/opt/homebrew/bin/ollama' });
  assert.equal(pasos.length, 2);

  assert.equal(pasos[0].cmd, '/opt/homebrew/bin/brew');
  assert.deepEqual(pasos[0].args, ['services', 'start', 'ollama']);

  assert.equal(pasos[1].cmd, '/opt/homebrew/bin/ollama');
  assert.deepEqual(pasos[1].args, ['pull', 'llama3.1:8b']);
});

test('sin modelo explícito, usa el modelo por defecto', () => {
  const pasos = pasosInstalarOllama({ brew: '/opt/homebrew/bin/brew', ollama: '/opt/homebrew/bin/ollama' });
  assert.deepEqual(pasos[pasos.length - 1].args, ['pull', 'llama3.1:8b']);
});

// ---------- avisoTamano / tamanoAprox ----------

test('el aviso de tamaño menciona el modelo y su peso aproximado conocido', () => {
  const texto = avisoTamano('llama3.1:8b');
  assert.match(texto, /llama3\.1:8b/);
  assert.match(texto, /4\.9 GB/);
});

test('un modelo desconocido no revienta: cae a un texto genérico de tamaño', () => {
  assert.equal(tamanoAprox('modelo-que-no-existe'), 'unos GB');
  assert.match(avisoTamano('modelo-que-no-existe'), /unos GB/);
});
