// Llama directamente a la API del proveedor con una llave propia.
// La llave se guarda en el Keychain de macOS, nunca en un archivo del proyecto.
const { execFile } = require('child_process');
const CONFIG = require('../config');

const SERVICIO = 'escriba-api-key';

function leerLlave(proveedor) {
  return new Promise((res) => {
    execFile('/usr/bin/security',
      ['find-generic-password', '-s', `${SERVICIO}-${proveedor}`, '-w'],
      (e, so) => res(e ? null : so.trim()));
  });
}

function guardarLlave(proveedor, llave) {
  return new Promise((res, rej) => {
    execFile('/usr/bin/security',
      ['add-generic-password', '-U', '-s', `${SERVICIO}-${proveedor}`, '-a', proveedor, '-w', llave],
      (e) => e ? rej(e) : res(true));
  });
}

const PUNTOS = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    cabeceras: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }),
    cuerpo: (modelo, prompt) => ({ model: modelo, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
    extraer: (j) => (j.content || []).map(c => c.text || '').join(''),
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    cabeceras: (k) => ({ authorization: `Bearer ${k}`, 'content-type': 'application/json' }),
    cuerpo: (modelo, prompt) => ({ model: modelo, messages: [{ role: 'user', content: prompt }] }),
    extraer: (j) => j.choices?.[0]?.message?.content || '',
  },
};

module.exports = {
  id: 'api',
  nombre: 'Llave propia',
  descripcion: 'Tu propia llave de Anthropic o de OpenAI. Se guarda en el Keychain del sistema.',
  privacidad: 'El texto de la reunión se envía al proveedor que elijas. El audio nunca sale del equipo.',
  guardarLlave, leerLlave,

  async disponible() {
    const c = CONFIG.leer().motor;
    return !!(await leerLlave(c.proveedor || 'anthropic'));
  },

  async probar() {
    try {
      const t = await this.redactar('Responde solo con la palabra LISTO.');
      return { ok: /LISTO/i.test(t), detalle: t.trim().slice(0, 120) };
    } catch (e) { return { ok: false, detalle: e.message }; }
  },

  async redactar(prompt) {
    const c = CONFIG.leer().motor;
    const proveedor = c.proveedor || 'anthropic';
    const def = PUNTOS[proveedor];
    if (!def) throw new Error(`Proveedor desconocido: ${proveedor}`);
    const llave = await leerLlave(proveedor);
    if (!llave) throw new Error('No hay llave guardada para ' + proveedor);
    const r = await fetch(def.url, {
      method: 'POST', headers: def.cabeceras(llave),
      body: JSON.stringify(def.cuerpo(c.modeloApi, prompt)),
    });
    if (!r.ok) throw new Error(`${proveedor} respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return def.extraer(await r.json());
  },
};
