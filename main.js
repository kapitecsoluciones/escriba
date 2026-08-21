const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut, Notification } = require('electron');
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn, execFile } = require('child_process');
const R = require('./lib/rutas');
const BIN = R.BIN;
const CONFIG = require('./lib/config');
const PROMPT = require('./lib/prompt');
const PDF = require('./lib/pdf');
const MD = require('./lib/md');
const VOCES = require('./lib/voces');
const MOTORES = require('./lib/motores');

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
  win = new BrowserWindow({
    width: 1180, height: 780, minWidth: 900, minHeight: 600,
    titleBarStyle: 'hiddenInset', backgroundColor: '#F7F9FC',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // primera vez: se abre directamente en Ajustes para configurar lo mínimo
  if (!CONFIG.configurado()) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => win.webContents.executeJavaScript('window.abrirAjustes && window.abrirAjustes()').catch(() => {}), 400);
    });
  }
}

const avisar = (etapa, detalle = '') => win && win.webContents.send('progreso', { etapa, detalle });

// Un handler que lanza deja al renderer esperando para siempre. Todos devuelven
// {ok:false,error} en vez de reventar.
const seguro = (fn) => async (...a) => {
  try { const r = await fn(...a); return (r && typeof r === 'object') ? r : { ok: true, valor: r }; }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
};
const correr = (cmd, args, opts = {}) => new Promise((res, rej) => {
  execFile(cmd, args, { maxBuffer: 1024 * 1024 * 64, ...opts }, (e, so, se) => e ? rej(new Error(se || e.message)) : res(so));
});

// ---------- consultas ----------
ipcMain.handle('clientes', () => R.clientes());
ipcMain.handle('config-leer', () => CONFIG.leer());
ipcMain.handle('config-guardar', (_e, parcial) => CONFIG.guardar(parcial));
ipcMain.handle('motores-estado', () => MOTORES.estado());
ipcMain.handle('motor-probar', async (_e, id) => MOTORES.porId(id).probar());
ipcMain.handle('guardar-llave', async (_e, { proveedor, llave }) => {
  await require('./lib/motores/api').guardarLlave(proveedor, llave); return { ok: true };
});
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
ipcMain.handle('crear-cliente', (_e, nombre) => R.crearCliente(nombre));

// ---------- grabación ----------
ipcMain.handle('grabar-iniciar', async (_e, slug) => {
  if (captura) return { ok: false, error: 'Ya hay una grabación en curso' };
  if (!BIN().captura) return { ok: false, error: 'No se encontró el capturador de audio. Reinstala la app.' };
  carpetaActual = path.join(R.BASE(), slug, sello());
  fs.mkdirSync(carpetaActual, { recursive: true });
  captura = spawn(BIN().captura, [path.join(carpetaActual, 'sistema.m4a')]);
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
  try {
    avisar('mezclando', 'Uniendo tu voz y el audio del Mac');
    const mezcla = await mezclar(carpeta);
    const dur = await duracion(mezcla);

    const base = path.join(carpeta, 'mezcla');
    // Si ya se transcribió antes (p. ej. falló la redacción), no se repite:
    // una hora de audio cuesta ~10 min de whisper.
    const yaTranscrito = fs.existsSync(base + '.txt') && fs.statSync(base + '.txt').size > 40;
    if (yaTranscrito) {
      avisar('transcribiendo', 'Ya estaba transcrita, se reutiliza');
    } else {
    avisar('transcribiendo', 'Puede tardar ~1 minuto por cada 10 de reunión');
    const wav = path.join(os.tmpdir(), `mezcla-${Date.now()}.wav`);
    await correr(BIN().ffmpeg, ['-nostdin', '-loglevel', 'error', '-y', '-i', mezcla, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    // -mc 0 evita los bucles de repetición en audios largos
    await correr(BIN().whisper, ['-m', BIN().modelo, '-f', wav, '-l', 'es', '-mc', '0', '-pp',
      '--output-txt', '--output-srt', '--output-file', base]);
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
    const minuta = await motor.redactar(prompt);
    fs.writeFileSync(path.join(carpeta, 'minuta.md'), minuta);

    avisar('guardando', 'Guardando la reunión en el expediente del cliente');
    const res = actualizarDossier({
      dossier: cli && cli.dossier, cliente: nombre,
      fecha: sello().slice(0, 10), minuta, carpeta
    });

    avisar('listo', '');
    notificar('Minuta lista', `${nombre} · ${dur}. Ya puedes revisarla y exportar el PDF.`);
    return { ok: true, minuta, transcripcion, duracion: dur, carpeta, dossier: res };
  } catch (e) {
    avisar('error', e.message);
    notificar('No se pudo procesar', e.message);
    return { ok: false, error: e.message };
  }
}

ipcMain.handle('procesar', (_e, d) => procesarInterno(d));

// ---------- dossier ----------
// Cierra el ciclo de memoria: la reunión queda en el dossier del cliente,
// para que la próxima vez la app arranque sabiendo lo que se acordó hoy.
function actualizarDossier({ dossier, cliente, fecha, minuta, carpeta }) {
  if (!dossier || !fs.existsSync(dossier)) return { ok: false, motivo: 'sin dossier' };
  const previo = fs.readFileSync(dossier, 'utf8');
  const marca = `## ${fecha} — Reunión`;
  if (previo.includes(marca)) return { ok: false, motivo: 'ya registrada' };
  // solo la parte del cliente; las notas internas van aparte y más cortas
  const [publica, internas] = minuta.split(/##\s*Notas internas[^\n]*/i);
  const resumen = publica.trim().split('\n')
    .filter(l => /^\*\*/.test(l.trim()))
    .filter(l => !/·/.test(l))          // fuera el encabezado "Cliente · fecha · duración"
    .slice(0, 8)
    .map(l => '- ' + l.replace(/\*\*/g, '').trim()).join('\n');
  let bloque = `\n\n${marca} (${cliente})\n\nMinuta completa: \`${path.join(carpeta, 'minuta.md')}\`\n`;
  if (resumen) bloque += `\n**Lo acordado:**\n${resumen}\n`;
  if (internas) {
    const pend = internas.split('\n').filter(l => /^-\s/.test(l)).slice(0, 10).join('\n');
    if (pend) bloque += `\n**Notas internas de la reunión:**\n${pend}\n`;
  }
  fs.appendFileSync(dossier, bloque);
  return { ok: true };
}

ipcMain.handle('actualizar-dossier', seguro((_e, d) => actualizarDossier(d)));

// ---------- minuta / pdf ----------
ipcMain.handle('guardar-minuta', seguro((_e, { carpeta, texto }) => {
  fs.writeFileSync(path.join(carpeta, 'minuta.md'), texto); return { ok: true };
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
ipcMain.handle('buscar', (_e, termino) => {
  const t = (termino || '').trim().toLowerCase();
  if (t.length < 3) return [];
  const salida = [];
  for (const c of R.clientes()) {
    for (const r of R.reuniones(c.slug)) {
      for (const [campo, texto] of [['minuta', r.minuta], ['transcripción', r.transcripcion]]) {
        if (!texto) continue;
        const bajo = texto.toLowerCase();
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
    const publica = r.minuta.split(/##\s*Notas internas/i)[0];
    for (const linea of publica.split('\n')) {
      const celdas = linea.trim().match(/^\|(.+)\|$/);
      if (!celdas) continue;
      const c = celdas[1].split('|').map(x => x.trim());
      if (c.length < 2 || /^-+$/.test(c[0]) || /compromiso|qué\b/i.test(c[0])) continue;
      compromisos.push({ fecha: fechaLegible(r.id), texto: c[0], quien: c[1] || '' });
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
  registrarAtajo();
  // Autoprueba: si existe el centinela, procesa esa carpeta y escribe el resultado.
  // Sirve para verificar que los subprocesos (whisper, claude) funcionan cuando la
  // app se abre desde el Finder y no desde la terminal.
  // Gancho de diagnóstico: solo activo con ESCRIBA_AUTOPRUEBA=1
  const centinela = '/private/tmp/AUTOPRUEBA.json';
  if (process.env.ESCRIBA_AUTOPRUEBA === '1' && fs.existsSync(centinela)) {
    const cfg = JSON.parse(fs.readFileSync(centinela, 'utf8'));
    fs.unlinkSync(centinela);
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
app.on('will-quit', () => globalShortcut.unregisterAll());

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
