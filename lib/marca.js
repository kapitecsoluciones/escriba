// La marca del documento: el logo propio y el color de acento. Existían en la
// configuración y el PDF los usaba, pero Ajustes no tenía campo para ellos:
// el logo solo se podía poner editando config.json a mano.
const fs = require('fs'), path = require('path');
const CONFIG = require('./config');
const { oscurecer, logoPropio, normalizarAcento, acentoValido, MIMES, TOPE_LOGO: TOPE } = require('./pdf');

const DIR = () => path.join(CONFIG.DIR, 'marca');
const ES_LOGO = /^logo(-[a-z0-9]+)?\.[a-z]+$/i;

// El logo se COPIA a la carpeta de configuración: si se guardara solo la ruta
// original, mover o borrar el archivo dejaría el PDF sin logo sin avisar.
// Cada instalación usa un nombre nuevo y el anterior se borra AL FINAL: si
// la copia o la config fallan a mitad, el logo que había sigue intacto; y
// elegir el mismo archivo ya instalado no lo borra antes de copiarlo.
function instalarLogo(origen) {
  const ext = path.extname(origen || '').toLowerCase();
  if (!MIMES[ext]) return { ok: false, error: 'El logo tiene que ser PNG, JPG, WebP o SVG.' };
  let st;
  try { st = fs.statSync(origen); } catch { return { ok: false, error: 'No se pudo leer el archivo.' }; }
  if (!st.isFile()) return { ok: false, error: 'No se pudo leer el archivo.' };
  if (st.size > TOPE) return { ok: false, error: `El logo pesa ${(st.size / 1048576).toFixed(1)} MB; el máximo es 2 MB.` };
  // nombre nuevo en cada instalación (nunca el mismo que el origen, aunque sea el ya instalado)
  const destino = path.join(DIR(), `logo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${ext}`);
  try {
    fs.mkdirSync(DIR(), { recursive: true });
    fs.copyFileSync(origen, destino);
    CONFIG.guardar({ marca: { logo: destino } });
  } catch (e) {
    try { fs.unlinkSync(destino); } catch {}
    return { ok: false, error: 'No se pudo guardar el logo: ' + (e.message || e) };
  }
  quitarArchivos(destino);
  return { ok: true, ruta: destino };
}

function quitarArchivos(salvo) {
  try {
    for (const f of fs.readdirSync(DIR())) {
      const ruta = path.join(DIR(), f);
      if (ES_LOGO.test(f) && ruta !== salvo) { try { fs.unlinkSync(ruta); } catch {} }
    }
  } catch {}
}

function quitarLogo() {
  CONFIG.guardar({ marca: { logo: '' } });
  quitarArchivos(null);
  return { ok: true };
}

// Lo que la vista previa de Ajustes necesita para dibujar el encabezado tal
// como sale en el PDF: el mismo logo, el mismo nombre y el mismo acento que
// usa lib/pdf.js (las tres cosas salen de sus funciones).
function vista() {
  const cfg = CONFIG.leer();
  const marca = cfg.marca || {};
  const logo = logoPropio();
  const acento = normalizarAcento(marca.acento) || '#B58A3E';
  return { logo, logoRuta: logo ? marca.logo : '', emisor: cfg.usuario.empresa || cfg.usuario.nombre || '',
           acento, acentoTexto: oscurecer(acento) };
}

module.exports = { instalarLogo, quitarLogo, vista, acentoValido, normalizarAcento, MIMES, TOPE };
