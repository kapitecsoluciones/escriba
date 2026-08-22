// Expediente del cliente: cierra el ciclo de memoria. Cada reunión queda anotada
// en el .md del cliente, para que la próxima vez la app arranque sabiendo lo que
// se acordó hoy. Vive fuera de main.js para poder probarse sin Electron.
const fs = require('fs'), path = require('path');
const ATOMICO = require('./atomico');

// Solo lectura. `actualizarDossier` vivió aquí y se fue: escribía en el
// expediente del usuario, en la región que el prompt no leía, y era código
// muerto (el handler existía pero el preload nunca lo expuso). La memoria de
// Escriba está en lib/memoria.js; aquí queda únicamente la limpieza de bloques
// que versiones anteriores llegaron a escribir en expedientes ajenos.

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
    ATOMICO.escribirAtomico(dossier, limpio);
    return true;
  } catch { return false; }
}

module.exports = { quitarDelDossier };
