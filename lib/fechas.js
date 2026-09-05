// La fecha y la HORA de la reunión salen del nombre de la carpeta, que sello()
// escribe siempre en hora local. La hora estaba ahí desde el principio y se
// tiraba al parsear: al prompt solo llegaban el día y la duración. Por eso una
// minuta podía notar que la grabación "se corta en plena intervención" y aun
// así no servir de nada — sin horas no se sabe qué tramo falta. Con la ventana,
// el aviso se vuelve accionable: "arranca a las 16:18, con la sesión ya en
// curso, y termina a las 17:30".
const SELLO = /(\d{4})-(\d{2})-(\d{2})(?:_(\d{2})(\d{2})(\d{2})?)?/;

function partes(carpeta) {
  // Solo el nombre final: "/archivo/2020-01-01/acme/2026-08-20_120000" es del 2026
  const nombre = String(carpeta || '').replace(/\/+$/, '').split('/').pop();
  const m = nombre.match(SELLO);
  if (!m) return null;
  const [, a, me, d, h, mi, s] = m;
  // El formato viejo era _HHMM y el actual _HHMMSS: los dos entran, y una
  // carpeta sin sello de hora sigue siendo válida, solo que sin ventana.
  const conHora = h !== undefined && +h < 24 && +mi < 60;
  return { a: +a, me: +me, d: +d, h: conHora ? +h : 0, mi: conHora ? +mi : 0, s: conHora ? +(s || 0) : 0, conHora };
}

// La fecha de la REUNIÓN. Antes se usaba `new Date()` al procesar: redactar hoy
// la junta de ayer ponía la fecha de hoy en la minuta.
function fechaDeCarpeta(carpeta) {
  const p = partes(carpeta);
  if (!p) return new Date();
  return new Date(p.a, p.me - 1, p.d, p.h, p.mi, p.s);
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// De cuándo a cuándo va lo que quedó grabado, en la zona del equipo. El nombre
// de la zona importa: el usuario puede estar en otro huso que la reunión (una
// Mac en Hermosillo escuchando un evento de la Ciudad de México), y sin decirlo
// las horas se leen mal.
function ventana(carpeta, segundos) {
  const p = partes(carpeta);
  if (!p || !p.conHora) return null;
  const inicio = fechaDeCarpeta(carpeta);
  let zona = null;
  try { zona = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch {}
  const dur = Number(segundos);
  const fin = Number.isFinite(dur) && dur > 0 ? new Date(inicio.getTime() + dur * 1000) : null;
  return { inicio: hhmm(inicio), fin: fin ? hhmm(fin) : null, zona };
}

module.exports = { fechaDeCarpeta, ventana };
