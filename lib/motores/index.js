// Motores de redacción intercambiables. Todos exponen la misma forma:
//   { id, nombre, disponible() -> bool, probar() -> {ok, detalle}, redactar(prompt) -> texto }
// El audio NUNCA sale de la Mac. Con 'claude-cli' y 'api' viaja el texto de la
// transcripción al proveedor; con 'ollama' no sale nada del equipo.
const claudeCli = require('./claude-cli');
const api = require('./api');
const ollama = require('./ollama');
const CONFIG = require('../config');

const TODOS = [claudeCli, api, ollama];

function porId(id) { return TODOS.find(m => m.id === id) || claudeCli; }

function activo() { return porId(CONFIG.leer().motor.tipo); }

async function estado() {
  return Promise.all(TODOS.map(async m => ({
    id: m.id, nombre: m.nombre, descripcion: m.descripcion,
    privacidad: m.privacidad, disponible: await m.disponible(),
  })));
}

module.exports = { TODOS, porId, activo, estado };
