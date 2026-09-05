// Ollama cuenta como disponible solo con el modelo configurado descargado.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');

process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-ollama-'));
process.env.ESCRIBA_CONFIG_DIR = path.join(process.env.HOME, 'cfg');
fs.mkdirSync(process.env.ESCRIBA_CONFIG_DIR, { recursive: true });
const CONFIG = require('../lib/config');
const R = require('../lib/rutas');
const OLLAMA = require('../lib/motores/ollama');

function conModelos(nombres) {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: nombres.map(name => ({ name })) }) });
}
const binOriginal = R.BIN;
test('con etiqueta exige esa etiqueta; sin etiqueta vale cualquiera del modelo', async (t) => {
  R.BIN = () => ({ ollama: '/usr/local/bin/ollama' });
  t.after(() => { R.BIN = binOriginal; delete globalThis.fetch; });
  CONFIG.guardar({ motor: { modeloOllama: 'qwen3:8b' } });
  conModelos(['qwen3:4b']); assert.strictEqual(await OLLAMA.disponible(), false);
  conModelos(['qwen3:8b']); assert.strictEqual(await OLLAMA.disponible(), true);
  conModelos([]);           assert.strictEqual(await OLLAMA.disponible(), false);
  CONFIG.guardar({ motor: { modeloOllama: 'llama3.1' } });
  conModelos(['llama3.1:latest']); assert.strictEqual(await OLLAMA.disponible(), true);
});
