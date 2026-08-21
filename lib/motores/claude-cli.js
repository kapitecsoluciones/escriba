// Usa la CLI de Claude Code ya instalada y autenticada en el equipo.
// Ventaja: sin llaves que gestionar. Requiere tener Claude Code.
const { execFile } = require('child_process');
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

  redactar(prompt) {
    const bin = R.BIN().claude;
    if (!bin) throw new Error('No se encontró la CLI de Claude Code.');
    return new Promise((res, rej) => {
      execFile(bin, ['-p', prompt, '--output-format', 'text'],
        { maxBuffer: 64 * 1024 * 1024 },
        (e, so, se) => e ? rej(new Error(se || e.message)) : res(so));
    });
  },
};
