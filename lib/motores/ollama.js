// Modelo local con Ollama: nada sale del equipo, funciona sin internet.
const CONFIG = require('../config');
const R = require('../rutas');
const URL_BASE = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';

module.exports = {
  id: 'ollama',
  nombre: 'Modelo local (Ollama)',
  descripcion: 'Un modelo que corre en tu propia Mac. Más lento, pero funciona sin internet.',
  privacidad: 'Nada sale de este equipo.',

  // Disponible = el servicio responde Y el modelo configurado está descargado.
  // Un `ollama pull` que falló a medias deja el servicio vivo sin modelo: si eso
  // contara como disponible, Ajustes escondería el botón para reintentarlo.
  async disponible() {
    if (!R.BIN().ollama) return false;
    try {
      const r = await fetch(`${URL_BASE}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!r.ok) return false;
      const modelo = String(CONFIG.leer().motor.modeloOllama || '');
      const nombres = ((await r.json()).models || []).map(m => String(m.name || ''));
      return nombres.some(n => n === modelo || n.split(':')[0] === modelo.split(':')[0]);
    } catch { return false; }
  },

  async probar() {
    try {
      const t = await this.redactar('Responde solo con la palabra LISTO.');
      return { ok: /LISTO/i.test(t), detalle: t.trim().slice(0, 120) };
    } catch (e) { return { ok: false, detalle: e.message }; }
  },

  async redactar(prompt, { senal } = {}) {
    const modelo = CONFIG.leer().motor.modeloOllama;
    const r = await fetch(`${URL_BASE}/api/generate`, {
      signal: senal,
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt, stream: false }),
    });
    if (!r.ok) throw new Error(`Ollama respondió ${r.status}`);
    return (await r.json()).response || '';
  },
};
