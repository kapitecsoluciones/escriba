// Escritura atómica: o queda el contenido nuevo entero, o queda el viejo entero.
//
// `writeFileSync` primero TRUNCA y después escribe. Entre esas dos cosas —un
// cierre forzado, un disco lleno, un corte de luz— el archivo queda a medias, y
// a medias es peor que perdido: `config.json` truncado hace que la app arranque
// con los valores por defecto y la lista de clientes desaparezca sin decir nada;
// `minuta.md` truncada se lleva las correcciones que el usuario acababa de hacer.
//
// Tres partes, las tres importan:
//   1. El temporal va en el MISMO directorio que el destino. `rename` solo es
//      atómico dentro del mismo volumen, y las reuniones pueden vivir en un
//      disco externo o en iCloud Drive: desde /tmp sería una copia.
//   2. `fsync` antes de renombrar: sin él el rename puede hacerse visible en
//      disco ANTES que el contenido, y tras un corte de luz queda un archivo
//      renombrado atómicamente… y vacío.
//   3. Si algo falla, el temporal se borra. Un temporal huérfano en la carpeta
//      del cliente saldría en el Finder y confundiría más que el fallo.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function escribirAtomico(ruta, contenido, opciones = {}) {
  const dir = path.dirname(ruta);
  // punto delante: fuera del Finder y del listado de clientes de rutas.js
  const tmp = path.join(dir, `.${path.basename(ruta)}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`);
  let modo = opciones.modo;
  if (modo === undefined) { try { modo = fs.statSync(ruta).mode & 0o777; } catch { modo = 0o644; } }
  fs.mkdirSync(dir, { recursive: true });
  let fd = null;
  try {
    fd = fs.openSync(tmp, 'w', modo);
    fs.writeFileSync(fd, contenido);
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = null;
    fs.chmodSync(tmp, modo);          // openSync aplica la umask; esto lo fija
    fs.renameSync(tmp, ruta);         // como propiedad, para que las pruebas lo puedan sustituir
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

// Añadir al final sin riesgo: se lee entero, se concatena y se reescribe por
// el camino de arriba. Un `appendFileSync` cortado a medias no destruye lo
// anterior, pero puede dejar la marca de una reunión sin su contenido, y la
// deduplicación la daría por anotada para siempre.
function anexarAtomico(ruta, contenido) {
  let previo = '';
  try { previo = fs.readFileSync(ruta, 'utf8'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  escribirAtomico(ruta, previo + contenido);
}

module.exports = { escribirAtomico, anexarAtomico };
