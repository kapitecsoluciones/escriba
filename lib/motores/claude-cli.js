// Usa la CLI de Claude Code ya instalada y autenticada en el equipo.
// Ventaja: sin llaves que gestionar. Requiere tener Claude Code.
const { execFile, spawn } = require('child_process');
const R = require('../rutas');

module.exports = {
  id: 'claude-cli',
  nombre: 'Claude Code',
  descripcion: 'Usa la sesión de Claude Code que ya tienes en este equipo. Sin llaves que configurar.',
  privacidad: 'El texto de la reunión se envía a Anthropic. El audio nunca sale del equipo.',

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
    return new Promise((res, rej) => {
      // con `signal`, cancelar en la app mata también este proceso en vez de
      // dejarlo corriendo en segundo plano hasta que termine solo
      const p = spawn(bin, ['-p', '--output-format', 'text'], { stdio: ['pipe', 'pipe', 'pipe'], signal: senal });
      let salida = '', error = '';
      p.stdout.on('data', (b) => salida += b);
      p.stderr.on('data', (b) => error += b);
      p.on('error', (e) => rej(e.name === 'AbortError' ? Object.assign(new Error('Cancelado'), { cancelado: true }) : new Error(e.message)));
      p.on('close', (code) => code === 0 ? res(salida) : rej(new Error(error.trim() || `terminó con código ${code}`)));
      p.stdin.end(prompt);
    });
  },
};
