// Atribuye cada frase a quien la dijo, comparando la energía de las dos pistas
// grabadas por separado: microfono.m4a (el usuario) y sistema.m4a (el otro lado).
const { execFile } = require('child_process');
const fs = require('fs');

// `registrar` deja que quien llama apunte el proceso para poder cancelarlo.
// Sin esto, los dos ffmpeg de la atribución quedaban fuera del inventario:
// Cancelar no los mataba y cerrar la app los dejaba huérfanos leyendo una hora
// de audio cada uno.
function correr(cmd, args, registrar) {
  return new Promise((res) => {
    const p = execFile(cmd, args, { maxBuffer: 1024 * 1024 * 128 },
                       (e, so, se) => res((se || '') + (so || '')));
    if (registrar) try { registrar(p); } catch {}
  });
}

// Envolvente de energía: [{t, db}]. El paso real es ~21 ms a 48 kHz (medido),
// no los 64 ms que decía aquí: cualquier función que lo use debe derivarlo de
// los datos, no fijarlo.
async function envolvente(ffmpeg, archivo, registrar) {
  const salida = await correr(ffmpeg, ['-nostdin', '-hide_banner', '-i', archivo,
    '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '/dev/null'], registrar);
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

// ¿Esta pista es un SEGUNDO PARTICIPANTE, o solo algo que sonó en el Mac?
//
// pistaAudible() mide señal, no voz, y eso ya falló en producción: en una
// reunión presencial el Mac reprodujo media tres veces (incluido un vídeo
// promocional del propio usuario), la pista del sistema pasó el umbral del 1 %,
// y dos turnos se atribuyeron a un cliente que no estaba. Se midieron 14
// fuentes con astats y aspectralstats (varianza, cruces, pausas, entropía,
// planitud espectral) y NINGUNA métrica separa voz de media: los vídeos y los
// podcasts contienen voz humana. La pregunta correcta es estructural, no de
// timbre: un participante habla repartido por toda la reunión; la media suena
// en islas.
//
// Dos puertas, en AND. Cualquier duda cae del lado de NO atribuir.
//   1. Dispersión: en qué fracción de bloques de tiempo hay actividad.
//      Medido: voz real 1.000 en 4 reuniones; sistema mudo 0.000; el caso real
//      del fallo 0.064. Umbral 0.25.
//   2. Qué fracción de los segmentos del SRT gana esta pista. En el fallo real
//      fueron 22 de 680 (3,2 %). Banda [0.10, 0.90]: rechaza ráfagas por abajo y
//      música continua por arriba.
//
// Se aplica SOLO a la pista del sistema: el micrófono nunca es media.
// Lo que no cubre, y se dice: una videollamada real con música de fondo pasa
// las dos puertas. No hay métrica de forma de onda que lo separe.
const DISPERSION_MINIMA = 0.25;
const MIN_BLOQUE_ACTIVO = 0.005;     // ~0,3 s de voz por bloque: el que solo asiente cuenta
const BANDA_SEGMENTOS = [0.10, 0.90];

function dispersion(puntos, { umbral = UMBRAL_DB, minBloque = MIN_BLOQUE_ACTIVO } = {}) {
  if (!puntos || puntos.length < 2) return 0;
  const dur = puntos[puntos.length - 1].t - puntos[0].t;
  if (dur <= 0) return 0;
  const largoBloque = Math.min(60, Math.max(10, dur / 12));
  const n = Math.max(1, Math.ceil(dur / largoBloque));
  const activos = new Array(n).fill(0), totales = new Array(n).fill(0);
  const t0 = puntos[0].t;
  for (const p of puntos) {
    const i = Math.min(n - 1, Math.floor((p.t - t0) / largoBloque));
    totales[i]++; if (p.db > umbral) activos[i]++;
  }
  let conActividad = 0;
  for (let i = 0; i < n; i++) if (totales[i] && activos[i] / totales[i] >= minBloque) conActividad++;
  return conActividad / n;
}

// Fracción de segmentos del SRT en los que `puntos` tiene más energía que `otros`.
function fraccionSegmentosGanados(puntos, otros, segmentos) {
  if (!segmentos || !segmentos.length) return 0;
  let ganados = 0;
  for (const s of segmentos) if (energiaEn(puntos, s.desde, s.hasta) > energiaEn(otros, s.desde, s.hasta)) ganados++;
  return ganados / segmentos.length;
}

function pistaConVoz(puntos, otros, segmentos) {
  if (!pistaAudible(puntos)) return false;
  if (dispersion(puntos) < DISPERSION_MINIMA) return false;
  const f = fraccionSegmentosGanados(puntos, otros, segmentos);
  return f >= BANDA_SEGMENTOS[0] && f <= BANDA_SEGMENTOS[1];
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
async function atribuir({ ffmpeg, srt, mic, sistema, nombreUsuario = 'Yo', nombreOtro = 'Cliente', registrar = null }) {
  if (!fs.existsSync(mic) || !fs.existsSync(sistema)) return null;
  const segmentos = parsearSrt(fs.readFileSync(srt, 'utf8'));
  if (!segmentos.length) return null;
  const [eMic, eSis] = await Promise.all([envolvente(ffmpeg, mic, registrar), envolvente(ffmpeg, sistema, registrar)]);
  if (!eMic.length || !eSis.length) return null;
  // Con una sola pista con voz no se puede saber quién dijo qué. Mejor no decir
  // nada que atribuirlo todo a quien tenía el micrófono. El micrófono solo tiene
  // que ser audible; el sistema tiene que ser un participante de verdad.
  if (!pistaAudible(eMic) || !pistaConVoz(eSis, eMic, segmentos)) return null;

  const turnos = agrupar(segmentos, (s, previo) => decidir({
    dbMic: energiaEn(eMic, s.desde, s.hasta),
    dbSistema: energiaEn(eSis, s.desde, s.hasta),
    previo, nombreUsuario, nombreOtro
  }));
  const reloj = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return turnos.map(t => `[${reloj(t.desde)}] ${t.quien}: ${t.texto}`).join('\n');
}

module.exports = { atribuir, envolvente, parsearSrt, decidir, agrupar, energiaEn, pistaAudible,
                   pistaConVoz, dispersion, fraccionSegmentosGanados,
                   MARGEN_DB, UMBRAL_DB, FRACCION_MINIMA, DISPERSION_MINIMA, BANDA_SEGMENTOS };
