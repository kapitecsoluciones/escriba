const os = require('os'), path = require('path'), fs = require('fs');
const CONFIG = require('./config');

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

// La carpeta de dossiers puede tener documentos de trabajo que no son clientes.
const NO_CLIENTE = /(\d{8})|spec|plan|matrix|mapping|acceptance|todos|parity|revision|sprint|bench|alignment|optimization|playbook/i;
const esCliente = (slug) => !NO_CLIENTE.test(slug);

// Un cliente puede tener slug de dossier y slug de carpeta distintos: se
// fusionan por nombre y se conservan ambos como alias.
function clientes() {
  const porNombre = new Map();
  const meter = (slug, dossier) => {
    const nombre = titulo(slug);
    if (!nombre) return;
    const previo = porNombre.get(nombre);
    if (previo) {
      if (!previo.alias.includes(slug)) previo.alias.push(slug);
      if (dossier && !previo.dossier) previo.dossier = dossier;
    } else {
      porNombre.set(nombre, { slug, nombre, dossier: dossier || null, alias: [slug] });
    }
  };
  const dirDossiers = DOSSIERS();
  if (dirDossiers) {
    try {
      for (const f of fs.readdirSync(dirDossiers)) {
        if (f.endsWith('.md') && esCliente(f)) meter(f.replace(/\.md$/, ''), path.join(dirDossiers, f));
      }
    } catch {}
  }
  try {
    for (const d of fs.readdirSync(BASE())) {
      if (fs.statSync(path.join(BASE(), d)).isDirectory()) meter(d, null);
    }
  } catch {}
  return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

function reuniones(slug) {
  const cli = clientes().find(c => c.slug === slug || c.alias.includes(slug));
  const dirs = (cli ? cli.alias : [slug]).map(a => path.join(BASE(), a)).filter(d => fs.existsSync(d));
  return dirs.flatMap(dir => fs.readdirSync(dir)
    .filter(d => { try { return fs.statSync(path.join(dir, d)).isDirectory(); } catch { return false; } })
    .map(d => {
      const carpeta = path.join(dir, d);
      const leer = (n) => { try { return fs.readFileSync(path.join(carpeta, n), 'utf8'); } catch { return null; } };
      return {
        id: d, carpeta, fecha: d,
        minuta: leer('minuta.md'),
        transcripcion: leer('mezcla.txt'),
        dialogo: leer('dialogo.txt'),
        tienePdf: fs.existsSync(path.join(carpeta, 'minuta.pdf')),
        anterior: leer('minuta-anterior.md'),
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

function crearCliente(nombre) {
  const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  fs.mkdirSync(path.join(BASE(), slug), { recursive: true });
  return { slug, nombre, dossier: null, alias: [slug] };
}

module.exports = { HOME, BASE, DOSSIERS, BIN, buscarBinario, faltantes, clientes, reuniones, titulo, crearCliente, dentroDeBase };
