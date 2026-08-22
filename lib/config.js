// Configuración de Escriba. Todo lo que era personal del autor vive aquí y
// se puede cambiar desde Ajustes, sin tocar el código.
const fs = require('fs'), path = require('path'), os = require('os');
const ATOMICO = require('./atomico');

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
  // Con qué se graba.
  //   modo: 'llamada'    = la otra persona suena en el Mac (FaceTime, Zoom, o una
  //                        llamada del iPhone contestada en el Mac). Dos pistas
  //                        limpias: se separa quién dijo qué por audio.
  //         'presencial' = todos en la misma sala. Una sola pista con voz: no
  //                        se atribuye nada por audio, y conviene el micro del
  //                        iPhone en medio de la mesa.
  //   microfono: entrada para el modo llamada ('' = la del sistema).
  //   microfonoPresencial: entrada para el modo presencial ('' = la del sistema).
  grabacion: { modo: 'llamada', microfono: '', microfonoPresencial: '' },
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
// Se muta, no se reasigna: module.exports captura la referencia al cargar.
const estado = { roto: false, respaldo: null };

function leer() {
  if (cache) return cache;
  let crudo;
  try { crudo = fs.readFileSync(ARCHIVO, 'utf8'); }
  catch {
    // Que NO exista no es estar corrupto: es el primer arranque. Valores por
    // defecto y ni una palabra.
    cache = { ...POR_DEFECTO }; return cache;
  }
  try { cache = fusionar(POR_DEFECTO, JSON.parse(crudo)); return cache; }
  catch {
    // El archivo está y no se puede leer. Antes esto se tragaba en silencio:
    // la app arrancaba con los valores por defecto, la carpeta de reuniones
    // apuntaba a otro sitio y el usuario veía su lista de clientes vacía sin
    // ninguna explicación posible. Ahora el original se APARTA, nunca se
    // borra, y Ajustes lo dice.
    let respaldo = ARCHIVO + '.roto';
    try {
      if (fs.existsSync(respaldo)) respaldo = `${ARCHIVO}.roto.${Date.now()}`;
      fs.renameSync(ARCHIVO, respaldo);
      estado.respaldo = respaldo;
    } catch { estado.respaldo = ARCHIVO; }
    estado.roto = true;
    cache = { ...POR_DEFECTO }; return cache;
  }
}

// null si todo bien; si no, { roto: true, respaldo: '/…/config.json.roto' }.
function corrupcion() { leer(); return estado.roto ? { ...estado } : null; }

function guardar(parcial) {
  const nueva = fusionar(leer(), parcial);
  ATOMICO.escribirAtomico(ARCHIVO, JSON.stringify(nueva, null, 2));
  cache = nueva;
  estado.roto = false; estado.respaldo = null;   // ya hay un config válido
  return nueva;
}

// ¿Ya se configuró lo mínimo para trabajar?
const configurado = () => !!leer().usuario.nombre;

module.exports = { leer, guardar, configurado, corrupcion, ARCHIVO, DIR, POR_DEFECTO };
