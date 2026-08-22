// Lo que hay que hacer UNA vez al arrancar sobre datos que ya existían.
// Todo idempotente: un segundo arranque no hace nada.
const fs = require('fs'), path = require('path');
const R = require('./rutas');
const MEMORIA = require('./memoria');

// Las minutas anteriores a la memoria propia no están en ella. Sin esto,
// Preparar arrancaría de cero para todos los clientes que ya tienen historia.
function memoriaInicial() {
  let anotadas = 0;
  for (const c of R.clientes()) {
    const dir = R.dirCanonica(c.slug);
    const rs = R.reuniones(c.slug).filter(r => r.minuta).sort((a, b) => a.id.localeCompare(b.id));
    for (const r of rs) {
      const res = MEMORIA.anotar({
        dirCliente: dir, id: r.id, minuta: r.minuta, carpeta: r.carpeta,
        fecha: fechaLegible(r.id),
      });
      if (res.ok) anotadas++;
    }
  }
  return anotadas;
}

function fechaLegible(id) {
  const m = String(id).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return id;
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${+m[3]} de ${meses[+m[2] - 1]} de ${m[1]}`;
}

// Carpetas de reunión sin ningún archivo: grabaciones que no arrancaron.
// Versiones anteriores las dejaban ahí, etiquetadas como "Solo audio".
// Devuelve las rutas para que quien llama las mande a la Papelera.
function carpetasVacias() {
  const vacias = [];
  for (const c of R.clientes()) {
    for (const alias of c.alias || [c.slug]) {
      const dir = path.join(R.BASE(), alias);
      let hijos = [];
      try { hijos = fs.readdirSync(dir); } catch { continue; }
      for (const h of hijos) {
        if (h.startsWith('.')) continue;
        const ruta = path.join(dir, h);
        try {
          if (!fs.statSync(ruta).isDirectory()) continue;
          if (fs.readdirSync(ruta).filter(x => !x.startsWith('.')).length === 0) vacias.push(ruta);
        } catch {}
      }
    }
  }
  return vacias;
}

// Diálogos atribuidos con un criterio anterior al actual. Ya no se reutilizan
// (main.js exige la cabecera de versión), pero rutas.js los sigue enseñando en
// "Quién dijo qué", y al menos uno atribuía turnos a alguien que no estaba.
function dialogosObsoletos(versionActual) {
  const obsoletos = [];
  for (const c of R.clientes()) {
    for (const r of R.reuniones(c.slug)) {
      const f = path.join(r.carpeta, 'dialogo.txt');
      try {
        const cab = fs.readFileSync(f, 'utf8').slice(0, 40);
        if (!cab.startsWith(versionActual)) obsoletos.push(f);
      } catch {}
    }
  }
  return obsoletos;
}

module.exports = { memoriaInicial, carpetasVacias, dialogosObsoletos };
