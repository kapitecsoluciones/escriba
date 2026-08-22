// Índice en memoria de la biblioteca: clientes, reuniones y su texto.
//
// La búsqueda releía CUATRO archivos por reunión (minuta, transcripción,
// diálogo, versión anterior) en cada tecla, con readFileSync, y llamaba a
// clientes() una vez por cliente: con 20 clientes y 100 reuniones eran decenas
// de MB por pulsación y la ventana entera se congelaba.
//
// Se reconstruye solo cuando cambia algo en disco. La "firma" son las fechas
// de modificación de las carpetas y archivos (stat, sin leer contenido); con
// 100 reuniones son unos 150 stat, por debajo de un milisegundo de CPU. Y no
// hace falta invalidar a mano desde cada sitio que escribe: las escrituras son
// atómicas (temporal + rename), y el rename cambia la fecha de la carpeta.
const fs = require('fs'), path = require('path');
const R = require('./rutas');
const MEMORIA = require('./memoria');

const plano = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

let CACHE = { firma: null, clientes: [], docs: [], porSlug: new Map() };

function firma() {
  const base = R.BASE();
  const partes = [];
  try { partes.push(fs.statSync(base).mtimeMs); } catch { return 'sin-base'; }
  let dirs = [];
  try { dirs = fs.readdirSync(base).filter(d => !d.startsWith('.')); } catch {}
  for (const d of dirs) {
    const dir = path.join(base, d);
    let st; try { st = fs.statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    partes.push(d, st.mtimeMs);
    let hijos = []; try { hijos = fs.readdirSync(dir); } catch {}
    for (const h of hijos) { try { partes.push(fs.statSync(path.join(dir, h)).mtimeMs); } catch {} }
  }
  return partes.join('|');
}

// Un título para la reunión. El modelo no escribe uno: la primera línea es
// "cliente · fecha · duración". Lo más parecido a "de qué fue" es el primer
// encabezado propio o, si no, la primera frase en negrita de la primera
// sección, que en estas minutas es el acuerdo principal.
const GENERICOS = /^(minuta|minuta de reuni[oó]n|compromisos|acuerdos|lo que qued[oó] definido|notas internas.*|siguientes pasos|resumen)$/i;
function tituloReunion(minuta) {
  if (!minuta) return null;
  const lineas = minuta.split('\n');
  for (const l of lineas) {
    const h = /^#\s+(.+?)\s*$/.exec(l);
    if (h && !GENERICOS.test(h[1].trim()) && h[1].length <= 90) return h[1].trim();
  }
  let primera = true;
  for (const l of lineas) {
    const b = /\*\*([^*]{6,120})\*\*/.exec(l);
    if (!b) continue;
    const t = b[1].trim().replace(/[.:;]\s*$/, '');
    // la línea de meta (cliente · fecha · duración) no es un título
    if (primera && (/ · /.test(t) || /minutos|\b\d{4}\b/.test(t))) { primera = false; continue; }
    primera = false;
    if (GENERICOS.test(t) || t.length > 90) continue;
    return t;
  }
  return null;
}

function construir() {
  const clientes = R.clientes();
  const docs = [];
  const porSlug = new Map();
  for (const c of clientes) {
    const rs = R.reuniones(c.slug);
    for (const r of rs) {
      docs.push({
        cliente: c.nombre, slug: c.slug, id: r.id, carpeta: r.carpeta,
        titulo: tituloReunion(r.minuta),
        minuta: r.minuta, transcripcion: r.transcripcion,
        bajoMinuta: plano(r.minuta), bajoTrans: plano(r.transcripcion),
      });
    }
    const pendientes = MEMORIA.pendientes(rs);
    porSlug.set(c.slug, { ultima: rs.length ? rs[0].id : null, pendientes: pendientes.length, reuniones: rs.length });
  }
  return { clientes, docs, porSlug };
}

function indice() {
  const f = firma();
  if (f !== CACHE.firma) { const c = construir(); CACHE = { firma: f, ...c }; }
  return CACHE;
}

// Clientes con lo que la barra lateral necesita: los de reunión más reciente
// primero; los que no tienen ninguna, al final y por nombre.
function clientes() {
  const { clientes, porSlug } = indice();
  return clientes.map(c => ({ ...c, ...(porSlug.get(c.slug) || { ultima: null, pendientes: 0, reuniones: 0 }) }))
    .sort((a, b) => {
      if (a.ultima && b.ultima) return b.ultima.localeCompare(a.ultima);
      if (a.ultima || b.ultima) return a.ultima ? -1 : 1;
      return a.nombre.localeCompare(b.nombre, 'es');
    });
}

function reuniones(slug) {
  return R.reuniones(slug).map(r => ({ ...r, titulo: tituloReunion(r.minuta) }));
}

function pendientes(slug) {
  return MEMORIA.pendientes(R.reuniones(slug));
}

// Por palabras, todas tienen que aparecer (en la minuta o en la transcripción).
// "hablamos del precio" antes solo encontraba esa secuencia exacta.
function buscar(termino, tope = 40) {
  const limpio = plano(termino).trim();
  const palabras = [...new Set(limpio.split(/\s+/).filter(p => p.length >= 2))];
  if (limpio.length < 3 || !palabras.length) return { total: 0, resultados: [], palabras };
  const { docs } = indice();
  const hallados = [];
  for (const d of docs) {
    const enMinuta = palabras.filter(p => d.bajoMinuta.includes(p)).length;
    const enTrans = palabras.filter(p => d.bajoTrans.includes(p)).length;
    if (!palabras.every(p => d.bajoMinuta.includes(p) || d.bajoTrans.includes(p))) continue;
    // el fragmento sale de donde más palabras caen; la minuta gana en empate
    const [campo, texto, bajo] = enMinuta >= enTrans && d.minuta
      ? ['minuta', d.minuta, d.bajoMinuta] : ['transcripción', d.transcripcion || '', d.bajoTrans];
    const primera = palabras.find(p => bajo.includes(p));
    const i = Math.max(0, bajo.indexOf(primera));
    const frag = texto.slice(Math.max(0, i - 70), i + 110)
      .replace(/\s+/g, ' ').replace(/\*\*/g, '').replace(/#+\s*/g, '').trim();
    hallados.push({ cliente: d.cliente, slug: d.slug, id: d.id, titulo: d.titulo, campo, fragmento: frag });
  }
  hallados.sort((a, b) => b.id.localeCompare(a.id));   // lo reciente primero
  return { total: hallados.length, resultados: hallados.slice(0, tope), palabras };
}

// para pruebas: obligar a reconstruir
function olvidar() { CACHE = { firma: null, clientes: [], docs: [], porSlug: new Map() }; }

module.exports = { indice, clientes, reuniones, pendientes, buscar, tituloReunion, plano, firma, olvidar };
