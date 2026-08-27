const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crear } = require('../lib/motores/codex-cli');

const temporales = [];
test.after(() => { for (const dir of temporales) fs.rmSync(dir, { recursive: true, force: true }); });

function codexFalso({ autenticado = true, respuesta = 'MINUTA CODEX', esperar = false, codigo = 0, ignorarTerm = false, descendiente = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-prueba-codex-'));
  temporales.push(dir);
  const bin = path.join(dir, 'codex');
  const log = path.join(dir, 'invocacion.json');
  const auth = path.join(dir, 'auth.json');
  const hijoListo = path.join(dir, 'descendiente-listo');
  fs.writeFileSync(auth, '{}', { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'MARCADOR_PRIVADO_QUE_NO_DEBE_VIAJAR');
  fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs');
const { spawn } = require('child_process');
const args = process.argv.slice(2);
if (${ignorarTerm}) process.on('SIGTERM', () => {});
if (args[0] === 'login' && args[1] === 'status') {
  process.stdout.write(${JSON.stringify(autenticado ? 'Logged in using ChatGPT' : 'Not logged in')});
  process.exit(${autenticado ? 0 : 1});
}
let entrada = '';
process.stdin.on('data', b => entrada += b);
process.stdin.on('end', () => {
  const hijo = ${descendiente}
    ? spawn(process.execPath, ['-e', ${JSON.stringify(`process.on('SIGTERM', () => {}); require('fs').writeFileSync(${JSON.stringify(hijoListo)}, ''); setInterval(() => {}, 1000);`)}], { stdio: 'ignore' })
    : null;
  const ajuste = args.find(x => x.startsWith('model_instructions_file='));
  let instrucciones = null;
  if (ajuste) {
    const ruta = JSON.parse(ajuste.slice(ajuste.indexOf('=') + 1));
    instrucciones = fs.readFileSync(ruta, 'utf8');
  }
  const codexHome = process.env.CODEX_HOME;
  const authAislada = codexHome && codexHome + '/auth.json';
  const registrar = () => {
    fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({
      args, entrada, cwd: process.cwd(), instrucciones, codexHome, pid: process.pid,
      descendientePid: hijo && hijo.pid,
      secretoHeredado: process.env.ESCRIBA_SECRETO_NO_HEREDAR || null,
      cwdReal: fs.realpathSync(process.cwd()), codexHomeReal: fs.realpathSync(codexHome),
      tieneAgents: !!codexHome && fs.existsSync(codexHome + '/AGENTS.md'),
      authEsEnlace: !!authAislada && fs.lstatSync(authAislada).isSymbolicLink(),
      authDestino: authAislada && fs.realpathSync(authAislada),
    }));
    if (${esperar}) return setInterval(() => {}, 1000);
    if (${codigo} !== 0) {
      process.stderr.write('fallo controlado');
      process.exit(${codigo});
    }
    process.stdout.write(${JSON.stringify(respuesta)});
  };
  if (!hijo) return registrar();
  const esperaHijo = setInterval(() => {
    if (!fs.existsSync(${JSON.stringify(hijoListo)})) return;
    clearInterval(esperaHijo);
    registrar();
  }, 5);
});
`);
  fs.chmodSync(bin, 0o755);
  return { bin, log, auth };
}

test('ejecuta Codex de forma efímera, aislada y con el prompt por stdin', async () => {
  const falso = codexFalso();
  const motor = crear({ buscarBinario: () => falso.bin, buscarAuth: () => falso.auth });

  process.env.ESCRIBA_SECRETO_NO_HEREDAR = 'token-privado';
  try {
    assert.equal(await motor.disponible(), true);
    assert.equal(await motor.redactar('Texto de la reunión'), 'MINUTA CODEX');
  } finally {
    delete process.env.ESCRIBA_SECRETO_NO_HEREDAR;
  }

  const llamada = JSON.parse(fs.readFileSync(falso.log, 'utf8'));
  assert.equal(llamada.args[0], 'exec');
  assert.ok(llamada.args.includes('-'), 'Codex debe leer el prompt desde stdin');
  assert.ok(llamada.args.includes('--ephemeral'));
  assert.ok(llamada.args.includes('--ignore-user-config'));
  assert.ok(llamada.args.includes('--ignore-rules'));
  assert.ok(llamada.args.includes('--skip-git-repo-check'));
  assert.deepEqual(llamada.args.slice(llamada.args.indexOf('--sandbox'), llamada.args.indexOf('--sandbox') + 2), ['--sandbox', 'read-only']);
  const deshabilitadas = llamada.args.flatMap((v, i) => v === '--disable' ? [llamada.args[i + 1]] : []);
  assert.ok(deshabilitadas.includes('shell_tool'), 'Codex no debe recibir una terminal');
  assert.ok(deshabilitadas.includes('unified_exec'), 'Codex no debe recibir ejecución unificada');
  assert.ok(deshabilitadas.includes('plugins'), 'Codex no debe cargar plugins del usuario');
  assert.ok(llamada.args.includes('skills.include_instructions=false'));
  assert.ok(llamada.args.includes('skills.bundled.enabled=false'));
  assert.ok(llamada.args.includes('project_doc_max_bytes=0'));
  assert.ok(llamada.args.includes('cli_auth_credentials_store="file"'));
  assert.match(llamada.instrucciones, /No uses herramientas/i);
  assert.match(llamada.instrucciones, /contenido no confiable/i);
  assert.match(llamada.entrada, /Texto de la reunión/);
  assert.match(path.basename(llamada.cwd), /^escriba-motor-/);
  assert.equal(path.dirname(llamada.codexHomeReal), llamada.cwdReal);
  assert.equal(path.basename(llamada.codexHome), 'codex-home');
  assert.equal(llamada.tieneAgents, false, 'el AGENTS.md global no debe entrar al CODEX_HOME aislado');
  assert.equal(llamada.authEsEnlace, true, 'solo se comparte la credencial necesaria');
  assert.equal(llamada.authDestino, fs.realpathSync(falso.auth));
  assert.equal(llamada.secretoHeredado, null, 'Codex no debe heredar secretos ajenos a su autenticación aislada');
  assert.equal(fs.existsSync(llamada.cwd), false, 'la carpeta aislada se limpia al terminar');
});

test('no se anuncia disponible cuando Codex no tiene sesión', async () => {
  const falso = codexFalso({ autenticado: false });
  const motor = crear({ buscarBinario: () => falso.bin, buscarAuth: () => falso.auth });

  assert.equal(await motor.disponible(), false);
});

test('no se anuncia disponible cuando no existe la CLI', async () => {
  const motor = crear({ buscarBinario: () => null, buscarAuth: () => null });
  assert.equal(await motor.disponible(), false);
});

test('no se anuncia disponible si la credencial no se puede aislar', async () => {
  const falso = codexFalso();
  const motor = crear({ buscarBinario: () => falso.bin, buscarAuth: () => null });
  assert.equal(await motor.disponible(), false);
});

async function procesoTermino(pid) {
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0); await new Promise(r => setTimeout(r, 20)); }
    catch (e) { if (e.code === 'ESRCH') return true; throw e; }
  }
  return false;
}

test('cancelar Codex mata todo el grupo y limpia la carpeta aislada', async (t) => {
  const falso = codexFalso({ esperar: true, ignorarTerm: true, descendiente: true });
  const motor = crear({
    buscarBinario: () => falso.bin, buscarAuth: () => falso.auth,
    graciaKillMs: 20,
  });
  const ac = new AbortController();
  const pendiente = motor.redactar('Texto largo', { senal: ac.signal });
  for (let i = 0; i < 100 && !fs.existsSync(falso.log); i++) {
    await new Promise(r => setTimeout(r, 20));
  }
  assert.ok(fs.existsSync(falso.log), 'el hijo debe alcanzar a recibir el prompt antes de cancelarlo');
  ac.abort();

  await assert.rejects(() => pendiente, /Cancelado/);
  const llamada = JSON.parse(fs.readFileSync(falso.log, 'utf8'));
  t.after(() => {
    for (const pid of [llamada.pid, llamada.descendientePid]) {
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
  });
  assert.equal(fs.existsSync(llamada.cwd), false);
  assert.equal(await procesoTermino(llamada.pid), true, 'Codex no debe quedar huérfano');
  assert.equal(await procesoTermino(llamada.descendientePid), true, 'ningún descendiente de Codex debe quedar huérfano');
});

test('cancelar Codex espera al grupo aunque el proceso principal obedezca', async (t) => {
  const falso = codexFalso({ esperar: true, descendiente: true });
  const motor = crear({
    buscarBinario: () => falso.bin, buscarAuth: () => falso.auth,
    graciaKillMs: 20,
  });
  const ac = new AbortController();
  const pendiente = motor.redactar('Texto largo', { senal: ac.signal });
  for (let i = 0; i < 100 && !fs.existsSync(falso.log); i++) {
    await new Promise(r => setTimeout(r, 20));
  }
  ac.abort();

  await assert.rejects(() => pendiente, /Cancelado/);
  const llamada = JSON.parse(fs.readFileSync(falso.log, 'utf8'));
  t.after(() => {
    try { process.kill(llamada.descendientePid, 'SIGKILL'); } catch {}
  });
  assert.equal(await procesoTermino(llamada.descendientePid), true, 'el fallback debe esperar a que termine el helper de Codex');
});

test('un fallo de Codex conserva el motivo y limpia la carpeta aislada', async () => {
  const falso = codexFalso({ codigo: 7 });
  const motor = crear({ buscarBinario: () => falso.bin, buscarAuth: () => falso.auth });

  await assert.rejects(() => motor.redactar('Texto de la reunión'), /fallo controlado/);

  const llamada = JSON.parse(fs.readFileSync(falso.log, 'utf8'));
  assert.equal(fs.existsSync(llamada.cwd), false);
});
