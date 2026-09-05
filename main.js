const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, Notification, clipboard, Menu, nativeTheme, ShareMenu } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const R = require('./lib/rutas');
const BIN = R.BIN;
const CONFIG = require('./lib/config');
const PROMPT = require('./lib/prompt');
const PDF = require('./lib/pdf');
const MD = require('./lib/md');
const MINUTA = require('./lib/minuta');
const VOCES = require('./lib/voces');
const MOTORES = require('./lib/motores');
const REDACCION = require('./lib/redaccion');
const { quitarDelDossier } = require('./lib/dossier');
const MEMORIA = require('./lib/memoria');
const INDICE = require('./lib/indice');
const MARCA = require('./lib/marca');
const ATOMICO = require('./lib/atomico');
const MIGRACION = require('./lib/migracion');
const PREPARACION = require('./lib/preparacion');
const { fechaDeCarpeta, ventana } = require('./lib/fechas');

let win = null;
// Versión del formato de dialogo.txt. Sube cuando cambia el criterio de
// atribución: un diálogo cacheado con un criterio viejo se descarta en vez
// de servirse para siempre (pasó: una atribución falsa se habría reutilizado
// en cada "Volver a redactar").
const VERSION_DIALOGO = '<!-- escriba:dialogo:2 -->';
let captura = null;          // proceso de grabación en curso
let carpetaActual = null;
let clienteActivo = null;    // {slug, nombre} — lo informa el renderer

const notificar = (titulo, cuerpo) => {
  try { new Notification({ title: titulo, body: cuerpo, silent: false }).show(); } catch {}
};

// Sello de tiempo en hora local. Con toISOString() una reunión de las 17:41
// quedaba archivada como del día siguiente a las 00:41.
// Con resolución de minuto, dos grabaciones seguidas dentro del mismo minuto
// compartían carpeta: la segunda truncaba el .m4a de la primera y, si esta ya
// se había procesado, heredaba su transcripción y redactaba la minuta del audio
// nuevo con el texto del viejo. Los segundos lo cierran.
function sello() {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}

function crearVentana() {
  // Recuperar el tamaño y la posición de la última vez. Si la pantalla donde
  // estaba ya no existe (se desconectó un monitor), Electron la recoloca solo.
  const guardada = CONFIG.leer().ventana || {};
  win = new BrowserWindow({
    width: guardada.ancho || 1180, height: guardada.alto || 780,
    x: Number.isInteger(guardada.x) ? guardada.x : undefined,
    y: Number.isInteger(guardada.y) ? guardada.y : undefined,
    minWidth: 900, minHeight: 600,
    titleBarStyle: 'hiddenInset',
    // sin esto la ventana parpadea en blanco al abrirse con el sistema en oscuro
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0F131A' : '#F7F9FC',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  let guardar = null;
  const recordar = () => {
    clearTimeout(guardar);
    guardar = setTimeout(() => {
      if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      const b = win.getNormalBounds();
      try { CONFIG.guardar({ ventana: { ancho: b.width, alto: b.height, x: b.x, y: b.y } }); } catch {}
    }, 500);
  };
  win.on('resize', recordar); win.on('move', recordar);
  // Sin esto, durante los 9 s en que before-quit espera al capturador seguían
  // llegando eventos NIVEL y `win.webContents.send` reventaba el proceso
  // principal sobre un objeto destruido — justo en la ventana que existe para
  // cerrar bien el contenedor M4A.
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // primera vez: se abre directamente en Ajustes para configurar lo mínimo
  if (!CONFIG.configurado()) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => { if (win && !win.isDestroyed()) win.webContents.executeJavaScript('window.abrirAjustes && window.abrirAjustes()').catch(() => {}); }, 400);
    });
  }
}

// En modo autoprueba el avance también se escribe a un archivo: es la única
// forma de comprobar sin ojos que la barra de progreso avanza de verdad.
const avisar = (etapa, detalle = '', pct = null) => {
  if (process.env.ESCRIBA_AUTOPRUEBA === '1') {
    try { fs.appendFileSync('/private/tmp/AUTOPRUEBA-progreso.log',
      `${new Date().toISOString()} ${etapa} ${pct == null ? '-' : pct + '%'} ${detalle}\n`); } catch {}
  }
  return win && win.webContents.send('progreso', { etapa, detalle, pct });
};

// Un handler que lanza deja al renderer esperando para siempre. Todos devuelven
// {ok:false,error} en vez de reventar.
const seguro = (fn) => async (...a) => {
  try { const r = await fn(...a); return (r && typeof r === 'object') ? r : { ok: true, valor: r }; }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
};

// ---------- trabajo en curso ----------
// Procesar una reunión encadena varios subprocesos: ffmpeg, whisper y el motor de
// redacción. Se registran todos aquí para que Cancelar pueda detenerlos de verdad.
let trabajo = null;
class Cancelado extends Error { constructor() { super('Cancelado'); this.cancelado = true; } }
const punto = () => { if (trabajo && trabajo.cancelado) throw new Cancelado(); };

// Lanza un proceso y espera. A diferencia de execFile, entrega stderr línea a línea
// mientras corre: de ahí sale el avance real de whisper, que antes se tiraba.
function correr(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    let p;
    try { p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return rej(e); }
    const t = trabajo; if (t) t.hijos.add(p);
    let so = '', se = '', resto = '';
    // hay que drenar las dos tuberías aunque no se lean: si se llenan, el hijo se bloquea
    p.stdout.on('data', (b) => { so += b; if (so.length > 8e6) so = so.slice(-4e6); });
    p.stderr.on('data', (b) => {
      const txt = b.toString();
      se += txt; if (se.length > 8e6) se = se.slice(-4e6);
      if (!opts.alLeer) return;
      resto += txt;
      const lineas = resto.split('\n'); resto = lineas.pop();
      for (const l of lineas) { try { opts.alLeer(l); } catch {} }
    });
    p.on('error', (e) => { if (t) t.hijos.delete(p); rej(e); });
    p.on('close', (code) => {
      if (t) t.hijos.delete(p);
      if (t && t.cancelado) return rej(new Cancelado());
      if (code === 0) return res(so);
      // el motivo real está al final de stderr; sin esto el fallo reaparecía dos
      // líneas después disfrazado de "no existe el archivo"
      const cola = se.trim().split('\n').filter(Boolean).slice(-4).join(' ').slice(0, 400);
      rej(new Error(cola || `${path.basename(cmd)} terminó con código ${code}`));
    });
  });
}

// ---------- consultas ----------
ipcMain.handle('clientes', () => INDICE.clientes());
ipcMain.handle('config-leer', () => CONFIG.leer());
ipcMain.handle('config-guardar', (_e, parcial) => CONFIG.guardar(parcial));
// La marca del PDF: existía en config y Ajustes no tenía campo para ella.
ipcMain.handle('marca-vista', seguro(() => MARCA.vista()));
ipcMain.handle('marca-quitar-logo', seguro(() => MARCA.quitarLogo()));
ipcMain.handle('marca-elegir-logo', seguro(async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Elige tu logo', properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: true, cancelado: true };
  return MARCA.instalarLogo(r.filePaths[0]);
}));
ipcMain.handle('motores-estado', () => MOTORES.estado());
ipcMain.handle('motor-probar', async (_e, id) => MOTORES.porId(id).probar());
ipcMain.handle('guardar-llave', async (_e, { proveedor, llave }) => {
  await require('./lib/motores/api').guardarLlave(proveedor, llave); return { ok: true };
});
// Entradas de audio del equipo. Con el iPhone cerca y Continuity activo, su
// micrófono aparece aquí como una más y se puede elegir sin cambiar la
// configuración de sonido de todo el Mac.
ipcMain.handle('micros', seguro(async () => {
  const bin = BIN().captura;
  if (!bin) return { ok: false, error: 'No se encontró el capturador de audio.' };
  const salida = await correr(bin, ['--micros']);
  return { ok: true, micros: JSON.parse(salida || '[]') };
}));

// La captura del micrófono vive tras `#available(macOS 15.0, *)` en el binario
// Swift. En 13 o 14 no hay pista de micrófono EN ABSOLUTO: una reunión presencial
// sale muda y una videollamada graba solo al otro lado. El README anunciaba 13+.
const soportaMicrofono = () => {
  try { return parseInt(process.getSystemVersion(), 10) >= 15; } catch { return true; }
};
ipcMain.handle('soporta-microfono', () => ({ ok: true, si: soportaMicrofono(),
                                             version: process.getSystemVersion() }));

ipcMain.handle('diagnostico', () => ({ faltantes: R.faltantes(), binarios: R.BIN(), configurado: CONFIG.configurado(),
                                        configRoto: CONFIG.corrupcion() }));

// Descarga del modelo de transcripción (1.5 GB) con progreso, sin terminal.
ipcMain.handle('descargar-modelo', async () => {
  const destino = CONFIG.leer().rutas.modelo;
  const url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin';
  try {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const r = await fetch(url);
    if (!r.ok) throw new Error('La descarga respondió ' + r.status);
    const total = Number(r.headers.get('content-length')) || 0;
    const parcial = destino + '.parcial';
    const salida = fs.createWriteStream(parcial);
    let recibido = 0, ultimo = 0;
    for await (const trozo of r.body) {
      salida.write(Buffer.from(trozo));
      recibido += trozo.length;
      const pct = total ? Math.round(recibido / total * 100) : 0;
      if (pct !== ultimo) { ultimo = pct; if (win) win.webContents.send('descarga', { pct, recibido, total }); }
    }
    salida.end();
    await new Promise(res => salida.on('close', res));
    // Si el servidor corta la conexión limpiamente a mitad, el bucle termina sin
    // excepción: un .bin incompleto de 1,5 GB quedaba instalado como válido y
    // whisper fallaba después con un error que la app atribuía a otra cosa.
    if (total && recibido !== total) {
      try { fs.unlinkSync(parcial); } catch {}
      return { ok: false, error: `La descarga se cortó: llegaron ${Math.round(recibido / 1e6)} MB de ${Math.round(total / 1e6)} MB. Vuelve a intentarlo.` };
    }
    fs.renameSync(parcial, destino);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Instala una dependencia con Homebrew, mostrando la salida en la app.
ipcMain.handle('instalar-dependencia', async (_e, formula) => {
  const brew = R.buscarBinario('brew');
  if (!brew) return { ok: false, error: 'No se encontró Homebrew. Instálalo desde brew.sh y vuelve a intentarlo.' };
  return new Promise((res) => {
    const p = spawn(brew, ['install', formula]);
    let salida = '';
    const pasar = (b) => { salida += b.toString(); if (win) win.webContents.send('instalando', { formula, linea: b.toString().trim().slice(-160) }); };
    p.stdout.on('data', pasar); p.stderr.on('data', pasar);
    p.on('exit', (code) => res({ ok: code === 0, salida: salida.slice(-800) }));
  });
});
ipcMain.handle('cliente-activo', (_e, c) => { clienteActivo = c; });
ipcMain.handle('reuniones', (_e, slug) => INDICE.reuniones(slug));
// "qué le debo a este cliente": existía para el prompt de Preparar y no se veía en ningún sitio
ipcMain.handle('pendientes', (_e, slug) => INDICE.pendientes(slug));
ipcMain.handle('crear-cliente', (_e, d) => {
  const nombre = typeof d === 'string' ? d : (d && d.nombre);
  const expediente = typeof d === 'string' ? null : (d && d.expediente);
  return R.crearCliente(nombre, expediente);
});
ipcMain.handle('expedientes', () => R.expedientes());
ipcMain.handle('enlazar-expediente', seguro((_e, { slug, archivo }) => R.enlazarExpediente(slug, archivo || null)));

// ---------- grabación ----------
// El micrófono que toca según el modo. Cambiarlo a mano en Ajustes para cada
// tipo de reunión era un viaje que nadie hacía: la de hoy se grabó con el micro
// del Mac teniendo el iPhone al lado.
function microParaModo(modo) {
  const g = CONFIG.leer().grabacion || {};
  return modo === 'presencial' ? (g.microfonoPresencial || '') : (g.microfono || '');
}

ipcMain.handle('grabar-iniciar', async (_e, slug, opciones = {}) => {
  if (captura) return { ok: false, error: 'Ya hay una grabación en curso' };
  if (!BIN().captura) return { ok: false, error: 'No se encontró el capturador de audio. Reinstala la app.' };
  carpetaActual = path.join(R.BASE(), R.exigirSlug(slug), sello());
  fs.mkdirSync(carpetaActual, { recursive: true });
  const modo = opciones.modo === 'presencial' ? 'presencial' : 'llamada';
  CONFIG.guardar({ grabacion: { modo } });   // se recuerda para la próxima
  const micro = microParaModo(modo);
  const argsCaptura = [path.join(carpetaActual, 'sistema.m4a')];
  if (micro) argsCaptura.push('--mic', micro);
  // El modo queda con la reunión: al procesar, el prompt sabe qué esperar sin
  // tener que adivinarlo por las pistas.
  try { ATOMICO.escribirAtomico(path.join(carpetaActual, '.reunion.json'), JSON.stringify({ modo }, null, 2)); } catch {}
  captura = spawn(BIN().captura, argsCaptura);
  let resto = '';
  captura.stderr.on('data', (b) => {
    resto += b.toString();
    const lineas = resto.split('\n'); resto = lineas.pop();
    for (const l of lineas) {
      const m = l.match(/^NIVEL sis=([\d.]+) mic=([\d.]+)/);
      if (m && win) { win.webContents.send('niveles', { sistema: +m[1], microfono: +m[2] }); continue; }
      // avisos de la captura: se muestran en la interfaz al instante
      const fallo = l.match(/^FALLO_ESCRITURA (.+)/);
      if (fallo && win) {
        win.webContents.send('captura-aviso', { tipo: 'fallo', texto: fallo[1] });
        notificar('La grabación no se está guardando', fallo[1]);
        continue;
      }
      const disco = l.match(/^DISCO (\d+)/);
      if (disco && win) win.webContents.send('captura-aviso', { tipo: 'disco', mb: +disco[1] });
      // Con qué micrófono se está grabando. Enterarse al empezar y no al final
      // es la diferencia entre repetir una junta y no repetirla.
      const cual = l.match(/^MICROFONO (.+)/);
      if (cual && win) win.webContents.send('captura-aviso', { tipo: 'microfono', texto: cual[1] });
      if (/^MICROFONO_AUSENTE /.test(l) && win) {
        win.webContents.send('captura-aviso', { tipo: 'microfono-ausente' });
      }
    }
  });
  let errorArranque = '';
  captura.stderr.on('data', (b) => { const t = b.toString(); const e = t.match(/^ERROR: (.+)/m); if (e) errorArranque = e[1]; });
  captura.on('exit', (code) => {
    captura = null;
    if (code !== 0 && errorArranque && win) {
      win.webContents.send('captura-aviso', { tipo: 'fallo', texto: errorArranque });
    }
  });
  // Esperar la confirmación real de arranque: antes se decía "Grabando" aunque
  // faltara el permiso de Grabación de Pantalla, y no se grababa nada.
  const arranque = await new Promise((res) => {
    const t = setTimeout(() => res({ ok: true }), 6000);   // arrancó sin decir nada: se acepta
    const ver = (b) => {
      const txt = b.toString();
      if (/captura iniciada/.test(txt)) { clearTimeout(t); captura.stderr.off('data', ver); res({ ok: true }); }
      const e = txt.match(/^ERROR: (.+)/m);
      if (e) { clearTimeout(t); captura.stderr.off('data', ver); res({ ok: false, error: e[1] }); }
    };
    if (captura) captura.stderr.on('data', ver); else res({ ok: false, error: 'No arrancó el capturador' });
    if (captura) captura.once('error', (err) => { clearTimeout(t); res({ ok: false, error: err.message }); });
    if (captura) captura.once('exit', (code) => { if (code !== 0) { clearTimeout(t); res({ ok: false, error: errorArranque || 'El capturador terminó inesperadamente' }); } });
  });
  if (!arranque.ok) {
    try { captura && captura.kill('SIGINT'); } catch {} captura = null;
    // La carpeta se crea antes de saber si la captura arranca. Si no arrancó,
    // dejarla ahí llenaba la lista del cliente de reuniones fantasma vacías,
    // etiquetadas además como "Solo audio" cuando no hay ningún audio.
    try { if (fs.readdirSync(carpetaActual).length === 0) fs.rmdirSync(carpetaActual); } catch {}
    carpetaActual = null;
    return arranque;
  }
  if (!soportaMicrofono() && win) {
    win.webContents.send('captura-aviso', { tipo: 'sin-microfono', texto: process.getSystemVersion() });
  }
  return { ok: true, carpeta: carpetaActual, inicio: Date.now() };
});

ipcMain.handle('grabar-detener', async () => {
  if (!captura) return { ok: false, error: 'La grabación se había detenido sola. Revisa si quedó audio en la carpeta de la reunión.' };
  const proc = captura;
  await new Promise(res => { proc.once('exit', res); proc.kill('SIGINT'); setTimeout(res, 8000); });
  captura = null;
  // Si no quedó nada escrito, no dejar la carpeta vacía en el historial.
  try {
    if (carpetaActual && fs.readdirSync(carpetaActual).length === 0) {
      fs.rmdirSync(carpetaActual);
      return { ok: false, error: 'No se grabó nada. Revisa el permiso de Grabación de Pantalla y el micrófono.' };
    }
  } catch {}
  return { ok: true, carpeta: carpetaActual };
});

// ---------- procesamiento ----------
async function mezclar(carpeta) {
  const yaMezclado = path.join(carpeta, 'mezcla.m4a');
  const sis = path.join(carpeta, 'sistema.m4a');
  const micOrig = path.join(carpeta, 'sistema.mic.m4a');
  const mic = path.join(carpeta, 'microfono.m4a');
  if (fs.existsSync(micOrig)) fs.renameSync(micOrig, mic);
  const salida = path.join(carpeta, 'mezcla.m4a');
  const haySis = fs.existsSync(sis) && fs.statSync(sis).size > 1000;
  const hayMic = fs.existsSync(mic) && fs.statSync(mic).size > 1000;
  // audio importado: ya viene en una sola pista, no hay nada que mezclar
  if (!haySis && !hayMic) {
    if (fs.existsSync(yaMezclado) && fs.statSync(yaMezclado).size > 1000) return yaMezclado;
    throw new Error('No se grabó audio. Revisa el permiso de Grabación de Pantalla.');
  }
  if (haySis && hayMic) {
    await correr(BIN().ffmpeg, ['-nostdin', '-loglevel', 'error', '-y', '-i', mic, '-i', sis,
      '-filter_complex', '[0:a]aresample=async=1[a0];[1:a]aresample=async=1[a1];[a0][a1]amix=inputs=2:duration=longest:normalize=0[out]',
      '-map', '[out]', '-c:a', 'aac', '-b:a', '96k', salida]);
  } else {
    fs.copyFileSync(haySis ? sis : mic, salida);
  }
  return salida;
}

async function duracion(archivo) {
  try {
    const s = await correr(BIN().ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', archivo]);
    const seg = parseFloat(s);
    if (!Number.isFinite(seg)) return { texto: 'desconocida', segundos: null };
    return { texto: `${Math.floor(seg / 60)} min ${String(Math.floor(seg % 60)).padStart(2, '0')} s`, segundos: seg };
  } catch { return { texto: 'desconocida', segundos: null }; }
}

async function procesarInterno({ carpeta, slug, nombre, reemplazarMemoria = false }) {
  // la autoprueba entra por aquí directamente: sin esto no ejercitaría ni la
  // cancelación ni el registro de subprocesos, que es justo lo que se quiere probar
  if (!trabajo) trabajo = { hijos: new Set(), cancelado: false, ac: new AbortController(), carpeta };
  try {
    avisar('mezclando', 'Uniendo tu voz y el audio del Mac');
    const mezcla = await mezclar(carpeta);
    const dur = await duracion(mezcla);
    punto();   // duracion() se traga sus errores, incluida la cancelación

    const base = path.join(carpeta, 'mezcla');
    // Si ya se transcribió antes (p. ej. falló la redacción), no se repite:
    // una hora de audio cuesta ~10 min de whisper.
    const yaTranscrito = fs.existsSync(base + '.txt') && fs.statSync(base + '.txt').size > 40;
    if (yaTranscrito) {
      avisar('transcribiendo', 'Ya estaba transcrita, se reutiliza');
    } else {
    avisar('transcribiendo', 'Puede tardar ~1 minuto por cada 10 de reunión', 0);
    const wav = path.join(os.tmpdir(), `mezcla-${Date.now()}.wav`);
    await correr(BIN().ffmpeg, ['-nostdin', '-loglevel', 'error', '-y', '-i', mezcla, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    punto();
    // -mc 0 evita los bucles de repetición en audios largos.
    // -pp imprime el avance por stderr: es lo que alimenta la barra de progreso.
    await correr(BIN().whisper, ['-m', BIN().modelo, '-f', wav, '-l', 'es', '-mc', '0', '-pp',
      '--output-txt', '--output-srt', '--output-file', base], {
      alLeer: (l) => {
        const m = l.match(/progress\s*=\s*(\d+)%/);
        if (m) avisar('transcribiendo', 'Transcribiendo el audio', +m[1]);
      }
    });
    try { fs.unlinkSync(wav); } catch {}
    }
    let transcripcion = fs.readFileSync(base + '.txt', 'utf8');

    // Sin esto, una grabación muda pasaba entera: mezclar() solo exige 1000 bytes
    // y una hora de silencio en AAC pesa megabytes, así que se le pedía la minuta
    // al modelo con la transcripción vacía. Cuesta minutos de motor y produce un
    // documento que se guarda, se exporta y se anexa al expediente.
    const utiles = transcripcion.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    // 30, no 80: "Sí, cerramos en 250 mil. Firmamos el jueves." son 44 caracteres
    // y es una reunión real. Lo que se rechaza es el silencio, no la brevedad.
    if (utiles.length < 30) {
      throw new Error('La transcripción está vacía: ' +
        `${utiles.length} caracteres con voz. No se redacta una minuta de eso. ` +
        'Si la reunión sí ocurrió, revisa qué micrófono se usó y los permisos de grabación.');
    }

    // Si se grabó con la app hay dos pistas: se puede saber quién dijo cada cosa
    let atribuida = null;
    try {
      avisar('atribuyendo', 'Separando quién dijo cada cosa');
      const yaDialogo = path.join(carpeta, 'dialogo.txt');
      const previo = fs.existsSync(yaDialogo) ? fs.readFileSync(yaDialogo, 'utf8') : '';
      if (previo.startsWith(VERSION_DIALOGO) && previo.length > VERSION_DIALOGO.length + 40) {
        atribuida = previo.slice(VERSION_DIALOGO.length + 1);
      } else
      atribuida = await VOCES.atribuir({
        ffmpeg: BIN().ffmpeg, srt: base + '.srt',
        mic: path.join(carpeta, 'microfono.m4a'),
        sistema: path.join(carpeta, 'sistema.m4a'),
        nombreUsuario: CONFIG.leer().usuario.nombre || 'Yo', nombreOtro: nombre,
        registrar: (p) => { if (trabajo) trabajo.hijos.add(p); p.on('close', () => { if (trabajo) trabajo.hijos.delete(p); }); }
      });
      if (atribuida) {
        ATOMICO.escribirAtomico(path.join(carpeta, 'dialogo.txt'), VERSION_DIALOGO + '\n' + atribuida);
        transcripcion = atribuida;
      }
    } catch (e) { /* si falla, seguimos con la transcripción plana */ }

    punto();
    avisar('redactando', `Escribiendo la minuta con ${MOTORES.activo().nombre}`);
    // por alias también: un cliente fusionado desde dos carpetas se quedaba sin
    // expediente al redactar, en silencio
    const cli = R.clientes().find(c => c.slug === slug || (c.alias || []).includes(slug));
    let dossier = null;
    if (cli && cli.dossier) { try { dossier = fs.readFileSync(cli.dossier, 'utf8'); } catch {} }
    const dirMemoria = R.dirCanonica(slug);
    const memoria = MEMORIA.leer(dirMemoria);
    let modoReunion = null;
    try { modoReunion = JSON.parse(fs.readFileSync(path.join(carpeta, '.reunion.json'), 'utf8')).modo || null; } catch {}
    const prompt = PROMPT.construir({
      cliente: nombre, modo: modoReunion,
      fecha: fechaDeCarpeta(carpeta).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
      duracion: dur.texto, horario: ventana(carpeta, dur.segundos),
      transcripcion, dossier, memoria, conHablantes: !!atribuida
    });
    const { minuta } = await REDACCION.redactarYGuardar({
      motor: MOTORES.activo(), prompt, carpeta,
      senal: trabajo && trabajo.ac.signal,
      alIntentar: (m) => avisar('redactando', `Escribiendo la minuta con ${m.nombre}`),
      antesDeGuardar: punto,
    });

    avisar('guardando', 'Guardando lo acordado en la memoria del cliente');
    const res = MEMORIA.anotar({
      dirCliente: dirMemoria, id: path.basename(carpeta),
      reemplazar: !!reemplazarMemoria,
      fecha: fechaDeCarpeta(carpeta).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
      minuta, carpeta
    });

    avisar('listo', '');
    notificar('Minuta lista', `${nombre} · ${dur.texto}. Ya puedes revisarla y exportar el PDF.`);
    return { ok: true, minuta, transcripcion, duracion: dur.texto, carpeta, dossier: res };
  } catch (e) {
    // cancelar es una decisión del usuario, no un fallo: no se le enseña un error rojo
    if (e.cancelado || (trabajo && trabajo.cancelado)) {
      avisar('cancelado', '');
      return { ok: false, cancelado: true };
    }
    avisar('error', e.message);
    notificar('No se pudo procesar', e.message);
    return { ok: false, error: e.message };
  } finally {
    trabajo = null;
  }
}

ipcMain.handle('procesar', (_e, d) => {
  if (trabajo) return { ok: false, error: 'Ya hay una reunión procesándose. Espera a que termine o cancélala.' };
  trabajo = { hijos: new Set(), cancelado: false, ac: new AbortController(), carpeta: d && d.carpeta };
  return procesarInterno(d);
});

ipcMain.handle('proceso-en-curso', () => ({ ok: true, activo: !!trabajo, carpeta: trabajo && trabajo.carpeta }));

// Cancelar de verdad: sin esto, matar whisper dejaba el proceso huérfano comiendo CPU.
ipcMain.handle('cancelar-proceso', () => {
  const t = trabajo;
  if (!t) return { ok: false, error: 'No hay nada en curso' };
  t.cancelado = true;
  try { t.ac.abort(); } catch {}
  for (const p of t.hijos) { try { p.kill('SIGTERM'); } catch {} }
  // el que no se muera por las buenas, se mata a los 3 s
  setTimeout(() => { for (const p of t.hijos) { try { p.kill('SIGKILL'); } catch {} } }, 3000);
  return { ok: true };
});

// ---------- dossier ----------

// ---------- pdf ----------
// Un solo sitio para generar PDFs. Antes había dos copias y ninguna cerraba la
// ventana offscreen si printToPDF fallaba: cada intento fallido dejaba una
// BrowserWindow viva y un HTML en /tmp.
async function generarPdf({ html, destino, pie }) {
  const tmp = path.join(os.tmpdir(), `escriba-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.html`);
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  try {
    await w.loadFile(tmp);
    await new Promise(r => setTimeout(r, 900));   // dar tiempo a las fuentes
    const buf = await w.webContents.printToPDF({
      pageSize: 'Letter', printBackground: true,
      margins: { marginType: 'custom', top: 0.7, bottom: 0.6, left: 0.7, right: 0.7 },
      displayHeaderFooter: true, headerTemplate: '<div></div>',
      footerTemplate: `<div style="width:100%;font-family:Inter,Helvetica,sans-serif;font-size:7.4pt;color:#98A2B3;padding:0 18mm;display:flex;justify-content:space-between"><span>${pie}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
    });
    ATOMICO.escribirAtomico(destino, buf);
    return destino;
  } finally {
    try { w.destroy(); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// ---------- minuta ----------
ipcMain.handle('guardar-minuta', seguro((_e, { carpeta, texto }) => {
  const destino = path.join(carpeta, 'minuta.md');
  // Guardar también deja copia de lo que había: sin esto, "Restaurar la versión
  // anterior" solo servía después de volver a redactar, no después de editar.
  try {
    const previo = fs.readFileSync(destino, 'utf8');
    if (previo && previo !== texto) ATOMICO.escribirAtomico(path.join(carpeta, 'minuta-anterior.md'), previo);
  } catch {}
  ATOMICO.escribirAtomico(destino, texto);
  return { ok: true };
}));

ipcMain.handle('pdf', seguro(async (_e, { carpeta, cliente, fecha, texto }) => {
  // las notas internas nunca salen al PDF del cliente
  // Falla cerrado: si no se ve dónde empiezan las notas internas, no se exporta.
  const corte = MINUTA.paraCliente(texto);
  if (!corte.ok) return { ok: false, error: corte.error };
  const soloCliente = corte.texto;
  const html = PDF.envolver({ cliente, fecha, cuerpoHtml: MD.convertir(soloCliente),
                              carpetaCliente: path.dirname(carpeta) });
  const ruta = await generarPdf({ html, destino: path.join(carpeta, 'minuta.pdf'),
                                  pie: `Minuta · ${cliente}` });
  return { ok: true, ruta };
}));

// Busca el término en las transcripciones y minutas de todas las reuniones.
// Sin tildes y en minúsculas. En español, buscar "catalogo" y no encontrar
// "catálogo" hace que el buscador parezca roto. La longitud no cambia: NFD
// expande la letra acentuada a dos y quitar la marca la devuelve a una, así
// que las posiciones siguen valiendo para recortar el fragmento.
ipcMain.handle('buscar', (_e, termino) => INDICE.buscar(termino));

// Expediente del cliente: todas sus reuniones en un solo PDF, para juntas de revisión.
ipcMain.handle('exportar-historial', seguro(async (_e, { slug, cliente }) => {
  const rs = R.reuniones(slug).filter(r => r.minuta).reverse(); // cronológico
  if (!rs.length) return { ok: false, error: 'Este cliente aún no tiene minutas.' };

  const fechaLegible = (id) => {
    const m = id.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return id;
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    return `${+m[3]} de ${meses[+m[2] - 1]} de ${m[1]}`;
  };

  // reunir los compromisos de todas las tablas de todas las minutas
  const compromisos = [];
  for (const r of rs) {
    // conEstado, no extraer: el PDF de expediente listaba como pendiente lo
    // que el usuario ya había marcado como hecho en la app
    for (const c of MINUTA.conEstado(r.minuta, r.carpeta)) {
      compromisos.push({ fecha: fechaLegible(r.id), texto: c.texto, quien: c.quien, hecho: c.hecho });
    }
  }

  let md = '';
  if (compromisos.length) {
    md += '# Compromisos a lo largo de la relación\n\n';
    const abiertos = compromisos.filter(c => !c.hecho), cerrados = compromisos.filter(c => c.hecho);
    if (abiertos.length) {
      md += `## Pendientes (${abiertos.length})\n\n| Reunión | Compromiso | Responsable |\n|---|---|---|\n`;
      md += abiertos.map(c => `| ${c.fecha} | ${c.texto} | ${c.quien} |`).join('\n') + '\n\n';
    }
    if (cerrados.length) {
      md += `## Cumplidos (${cerrados.length})\n\n| Reunión | Compromiso | Responsable |\n|---|---|---|\n`;
      md += cerrados.map(c => `| ${c.fecha} | ${c.texto} | ${c.quien} |`).join('\n') + '\n\n';
    }
  }
  md += '# Reuniones, una por una\n\n';
  for (const r of rs) {
    const corte = MINUTA.paraCliente(r.minuta);
    if (!corte.ok) return { ok: false, error: `${fechaLegible(r.id)}: ${corte.error}` };
    const publica = corte.texto;
    // quitar el encabezado propio de cada minuta y la línea de contacto
    // fuera el encabezado propio de cada minuta y la línea de contacto repetida
    const firma = CONFIG.leer().usuario.contacto;
    const cuerpo = publica.split('\n')
      .filter(l => !(firma && l.includes(firma.slice(0, 24))))
      .slice(1).join('\n').trim();
    md += `## ${fechaLegible(r.id)}\n\n${cuerpo}\n\n`;
  }

  // carpeta real del cliente (el slug del dossier puede diferir del de la carpeta)
  const dirCliente = path.dirname(rs[rs.length - 1].carpeta);

  const html = PDF.envolver({
    cliente, fecha: `${rs.length} ${rs.length === 1 ? 'reunión registrada' : 'reuniones registradas'}`,
    cuerpoHtml: MD.convertir(md),
    eyebrow: 'Expediente del cliente', titulo: 'Historial de reuniones',
    carpetaCliente: dirCliente
  });
  const ruta = await generarPdf({
    html, destino: path.join(dirCliente, `expediente-${cliente.toLowerCase().replace(/\s+/g, '-')}.pdf`),
    pie: `Expediente · ${cliente}`
  });
  return { ok: true, ruta, reuniones: rs.length, compromisos: compromisos.length };
}));

// Borrar una reunión. Va a la Papelera, no a rm -rf: una grabación de una hora
// que se borró por error se puede recuperar desde el Finder.
ipcMain.handle('eliminar-reunion', seguro(async (_e, { carpeta, slug }) => {
  const objetivo = path.resolve(carpeta || '');
  if (!R.dentroDeBase(objetivo)) {
    return { ok: false, error: 'Esa carpeta está fuera de Escriba. No se borró nada.' };
  }
  if (!fs.existsSync(objetivo)) return { ok: false, error: 'Esa reunión ya no existe.' };
  if (trabajo && trabajo.carpeta && path.resolve(trabajo.carpeta) === objetivo) {
    return { ok: false, error: 'Esa reunión se está procesando. Cancélala antes de borrarla.' };
  }
  // Un cliente puede tener slug de expediente distinto al de la carpeta.
  const cli = R.clientes().find(c => c.slug === slug || (c.alias || []).includes(slug));
  // Primero la Papelera y después el expediente: al revés, si el borrado falla,
  // la reunión sigue ahí pero su registro en el expediente ya se perdió.
  await shell.trashItem(objetivo);
  // la memoria propia; el expediente del usuario ya no se toca, salvo para
  // limpiar bloques que versiones anteriores llegaron a escribir en él
  // los dos, sin cortocircuito: el `||` de antes hacía que, si la memoria tenía
  // el bloque, el expediente viejo del usuario nunca se limpiara
  const limpiadoMemoria = MEMORIA.quitar(R.dirCanonica(slug), path.basename(objetivo));
  const limpiadoDossier = quitarDelDossier(cli && cli.dossier, objetivo);
  const limpiado = limpiadoMemoria || limpiadoDossier;
  return { ok: true, dossierLimpiado: limpiado };
}));

// Selector nativo de carpeta para Ajustes: teclear una ruta absoluta a mano
// era la parte más incómoda de configurar la app.
ipcMain.handle('elegir-carpeta', async (_e, actual) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Elige la carpeta', properties: ['openDirectory', 'createDirectory'],
    defaultPath: actual && fs.existsSync(actual) ? actual : os.homedir()
  });
  return r.canceled ? null : r.filePaths[0];
});

// Copiar la minuta lista para pegar en un correo. Las notas internas nunca van.
ipcMain.handle('copiar-minuta', seguro((_e, texto) => {
  const corte = MINUTA.paraCliente(texto);
  if (!corte.ok) return { ok: false, error: corte.error };
  clipboard.writeText(corte.texto);
  return { ok: true };
}));

// El PDF se genera dentro de la carpeta de la reunión, que es donde debe quedar
// archivado — pero nadie navega hasta ahí para mandárselo a un cliente. Estas dos
// son las que convierten "existe un PDF" en "se lo puedo enviar".
ipcMain.handle('guardar-como', seguro(async (_e, { origen, nombre }) => {
  if (!fs.existsSync(origen)) return { ok: false, error: 'Ese archivo ya no existe.' };
  const r = await dialog.showSaveDialog(win, {
    title: 'Guardar el PDF',
    defaultPath: path.join(app.getPath('desktop'), nombre || path.basename(origen)),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (r.canceled || !r.filePath) return { ok: true, cancelado: true };
  fs.copyFileSync(origen, r.filePath);
  return { ok: true, ruta: r.filePath };
}));

// Hoja de compartir de macOS: Mail, Mensajes, WhatsApp, AirDrop.
ipcMain.handle('compartir', seguro(async (_e, { archivo }) => {
  if (!fs.existsSync(archivo)) return { ok: false, error: 'Ese archivo ya no existe.' };
  const menu = new ShareMenu({ filePaths: [archivo] });
  menu.popup({ window: win });
  return { ok: true };
}));

// Cuando falta el permiso de grabación no basta con decirlo: hay que llevar
// hasta el interruptor, que está a tres niveles dentro de Ajustes del sistema.
ipcMain.handle('abrir-permisos', seguro(async () => {
  await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
  return { ok: true };
}));

ipcMain.handle('copiar-texto', seguro((_e, texto) => { clipboard.writeText(String(texto || '')); return { ok: true }; }));
ipcMain.handle('compromisos', seguro((_e, { carpeta, minuta }) => {
  // el corte lo hace lib/minuta.js, no el renderer: una sola definición de la
  // frontera para la vista, el PDF, el portapapeles y el expediente
  const { cliente, internas, encontrado } = MINUTA.separar(minuta);
  return { ok: true, lista: MINUTA.conEstado(minuta, carpeta), hallazgos: MINUTA.hallazgos(minuta),
           cliente, internas, encontrado };
}));
ipcMain.handle('compromiso-marcar', seguro((_e, { carpeta, texto, hecho }) => {
  MINUTA.marcar(carpeta, texto, hecho); return { ok: true };
}));

// Antes de la reunión: qué está pendiente, qué preguntar y qué llevar listo.
ipcMain.handle('preparar', seguro(async (_e, { slug, nombre }) => {
  const cli = R.clientes().find(c => c.slug === slug || (c.alias || []).includes(slug));
  const dirCliente = R.dirCanonica(slug);
  const rs = R.reuniones(slug);
  let dossier = null;
  if (cli && cli.dossier) { try { dossier = fs.readFileSync(cli.dossier, 'utf8'); } catch {} }
  const motor = MOTORES.activo();
  if (motor.id !== 'automatico' && !(await motor.disponible())) {
    return { ok: false, error: `El motor "${motor.nombre}" no está disponible. Revísalo en Ajustes.` };
  }
  const ultima = rs.find(r => r.minuta);
  const prompt = PREPARACION.construir({
    cliente: nombre, memoria: MEMORIA.leer(dirCliente), dossier,
    pendientes: MEMORIA.pendientes(rs),
    ultimaFecha: ultima ? fechaDeCarpeta(ultima.carpeta).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : null,
  });
  const texto = await REDACCION.redactarMotor({ motor, prompt });
  if (!texto || texto.trim().length < 40) return { ok: false, error: 'El motor no devolvió nada útil.' };
  fs.mkdirSync(dirCliente, { recursive: true });
  ATOMICO.escribirAtomico(path.join(dirCliente, 'preparacion.md'), texto);
  return { ok: true, texto };
}));

ipcMain.handle('preparacion-leer', seguro((_e, { slug }) => {
  const dir = R.dirCanonica(slug);
  const f = path.join(dir, 'preparacion.md');
  // con la fecha: un informe de hace meses parecía recién hecho
  try { return { ok: true, texto: fs.readFileSync(f, 'utf8'), fecha: fs.statSync(f).mtime.toISOString() }; }
  catch { return { ok: true, texto: '', fecha: null }; }
}));

ipcMain.handle('preparacion-pdf', seguro(async (_e, { slug, nombre, texto }) => {
  const dir = R.dirCanonica(slug);
  const html = PDF.envolver({
    cliente: nombre, fecha: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
    cuerpoHtml: MD.convertir(texto), carpetaCliente: dir,
    eyebrow: 'Preparación · uso interno', titulo: 'Antes de la reunión',
  });
  const ruta = await generarPdf({ html, destino: path.join(dir, 'preparacion.pdf'),
                                  pie: `Preparación · ${nombre} · no enviar` });
  return { ok: true, ruta };
}));

ipcMain.handle('abrir', (_e, ruta) => { shell.openPath(ruta); });
ipcMain.handle('revelar', (_e, ruta) => { shell.showItemInFolder(ruta); });
ipcMain.handle('importar', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Elige el audio de la reunión', properties: ['openFile'],
    filters: [{ name: 'Audio o video', extensions: ['m4a','mp3','wav','mp4','mov','aiff','caf','webm'] }]
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('importar-a-carpeta', seguro(async (_e, { slug, archivo }) => {
  const carpeta = path.join(R.BASE(), R.exigirSlug(slug), sello());
  fs.mkdirSync(carpeta, { recursive: true });
  await correr(BIN().ffmpeg, ['-nostdin','-loglevel','error','-y','-i',archivo,'-c:a','aac','-b:a','96k', path.join(carpeta,'mezcla.m4a')]);
  return { carpeta };
}));

// Sin esto se queda el menú por defecto de Electron, en inglés. En una app de
// Mac el menú es además donde se descubren los atajos: si no están ahí, no existen.
function construirMenu() {
  const alRenderer = (accion) => () => { if (win) { win.show(); win.webContents.send('menu', { accion }); } };
  const plantilla = [
    {
      label: 'Escriba',
      submenu: [
        { label: 'Acerca de Escriba', role: 'about' },
        { type: 'separator' },
        { label: 'Ajustes…', accelerator: 'Command+,', click: alRenderer('ajustes') },
        { type: 'separator' },
        { label: 'Ocultar Escriba', role: 'hide' },
        { label: 'Ocultar otras', role: 'hideOthers' },
        { label: 'Mostrar todas', role: 'unhide' },
        { type: 'separator' },
        { label: 'Salir de Escriba', role: 'quit' },
      ],
    },
    {
      label: 'Reunión',
      submenu: [
        { label: 'Grabar o detener', accelerator: 'Command+R', click: alRenderer('grabar') },
        { label: 'Importar audio…', accelerator: 'Command+O', click: alRenderer('importar') },
        { type: 'separator' },
        { label: 'Generar el PDF', accelerator: 'Command+E', click: alRenderer('pdf') },
        { label: 'Copiar la minuta', accelerator: 'Shift+Command+C', click: alRenderer('copiar') },
        { type: 'separator' },
        { label: 'Historial del cliente en PDF', accelerator: 'Shift+Command+E', click: alRenderer('expediente') },
        { label: 'Preparar la reunión', accelerator: 'Shift+Command+P', click: alRenderer('preparar') },
      ],
    },
    {
      label: 'Cliente',
      submenu: [
        { label: 'Nuevo cliente…', accelerator: 'Command+N', click: alRenderer('nuevo-cliente') },
        { label: 'Buscar', accelerator: 'Command+F', click: alRenderer('buscar') },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', role: 'undo' }, { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' }, { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' }, { label: 'Seleccionar todo', role: 'selectAll' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { label: 'Minimizar', role: 'minimize' },
        { label: 'Zoom', role: 'zoom' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
        { type: 'separator' },
        // ⇧⌘R es el atajo global de grabar: el reload no puede compartirlo.
        // Un reload a mitad de grabación reiniciaba el renderer con la captura viva.
        { label: 'Recargar la ventana', accelerator: 'Alt+Command+R', role: 'forceReload' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Manual de Escriba', click: () => shell.openExternal('https://escriba.kapitec.pro/manual.html') },
        { label: 'Carpeta de reuniones', click: () => shell.openPath(R.BASE()) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

function registrarAtajo() {
  // Cmd+Shift+R: empieza o detiene la grabación sin tener que ir a la ventana
  const ok = globalShortcut.register('CommandOrControl+Shift+R', async () => {
    if (captura) {
      if (win) win.webContents.send('atajo', { accion: 'detener' });
      notificar('Grabación detenida', 'Procesando la reunión…');
    } else if (clienteActivo) {
      if (win) win.webContents.send('atajo', { accion: 'grabar' });
      notificar('Grabando', `Reunión de ${clienteActivo.nombre}`);
    } else {
      if (win) { win.show(); win.focus(); }
      notificar('Elige un cliente', 'Selecciona a quién pertenece la reunión y vuelve a intentarlo.');
    }
  });
  if (!ok) console.log('no se pudo registrar el atajo global');
}

// Dos instancias = dos grabaciones sin saberlo una de la otra.
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// Una vez por arranque, sobre datos que ya existían. Idempotente.
async function migrarAlArrancar() {
  const aviso = [];
  try {
    const n = MIGRACION.memoriaInicial();
    if (n) aviso.push(`${n} ${n === 1 ? 'reunión anterior anotada' : 'reuniones anteriores anotadas'} en la memoria de sus clientes.`);
  } catch (e) { console.error('migración de memoria:', e.message); }
  try {
    // se renombran, no se borran: por si alguien quiere ver qué decía
    const viejos = MIGRACION.dialogosObsoletos(VERSION_DIALOGO);
    for (const f of viejos) { try { fs.renameSync(f, f.replace(/dialogo\.txt$/, 'dialogo-obsoleto.txt')); } catch {} }
    if (viejos.length) aviso.push(`${viejos.length} ${viejos.length === 1 ? 'diálogo se recalculará' : 'diálogos se recalcularán'} con el criterio nuevo al volver a redactar.`);
  } catch (e) { console.error('diálogos obsoletos:', e.message); }
  try {
    const vacias = MIGRACION.carpetasVacias();
    for (const v of vacias) { try { await shell.trashItem(v); } catch {} }
    if (vacias.length) aviso.push(`Se retiraron ${vacias.length} ${vacias.length === 1 ? 'grabación vacía' : 'grabaciones vacías'} (están en la Papelera).`);
  } catch (e) { console.error('limpieza de carpetas vacías:', e.message); }
  if (aviso.length && win) {
    win.webContents.once('did-finish-load', () => setTimeout(() => {
      if (win && !win.isDestroyed()) win.webContents.send('aviso-arranque', { texto: aviso.join(' ') });
    }, 900));
  }
}

app.whenReady().then(async () => {
  crearVentana();
  construirMenu();
  registrarAtajo();
  migrarAlArrancar();
  // Autoprueba: si existe el centinela, procesa esa carpeta y escribe el resultado.
  // Sirve para verificar que los subprocesos (whisper, claude) funcionan cuando la
  // app se abre desde el Finder y no desde la terminal.
  // Gancho de diagnóstico: solo activo con ESCRIBA_AUTOPRUEBA=1
  const centinela = '/private/tmp/AUTOPRUEBA.json';
  if (process.env.ESCRIBA_AUTOPRUEBA === '1' && fs.existsSync(centinela)) {
    const cfg = JSON.parse(fs.readFileSync(centinela, 'utf8'));
    fs.unlinkSync(centinela);
    // Disparador de cancelación para la autoprueba. Va por el mismo camino que el
    // botón (preload -> ipcRenderer.invoke -> handler), no por un atajo interno:
    // probar una ruta parecida no prueba la ruta.
    if (process.env.ESCRIBA_AUTOPRUEBA_CANCELAR) {
      const seg = Number(process.env.ESCRIBA_AUTOPRUEBA_CANCELAR) || 20;
      setTimeout(() => {
        if (win) win.webContents.executeJavaScript('window.api.cancelarProceso()').catch(() => {});
      }, 1500 + seg * 1000);
    }
    setTimeout(async () => {
      const t = Date.now();
      let salida;
      try { salida = await procesarInterno(cfg); }
      catch (e) { salida = { ok: false, error: e.message }; }
      fs.writeFileSync('/private/tmp/AUTOPRUEBA-resultado.json', JSON.stringify({
        ...salida, minuta: salida && salida.minuta ? salida.minuta.slice(0, 400) : null,
        segundos: Math.round((Date.now() - t) / 1000)
      }, null, 2));
      app.quit();
    }, 1500);
  }
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  // Cerrar la app mientras se transcribía dejaba whisper corriendo solo, comiendo
  // CPU hasta terminar un trabajo que ya no le interesa a nadie.
  if (trabajo) {
    trabajo.cancelado = true;
    try { trabajo.ac.abort(); } catch {}
    for (const p of trabajo.hijos) { try { p.kill('SIGKILL'); } catch {} }
  }
});

// Cerrar la ventana mientras se graba dejaba el .m4a sin finalizar y la reunión
// se perdía. Ahora se espera a que el capturador cierre el contenedor.
let cerrando = false;
app.on('before-quit', (e) => {
  if (captura && !cerrando) {
    cerrando = true;
    e.preventDefault();
    const proc = captura;
    proc.once('exit', () => { captura = null; app.quit(); });
    proc.kill('SIGINT');
    setTimeout(() => { captura = null; app.quit(); }, 9000);
  }
});
app.on('window-all-closed', () => app.quit());
