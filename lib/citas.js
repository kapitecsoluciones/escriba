// Citas de audio: marcas [mm:ss] en la transcripción que va al prompt, para que
// cada compromiso y cada hallazgo de la minuta se pueda oír antes de enviarla.
//
// La marca es texto plano dentro de minuta.md y se retira de todo lo que sale
// hacia el cliente. Solo sobrevive una cita si coincide con una marca que
// Escriba emitió: una cita inventada por el modelo es peor que ninguna, porque
// lleva a oír el momento equivocado y a dar por verificado lo que no lo está.

// Una sola gramática para emitir, validar y limpiar: [mm:ss] con minutos sin
// tope. Un [h:mm:ss] también se reconoce para RETIRARLO (nunca se emite, así
// que nunca sobrevive a validar): lo que no sea una marca emitida no sale.
const RE_MARCA = /\[(\d{1,4}):(\d{2})(?::(\d{2}))?\]/g;
// La marca se lleva un espacio consigo: el anterior ("cotización [03:15] |" →
// "cotización |") o, si abre la línea, el siguiente ("[00:00] hola" → "hola").
const RE_MARCA_CON_ESPACIO = /( ?)\[(\d{1,4}):(\d{2})(?::(\d{2}))?\]( ?)/g;
const sinMarca = (antes, despues) => (antes ? despues : '');

// Siempre mm:ss, también pasada la hora (75:03): un solo formato que el modelo
// copia y que la interfaz sabe leer.
function formato(seg) {
  const s = Math.max(0, Math.floor(Number(seg) || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function segundos(mmss) {
  const m = String(mmss || '').trim().match(/^\[?(\d{1,4}):(\d{2})\]?$/);
  if (!m || +m[2] > 59) return null;
  return +m[1] * 60 + +m[2];
}

const normal = (mm, ss) => `${mm.padStart(2, '0')}:${ss}`;

// Transcripción para el prompt a partir de los segmentos del SRT. Una marca
// abre línea cuando pasaron `cada` segundos desde la anterior o cambió el
// hablante; lo demás se pega a la línea abierta. `turnos` viene de dialogo.txt
// ([{desde, quien}]) y solo sirve para poner el nombre: el diálogo agrupa por
// turno y un turno puede durar minutos, demasiado grueso para citar.
function marcar(segmentos, { cada = 25, turnos = null } = {}) {
  const orden = (turnos || []).slice().sort((a, b) => a.desde - b.desde);
  const quienDe = (t) => {
    let q = null;
    for (const tr of orden) { if (tr.desde <= t + 1e-6) q = tr.quien; else break; }
    return q;
  };
  const marcas = new Set(), lineas = [];
  let ultima = null, ultimoQuien = null;
  for (const s of segmentos || []) {
    const texto = String(s.texto || '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const desde = Math.max(0, Number(s.desde) || 0);
    const quien = quienDe(desde);
    if (ultima === null || desde - ultima >= cada || quien !== ultimoQuien) {
      const f = formato(desde);
      marcas.add(f);
      lineas.push(`[${f}]${quien ? ` ${quien}:` : ''} ${texto}`);
      ultima = desde; ultimoQuien = quien;
    } else {
      lineas[lineas.length - 1] += ' ' + texto;
    }
  }
  return { texto: lineas.join('\n'), marcas };
}

// Conserva solo las citas que Escriba emitió. "[5:03]" cuenta como "[05:03]":
// es el mismo instante, no una invención. Todo lo demás se quita.
function validar(minuta, marcas) {
  const ok = marcas instanceof Set ? marcas : new Set(marcas || []);
  let total = 0, descartadas = 0;
  const texto = String(minuta || '').replace(RE_MARCA_CON_ESPACIO, (m, antes, mm, ss, hms, despues) => {
    total++;
    const k = hms === undefined ? normal(mm, ss) : null;   // [h:mm:ss] nunca se emitió
    if (k && ok.has(k)) return `${antes}[${k}]${despues}`;
    descartadas++;
    return sinMarca(antes, despues);
  });
  return { texto, total, descartadas };
}

// Lo que sale hacia el cliente: sin marcas y sin los huecos que dejan.
function sinCitas(texto) {
  return String(texto || '')
    .replace(RE_MARCA_CON_ESPACIO, (m, antes, mm, ss, hms, despues) => sinMarca(antes, despues))
    // "**Notas internas** ([00:25])" dejaba "()" y el título ya no cortaba
    .replace(/ ?\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:)])/g, '$1')
    .replace(/[ \t]+$/gm, '');
}

// Segundos de la última cita VÁLIDA de un texto (una celda, una viñeta), o null.
function ultima(texto) {
  const todas = [...String(texto || '').matchAll(RE_MARCA)];
  for (let i = todas.length - 1; i >= 0; i--) {
    const m = todas[i];
    if (m[3] !== undefined) continue;
    const s = segundos(`${m[1]}:${m[2]}`);
    if (s !== null) return s;
  }
  return null;
}

// Los turnos de dialogo.txt ("[mm:ss] Nombre: …"), solo para saber quién habla
// en cada momento. La cabecera de versión y las líneas sin marca se ignoran.
function turnosDeDialogo(texto) {
  const turnos = [];
  for (const l of String(texto || '').split('\n')) {
    const m = l.match(/^\[(\d{1,3}):(\d{2})\]\s+([^:]+):/);
    if (m) turnos.push({ desde: +m[1] * 60 + +m[2], quien: m[3].trim() });
  }
  return turnos;
}

function tiene(texto) { return RE_MARCA.test(String(texto || '')) && !(RE_MARCA.lastIndex = 0); }

module.exports = { marcar, validar, sinCitas, ultima, tiene, turnosDeDialogo, formato, segundos, RE_MARCA };
