// La memoria de Escriba, por cliente y bajo su control.
//
// Antes esto se escribía dentro del expediente del usuario en `.ai-context`, y
// el bucle nunca llegó a cerrarse ni una vez:
//
//   - `prompt.js` leía los PRIMEROS 60.000 caracteres del expediente y
//     `dossier.js` escribía al FINAL con `appendFileSync`. Escriba escribía
//     exactamente en la región que el lector no mira. Medido el 21-ago-2026:
//     el único bloque que llegó a escribirse quedó en el carácter 61.946 de un
//     archivo de 63.663 — ya invisible con UNA reunión.
//   - Lo que escribía tampoco servía: filtraba por líneas que empiezan en `**`,
//     así que las tablas de compromisos —lo único que querrías consultar— se
//     descartaban enteras, y con una minuta de encabezados normales el resumen
//     salía vacío.
//   - Y hacía cirugía de texto sobre un archivo que el usuario edita a la vez
//     con otras herramientas.
//
// Ahora Escriba escribe solo aquí, en la carpeta del cliente, con un formato que
// ella misma define. El expediente de `.ai-context` pasa a ser SOLO LECTURA.
const fs = require('fs'), path = require('path');
const ATOMICO = require('./atomico');
const MINUTA = require('./minuta');

const ARCHIVO = 'memoria.md';
const ruta = (dirCliente) => path.join(dirCliente, ARCHIVO);

function leer(dirCliente) {
  try { return fs.readFileSync(ruta(dirCliente), 'utf8'); } catch { return ''; }
}

// Lo acordado, en prosa corta. No se filtra por formato —ese fue el error—:
// se toma el cuerpo del cliente sin su encabezado y se corta por párrafos.
function resumirAcuerdos(cuerpo, limite = 1200) {
  const parrafos = String(cuerpo || '').split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p && !/^\|/.test(p) && !/^#{1,6}\s/.test(p) && !/·.*·/.test(p));
  const salida = [];
  let largo = 0;
  for (const p of parrafos) {
    // `continue`, no `break`: un párrafo largo temprano no puede dejar fuera
    // una frase corta e importante que viene después
    if (largo + p.length > limite) continue;
    salida.push(p.replace(/\s+/g, ' '));
    largo += p.length;
  }
  return salida;
}

// Un bloque por reunión. La clave es el ID de la reunión, no la fecha del día:
// con fecha de día, dos juntas del mismo cliente el mismo día hacían que la
// segunda no se anotara nunca, y en silencio.
function anotar({ dirCliente, id, fecha, minuta, carpeta, reemplazar = false }) {
  if (!dirCliente) return { ok: false, motivo: 'sin carpeta de cliente' };
  // el ID va dentro de un comentario HTML: un `-->` en él lo cerraría antes
  // de tiempo y el resto saldría como texto visible hacia el prompt
  id = String(id || '').replace(/-->/g, '').trim();
  if (!id) return { ok: false, motivo: 'sin identificador' };
  const marca = `<!-- reunion:${id} -->`;
  if (leer(dirCliente).includes(marca)) {
    // "Volver a redactar" y editar a mano dejaban la memoria con la versión
    // descartada: la próxima reunión se preparaba contra un texto que ya no existía
    if (!reemplazar) return { ok: false, motivo: 'ya registrada' };
    quitar(dirCliente, id);
  }

  const { cliente, internas } = MINUTA.separar(minuta);
  const acuerdos = resumirAcuerdos(cliente);
  const compromisos = MINUTA.conEstado(minuta, carpeta);
  const abiertos = MINUTA.hallazgos(minuta, 12);

  let b = `\n${marca}\n## ${fecha} — Reunión\n\n`;
  b += `Minuta completa: \`${path.join(carpeta, 'minuta.md')}\`\n`;
  if (acuerdos.length) b += `\n**Lo acordado**\n\n${acuerdos.map(a => `- ${a}`).join('\n')}\n`;
  if (compromisos.length) {
    b += `\n**Compromisos**\n\n` + compromisos.map(c =>
      `- [${c.hecho ? 'x' : ' '}] ${c.texto}` +
      (c.quien ? ` — ${c.quien}` : '') + (c.cuando ? ` · ${c.cuando}` : '')).join('\n') + '\n';
  }
  if (abiertos.length) {
    b += `\n**Quedó sin resolver** (comprobar si se retoma la próxima vez)\n\n` +
         abiertos.map(x => `- ${x}`).join('\n') + '\n';
  }
  ATOMICO.anexarAtomico(ruta(dirCliente), b);
  return { ok: true };
}

// Quitar el bloque de una reunión borrada, para no dejar referencias colgando.
function quitar(dirCliente, id) {
  try {
    const texto = leer(dirCliente);
    const marca = `<!-- reunion:${id} -->`;
    const i = texto.indexOf(marca);
    if (i === -1) return false;
    const siguiente = texto.indexOf('\n<!-- reunion:', i + marca.length);
    const fin = siguiente === -1 ? texto.length : siguiente;
    const limpio = (texto.slice(0, i) + texto.slice(fin)).replace(/\n{4,}/g, '\n\n\n').replace(/^\n+/, '');
    ATOMICO.escribirAtomico(ruta(dirCliente), limpio);
    return true;
  } catch { return false; }
}

// Los compromisos que siguen abiertos en todo el historial del cliente.
function pendientes(reuniones) {
  const vistos = new Set(); const salida = [];
  for (const r of reuniones) {
    if (!r.minuta) continue;
    for (const c of MINUTA.conEstado(r.minuta, r.carpeta)) {
      const k = MINUTA.clave(c.texto);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      if (!c.hecho) salida.push({ ...c, reunion: r.id });
    }
  }
  return salida;
}

module.exports = { leer, anotar, quitar, pendientes, resumirAcuerdos, ARCHIVO };
