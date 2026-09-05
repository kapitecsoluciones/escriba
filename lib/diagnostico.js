// El texto que alguien pega en un chat cuando algo le falló. Puro: no toca
// disco, no lanza procesos, no importa Electron. main.js reúne los datos con
// execFile/fs/systemPreferences y esto solo los convierte en texto plano.
const RAYA = '-'.repeat(40);

// Los cinco binarios de los que depende Escriba, en el orden en que se listan
// en el diagnóstico. La clave es la que usa BIN() en lib/rutas.js; el nombre
// es el que ve quien lee el texto.
const BINARIOS = [
  ['ffmpeg', 'ffmpeg'],
  ['whisper-cli', 'whisper'],
  ['claude', 'claude'],
  ['codex', 'codex'],
  ['ollama', 'ollama'],
];

// 'restricted' (perfil de empresa o control parental) se trata como denegado:
// a diferencia de 'not-determined', el usuario no puede concederlo desde
// Ajustes del Sistema aunque quiera, así que decirle "sin pedir" sería engañoso.
const PERMISOS = { granted: 'concedido', denied: 'denegado', restricted: 'denegado', 'not-determined': 'sin pedir' };
const traducirPermiso = (v) => PERMISOS[v] || 'sin pedir';

function textoBinario(nombre, info) {
  const i = info || {};
  if (!i.encontrado) return `${nombre} no encontrado`;
  return `${nombre} sí${i.version ? ` (${i.version})` : ''}`;
}

// Bytes a una unidad legible. El modelo pesa ~1.5 GB: mostrarlo en MB (1500)
// no ayuda a saber de un vistazo si la descarga se completó o se cortó a medias.
function formatoTamano(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  const mb = bytes / 1048576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function formatear(datos) {
  const d = datos || {};
  const macos = d.macos || {};
  const binarios = d.binarios || {};
  const modelo = d.modelo || {};
  const permisos = d.permisos || {};
  const rutas = d.rutas || {};
  const motores = Array.isArray(d.motores) ? d.motores : [];

  const elegido = motores.find(m => m.id === d.motorTipo);
  const nombreElegido = (elegido && elegido.nombre) || d.motorTipo || 'desconocido';
  const disponibilidad = motores.length
    ? motores.map(m => `${m.nombre} ${m.disponible ? 'sí' : 'no'}`).join(' · ')
    : 'sin datos';

  const lineaBinarios = BINARIOS.map(([nombre, clave]) => textoBinario(nombre, binarios[clave])).join(' · ');
  const tamano = formatoTamano(modelo.tamano);
  const lineaModelo = modelo.presente
    ? `Modelo de transcripción: sí${tamano ? ` (${tamano})` : ''}`
    : 'Modelo de transcripción: no encontrado';

  return [
    `Escriba ${d.version || 'desconocida'}`,
    `macOS ${macos.version || 'desconocido'}${macos.build ? ` (build ${macos.build})` : ''} · Chip ${d.chip || 'desconocido'}`,
    RAYA,
    `Binarios: ${lineaBinarios}`,
    lineaModelo,
    `Motor elegido: ${nombreElegido} — disponibilidad: ${disponibilidad}`,
    `Permiso de micrófono: ${traducirPermiso(permisos.microfono)} · Permiso de grabación de pantalla: ${traducirPermiso(permisos.pantalla)}`,
    `Carpeta de reuniones: ${rutas.reuniones || 'desconocida'}`,
    `Carpeta de configuración: ${rutas.config || 'desconocida'}`,
    RAYA,
    `Último error: ${d.ultimoError ? `${d.ultimoError.mensaje} (${d.ultimoError.hora})` : 'ninguno registrado'}`,
  ].join('\n');
}

// El home puede repetirse varias veces en el texto (carpeta de reuniones, de
// configuración, y dentro del mensaje de un error de ruta). split/join es un
// reemplazo LITERAL: a diferencia de una RegExp no le importa que el home
// traiga paréntesis o puntos, que sí tendrían significado especial en un patrón.
function ocultarRutas(texto, home) {
  const t = String(texto == null ? '' : texto);
  if (!home) return t;
  return t.split(home).join('~');
}

module.exports = { formatear, ocultarRutas };
