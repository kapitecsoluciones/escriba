// Motores de redacción intercambiables. Todos exponen la misma forma:
//   { id, nombre, disponible() -> bool, probar() -> {ok, detalle}, redactar(prompt) -> texto }
// El audio NUNCA sale de la Mac. Con 'claude-cli' y 'api' viaja el texto de la
// transcripción al proveedor; con 'ollama' no sale nada del equipo.
const claudeCli = require('./claude-cli');
const codexCli = require('./codex-cli');
const api = require('./api');
const ollama = require('./ollama');
const { crearAutomatico } = require('./automatico');
const CONFIG = require('../config');

const DIRECTOS = [claudeCli, codexCli, ollama, api];

function crearRegistro({ motores = DIRECTOS, config = CONFIG } = {}) {
  const porOrden = DIRECTOS
    .map(plantilla => motores.find(m => m.id === plantilla.id)).filter(Boolean);
  const automatico = crearAutomatico(porOrden);
  const todos = [automatico, ...motores];

  function porId(id) { return todos.find(m => m.id === id) || automatico; }

  function activo() { return porId(config.leer().motor.tipo); }

  async function estado() {
    const directos = await Promise.all(motores.map(async m => ({
      id: m.id, nombre: m.nombre, descripcion: m.descripcion,
      privacidad: m.privacidad, disponible: await m.disponible(),
    })));
    return [{
      id: automatico.id, nombre: automatico.nombre, descripcion: automatico.descripcion,
      privacidad: automatico.privacidad,
      disponible: directos.some(m => m.disponible),
    }, ...directos];
  }

  return { TODOS: todos, porId, activo, estado };
}

module.exports = Object.assign(crearRegistro(), { crearRegistro });
