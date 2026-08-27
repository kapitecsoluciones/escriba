const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { crear } = require('../lib/motores/claude-cli');

const temporales = [];
test.after(() => { for (const dir of temporales) fs.rmSync(dir, { recursive: true, force: true }); });

function claudeFalso({ autenticado = true, salirAntes = false, esperar = false, ignorarTerm = false, descendiente = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-prueba-claude-'));
  temporales.push(dir);
  const bin = path.join(dir, 'claude');
  const log = path.join(dir, 'invocacion.json');
  const hijoListo = path.join(dir, 'descendiente-listo');
  fs.writeFileSync(bin, `#!/usr/bin/env node
const args = process.argv.slice(2);
const { spawn } = require('child_process');
if (${ignorarTerm}) process.on('SIGTERM', () => {});
if (args[0] === 'auth' && args[1] === 'status') {
  process.stdout.write(JSON.stringify({ loggedIn: ${autenticado} }));
  process.exit(${autenticado ? 0 : 1});
}
if (${salirAntes}) process.exit(1);
const inicio = args.indexOf('--disallowedTools') + 1;
const herramientas = inicio ? args.slice(inicio, args.findIndex((v, i) => i >= inicio && v.startsWith('--'))) : [];
const obsoletas = herramientas.filter(x => ['MultiEdit', 'SlashCommand', 'LS'].includes(x));
if (obsoletas.length) {
  process.stderr.write(obsoletas.map(x => 'Permission deny rule "' + x + '" matches no known tool — check for typos.').join(' '));
  process.exit(1);
}
const requeridas = ['--safe-mode', '--no-session-persistence'];
if (requeridas.some(x => !args.includes(x)) || !args.includes('--tools') || args[args.indexOf('--tools') + 1] !== '') {
  process.stderr.write('Claude debe ejecutarse sin personalizaciones, herramientas ni persistencia');
  process.exit(1);
}
if (args.includes('--disallowedTools')) {
  process.stderr.write('Una lista negra permitiría herramientas nuevas');
  process.exit(1);
}
process.stdin.resume();
process.stdin.on('end', () => {
  const hijo = ${descendiente}
    ? spawn(process.execPath, ['-e', ${JSON.stringify(`process.on('SIGTERM', () => {}); require('fs').writeFileSync(${JSON.stringify(hijoListo)}, ''); setInterval(() => {}, 1000);`)}], { stdio: 'ignore' })
    : null;
  const registrar = () => {
    require('fs').writeFileSync(${JSON.stringify(log)}, JSON.stringify({
      cwd: process.cwd(), pid: process.pid, descendientePid: hijo && hijo.pid,
      secretoHeredado: process.env.ESCRIBA_SECRETO_NO_HEREDAR || null,
    }));
    if (${esperar}) return setInterval(() => {}, 1000);
    process.stdout.write('LISTO');
  };
  if (!hijo) return registrar();
  const esperaHijo = setInterval(() => {
    if (!require('fs').existsSync(${JSON.stringify(hijoListo)})) return;
    clearInterval(esperaHijo);
    registrar();
  }, 5);
});
`);
  fs.chmodSync(bin, 0o755);
  return { bin, log };
}

test('la invocación es válida para Claude Code actual', async () => {
  const falso = claudeFalso();
  const motor = crear({ buscarBinario: () => falso.bin });
  process.env.ESCRIBA_SECRETO_NO_HEREDAR = 'token-privado';
  try { assert.equal(await motor.redactar('prompt'), 'LISTO'); }
  finally { delete process.env.ESCRIBA_SECRETO_NO_HEREDAR; }
  const llamada = JSON.parse(fs.readFileSync(falso.log, 'utf8'));
  assert.equal(llamada.secretoHeredado, null, 'Claude no debe heredar secretos del proceso padre');
});

test('no se anuncia disponible cuando Claude Code no tiene sesión', async () => {
  const falso = claudeFalso({ autenticado: false });
  const motor = crear({ buscarBinario: () => falso.bin });
  assert.equal(await motor.disponible(), false);
});

test('no se anuncia disponible cuando no existe la CLI', async () => {
  const motor = crear({ buscarBinario: () => null });
  assert.equal(await motor.disponible(), false);
});

test('un fallo inmediato con un prompt largo no tumba el proceso y permite manejar el error', async () => {
  const falso = claudeFalso({ salirAntes: true });
  const motor = crear({ buscarBinario: () => falso.bin });
  await assert.rejects(() => motor.redactar('x'.repeat(200_000)));
});

async function procesoTermino(pid) {
  for (let i = 0; i < 100; i++) {
    try { process.kill(pid, 0); await new Promise(r => setTimeout(r, 20)); }
    catch (e) { if (e.code === 'ESRCH') return true; throw e; }
  }
  return false;
}

test('cancelar Claude mata todo el grupo y limpia la carpeta aislada', async (t) => {
  const falso = claudeFalso({ esperar: true, ignorarTerm: true, descendiente: true });
  const motor = crear({ buscarBinario: () => falso.bin, graciaKillMs: 20 });
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
  assert.equal(await procesoTermino(llamada.pid), true, 'Claude no debe quedar huérfano');
  assert.equal(await procesoTermino(llamada.descendientePid), true, 'ningún descendiente de Claude debe quedar huérfano');
});

test('cancelar Claude espera al grupo aunque el proceso principal obedezca', async (t) => {
  const falso = claudeFalso({ esperar: true, descendiente: true });
  const motor = crear({ buscarBinario: () => falso.bin, graciaKillMs: 20 });
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
  assert.equal(await procesoTermino(llamada.descendientePid), true, 'el fallback debe esperar a que termine el helper de Claude');
});
