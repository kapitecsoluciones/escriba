// Plantilla del PDF de la minuta: tema claro, acento configurable.
const fs = require('fs'), path = require('path');
const CONFIG = require('./config');

const MIMES = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };

// El logo se busca, en este orden: el del cliente (logo.* en su carpeta),
// el de la empresa que emite (Ajustes), o ninguno. NUNCA uno fijo:
// un logo cableado acabaría apareciendo en el documento de otro cliente.
function logoDataUri(carpetaCliente) {
  const candidatos = [];
  if (carpetaCliente) {
    for (const ext of Object.keys(MIMES)) candidatos.push(path.join(carpetaCliente, 'logo' + ext));
  }
  const propio = CONFIG.leer().marca.logo;
  if (propio) candidatos.push(propio);
  for (const c of candidatos) {
    try {
      if (!fs.existsSync(c)) continue;
      const mime = MIMES[path.extname(c).toLowerCase()];
      if (!mime) continue;
      return `data:${mime};base64,` + fs.readFileSync(c).toString('base64');
    } catch {}
  }
  return null;
}

const CSS = `
@page { size: letter; margin: 18mm; }
*{box-sizing:border-box}
:root{--ink:#0A1428;--soft:#4A5670;--rule:rgba(10,20,40,.10);--tint:#F7F9FC;--gold:ACENTO;--gold-soft:ACENTO_SUAVE}
html,body{margin:0;background:#fff;color:var(--ink);
 font-family:'Inter',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;
 font-size:10.6pt;line-height:1.58;-webkit-font-smoothing:antialiased}
.masthead{display:flex;align-items:flex-end;justify-content:space-between;
 padding-bottom:10px;border-bottom:1px solid var(--rule);margin-bottom:22px}
.masthead img{height:34px}
.issuer{text-align:right;font-size:8pt;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);font-weight:600;line-height:1.5}
.issuer b{display:block;color:var(--ink);font-weight:700;letter-spacing:.10em}
.eyebrow{font-size:8pt;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);font-weight:700;margin:0 0 8px}
h1.doctitle{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-weight:800;font-size:25pt;
 line-height:1.1;letter-spacing:-.015em;word-spacing:.04em;margin:0 0 8px}
.subtitle{color:var(--soft);font-size:10pt;margin:0}
.accentbar{height:3px;width:64px;background:linear-gradient(90deg,#2367FB,#2DD2A1);border-radius:2px;margin:14px 0 26px}
h1:not(.doctitle){font-family:'Plus Jakarta Sans',Inter,sans-serif;font-weight:800;font-size:15.5pt;
 letter-spacing:0;word-spacing:.09em;margin:26px 0 12px;padding-top:14px;border-top:1px solid var(--rule)}
h1:not(.doctitle):first-of-type{margin-top:0;padding-top:0;border-top:none}
h2{font-family:'Plus Jakarta Sans',Inter,sans-serif;font-weight:800;font-size:12.6pt;
 letter-spacing:0;word-spacing:.10em;margin:22px 0 9px;break-after:avoid}
h2::before{content:"";display:block;width:22px;height:2px;background:var(--gold);margin:0 0 7px;border-radius:1px}
h3{font-size:11pt;font-weight:700;margin:16px 0 6px}
p{margin:0 0 10px}
strong{font-weight:700}
ul,ol{margin:0 0 12px;padding-left:0;list-style:none}
ol{counter-reset:li}
li{position:relative;padding-left:20px;margin-bottom:7px}
ul>li::before{content:"";position:absolute;left:4px;top:.62em;width:5px;height:5px;border-radius:50%;background:var(--gold)}
ol>li{counter-increment:li}
ol>li::before{content:counter(li);position:absolute;left:0;top:.05em;font-family:ui-monospace,Menlo,monospace;font-size:8.4pt;font-weight:700;color:var(--gold)}
table{width:100%;border-collapse:collapse;margin:14px 0 16px;font-size:9.7pt}
thead{display:table-header-group}
tr{break-inside:avoid}
th{text-align:left;font-weight:700;font-size:8.2pt;letter-spacing:.09em;text-transform:uppercase;
 color:var(--soft);padding:0 10px 7px;border-bottom:1.5px solid var(--ink)}
td{padding:9px 10px;border-bottom:1px solid var(--rule);vertical-align:top}
tbody tr:last-child td{border-bottom:none}
hr{border:none;border-top:1px solid var(--rule);margin:22px 0 12px}
p.contact{background:var(--tint);border:1px solid var(--rule);border-left:3px solid var(--gold);
 border-radius:4px;padding:12px 14px;font-size:9.7pt;margin:24px 0 0}
code{font-family:ui-monospace,Menlo,monospace;font-size:8.8pt;background:var(--tint);
 border:1px solid var(--rule);border-radius:3px;padding:0 3px}
`;

function envolver({ cliente, fecha, cuerpoHtml, carpetaCliente = null,
                    eyebrow = 'Minuta de reunión', titulo = 'Acuerdos y siguientes pasos' }) {
  const cfg = CONFIG.leer();
  const acento = cfg.marca.acento || '#B58A3E';
  const suave = acento + '22';   // el mismo tono, translúcido, para los fondos
  const logo = logoDataUri(carpetaCliente);
  const cabecera = logo
    ? `<img src="${logo}" alt="">`
    : `<div style="font-family:'Plus Jakarta Sans',Inter,sans-serif;font-weight:800;font-size:15pt;letter-spacing:-.01em">${cliente}</div>`;
  const emisor = cfg.usuario.empresa
    ? `<div class="issuer">Preparado por<b>${cfg.usuario.empresa}</b></div>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<style>${CSS.replace(/ACENTO_SUAVE/g, suave).replace(/ACENTO/g, acento)}</style></head><body>
<header class="masthead">${cabecera}${emisor}</header>
<p class="eyebrow">${eyebrow}</p>
<h1 class="doctitle">${titulo}</h1>
<p class="subtitle">${cliente} · ${fecha}</p>
<div class="accentbar"></div>
${cuerpoHtml}
</body></html>`;
}

module.exports = { envolver };
