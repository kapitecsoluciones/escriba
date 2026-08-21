const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, Notification, clipboard, Menu, nativeTheme } = require('electron');
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
const { actualizarDossier, quitarDelDossier } = require('./lib/dossier');

let win = null;
let captura = null;          // proceso de grabación en curso
let carpetaActual = null;
let clienteActivo = null;    // {slug, nombre} — lo informa el renderer

const notificar = (titulo, cuerpo) => {
  try { new Notification({ title: titulo, body: cuerpo, silent: false }).show(); } catch {}
};

// Sello de tiempo en hora local. Con toISOString() una reunión de las 17:41
// quedaba archivada como del día siguiente a las 00:41.
function sello() {
  const d = new Date(), z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}`;
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
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // primera vez: se abre directamente en Ajustes para configurar lo mínimo
  if (!CONFIG.configurado()) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => win.webContents.executeJavaScript('window.abrirAjustes && window.abrirAjustes()').catch(() => {}), 400);
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
ipcMain.handle('clientes', () => R.clientes());
ipcMain.handle('config-leer', () => CONFIG.leer());
ipcMain.handle('config-guardar', (_e, parcial) => CONFIG.guardar(parcial));
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

ipcMain.handle('diagnostico', () => ({ faltantes: R.faltantes(), binarios: R.BIN(), configurado: CONFIG.configurado() }));

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
ipcMain.handle('reuniones', (_e, slug) => R.reuniones(slug));
ipcMain.handle('crear-cliente', (_e, d) => {
  const nombre = typeof d === 'string' ? d : (d && d.nombre);
  const expediente = typeof d === 'string' ? null : (d && d.expediente);
  return R.crearCliente(nombre, expediente);
});
ipcMain.handle('expedientes', () => R.expedientes());
ipcMain.handle('enlazar-expediente', seguro((_e, { slug, archivo }) => R.enlazarExpediente(slug, archivo || null)));

// ---------- grabación ----------
ipcMain.handle('grabar-iniciar', async (_e, slug) => {
  if (captura) return { ok: false, error: 'Ya hay una grabación en curso' };
  if (!BIN().captura) return { ok: false, error: 'No se encontró el capturador de audio. Reinstala la app.' };
  carpetaActual = path.join(R.BASE(), slug, sello());
  fs.mkdirSync(carpetaActual, { recursive: true });
  const micro = (CONFIG.leer().grabacion || {}).microfono || '';
  const argsCaptura = [path.join(carpetaActual, 'sistema.m4a')];
  if (micro) argsCaptura.push('--mic', micro);
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
  if (!arranque.ok) { try { captura && captura.kill('SIGINT'); } catch {} captura = null; return arranque; }
  return { ok: true, carpeta: carpetaActual, inicio: Date.now() };
});

ipcMain.handle('grabar-detener', async () => {
  if (!captura) return { ok: false, error: 'No hay grabación activa' };
  const proc = captura;
  await new Promise(res => { proc.once('exit', res); proc.kill('SIGINT'); setTimeout(res, 8000); });
  captura = null;
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
    return `${Math.floor(seg / 60)} min ${String(Math.floor(seg % 60)).padStart(2, '0')} s`;
  } catch { return 'desconocida'; }
}

async function procesarInterno({ carpeta, slug, nombre }) {
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

    // Si se grabó con la app hay dos pistas: se puede saber quién dijo cada cosa
    let atribuida = null;
    try {
      avisar('atribuyendo', 'Separando quién dijo cada cosa');
      const yaDialogo = path.join(carpeta, 'dialogo.txt');
      if (fs.existsSync(yaDialogo) && fs.statSync(yaDialogo).size > 40) {
        atribuida = fs.readFileSync(yaDialogo, 'utf8');
      } else
      atribuida = await VOCES.atribuir({
        ffmpeg: BIN().ffmpeg, srt: base + '.srt',
        mic: path.join(carpeta, 'microfono.m4a'),
        sistema: path.join(carpeta, 'sistema.m4a'),
        nombreUsuario: CONFIG.leer().usuario.nombre || 'Yo', nombreOtro: nombre
      });
      if (atribuida) {
        fs.writeFileSync(path.join(carpeta, 'dialogo.txt'), atribuida);
        transcripcion = atribuida;
      }
    } catch (e) { /* si falla, seguimos con la transcripción plana */ }

    punto();
    avisar('redactando', `Escribiendo la minuta con ${MOTORES.activo().nombre}`);
    const cli = R.clientes().find(c => c.slug === slug);
    let dossier = null;
    if (cli && cli.dossier) { try { dossier = fs.readFileSync(cli.dossier, 'utf8'); } catch {} }
    const prompt = PROMPT.construir({
      cliente: nombre, fecha: new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
      duracion: dur, transcripcion, dossier, conHablantes: !!atribuida
    });
    const motor = MOTORES.activo();
    if (!(await motor.disponible())) {
      throw new Error(`El motor de redacción "${motor.nombre}" no está disponible. Revísalo en Ajustes.`);
    }
    const minuta = await motor.redactar(prompt, { senal: trabajo && trabajo.ac.signal });
    punto();
    // "Volver a redactar" pisaba las correcciones hechas a mano sin vuelta atrás.
    // La versión anterior queda guardada al lado antes de escribir la nueva.
    const destinoMinuta = path.join(carpeta, 'minuta.md');
    try {
      if (fs.existsSync(destinoMinuta) && fs.statSync(destinoMinuta).size > 0) {
        fs.copyFileSync(destinoMinuta, path.join(carpeta, 'minuta-anterior.md'));
      }
    } catch {}
    fs.writeFileSync(destinoMinuta, minuta);

    avisar('guardando', 'Guardando la reunión en el expediente del cliente');
    const res = actualizarDossier({
      dossier: cli && cli.dossier, cliente: nombre,
      fecha: sello().slice(0, 10), minuta, carpeta
    });

    avisar('listo', '');
    notificar('Minuta lista', `${nombre} · ${dur}. Ya puedes revisarla y exportar el PDF.`);
    return { ok: true, minuta, transcripcion, duracion: dur, carpeta, dossier: res };
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
ipcMain.handle('actualizar-dossier', seguro((_e, d) => actualizarDossier(d)));

// ---------- minuta / pdf ----------
ipcMain.handle('guardar-minuta', seguro((_e, { carpeta, texto }) => {
  const destino = path.join(carpeta, 'minuta.md');
  // Guardar también deja copia de lo que había: sin esto, "Restaurar la versión
  // anterior" solo servía después de volver a redactar, no después de editar.
  try {
    const previo = fs.readFileSync(destino, 'utf8');
    if (previo && previo !== texto) fs.writeFileSync(path.join(carpeta, 'minuta-anterior.md'), previo);
  } catch {}
  fs.writeFileSync(destino, texto);
  return { ok: true };
}));

ipcMain.handle('pdf', seguro(async (_e, { carpeta, cliente, fecha, texto }) => {
  // las notas internas nunca salen al PDF del cliente
  const soloCliente = texto.split(/##\s*Notas internas/i)[0].trim();
  const html = PDF.envolver({ cliente, fecha, cuerpoHtml: MD.convertir(soloCliente),
                              carpetaCliente: path.dirname(carpeta) });
  const tmp = path.join(os.tmpdir(), `minuta-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadFile(tmp);
  await new Promise(r => setTimeout(r, 900)); // dar tiempo a las fuentes
  const buf = await w.webContents.printToPDF({
    pageSize: 'Letter', printBackground: true,
    margins: { marginType: 'custom', top: 0.7, bottom: 0.6, left: 0.7, right: 0.7 },
    displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-family:Inter,Helvetica,sans-serif;font-size:7.4pt;color:#98A2B3;padding:0 18mm;display:flex;justify-content:space-between"><span>Minuta · ${cliente}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
  });
  w.destroy(); try { fs.unlinkSync(tmp); } catch {}
  const destino = path.join(carpeta, 'minuta.pdf');
  fs.writeFileSync(destino, buf);
  return { ok: true, ruta: destino };
}));

// Busca el término en las transcripciones y minutas de todas las reuniones.
// Sin tildes y en minúsculas. En español, buscar "catalogo" y no encontrar
// "catálogo" hace que el buscador parezca roto. La longitud no cambia: NFD
// expande la letra acentuada a dos y quitar la marca la devuelve a una, así
// que las posiciones siguen valiendo para recortar el fragmento.
const plano = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

ipcMain.handle('buscar', (_e, termino) => {
  const t = plano(termino).trim();
  if (t.length < 3) return [];
  const salida = [];
  for (const c of R.clientes()) {
    for (const r of R.reuniones(c.slug)) {
      for (const [campo, texto] of [['minuta', r.minuta], ['transcripción', r.transcripcion]]) {
        if (!texto) continue;
        const bajo = plano(texto);
        let i = bajo.indexOf(t);
        if (i === -1) continue;
        const frag = texto.slice(Math.max(0, i - 70), i + 110)
          .replace(/\s+/g, ' ').replace(/\*\*/g, '').replace(/#+\s*/g, '').trim();
        salida.push({ cliente: c.nombre, slug: c.slug, id: r.id, campo, fragmento: frag });
        break;
      }
    }
  }
  return salida.slice(0, 40);
});

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
    for (const c of MINUTA.extraer(r.minuta)) {
      compromisos.push({ fecha: fechaLegible(r.id), texto: c.texto, quien: c.quien });
    }
  }

  let md = '';
  if (compromisos.length) {
    md += '# Compromisos a lo largo de la relación\n\n';
    md += '| Reunión | Compromiso | Responsable |\n|---|---|---|\n';
    md += compromisos.map(c => `| ${c.fecha} | ${c.texto} | ${c.quien} |`).join('\n') + '\n\n';
  }
  md += '# Reuniones, una por una\n\n';
  for (const r of rs) {
    const publica = r.minuta.split(/##\s*Notas internas/i)[0].trim();
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
  const tmp = path.join(os.tmpdir(), `hist-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadFile(tmp);
  await new Promise(r => setTimeout(r, 900));
  const buf = await w.webContents.printToPDF({
    pageSize: 'Letter', printBackground: true,
    margins: { marginType: 'custom', top: 0.7, bottom: 0.6, left: 0.7, right: 0.7 },
    displayHeaderFooter: true, headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-family:Inter,Helvetica,sans-serif;font-size:7.4pt;color:#98A2B3;padding:0 18mm;display:flex;justify-content:space-between"><span>Expediente · ${cliente}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
  });
  w.destroy(); try { fs.unlinkSync(tmp); } catch {}
  const destino = path.join(dirCliente, `expediente-${cliente.toLowerCase().replace(/\s+/g, '-')}.pdf`);
  fs.mkdirSync(dirCliente, { recursive: true });
  fs.writeFileSync(destino, buf);
  return { ok: true, ruta: destino, reuniones: rs.length, compromisos: compromisos.length };
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
  const limpiado = quitarDelDossier(cli && cli.dossier, objetivo);
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
  clipboard.writeText(String(texto || '').split(/##\s*Notas internas/i)[0].trim());
  return { ok: true };
}));

ipcMain.handle('copiar-texto', seguro((_e, texto) => { clipboard.writeText(String(texto || '')); return { ok: true }; }));
ipcMain.handle('compromisos', seguro((_e, { carpeta, minuta }) => ({
  ok: true, lista: MINUTA.conEstado(minuta, carpeta), hallazgos: MINUTA.hallazgos(minuta)
})));
ipcMain.handle('compromiso-marcar', seguro((_e, { carpeta, texto, hecho }) => {
  MINUTA.marcar(carpeta, texto, hecho); return { ok: true };
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
  const carpeta = path.join(R.BASE(), slug, sello());
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
        { label: 'Exportar el PDF', accelerator: 'Command+E', click: alRenderer('pdf') },
        { label: 'Copiar la minuta', accelerator: 'Shift+Command+C', click: alRenderer('copiar') },
        { type: 'separator' },
        { label: 'Expediente del cliente', accelerator: 'Shift+Command+E', click: alRenderer('expediente') },
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
        { label: 'Recargar la ventana', accelerator: 'Shift+Command+R', role: 'forceReload' },
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

app.whenReady().then(async () => {
  crearVentana();
  construirMenu();
  registrarAtajo();
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
