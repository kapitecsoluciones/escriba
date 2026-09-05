// Qué falta para poder redactar una minuta, y cómo dejar Ollama listo si
// nada más está disponible. Módulo puro: nada de fs, red ni CONFIG/rutas —
// eso lo resuelve quien llama (main.js), para que esto se pueda probar sin
// tocar el disco ni la red.

// Tamaño aproximado de descarga por modelo, solo para avisar antes de bajarlo.
const TAMANOS_MODELO = { 'llama3.1:8b': '4.9 GB' };
const MODELO_POR_DEFECTO = 'llama3.1:8b';

function tamanoAprox(modelo) {
  return TAMANOS_MODELO[modelo] || 'unos GB';
}

// Texto del aviso previo a instalar: cuánto se va a bajar, antes de arrancar
// la descarga. Vive aquí (no duplicado en el renderer) para que no se
// desactualice si cambia el modelo por defecto.
function avisoTamano(modelo) {
  const m = modelo || MODELO_POR_DEFECTO;
  return `Se instalará Ollama con Homebrew y se descargará el modelo ${m} (~${tamanoAprox(m)}). ` +
         'Es una sola vez; después redacta sin conexión a internet.';
}

// null si algún motor (Claude Code, Codex, Ollama o llave propia) ya puede
// redactar. Si no, el único hueco que de verdad bloquea a Escriba: sin motor
// no hay minuta, sin importar qué tan bien haya salido la transcripción.
// `disponibles` acepta un arreglo de booleanos o de {id, disponible}, para no
// atarse a cómo main.js arme la lista.
function queFaltaParaRedactar({ disponibles } = {}) {
  const lista = Array.isArray(disponibles) ? disponibles : [];
  const algunoListo = lista.some(d => (d && typeof d === 'object') ? d.disponible === true : d === true);
  if (algunoListo) return null;
  return {
    que: 'Quién redacta la minuta',
    como: 'No se encontró Claude Code, Codex ni Ollama. Puedes instalar Ollama (gratis y local) desde aquí, ' +
          'o iniciar sesión en Claude Code o Codex.',
    accion: 'ollama',
  };
}

// Pasos para dejar Ollama listo con el modelo configurado, en orden.
//
// Sin brew no hay manera automática: un solo paso informativo con el enlace,
// sin cmd (no se puede seguir desde aquí).
//
// Con brew, se instala el binario si falta y SIEMPRE se asegura el servicio
// antes de pedir el modelo: `ollama pull` falla si el servicio no está
// arriba, y desde estos tres parámetros no hay forma de saber si ya estaba
// corriendo — `brew services start` es idempotente, así que no está de más.
function pasosInstalarOllama({ modelo, brew, ollama } = {}) {
  const modeloFinal = modelo || MODELO_POR_DEFECTO;
  if (!brew) {
    return [{
      descripcion: 'No se encontró Homebrew, y sin él no se puede instalar Ollama desde aquí. ' +
                   'Instálalo desde https://brew.sh y vuelve a intentarlo.',
      cmd: null,
      args: [],
    }];
  }
  const pasos = [];
  if (!ollama) {
    pasos.push({ descripcion: 'Instalar Ollama con Homebrew', cmd: brew, args: ['install', 'ollama'] });
  }
  pasos.push({ descripcion: 'Iniciar el servicio de Ollama', cmd: brew, args: ['services', 'start', 'ollama'] });
  pasos.push({
    descripcion: `Descargar el modelo ${modeloFinal} (~${tamanoAprox(modeloFinal)})`,
    // Si `ollama` aún no existe (se acaba de instalar arriba), no hay ruta que
    // dar: se deja el nombre suelto y quien ejecute el paso lo vuelve a buscar.
    cmd: ollama || 'ollama',
    args: ['pull', modeloFinal],
  });
  return pasos;
}

module.exports = { queFaltaParaRedactar, pasosInstalarOllama, avisoTamano, tamanoAprox, MODELO_POR_DEFECTO };
