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
const ATOMICO = require('./atomico');
const CITAS = require('./citas');

const ARCHIVO = 'compromisos.json';

// ---------- la frontera de confidencialidad ----------
// Todo lo que sale hacia el cliente (PDF, portapapeles, expediente) se corta por
// aquí. Antes el corte era un solo `split(/##\s*Notas internas/i)` repetido en tres
// sitios, sobre texto que escribe un LLM: si titulaba `**Notas internas**` o
// `# Notas internas`, no cortaba, `[0]` era el documento ENTERO, y los riesgos,
// las señales de alerta y lo que se dijo de terceros salían en el PDF del cliente.
// La única pista era que desaparecía la tarjeta "Lo que no se dijo".
//
// El corte se ancla a un TÍTULO, no a una frase. La primera versión casaba con
// cualquier línea que empezara por "notas internas", y partía por la mitad
// minutas legítimas ("Notas internas de Acme: el equipo revisará…") sin avisar:
// peor que el fallo original, que enseñaba de más; este escondía de menos.
//
// Un título es: un encabezado Markdown de cualquier nivel (con numeración,
// emoji o cita delante, que es como lo escribe un modelo al que se le pidió una
// lista numerada), o una línea que sea SOLO el título en negrita o cursiva.
const TITULO = String.raw`notas\s+internas(?![a-záéíóúñ])`;
// Dos formas de título, y solo dos:
//  (a) una línea de ENCABEZADO Markdown (#…) que contenga el título en algún
//      punto: admite numeración, emoji, "[Interno]", "(uso interno)", o una
//      cita ">" delante, sin tener que enumerar cada prefijo posible;
//  (b) una línea que sea SOLO el título en negrita/cursiva, con hasta 40
//      caracteres más dentro del énfasis ("**Notas internas (no enviar)**").
// Una frase que EMPIEZA por "notas internas" y sigue con prosa no es ninguna
// de las dos, y por tanto no corta.
const ANUNCIO_INTERNAS = new RegExp(
  String.raw`^\s*(?:>\s*)?#{1,6}[^\n]{0,60}?` + TITULO +
  String.raw`|^\s*(?:>\s*)?[*_]{1,3}\s*` + TITULO + String.raw`[^*_\n]{0,40}[*_]{1,3}\s*:?\s*$`, 'i');

// Señales INEQUÍVOCAS de notas internas: un encabezado con el texto exacto que
// pide el prompt. Palabras sueltas en prosa ("revisamos las oportunidades
// comerciales del trimestre") no valen: bloqueaban minutas limpias sin salida.
const SENALES_INTERNAS = /^\s*(?:#{1,6}\s*|[*_]{1,3})\s*(lo que no se dijo|riesgos o se[ñn]ales de alerta|oportunidades comerciales)/im;

function separar(minuta) {
  const texto = String(minuta || '');
  const lineas = texto.split('\n');
  // El título se busca SIN la cita: "**Notas internas** [00:25]" es el mismo
  // título, y si no cortara aquí las notas privadas saldrían al cliente.
  const i = lineas.findIndex(l => ANUNCIO_INTERNAS.test(CITAS.sinCitas(l)));
  if (i === -1) return { cliente: texto.trim(), internas: '', encontrado: false };
  return {
    cliente: lineas.slice(0, i).join('\n').trim(),
    internas: lineas.slice(i + 1).join('\n').trim(),
    encontrado: true,
  };
}

// Lo único que puede salir hacia el cliente. Falla cerrado, a propósito.
function paraCliente(minuta) {
  const s = separar(minuta);
  if (s.encontrado) return { ok: true, texto: CITAS.sinCitas(s.cliente) };
  if (SENALES_INTERNAS.test(CITAS.sinCitas(s.cliente))) {
    return { ok: false, error: 'La minuta parece traer notas internas pero no se ve dónde empiezan. ' +
                               'No se exporta para no filtrarlas: revisa el encabezado de esa sección.' };
  }
  return { ok: true, texto: CITAS.sinCitas(s.cliente) };
}

const ES_SEPARADOR = /^:?-{2,}:?$/;
// Red de seguridad para tablas que el modelo cortó antes de la fila separadora.
// Ojo con \b después de una vocal acentuada: "qué\b" NO casa, porque la é no
// cuenta como carácter de palabra y ahí no hay frontera. Por eso los encabezados
// se detectan por la fila separadora, y esto es solo el respaldo.
const ES_ENCABEZADO = /^(compromiso|acuerdo|tarea|pendiente|acci[oó]n|qu[eé]|responsable|entregable|descripci[oó]n|concepto|punto|fecha|qui[eé]n|cu[aá]ndo|plazo|due[ñn]o|detalle|item|actividad)s?$/i;
const limpio = (t) => String(t || '').replace(/\*\*/g, '').trim();
// La cita de audio viaja dentro de la celda; hacia fuera solo va el texto y el
// instante en segundos. Así la clave del compromiso no cambia por la cita.
const sinCita = (t) => CITAS.sinCitas(limpio(t));

// Las notas internas nunca cuentan: no se envían al cliente.
function filas(minuta) {
  const publica = separar(minuta).cliente;
  const filas = [];   // eslint-disable-line no-shadow
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
    .filter(c => sinCita(c[0]) && !ES_ENCABEZADO.test(sinCita(c[0])))
    .map(c => ({ texto: sinCita(c[0]), quien: sinCita(c[1]), cuando: sinCita(c[2]), t: CITAS.ultima(c[0]), crudo: limpio(c[0]) }));
}
function extraer(minuta) { return filas(minuta).map(({ crudo, ...c }) => c); }

// Clave estable para recordar cuáles están hechos. Se normaliza para que un
// cambio de tilde o de mayúsculas no pierda la marca; una reescritura de fondo
// sí la pierde, y eso hay que decirlo, no esconderlo.
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function clave(texto) { return normalizar(CITAS.sinCitas(String(texto || ''))); }

function leerHechos(carpeta) {
  try { return JSON.parse(fs.readFileSync(path.join(carpeta, ARCHIVO), 'utf8')) || {}; }
  catch { return {}; }
}

function marcar(carpeta, texto, hecho, claveExplicita = null) {
  const hechos = leerHechos(carpeta);
  const k = claveExplicita || clave(texto);
  if (hecho) hechos[k] = true; else delete hechos[k];
  ATOMICO.escribirAtomico(path.join(carpeta, ARCHIVO), JSON.stringify(hechos, null, 2));
  return hechos;
}

// Compromisos de una reunión, ya con su estado.
// La clave con la que se recuerda cada fila. Sin la cita, para que volver a
// redactar no desmarque todo; salvo cuando dos filas de la MISMA minuta
// quedan iguales al quitarla ("Revisar [09:30]" y "Revisar [10:30]" en una
// minuta vieja): ahí cada una conserva su clave cruda y no se confunden.
function clavesDe(fs_) {
  const limpias = fs_.map(f => clave(f.texto));
  const veces = {};
  for (const k of limpias) veces[k] = (veces[k] || 0) + 1;
  return fs_.map((f, i) => (veces[limpias[i]] > 1 ? normalizar(f.crudo) : limpias[i]));
}

function conEstado(minuta, carpeta) {
  const hechos = leerHechos(carpeta);
  const fs_ = filas(minuta), claves = clavesDe(fs_);
  // Una minuta anterior a las citas pudo llevar "[09:30]" como texto legítimo y
  // su marca se guardó con la clave sin recortar. Se migra a la clave nueva al
  // leer: si solo se aceptara la vieja, desmarcar no la borraría y volvería.
  let migrado = false;
  const lista = fs_.map(({ crudo, ...c }, i) => {
    const k = claves[i], vieja = normalizar(crudo);
    if (vieja !== k && hechos[vieja]) { hechos[k] = true; delete hechos[vieja]; migrado = true; }
    return { ...c, clave: k, hecho: !!hechos[k] };
  });
  if (migrado) { try { ATOMICO.escribirAtomico(path.join(carpeta, ARCHIVO), JSON.stringify(hechos, null, 2)); } catch {} }
  return lista;
}

// Lo que NO se dijo: el diferenciador del producto, y hasta ahora enterrado al
// final del documento. Se saca de las notas internas para poder enseñarlo arriba.
// NUNCA sale al PDF del cliente: esto solo lee, el corte lo hace el handler `pdf`.
function hallazgosConTiempo(minuta, maximo = 6) {
  const { internas } = separar(minuta);
  if (!internas) return [];
  const lineas = internas.split('\n');
  // preferimos la sección de "lo que no se dijo"; si no está, las primeras viñetas
  let desde = lineas.findIndex(l => /^#{2,4}\s.*no\s+se\s+dijo/i.test(l.trim()));
  if (desde === -1) desde = 0; else desde += 1;
  const salida = [];
  for (let i = desde; i < lineas.length && salida.length < maximo; i++) {
    const l = lineas[i].trim();
    if (/^#{2,4}\s/.test(l) && salida.length) break;   // llegó otra sección
    const m = l.match(/^[-*]\s+(.+)$/);
    if (m) salida.push({ texto: sinCita(m[1]), t: CITAS.ultima(m[1]) });
  }
  return salida;
}

function hallazgos(minuta, maximo = 6) { return hallazgosConTiempo(minuta, maximo).map(x => x.texto); }

module.exports = { extraer, clave, leerHechos, marcar, conEstado, hallazgos, hallazgosConTiempo,
                   separar, paraCliente, ARCHIVO };
