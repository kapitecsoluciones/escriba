const os = require('os'), path = require('path'), fs = require('fs'), crypto = require('crypto');
const CONFIG = require('./config');
const ATOMICO = require('./atomico');

const HOME = os.homedir();

// Una app abierta desde el Finder hereda un PATH mínimo que NO incluye
// /opt/homebrew ni /usr/local: por eso hay que buscar los binarios a mano.
const LUGARES = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
                 path.join(HOME, '.local', 'bin'), path.join(HOME, 'bin')];

function buscarBinario(nombre, rutaConfigurada) {
  if (rutaConfigurada && fs.existsSync(rutaConfigurada)) return rutaConfigurada;
  for (const dir of [...LUGARES, ...(process.env.PATH || '').split(':')]) {
    if (!dir) continue;
    const p = path.join(dir, nombre);
    try { if (fs.existsSync(p) && (fs.statSync(p).mode & 0o111)) return p; } catch {}
  }
  return null;
}

// El capturador viaja dentro de la app; en desarrollo vive junto al proyecto.
function rutaCaptura() {
  const empaquetado = path.join(process.resourcesPath || '', 'capturasistema');
  if (fs.existsSync(empaquetado)) return empaquetado;
  const local = path.join(__dirname, '..', 'nativo', 'capturasistema');
  if (fs.existsSync(local)) return local;
  return buscarBinario('capturasistema');
}

const BIN = () => {
  const c = CONFIG.leer();
  return {
    captura: rutaCaptura(),
    whisper: buscarBinario('whisper-cli'),
    ffmpeg: buscarBinario('ffmpeg'),
    ffprobe: buscarBinario('ffprobe'),
    claude: buscarBinario('claude'),
    codex: buscarBinario('codex'),
    ollama: buscarBinario('ollama'),
    modelo: c.rutas.modelo,
  };
};

// Qué falta para poder trabajar
function faltantes() {
  const b = BIN(), falta = [];
  // El texto lo lee alguien que no programa: nada de nombres de binarios sueltos.
  if (!b.captura) falta.push({ que: 'El grabador de audio', como: 'Falta una pieza de la instalación. Vuelve a instalar Escriba desde el .dmg.' });
  if (!b.whisper) falta.push({ que: 'El transcriptor', como: 'brew install whisper-cpp' });
  if (!b.ffmpeg) falta.push({ que: 'El procesador de audio', como: 'brew install ffmpeg' });
  if (!fs.existsSync(b.modelo)) falta.push({ que: 'El modelo de transcripción', como: 'Se descarga una sola vez desde aquí mismo (1.5 GB).' });
  return falta;
}

const BASE = () => CONFIG.leer().rutas.reuniones;
const DOSSIERS = () => CONFIG.leer().rutas.dossiers;

// Nombre legible: "acme-mx.md" -> "Acme"
const SIGLAS = { mx: '', ai: 'AI', gtm: 'GTM', pos: 'POS', crm: 'CRM', seo: 'SEO' };
function titulo(slug) {
  const partes = slug.replace(/\.md$/, '').split(/[-_]/).filter(Boolean);
  const limpias = partes.filter((p, i) => !(p === 'mx' && i === partes.length - 1) && !/^\d{6,8}$/.test(p));
  return limpias.map(p => {
    const k = p.toLowerCase();
    if (SIGLAS[k] !== undefined) return SIGLAS[k] || p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(' ').replace(/\s+/g, ' ').trim();
}

// La carpeta de expedientes es de contexto general, no un padrón de clientes:
// junto a los clientes hay specs, planes y documentos de trabajo.
const NO_CLIENTE = /(\d{8})|spec|plan|matrix|mapping|acceptance|todos|parity|revision|sprint|bench|alignment|optimization|playbook/i;
const esCliente = (slug) => !NO_CLIENTE.test(slug);

// Todos los expedientes disponibles, para ofrecerlos al crear un cliente.
function expedientes() {
  const dir = DOSSIERS();
  if (!dir) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && esCliente(f))
      .map(f => ({ slug: f.replace(/\.md$/, ''), nombre: titulo(f), archivo: path.join(dir, f) }))
      .filter(e => e.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  } catch { return []; }
}

// Lo que el usuario decidió sobre este cliente vive en su propia carpeta: el
// nombre tal como lo escribió y el expediente que le enlazó. Sin esto el nombre
// se reconstruye del nombre de carpeta y sale con cada palabra en mayúscula
// ("Amigo Del Sitio Web"), que no es como nadie escribe el nombre de un cliente.
const ARCHIVO_DATOS = '.cliente.json';
function datosCliente(dirCliente) {
  try { return JSON.parse(fs.readFileSync(path.join(dirCliente, ARCHIVO_DATOS), 'utf8')) || {}; }
  catch { return {}; }
}
function guardarDatosCliente(slug, cambios) {
  if (!slug) throw new Error('Falta el identificador del cliente.');
  const dir = path.join(BASE(), slug);
  fs.mkdirSync(dir, { recursive: true });
  const datos = { ...datosCliente(dir), ...cambios };
  for (const k of Object.keys(datos)) if (datos[k] == null) delete datos[k];
  ATOMICO.escribirAtomico(path.join(dir, ARCHIVO_DATOS), JSON.stringify(datos, null, 2));
  return datos;
}
function expedienteEnlazado(dirCliente) {
  const ruta = datosCliente(dirCliente).expediente;
  return ruta && fs.existsSync(ruta) ? ruta : null;
}
function enlazarExpediente(slug, archivo) {
  if (!slug) return { ok: false, error: 'Falta el identificador del cliente.' };
  guardarDatosCliente(slug, { expediente: archivo || null });
  return { ok: true };
}

// Un cliente es alguien a quien has grabado o que creaste a propósito: las
// carpetas de ~/Reuniones. Antes la lista se armaba también con cada .md de la
// carpeta de expedientes, y se llenaba de proyectos que no son clientes.
// El expediente se enlaza a mano, o por coincidencia de nombre si no.
function clientes() {
  const porNombre = new Map();
  const disponibles = expedientes();
  const meter = (slug) => {
    const dirCliente = path.join(BASE(), slug);
    // el nombre que escribió el usuario manda; si no hay, se deduce de la carpeta
    const nombre = (datosCliente(dirCliente).nombre || '').trim() || titulo(slug);
    if (!nombre) return;
    const dossier = expedienteEnlazado(dirCliente)
      || (disponibles.find(e => e.nombre === nombre) || {}).archivo
      || null;
    const previo = porNombre.get(nombre);
    if (previo) {
      if (!previo.alias.includes(slug)) previo.alias.push(slug);
      if (dossier && !previo.dossier) previo.dossier = dossier;
    } else {
      porNombre.set(nombre, { slug, nombre, dossier, alias: [slug] });
    }
  };
  try {
    for (const d of fs.readdirSync(BASE())) {
      if (d.startsWith('.')) continue;
      try { if (fs.statSync(path.join(BASE(), d)).isDirectory()) meter(d); } catch {}
    }
  } catch {}
  return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function pdfVigente(carpeta) {
  try {
    const pdf = fs.statSync(path.join(carpeta, 'minuta.pdf')).mtimeMs;
    const md = fs.statSync(path.join(carpeta, 'minuta.md')).mtimeMs;
    return pdf >= md;
  } catch { return false; }
}

function metaReunion(carpeta) {
  try { return JSON.parse(fs.readFileSync(path.join(carpeta, '.reunion.json'), 'utf8')) || {}; }
  catch { return {}; }
}

function guardarMotorReunion(carpeta, motor) {
  if (!dentroDeBase(carpeta)) throw new Error('La reunión está fuera de la carpeta de Escriba.');
  const id = String((motor || {}).id || '').trim();
  const nombre = String((motor || {}).nombre || '').trim();
  if (!id || !nombre) throw new Error('Falta identificar el motor de redacción.');
  const meta = { ...metaReunion(carpeta), motor: { id, nombre } };
  ATOMICO.escribirAtomico(path.join(carpeta, '.reunion.json'), JSON.stringify(meta, null, 2));
  return meta.motor;
}

function reuniones(slug) {
  if (!slug) return [];   // con slug vacío, los dirs serían la carpeta raíz
  const cli = clientes().find(c => c.slug === slug || c.alias.includes(slug));
  const dirs = (cli ? cli.alias : [slug]).map(a => path.join(BASE(), a)).filter(d => fs.existsSync(d));
  return dirs.flatMap(dir => fs.readdirSync(dir)
    .filter(d => { try { return fs.statSync(path.join(dir, d)).isDirectory(); } catch { return false; } })
    .map(d => {
      const carpeta = path.join(dir, d);
      const leer = (n) => { try { return fs.readFileSync(path.join(carpeta, n), 'utf8'); } catch { return null; } };
      const meta = metaReunion(carpeta);
      return {
        id: d, carpeta, fecha: d,
        minuta: leer('minuta.md'),
        transcripcion: leer('mezcla.txt'),
        // la primera línea es la versión del formato, no parte del diálogo
        dialogo: (d => d && d.startsWith('<!-- escriba:dialogo:') ? d.slice(d.indexOf('\n') + 1) : d)(leer('dialogo.txt')),
        tienePdf: fs.existsSync(path.join(carpeta, 'minuta.pdf')),
        // al día = posterior a la última edición de minuta.md; si no, Compartir mandaría un PDF viejo
        pdfVigente: pdfVigente(carpeta),
        anterior: leer('minuta-anterior.md'),
        tieneAudio: fs.existsSync(path.join(carpeta, 'mezcla.m4a')),
        motor: meta.motor || null,
      };
    })
  ).sort((a, b) => b.id.localeCompare(a.id));
}

// ¿Esta carpeta está dentro del área de Escriba? La ruta a borrar viene del
// renderer: sin esta comprobación, un valor equivocado mandaría a la Papelera
// una carpeta que no es de la app. Se compara ya resuelta, para que ".." no
// pueda salirse, y se exige que sea una subcarpeta, no la base misma.
function dentroDeBase(carpeta, base = BASE()) {
  if (!carpeta || !base) return false;
  const raiz = path.resolve(base);
  const objetivo = path.resolve(carpeta);
  return objetivo !== raiz && objetivo.startsWith(raiz + path.sep);
}

// Nombre de carpeta a partir del nombre del cliente.
//
// Un nombre sin letras latinas ("北京", "🙂", "###") dejaba el slug VACÍO, y con
// slug vacío `path.join(BASE(), '')` es la carpeta raíz: `reuniones('')` listaba
// a los demás clientes como si fueran reuniones suyas, y "Borrar esta reunión"
// mandaba a la Papelera la carpeta completa de otro cliente. El guardia de ruta
// no protegía, porque esas carpetas sí están dentro de la base.
//
// El slug es solo un nombre de carpeta —el nombre que se ve vive en
// .cliente.json—, así que cuando no queda nada legible se usa un identificador
// estable en vez de rechazar al cliente.
function aSlug(nombre) {
  const base = String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (base) return base;
  const huella = crypto.createHash('sha1').update(String(nombre || '')).digest('hex').slice(0, 8);
  return 'cliente-' + huella;
}

// Un slug que llega del renderer tiene que ser una carpeta válida bajo BASE.
// Vacío o con separadores, `path.join(BASE(), slug)` cae en la raíz o fuera.
function exigirSlug(slug) {
  const s = String(slug || '').trim();
  if (!s || s === '.' || s === '..' || /[\/\\]/.test(s)) {
    throw new Error('Falta el identificador del cliente.');
  }
  return s;
}

// La carpeta canónica de un cliente. Un cliente fusionado desde dos carpetas
// (alias) tiene UNA memoria y UNA preparación: las de su carpeta canónica.
// Anotar en la carpeta donde cayó la grabación y leer de la canónica partía la
// memoria en dos y Preparar solo veía una mitad.
function dirCanonica(slug) {
  const s = exigirSlug(slug);
  const cli = clientes().find(c => c.slug === s || (c.alias || []).includes(s));
  return path.join(BASE(), cli ? cli.slug : s);
}

function crearCliente(nombre, expediente = null) {
  if (!String(nombre || '').trim()) throw new Error('El cliente necesita un nombre.');
  const slug = aSlug(nombre);
  fs.mkdirSync(path.join(BASE(), slug), { recursive: true });
  guardarDatosCliente(slug, { nombre, expediente: expediente || null });
  return { slug, nombre, dossier: expediente || null, alias: [slug] };
}

module.exports = { HOME, BASE, DOSSIERS, BIN, buscarBinario, faltantes, clientes, reuniones, titulo,
                   crearCliente, aSlug, exigirSlug, dirCanonica, dentroDeBase, expedientes, enlazarExpediente, expedienteEnlazado,
                   datosCliente, guardarDatosCliente, guardarMotorReunion, metaReunion };
