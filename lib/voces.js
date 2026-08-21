// Atribuye cada frase a quien la dijo, comparando la energía de las dos pistas
// grabadas por separado: microfono.m4a (el usuario) y sistema.m4a (el otro lado).
const { execFile } = require('child_process');
const fs = require('fs');

function correr(cmd, args) {
  return new Promise((res) => {
    execFile(cmd, args, { maxBuffer: 1024 * 1024 * 128 }, (e, so, se) => res((se || '') + (so || '')));
  });
}

// Envolvente de energía: [{t, db}] cada ~0.064 s
async function envolvente(ffmpeg, archivo) {
  const salida = await correr(ffmpeg, ['-nostdin', '-hide_banner', '-i', archivo,
    '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '/dev/null']);
  const puntos = [];
  let t = null;
  for (const linea of salida.split('\n')) {
    let m = linea.match(/pts_time:([\d.]+)/);
    if (m) { t = parseFloat(m[1]); continue; }
    m = linea.match(/RMS_level=(-?[\d.]+|-inf)/);
    if (m && t !== null) {
      const db = m[1] === '-inf' ? -120 : parseFloat(m[1]);
      puntos.push({ t, db });
      t = null;
    }
  }
  return puntos;
}

function energiaEn(puntos, desde, hasta) {
  const dentro = puntos.filter(p => p.t >= desde && p.t <= hasta);
  if (!dentro.length) return -120;
  // promedio en escala lineal, más fiel que promediar decibelios
  const lin = dentro.reduce((a, p) => a + Math.pow(10, p.db / 20), 0) / dentro.length;
  return 20 * Math.log10(Math.max(lin, 1e-6));
}

function parsearSrt(texto) {
  const bloques = texto.replace(/\r/g, '').split(/\n\n+/);
  const seg = [];
  for (const b of bloques) {
    const m = b.match(/(\d\d):(\d\d):(\d\d)[,.](\d\d\d)\s*-->\s*(\d\d):(\d\d):(\d\d)[,.](\d\d\d)\n([\s\S]+)/);
    if (!m) continue;
    const s = (h, mi, se, ms) => +h * 3600 + +mi * 60 + +se + +ms / 1000;
    seg.push({
      desde: s(m[1], m[2], m[3], m[4]), hasta: s(m[5], m[6], m[7], m[8]),
      texto: m[9].trim().replace(/\s+/g, ' ')
    });
  }
  return seg;
}

// ¿Esta pista tiene a alguien hablando, o está muda?
//
// Escriba se diseñó para videollamadas: micrófono = tú, audio del sistema = el
// otro lado. En una reunión PRESENCIAL no hay audio del sistema, pero el archivo
// existe igual y pesa (el silencio en AAC también ocupa). Sin esta comprobación,
// comparar energías daba siempre ganador al micrófono y la conversación entera
// quedaba atribuida a una sola persona — y al modelo se le decía que esa
// separación era fiable. La minuta repartía los compromisos al revés.
//
// El audio del sistema es digital: si no suena nada, es silencio exacto (-inf,
// que envolvente() mapea a -120 dB). Distinguirlo de una voz real es fácil.
const UMBRAL_DB = -55;        // por encima de esto hay señal, no ruido de fondo
const FRACCION_MINIMA = 0.01; // y tiene que darse en algún momento, no una vez suelta
function pistaAudible(puntos, { umbral = UMBRAL_DB, fraccion = FRACCION_MINIMA } = {}) {
  if (!puntos || !puntos.length) return false;
  const activos = puntos.reduce((n, p) => n + (p.db > umbral ? 1 : 0), 0);
  return activos / puntos.length >= fraccion;
}

// De quién es este segmento. Es el corazón de la atribución, así que vive aparte
// y sin depender de disco ni de ffmpeg: con menos de `margen` dB de diferencia las
// dos voces están encimadas y se hereda el hablante anterior, porque alternar en
// cada frase pareja producía un diálogo de pimpón ilegible.
const MARGEN_DB = 2;
function decidir({ dbMic, dbSistema, previo = null, nombreUsuario = 'Yo', nombreOtro = 'Cliente', margen = MARGEN_DB }) {
  if (Math.abs(dbMic - dbSistema) < margen && previo) return previo;
  return dbMic > dbSistema ? nombreUsuario : nombreOtro;
}

// Junta frases seguidas del mismo hablante en un solo turno.
function agrupar(segmentos, quienDe) {
  const turnos = [];
  for (const s of segmentos) {
    const quien = quienDe(s, turnos.length ? turnos[turnos.length - 1].quien : null);
    const ult = turnos[turnos.length - 1];
    if (ult && ult.quien === quien) ult.texto += ' ' + s.texto;
    else turnos.push({ quien, texto: s.texto, desde: s.desde });
  }
  return turnos;
}

// Devuelve la transcripción con hablante por turno, agrupando frases seguidas
async function atribuir({ ffmpeg, srt, mic, sistema, nombreUsuario = 'Yo', nombreOtro = 'Cliente' }) {
  if (!fs.existsSync(mic) || !fs.existsSync(sistema)) return null;
  const [eMic, eSis] = await Promise.all([envolvente(ffmpeg, mic), envolvente(ffmpeg, sistema)]);
  if (!eMic.length || !eSis.length) return null;
  // Con una sola pista con voz no se puede saber quién dijo qué. Mejor no decir
  // nada que atribuirlo todo a quien tenía el micrófono.
  if (!pistaAudible(eMic) || !pistaAudible(eSis)) return null;

  const segmentos = parsearSrt(fs.readFileSync(srt, 'utf8'));
  if (!segmentos.length) return null;

  const turnos = agrupar(segmentos, (s, previo) => decidir({
    dbMic: energiaEn(eMic, s.desde, s.hasta),
    dbSistema: energiaEn(eSis, s.desde, s.hasta),
    previo, nombreUsuario, nombreOtro
  }));
  const reloj = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return turnos.map(t => `[${reloj(t.desde)}] ${t.quien}: ${t.texto}`).join('\n');
}

module.exports = { atribuir, envolvente, parsearSrt, decidir, agrupar, energiaEn, pistaAudible,
                   MARGEN_DB, UMBRAL_DB, FRACCION_MINIMA };
