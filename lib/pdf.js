// Plantilla del PDF: tema claro, acento configurable, fuentes incrustadas.
// Comparte escala con la ventana (pt = px × 0.75): lo que revisas en pantalla
// es lo que recibe el cliente.
const fs = require('fs'), path = require('path');
const CONFIG = require('./config');

const MIMES = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };

function dataUri(ruta, mime) {
  try { return `data:${mime};base64,` + fs.readFileSync(ruta).toString('base64'); } catch { return null; }
}

// Las fuentes van dentro del HTML, no enlazadas: el PDF se genera en una
// ventana sin red y antes, sin conexión, salía en Arial con el espaciado
// calibrado para otra letra. Se leen una vez por proceso.
const DIR_FUENTES = path.join(__dirname, '..', 'renderer', 'fuentes');
let FUENTES_CSS = null;
function fuentes() {
  if (FUENTES_CSS != null) return FUENTES_CSS;
  const inter = dataUri(path.join(DIR_FUENTES, 'Inter.woff2'), 'font/woff2');
  const jakarta = dataUri(path.join(DIR_FUENTES, 'PlusJakartaSans-800.woff2'), 'font/woff2');
  FUENTES_CSS = (inter ? `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url(${inter}) format('woff2')}\n` : '') +
                (jakarta ? `@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:800;src:url(${jakarta}) format('woff2')}\n` : '');
  return FUENTES_CSS;
}

// Cada logo solo se busca donde le toca: el del cliente en SU carpeta
// (logo.*), el propio en Ajustes. Nunca uno fijo: acabaría en el documento
// de otro cliente.
function logoCliente(carpetaCliente) {
  if (!carpetaCliente) return null;
  for (const ext of Object.keys(MIMES)) {
    const c = path.join(carpetaCliente, 'logo' + ext);
    if (fs.existsSync(c)) return dataUri(c, MIMES[ext]);
  }
  return null;
}
const TOPE_LOGO = 2 * 1024 * 1024;   // 2 MB: un logo de encabezado no necesita más
function logoPropio() {
  const propio = ((CONFIG.leer().marca) || {}).logo;
  if (!propio) return null;
  const mime = MIMES[path.extname(propio).toLowerCase()];
  try {
    const st = fs.statSync(propio);
    return mime && st.isFile() && st.size <= TOPE_LOGO ? dataUri(propio, mime) : null;
  } catch { return null; }
}

// El acento va al CSS del documento: solo #RRGGBB (o #RGB, que se expande).
// Un valor cualquiera de config.json era inyección directa en la hoja del PDF.
function normalizarAcento(v) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v || '').trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return '#' + h.toUpperCase();
}
const acentoValido = (v) => normalizarAcento(v) !== null;

const CSS = `
@page { size: letter; margin: 18mm; }
*{box-sizing:border-box}
:root{--ink:#0A1428;--soft:#525E78;--muted:#626C80;--rule:rgba(10,20,40,.10);--tint:#F7F9FC;
  --gold:ACENTO;--gold-soft:ACENTO_SUAVE;--gold-texto:ACENTO_TEXTO;
  --titulo:'Plus Jakarta Sans',Inter,sans-serif;--mono:ui-monospace,Menlo,monospace}
html,body{margin:0;background:#fff;color:var(--ink);
 font-family:'Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
 font-size:10.5pt;line-height:1.65;-webkit-font-smoothing:antialiased}
h1,h2,h3{break-after:avoid}
/* cabecera: quien emite, grande; para quién, pequeño. Antes iba al revés y el
   documento parecía emitido por el cliente. */
.masthead{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;
 padding-bottom:10px;border-bottom:1px solid var(--rule);margin-bottom:22px;break-inside:avoid}
.masthead img{height:34px;max-width:200px;object-fit:contain}
.emisor{font-family:var(--titulo);font-weight:800;font-size:15pt;letter-spacing:-.01em;line-height:1.1}
.para{text-align:right;font-size:8.25pt;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);font-weight:600;line-height:1.5}
.para b{display:block;color:var(--ink);font-weight:700;letter-spacing:.10em}
.eyebrow{font-size:8.25pt;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-texto);font-weight:700;margin:0 0 8px}
h1.doctitle{font-family:var(--titulo);font-weight:800;font-size:25pt;
 line-height:1.1;letter-spacing:-.015em;word-spacing:.04em;margin:0 0 8px}
.subtitle{color:var(--soft);font-size:10.5pt;margin:0}
.accentbar{height:3px;width:64px;background:var(--gold);border-radius:2px;margin:14px 0 26px}
h1:not(.doctitle){font-family:var(--titulo);font-weight:800;font-size:15.75pt;line-height:1.25;
 letter-spacing:0;word-spacing:.09em;margin:24px 0 12px;padding-top:16px;border-top:1px solid var(--rule)}
h1:not(.doctitle):first-of-type{margin-top:0;padding-top:0;border-top:none}
h2{font-family:var(--titulo);font-weight:800;font-size:12.75pt;line-height:1.25;
 letter-spacing:0;word-spacing:.09em;margin:20px 0 8px}
h2::before{content:"";display:block;width:20px;height:2px;background:var(--gold);margin:0 0 8px;border-radius:1px}
h3{font-size:10.5pt;font-weight:700;margin:16px 0 4px}
p{margin:0 0 8px}
strong{font-weight:700}
ul,ol{margin:0 0 12px;padding-left:0;list-style:none}
ol{counter-reset:li}
li{position:relative;padding-left:20px;margin-bottom:4px}
ul>li::before{content:"";position:absolute;left:3px;top:.62em;width:5px;height:5px;border-radius:50%;background:var(--gold)}
ol>li{counter-increment:li}
ol>li::before{content:counter(li);position:absolute;left:0;font-size:8.25pt;font-weight:700;color:var(--gold-texto)}
table{width:100%;border-collapse:collapse;margin:12px 0 14px;font-size:9.75pt}
thead{display:table-header-group}
tr{break-inside:avoid}
th{text-align:left;font-weight:700;font-size:8.25pt;letter-spacing:.08em;text-transform:uppercase;
 color:var(--muted);padding:0 8px 8px;border-bottom:1.5px solid var(--ink)}
td{padding:8px;border-bottom:1px solid var(--rule);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
hr{border:none;border-top:1px solid var(--rule);margin:20px 0 12px}
p.contact{background:var(--tint);border:1px solid var(--rule);border-left:3px solid var(--gold);
 border-radius:6px;padding:12px 16px;font-size:9.75pt;margin:20px 0 0}
code{font-family:var(--mono);font-size:9pt;background:var(--tint);
 border:1px solid var(--rule);border-radius:3px;padding:0 3px}
`;

const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Un tono del acento que lea con contraste como texto: se oscurece a la mitad.
function oscurecer(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = [16, 8, 0].map(s => Math.round(((n >> s) & 255) * 0.72).toString(16).padStart(2, '0'));
  return '#' + c.join('');
}

function envolver({ cliente, fecha, cuerpoHtml, carpetaCliente = null,
                    eyebrow = 'Minuta de reunión', titulo = 'Acuerdos y siguientes pasos' }) {
  const cfg = CONFIG.leer();
  const acento = normalizarAcento((cfg.marca || {}).acento) || '#B58A3E';
  const suave = acento + '22';   // el mismo tono, translúcido, para los fondos
  const propio = logoPropio();
  const delCliente = logoCliente(carpetaCliente);
  const emisor = cfg.usuario.empresa || cfg.usuario.nombre || '';
  const izquierda = propio
    ? `<img src="${propio}" alt="${esc(emisor)}">`
    : `<div class="emisor">${esc(emisor)}</div>`;
  const derecha = delCliente
    ? `<img src="${delCliente}" alt="${esc(cliente)}">`
    : `<div class="para">Para<b>${esc(cliente)}</b></div>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<style>${fuentes()}${CSS.replace(/ACENTO_SUAVE/g, suave).replace(/ACENTO_TEXTO/g, oscurecer(acento)).replace(/ACENTO/g, acento)}</style></head><body>
<header class="masthead">${izquierda}${derecha}</header>
<p class="eyebrow">${esc(eyebrow)}</p>
<h1 class="doctitle">${esc(titulo)}</h1>
<p class="subtitle">${esc(cliente)} · ${esc(fecha)}</p>
<div class="accentbar"></div>
${cuerpoHtml}
</body></html>`;
}

module.exports = { envolver, oscurecer, logoPropio, normalizarAcento, acentoValido, MIMES, TOPE_LOGO };
