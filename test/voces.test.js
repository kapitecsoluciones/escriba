// Pruebas de la atribución de voces: es el diferenciador del producto y lo que
// más silenciosamente se puede romper, porque un fallo aquí no truena, solo
// atribuye las frases a quien no las dijo.
const { test } = require('node:test');
const assert = require('node:assert');
const V = require('../lib/voces');

test('un SRT vacío no devuelve segmentos', () => {
  assert.deepStrictEqual(V.parsearSrt(''), []);
});

test('lee un SRT con coma en los milisegundos', () => {
  const seg = V.parsearSrt('1\n00:00:01,500 --> 00:00:04,000\nBuenos días.\n');
  assert.strictEqual(seg.length, 1);
  assert.strictEqual(seg[0].desde, 1.5);
  assert.strictEqual(seg[0].hasta, 4);
  assert.strictEqual(seg[0].texto, 'Buenos días.');
});

test('lee un SRT con punto en los milisegundos', () => {
  const seg = V.parsearSrt('1\n00:00:01.500 --> 00:00:04.000\nBuenos días.\n');
  assert.strictEqual(seg.length, 1);
  assert.strictEqual(seg[0].desde, 1.5);
});

test('junta en una sola línea el texto partido en varias', () => {
  const seg = V.parsearSrt('1\n00:00:00,000 --> 00:00:03,000\nprimera línea\nsegunda línea\n');
  assert.strictEqual(seg[0].texto, 'primera línea segunda línea');
});

test('descarta los bloques sin marca de tiempo en vez de reventar', () => {
  const seg = V.parsearSrt('esto no es un bloque\n\n1\n00:00:00,000 --> 00:00:02,000\nHola.\n');
  assert.strictEqual(seg.length, 1);
});

test('la hora se convierte bien más allá de un minuto', () => {
  const seg = V.parsearSrt('1\n01:02:03,250 --> 01:02:05,000\nTexto.\n');
  assert.strictEqual(seg[0].desde, 3723.25);
});

// --- el margen de 2 dB: el corazón de la decisión ---
test('con las voces encimadas se hereda el hablante anterior', () => {
  // 1 dB de diferencia está por debajo del margen
  const quien = V.decidir({ dbMic: -20, dbSistema: -21, previo: 'Ana', nombreUsuario: 'Yo', nombreOtro: 'Cliente' });
  assert.strictEqual(quien, 'Ana');
});

test('con una voz claramente más fuerte se elige a esa', () => {
  assert.strictEqual(
    V.decidir({ dbMic: -18, dbSistema: -30, previo: 'Cliente', nombreUsuario: 'Yo', nombreOtro: 'Cliente' }), 'Yo');
  assert.strictEqual(
    V.decidir({ dbMic: -30, dbSistema: -18, previo: 'Yo', nombreUsuario: 'Yo', nombreOtro: 'Cliente' }), 'Cliente');
});

test('el margen se aplica justo en el límite', () => {
  const dentro = V.decidir({ dbMic: -20, dbSistema: -21.9, previo: 'Ana', nombreUsuario: 'Yo', nombreOtro: 'Cliente' });
  const fuera  = V.decidir({ dbMic: -20, dbSistema: -22.1, previo: 'Ana', nombreUsuario: 'Yo', nombreOtro: 'Cliente' });
  assert.strictEqual(dentro, 'Ana', 'por debajo del margen debe heredar');
  assert.strictEqual(fuera, 'Yo', 'por encima del margen debe decidir por energía');
  assert.strictEqual(V.MARGEN_DB, 2);
});

test('sin hablante anterior no hay nada que heredar', () => {
  const quien = V.decidir({ dbMic: -20, dbSistema: -20, previo: null, nombreUsuario: 'Yo', nombreOtro: 'Cliente' });
  assert.strictEqual(quien, 'Cliente');
});

// --- agrupación de turnos ---
test('junta frases seguidas del mismo hablante en un turno', () => {
  const segs = [
    { desde: 0, texto: 'Hola.' }, { desde: 2, texto: 'Qué tal.' }, { desde: 4, texto: 'Bien.' }
  ];
  const turnos = V.agrupar(segs, (s) => (s.desde < 4 ? 'Ana' : 'Beto'));
  assert.strictEqual(turnos.length, 2);
  assert.strictEqual(turnos[0].texto, 'Hola. Qué tal.');
  assert.strictEqual(turnos[1].quien, 'Beto');
  assert.strictEqual(turnos[0].desde, 0);
});

test('sin segmentos no hay turnos', () => {
  assert.deepStrictEqual(V.agrupar([], () => 'Ana'), []);
});

test('un solo hablante produce un solo turno', () => {
  const segs = [{ desde: 0, texto: 'Uno.' }, { desde: 1, texto: 'Dos.' }];
  const turnos = V.agrupar(segs, () => 'Ana');
  assert.strictEqual(turnos.length, 1);
});

test('la energía de un tramo sin muestras devuelve silencio', () => {
  assert.strictEqual(V.energiaEn([], 0, 5), -120);
});


// --- pista muda: el fallo que hacía mentir a la minuta en reuniones presenciales ---
// Sin esto, en presencial el audio del sistema queda mudo pero existe, gana
// siempre el micrófono, y TODA la conversación se atribuye a quien grabó.
const envolvente = (n, fn) => Array.from({ length: n }, (_, i) => ({ t: i * 0.064, db: fn(i) }));

test('una pista en silencio digital no cuenta como presente', () => {
  assert.strictEqual(V.pistaAudible(envolvente(1000, () => -120)), false);
});

test('una pista con voz sí cuenta', () => {
  // habla un tercio del tiempo, como cualquiera en una conversación
  assert.strictEqual(V.pistaAudible(envolvente(1000, i => (i % 3 === 0 ? -22 : -70))), true);
});

test('quien habla poco pero habla, cuenta', () => {
  // 2 % del tiempo: el que solo asiente en una llamada de una hora
  assert.strictEqual(V.pistaAudible(envolvente(1000, i => (i % 50 === 0 ? -25 : -110))), true);
});

test('un sonido suelto no convierte una pista muda en pista con voz', () => {
  // una notificación del sistema en toda la reunión
  assert.strictEqual(V.pistaAudible(envolvente(1000, i => (i < 3 ? -20 : -120))), false);
});

test('el ruido de fondo por debajo del umbral no cuenta', () => {
  assert.strictEqual(V.pistaAudible(envolvente(1000, () => -62)), false);
});

test('una envolvente vacía no cuenta', () => {
  assert.strictEqual(V.pistaAudible([]), false);
  assert.strictEqual(V.pistaAudible(null), false);
});

test('los umbrales son los que dice el módulo', () => {
  assert.strictEqual(V.UMBRAL_DB, -55);
  assert.strictEqual(V.FRACCION_MINIMA, 0.01);
});

// ---------- pistaConVoz: ¿es un segundo participante, o media? ----------
// pistaAudible mide señal, no voz, y ya falló en producción: en una reunión
// presencial el Mac reprodujo media en tres islas, la pista del sistema pasó el
// 1 %, y dos turnos se atribuyeron a un cliente que no estaba. Ninguna métrica
// de forma de onda separa voz de media (los vídeos contienen voz); lo que
// separa es la estructura temporal: un participante habla repartido.
const DT = 0.0213;   // el paso REAL de la envolvente (~21 ms), no los 64 ms que decía el código
const env = (segundos, fn, dt = DT) => {
  const n = Math.round(segundos / dt);
  return Array.from({ length: n }, (_, i) => ({ t: i * dt, db: fn(i * dt) }));
};
const srtCada = (segundos, paso = 4) => {
  const out = []; for (let t = 0; t < segundos; t += paso) out.push({ desde: t, hasta: t + paso - 0.5, texto: 'x' });
  return out;
};

test('una voz repartida por toda la reunión tiene dispersión ~1', () => {
  const voz = env(600, t => (Math.floor(t) % 3 === 0 ? -22 : -70));
  assert.ok(V.dispersion(voz) > 0.9);
});

test('el silencio digital tiene dispersión 0', () => {
  assert.strictEqual(V.dispersion(env(600, () => -120)), 0);
});

// Reproducción sintética del fallo real: 47 min, tres ráfagas de ~25 s.
test('media en tres islas NO cuenta como participante (el caso real)', () => {
  const dur = 47 * 60;
  const isla = t => (t > 1032 && t < 1057) || (t > 2628 && t < 2653) || (t > 2718 && t < 2743);
  const sis = env(dur, t => (isla(t) ? -20 : -120));
  const mic = env(dur, t => (Math.floor(t) % 3 === 0 ? -25 : -60));
  assert.strictEqual(V.pistaAudible(sis), true, 'pistaAudible sí la daba por buena: ese era el bug');
  assert.ok(V.dispersion(sis) < 0.25, 'dispersión ' + V.dispersion(sis).toFixed(3));
  assert.strictEqual(V.pistaConVoz(sis, mic, srtCada(dur)), false);
});

test('el otro lado de una videollamada SÍ cuenta, aunque hable poco', () => {
  const dur = 1800;
  // habla ~1 de cada 4 segmentos, repartido
  const sis = env(dur, t => (Math.floor(t / 4) % 4 === 0 ? -24 : -120));
  const mic = env(dur, t => (Math.floor(t / 4) % 4 !== 0 ? -24 : -70));
  assert.strictEqual(V.pistaConVoz(sis, mic, srtCada(dur)), true);
});

test('música continua que gana TODOS los segmentos no cuenta', () => {
  const dur = 1200;
  const sis = env(dur, () => -15);          // constante y fuerte
  const mic = env(dur, () => -40);
  assert.strictEqual(V.pistaConVoz(sis, mic, srtCada(dur)), false, 'gana el 100 %: eso no es un interlocutor');
});

test('el veredicto no depende del paso de la envolvente', () => {
  const dur = 1200, f = t => (Math.floor(t) % 3 === 0 ? -22 : -70);
  const fino = env(dur, f, 0.0213), grueso = env(dur, f, 0.064);
  assert.strictEqual(V.dispersion(fino) > 0.9, V.dispersion(grueso) > 0.9);
});

test('una grabación de 9 segundos no revienta', () => {
  const sis = env(9, () => -120), mic = env(9, () => -25);
  assert.strictEqual(V.pistaConVoz(sis, mic, srtCada(9, 3)), false);
  assert.strictEqual(V.dispersion([]), 0);
  assert.strictEqual(V.dispersion([{ t: 0, db: -20 }]), 0);
});

test('los umbrales son los que dice el módulo', () => {
  assert.strictEqual(V.DISPERSION_MINIMA, 0.25);
  assert.deepStrictEqual(V.BANDA_SEGMENTOS, [0.10, 0.90]);
});

// Este caso es el que SOLO la dispersión atrapa: dos islas de media de 3 min
// en media hora (140 s cada una). Dentro gana todos los segmentos y la fracción total
// (~0.16) cae dentro de la banda [0.10, 0.90]; lo que la descarta es que ocupa
// 2 de 12 bloques. Límite honesto: islas aún más largas suben la dispersión
// por encima de 0.25 y son indistinguibles de un participante real.
test('islas que ganan bastantes segmentos siguen sin contar (solo la dispersión lo ve)', () => {
  const dur = 1800;
  const isla = t => (t >= 200 && t < 340) || (t >= 1100 && t < 1240);
  const sis = env(dur, t => (isla(t) ? -15 : -120));
  const mic = env(dur, t => (isla(t) ? -70 : -25));
  const f = V.fraccionSegmentosGanados(sis, mic, srtCada(dur));
  assert.ok(f >= 0.10 && f <= 0.90, 'debe caer en la banda para que la prueba sea de dispersión: ' + f.toFixed(2));
  assert.ok(V.dispersion(sis) < 0.25, 'dispersión ' + V.dispersion(sis).toFixed(3));
  assert.strictEqual(V.pistaConVoz(sis, mic, srtCada(dur)), false);
});
