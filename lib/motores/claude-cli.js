// Usa la CLI de Claude Code ya instalada y autenticada en el equipo.
// Ventaja: sin llaves que gestionar. Requiere tener Claude Code.
const { execFile, spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const R = require('../rutas');
const ENTORNO = require('./entorno');
const PROCESO = require('./proceso');

// La CLI carga el CLAUDE.md y la memoria del proyecto que corresponda a su
// directorio de trabajo, y además puede salir a leer el disco con sus propias
// herramientas. Sin esto, una minuta se redactaba con notas privadas de OTROS
// clientes y con documentos sueltos del Escritorio: contexto que Escriba nunca
// le pasó, que no es reproducible, y que puede acabar en el PDF que se envía.
//
// `--safe-mode` corta personalizaciones y contexto global, `--tools ''` corta
// la búsqueda por el disco y el cwd temporal evita descubrir archivos del
// proyecto. Son canales distintos, así que se cierran los tres.
const PREFIJO_AISLADA = 'escriba-motor-';

// Sin carpeta aislada no hay aislamiento, y sin aislamiento no se redacta.
// Antes, si mkdtempSync fallaba (disco lleno bajando el modelo, permisos), se
// devolvía os.tmpdir() ENTERO — y al terminar se hacía rmSync recursivo sobre
// él: el directorio temporal de todo el usuario, con el .wav de whisper y el
// HTML del PDF en vuelo dentro. Disparador raro; consecuencia indefendible.
function carpetaAislada() {
  try { return fs.mkdtempSync(path.join(os.tmpdir(), PREFIJO_AISLADA)); }
  catch (e) {
    throw new Error('No se pudo crear la carpeta de trabajo del motor (' + (e.code || e.message) +
                    '). Sin ella no se redacta: comprueba el espacio en disco.');
  }
}

// Borrar solo lo que es nuestro, nunca por una ruta que no lleve el prefijo.
function limpiar(carpeta) {
  if (!carpeta || path.basename(carpeta).indexOf(PREFIJO_AISLADA) !== 0) return;
  try { fs.rmSync(carpeta, { recursive: true, force: true }); } catch {}
}

function crear({ buscarBinario = () => R.BIN().claude, graciaKillMs = 3000 } = {}) {
  return {
    id: 'claude-cli',
    nombre: 'Claude Code',
    descripcion: 'Usa la sesión de Claude Code que ya tienes en este equipo. Sin llaves que configurar.',
    privacidad: 'El texto de la reunión, la memoria que Escriba guarda de ese cliente y, si lo enlazaste, su expediente se envían a Anthropic. El audio nunca sale del equipo.',

    disponible() {
      const bin = buscarBinario();
      if (!bin) return Promise.resolve(false);
      return new Promise((res) => {
        execFile(bin, ['auth', 'status'], { timeout: 5000, env: ENTORNO.limpio() }, (e, salida) => {
          if (e) return res(false);
          try { res(JSON.parse(salida).loggedIn === true); }
          catch { res(false); }
        });
      });
    },

    async probar() {
      const bin = buscarBinario();
      if (!bin) return { ok: false, detalle: 'No se encontró la CLI de Claude Code.' };
      try {
        const texto = await this.redactar('Responde solo con la palabra LISTO.');
        return { ok: /LISTO/i.test(texto), detalle: texto.trim().slice(0, 120) };
      } catch (e) { return { ok: false, detalle: e.message }; }
    },

    redactar(prompt, { senal } = {}) {
      const bin = buscarBinario();
      if (!bin) throw new Error('No se encontró la CLI de Claude Code.');
      if (senal?.aborted) return Promise.reject(Object.assign(new Error('Cancelado'), { cancelado: true }));
      // El prompt va por stdin, no como argumento: una reunión larga supera el
      // límite de longitud de la línea de comandos del sistema (E2BIG).
      let aislada;
      try { aislada = carpetaAislada(); } catch (e) { return Promise.reject(e); }
      return new Promise((res, rej) => {
        const p = spawn(bin, ['-p', '--output-format', 'text',
                              '--safe-mode', '--tools', '', '--no-session-persistence',
                              '--disable-slash-commands',
                              '--setting-sources', '',
                              '--strict-mcp-config'],
                        { stdio: ['pipe', 'pipe', 'pipe'], cwd: aislada,
                          env: ENTORNO.limpio(), detached: PROCESO.aislado() });
        let salida = '', error = '';
        let terminado = false;
        let abortoPendiente = null;
        let killForzado = null;
        let cierreDuranteAborto = false;
        const cancelar = () => {
          abortoPendiente = Object.assign(new Error('Cancelado'), { cancelado: true });
          PROCESO.terminar(p, 'SIGTERM');
          killForzado = setTimeout(() => {
            PROCESO.terminar(p, 'SIGKILL');
            killForzado = null;
            if (cierreDuranteAborto) rechazar(abortoPendiente);
          }, graciaKillMs);
        };
        if (senal) senal.addEventListener('abort', cancelar, { once: true });
        const resolver = (valor) => {
          if (terminado) return;
          terminado = true;
          limpiar(aislada);
          res(valor);
        };
        const rechazar = (e) => {
          if (terminado) return;
          terminado = true;
          limpiar(aislada);
          rej(e);
        };
        p.stdout.on('data', (b) => salida += b);
        p.stderr.on('data', (b) => error += b);
        // Un fallo inmediato puede cerrar el pipe antes de recibir una
        // transcripción larga. EPIPE se resuelve con el código real del hijo.
        p.stdin.on('error', (e) => {
          if (e.code !== 'EPIPE') rechazar(new Error(e.message));
        });
        p.on('error', (e) => {
          rechazar(new Error(e.message));
        });
        p.on('close', (code) => {
          if (senal) senal.removeEventListener('abort', cancelar);
          if (abortoPendiente && killForzado && PROCESO.activo(p)) {
            cierreDuranteAborto = true;
            return;
          }
          if (killForzado) clearTimeout(killForzado);
          if (abortoPendiente) rechazar(abortoPendiente);
          else code === 0 ? resolver(salida) : rechazar(new Error(error.trim() || `terminó con código ${code}`));
        });
        p.stdin.end(prompt);
      });
    },
  };
}

module.exports = Object.assign(crear(), { crear });
