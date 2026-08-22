// Usa la CLI de Claude Code ya instalada y autenticada en el equipo.
// Ventaja: sin llaves que gestionar. Requiere tener Claude Code.
const { execFile, spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const R = require('../rutas');

// La CLI carga el CLAUDE.md y la memoria del proyecto que corresponda a su
// directorio de trabajo, y además puede salir a leer el disco con sus propias
// herramientas. Sin esto, una minuta se redactaba con notas privadas de OTROS
// clientes y con documentos sueltos del Escritorio: contexto que Escriba nunca
// le pasó, que no es reproducible, y que puede acabar en el PDF que se envía.
//
// Dos cierres, porque son dos canales distintos:
//   - `cwd` en una carpeta vacía FUERA de la carpeta personal (os.tmpdir() cae
//     en /var/folders), que es lo que corta el contexto ambiental.
//   - sin herramientas, que es lo que corta la búsqueda por el disco.
// Es una lista negra y las listas negras se quedan cortas: en una prueba la
// CLI intentó leer un archivo por `Monitor`, que no estaba aquí. Lo que la
// frenó fue el sandbox de directorio, no esta lista. Por eso el cwd aislado es
// la defensa principal y esto es la segunda.
const SIN_HERRAMIENTAS = ['Bash', 'Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep',
                          'Task', 'Agent', 'WebFetch', 'WebSearch', 'NotebookEdit',
                          'Monitor', 'TodoWrite', 'SlashCommand', 'BashOutput', 'KillShell',
                          'Skill', 'LS'];

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

module.exports = {
  id: 'claude-cli',
  nombre: 'Claude Code',
  descripcion: 'Usa la sesión de Claude Code que ya tienes en este equipo. Sin llaves que configurar.',
  privacidad: 'El texto de la reunión, la memoria que Escriba guarda de ese cliente y, si lo enlazaste, su expediente se envían a Anthropic. El audio nunca sale del equipo.',

  async disponible() { return !!R.BIN().claude; },

  async probar() {
    const bin = R.BIN().claude;
    if (!bin) return { ok: false, detalle: 'No se encontró la CLI de Claude Code.' };
    try {
      const texto = await this.redactar('Responde solo con la palabra LISTO.');
      return { ok: /LISTO/i.test(texto), detalle: texto.trim().slice(0, 120) };
    } catch (e) { return { ok: false, detalle: e.message }; }
  },

  redactar(prompt, { senal } = {}) {
    const bin = R.BIN().claude;
    if (!bin) throw new Error('No se encontró la CLI de Claude Code.');
    // El prompt va por stdin, no como argumento: una reunión larga supera el
    // límite de longitud de la línea de comandos del sistema (E2BIG).
    let aislada;
    try { aislada = carpetaAislada(); } catch (e) { return Promise.reject(e); }
    return new Promise((res, rej) => {
      // con `signal`, cancelar en la app mata también este proceso en vez de
      // dejarlo corriendo en segundo plano hasta que termine solo
      const p = spawn(bin, ['-p', '--output-format', 'text',
                            '--disallowedTools', ...SIN_HERRAMIENTAS,
                            '--setting-sources', '',
                            '--strict-mcp-config'],
                      { stdio: ['pipe', 'pipe', 'pipe'], signal: senal, cwd: aislada });
      let salida = '', error = '';
      p.stdout.on('data', (b) => salida += b);
      p.stderr.on('data', (b) => error += b);
      p.on('error', (e) => rej(e.name === 'AbortError' ? Object.assign(new Error('Cancelado'), { cancelado: true }) : new Error(e.message)));
      p.on('close', (code) => {
        limpiar(aislada);
        code === 0 ? res(salida) : rej(new Error(error.trim() || `terminó con código ${code}`));
      });
      p.stdin.end(prompt);
    });
  },
};
