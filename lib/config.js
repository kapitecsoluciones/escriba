// Configuración de Escriba. Todo lo que era personal del autor vive aquí y
// se puede cambiar desde Ajustes, sin tocar el código.
const fs = require('fs'), path = require('path'), os = require('os');

const DIR = path.join(os.homedir(), '.config', 'escriba');
const ARCHIVO = path.join(DIR, 'config.json');

const POR_DEFECTO = {
  // Quién eres (aparece en la minuta y como hablante del micrófono)
  usuario: { nombre: '', empresa: '', contacto: '' },
  // Marca del documento
  marca: { logo: '', acento: '#B58A3E' },
  // Dónde vive todo
  rutas: {
    reuniones: path.join(os.homedir(), 'Escriba'),
    dossiers: '',            // carpeta con un .md por cliente; vacío = sin contexto
    modelo: path.join(os.homedir(), '.whisper-models', 'ggml-large-v3-turbo.bin'),
  },
  // Motor de redacción: 'claude-cli' | 'api' | 'ollama'
  motor: { tipo: 'claude-cli', modeloApi: 'claude-sonnet-5', modeloOllama: 'llama3.1:8b', proveedor: 'anthropic' },
  // Con qué se graba. microfono vacío = el que use el sistema.
  grabacion: { microfono: '' },
  idioma: 'es',
  // tamaño y posición de la ventana, para no reabrirla siempre igual
  ventana: {},
};

function fusionar(base, encima) {
  const salida = { ...base };
  for (const [k, v] of Object.entries(encima || {})) {
    salida[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? fusionar(base[k] || {}, v) : v;
  }
  return salida;
}

let cache = null;

function leer() {
  if (cache) return cache;
  try {
    cache = fusionar(POR_DEFECTO, JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')));
  } catch {
    cache = { ...POR_DEFECTO };
  }
  return cache;
}

function guardar(parcial) {
  const nueva = fusionar(leer(), parcial);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify(nueva, null, 2));
  cache = nueva;
  return nueva;
}

// ¿Ya se configuró lo mínimo para trabajar?
const configurado = () => !!leer().usuario.nombre;

module.exports = { leer, guardar, configurado, ARCHIVO, DIR, POR_DEFECTO };
