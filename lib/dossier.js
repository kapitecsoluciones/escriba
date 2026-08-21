// Expediente del cliente: cierra el ciclo de memoria. Cada reunión queda anotada
// en el .md del cliente, para que la próxima vez la app arranque sabiendo lo que
// se acordó hoy. Vive fuera de main.js para poder probarse sin Electron.
const fs = require('fs'), path = require('path');

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

// Quita del expediente el bloque que apuntaba a una reunión borrada, para no
// dejar una referencia colgando a una carpeta que ya no existe.
function quitarDelDossier(dossier, carpeta) {
  try {
    if (!dossier || !fs.existsSync(dossier)) return false;
    const texto = fs.readFileSync(dossier, 'utf8');
    const aguja = path.join(carpeta, 'minuta.md');
    const pos = texto.indexOf(aguja);
    if (pos === -1) return false;
    let inicio = texto.lastIndexOf('\n## ', pos);
    // si el bloque es el primero del archivo no lleva salto de línea delante
    if (inicio === -1) inicio = /^##\s/.test(texto) ? 0 : -1;
    if (inicio === -1) return false;
    const siguiente = texto.indexOf('\n## ', pos);
    const fin = siguiente === -1 ? texto.length : siguiente;
    const limpio = (texto.slice(0, inicio) + texto.slice(fin))
      .replace(/\n{4,}/g, '\n\n\n').replace(/^\n+/, '');
    fs.writeFileSync(dossier, limpio);
    return true;
  } catch { return false; }
}

module.exports = { actualizarDossier, quitarDelDossier };
