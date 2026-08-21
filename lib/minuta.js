// Lo que se puede sacar de una minuta ya redactada: los compromisos y los
// hallazgos internos. Vive aquí y no en main.js para poder probarlo sin Electron.
//
// Los compromisos son lo más valioso de una minuta: quién hace qué y para
// cuándo. El modelo los escribe como tablas Markdown dentro del texto, así que
// hay que sacarlos de ahí para poder listarlos, copiarlos y marcarlos.
//
// Este parser vivía dentro del handler `exportar-historial` de main.js; se movió
// aquí para usarlo también en la vista de la reunión y para poder probarlo.
const fs = require('fs'), path = require('path');

const ARCHIVO = 'compromisos.json';

const ES_SEPARADOR = /^:?-{2,}:?$/;
// Red de seguridad para tablas que el modelo cortó antes de la fila separadora.
// Ojo con \b después de una vocal acentuada: "qué\b" NO casa, porque la é no
// cuenta como carácter de palabra y ahí no hay frontera. Por eso los encabezados
// se detectan por la fila separadora, y esto es solo el respaldo.
const ES_ENCABEZADO = /^(compromiso|acuerdo|tarea|pendiente|acci[oó]n|qu[eé]|responsable)s?$/i;
const limpio = (t) => String(t || '').replace(/\*\*/g, '').trim();

// Las notas internas nunca cuentan: no se envían al cliente.
function extraer(minuta) {
  const publica = String(minuta || '').split(/##\s*Notas internas/i)[0];
  const filas = [];
  for (const linea of publica.split('\n')) {
    const celdas = linea.trim().match(/^\|(.+)\|$/);
    if (!celdas) continue;
    const c = celdas[1].split('|').map(x => x.trim());
    if (c.length < 2) continue;
    // La fila de guiones va justo debajo del encabezado: cuando aparece, lo que
    // se guardó antes era el encabezado, sea cual sea la palabra que use.
    if (c.every(x => x === '' || ES_SEPARADOR.test(x))) { filas.pop(); continue; }
    filas.push(c);
  }
  return filas
    .filter(c => limpio(c[0]) && !ES_ENCABEZADO.test(limpio(c[0])))
    .map(c => ({ texto: limpio(c[0]), quien: limpio(c[1]), cuando: limpio(c[2]) }));
}

// Clave estable para recordar cuáles están hechos. Se normaliza para que un
// cambio de tilde o de mayúsculas no pierda la marca; una reescritura de fondo
// sí la pierde, y eso hay que decirlo, no esconderlo.
function clave(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function leerHechos(carpeta) {
  try { return JSON.parse(fs.readFileSync(path.join(carpeta, ARCHIVO), 'utf8')) || {}; }
  catch { return {}; }
}

function marcar(carpeta, texto, hecho) {
  const hechos = leerHechos(carpeta);
  const k = clave(texto);
  if (hecho) hechos[k] = true; else delete hechos[k];
  fs.writeFileSync(path.join(carpeta, ARCHIVO), JSON.stringify(hechos, null, 2));
  return hechos;
}

// Compromisos de una reunión, ya con su estado.
function conEstado(minuta, carpeta) {
  const hechos = leerHechos(carpeta);
  return extraer(minuta).map(c => ({ ...c, hecho: !!hechos[clave(c.texto)] }));
}

// Lo que NO se dijo: el diferenciador del producto, y hasta ahora enterrado al
// final del documento. Se saca de las notas internas para poder enseñarlo arriba.
// NUNCA sale al PDF del cliente: esto solo lee, el corte lo hace el handler `pdf`.
function hallazgos(minuta, maximo = 3) {
  const partes = String(minuta || '').split(/##\s*Notas internas[^\n]*/i);
  if (!partes[1]) return [];
  const lineas = partes[1].split('\n');
  // preferimos la sección de "lo que no se dijo"; si no está, las primeras viñetas
  let desde = lineas.findIndex(l => /^#{2,4}\s.*no\s+se\s+dijo/i.test(l.trim()));
  if (desde === -1) desde = 0; else desde += 1;
  const salida = [];
  for (let i = desde; i < lineas.length && salida.length < maximo; i++) {
    const l = lineas[i].trim();
    if (/^#{2,4}\s/.test(l) && salida.length) break;   // llegó otra sección
    const m = l.match(/^[-*]\s+(.+)$/);
    if (m) salida.push(m[1].replace(/\*\*/g, '').trim());
  }
  return salida;
}

module.exports = { extraer, clave, leerHechos, marcar, conEstado, hallazgos, ARCHIVO };
