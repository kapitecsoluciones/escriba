// El diagnóstico que alguien pega en un chat para reportar que algo falló.
// Puro (sin fs ni Electron), así que se prueba con datos armados a mano.
const { test } = require('node:test');
const assert = require('node:assert');
const DIAGNOSTICO = require('../lib/diagnostico');

// No es la carpeta personal de nadie ni nada que exista en este disco: sirve
// solo para probar que ocultarRutas sustituye una cadena literal.
const HOME_PRUEBA = '/casa/prueba';

const datosCompletos = {
  version: '0.9.0',
  macos: { version: '14.6', build: '23G80' },
  chip: 'Apple M2 Pro (arm64)',
  binarios: {
    ffmpeg: { encontrado: true, version: '6.1.1' },
    whisper: { encontrado: true, version: null },
    claude: { encontrado: true, version: '1.2.3' },
    codex: { encontrado: false, version: null },
    ollama: { encontrado: true, version: '0.3.10' },
  },
  modelo: { presente: true, tamano: 1610612736 }, // ~1.5 GB
  motorTipo: 'automatico',
  motores: [
    { id: 'automatico', nombre: 'Automático', disponible: true },
    { id: 'claude-cli', nombre: 'Claude Code', disponible: true },
    { id: 'codex-cli', nombre: 'Codex', disponible: false },
    { id: 'api', nombre: 'Llave propia', disponible: false },
    { id: 'ollama', nombre: 'Modelo local (Ollama)', disponible: true },
  ],
  permisos: { microfono: 'granted', pantalla: 'not-determined' },
  rutas: { reuniones: `${HOME_PRUEBA}/Escriba`, config: `${HOME_PRUEBA}/.config/escriba` },
  ultimoError: { mensaje: 'ffmpeg terminó con código 1', hora: '5/9/2026, 14:32:10' },
};

test('formatear con datos completos: cada dato pedido aparece, cada binario ausente sale como "no encontrado"', () => {
  const texto = DIAGNOSTICO.formatear(datosCompletos);
  assert.match(texto, /^Escriba 0\.9\.0$/m);
  assert.match(texto, /macOS 14\.6 \(build 23G80\) · Chip Apple M2 Pro \(arm64\)/);
  assert.match(texto, /ffmpeg sí \(6\.1\.1\)/);
  // whisper-cli está pero sin versión obtenible: "sí" a secas, sin paréntesis vacíos
  assert.match(texto, /whisper-cli sí(?! \()/);
  assert.doesNotMatch(texto, /whisper-cli sí \(/);
  assert.match(texto, /codex no encontrado/);
  assert.match(texto, /Modelo de transcripción: sí \(1\.5 GB\)/);
  assert.match(texto, /Motor elegido: Automático — disponibilidad: .*Claude Code sí.*Codex no/);
  assert.match(texto, /Permiso de micrófono: concedido · Permiso de grabación de pantalla: sin pedir/);
  assert.match(texto, new RegExp(`Carpeta de reuniones: ${HOME_PRUEBA}/Escriba`));
  assert.match(texto, new RegExp(`Carpeta de configuración: ${HOME_PRUEBA}/\\.config/escriba`));
  assert.match(texto, /Último error: ffmpeg terminó con código 1 \(5\/9\/2026, 14:32:10\)/);
  // ~10 líneas: separadores incluidos, sin desbordarse a un muro de texto
  assert.ok(texto.split('\n').length <= 12, 'el diagnóstico debe caber en unas 10-12 líneas');
});

test('formatear con datos faltantes: nada revienta y todo cae a "no encontrado" / "desconocido"', () => {
  const texto = DIAGNOSTICO.formatear({});
  assert.match(texto, /^Escriba desconocida$/m);
  assert.match(texto, /macOS desconocido · Chip desconocido/);
  // los 5 binarios "no encontrado" + el modelo "no encontrado" = 6
  assert.strictEqual((texto.match(/no encontrado/g) || []).length, 6);
  assert.match(texto, /Motor elegido: desconocido — disponibilidad: sin datos/);
  assert.match(texto, /Permiso de micrófono: sin pedir · Permiso de grabación de pantalla: sin pedir/);
  assert.match(texto, /Carpeta de reuniones: desconocida/);
  assert.match(texto, /Carpeta de configuración: desconocida/);
  assert.match(texto, /Último error: ninguno registrado/);
});

test('formatear sin datos (undefined) tampoco revienta', () => {
  assert.doesNotThrow(() => DIAGNOSTICO.formatear());
  assert.match(DIAGNOSTICO.formatear(), /Último error: ninguno registrado/);
});

test('los permisos del sistema se traducen a español', () => {
  const f = (microfono, pantalla) => DIAGNOSTICO.formatear({ permisos: { microfono, pantalla } });
  assert.match(f('granted', 'denied'), /Permiso de micrófono: concedido · Permiso de grabación de pantalla: denegado/);
  // 'restricted' (perfil gestionado) se trata como denegado, no como "sin pedir"
  assert.match(f('restricted', 'not-determined'), /Permiso de micrófono: denegado · Permiso de grabación de pantalla: sin pedir/);
  // un valor que no reconoce (o que no vino) cae a "sin pedir", nunca truena
  assert.match(f('algo-que-no-existe', undefined), /Permiso de micrófono: sin pedir · Permiso de grabación de pantalla: sin pedir/);
});

test('ocultarRutas sustituye el home dentro de rutas largas, aunque se repita varias veces', () => {
  const texto = [
    `Carpeta de reuniones: ${HOME_PRUEBA}/Escriba/cliente-x/2026-09-05_1200`,
    `Carpeta de configuración: ${HOME_PRUEBA}/.config/escriba`,
    `Último error: no se pudo leer ${HOME_PRUEBA}/Escriba/otro-cliente/mezcla.m4a (permiso denegado)`,
  ].join('\n');
  const oculto = DIAGNOSTICO.ocultarRutas(texto, HOME_PRUEBA);
  assert.ok(!oculto.includes(HOME_PRUEBA), 'no debe quedar ningún rastro literal del home');
  assert.match(oculto, /~\/Escriba\/cliente-x\/2026-09-05_1200/);
  assert.match(oculto, /~\/\.config\/escriba/);
  assert.match(oculto, /~\/Escriba\/otro-cliente\/mezcla\.m4a \(permiso denegado\)/);
});

test('ocultarRutas con home vacío (o ausente) no sustituye nada', () => {
  const texto = `Carpeta de reuniones: ${HOME_PRUEBA}/Escriba`;
  assert.strictEqual(DIAGNOSTICO.ocultarRutas(texto, ''), texto);
  assert.strictEqual(DIAGNOSTICO.ocultarRutas(texto, null), texto);
  assert.strictEqual(DIAGNOSTICO.ocultarRutas(texto, undefined), texto);
});

test('ocultarRutas con texto vacío o ausente no revienta', () => {
  assert.strictEqual(DIAGNOSTICO.ocultarRutas('', HOME_PRUEBA), '');
  assert.strictEqual(DIAGNOSTICO.ocultarRutas(undefined, HOME_PRUEBA), '');
});
