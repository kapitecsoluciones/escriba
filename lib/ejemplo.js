const fs = require('node:fs');
const path = require('node:path');
const ATOMICO = require('./atomico');
const { dentroDeBase } = require('./rutas');

function lineaDeTiempo(guion, duraciones) {
  if (!Array.isArray(guion) || !Array.isArray(duraciones) || guion.length !== duraciones.length) {
    throw new Error('Cada turno debe tener una duración.');
  }
  let siguiente = 0;
  return guion.map((turno, i) => {
    if (!['tu', 'cliente'].includes(turno.quien) || !Number.isFinite(duraciones[i]) || duraciones[i] <= 0
        || !Number.isFinite(turno.pausaDespues) || turno.pausaDespues < 0) {
      throw new Error(`Turno o duración inválidos en la posición ${i}.`);
    }
    const desde = siguiente;
    const hasta = desde + duraciones[i];
    siguiente = hasta + turno.pausaDespues;
    return { quien: turno.quien, desde, hasta };
  });
}

function invariantes(linea) {
  let solapes = 0, alternancia = true, islaMaxima = 0, hablado = 0, cliente = 0;
  let inicioIsla = 0;
  for (let i = 0; i < linea.length; i++) {
    const turno = linea[i];
    if (!['tu', 'cliente'].includes(turno.quien) || !Number.isFinite(turno.desde)
        || !Number.isFinite(turno.hasta) || turno.desde < 0 || turno.hasta <= turno.desde) {
      throw new Error(`Intervalo inválido en la posición ${i}.`);
    }
    for (let j = 0; j < i; j++) {
      if (turno.desde < linea[j].hasta && turno.hasta > linea[j].desde) solapes++;
    }
    if (i && turno.quien === linea[i - 1].quien) alternancia = false;
    else inicioIsla = turno.desde;
    islaMaxima = Math.max(islaMaxima, turno.hasta - inicioIsla);
    const duracion = turno.hasta - turno.desde;
    hablado += duracion;
    if (turno.quien === 'cliente') cliente += duracion;
  }
  // Las pausas no pertenecen a ningún hablante; no deben sesgar el reparto.
  return { solapes, alternancia, islaMaxima, fraccionCliente: hablado ? cliente / hablado : 0 };
}

function estadoSeguro(archivo) {
  try {
    const estado = fs.lstatSync(archivo);
    if (estado.isSymbolicLink()) throw new Error(`No se permiten enlaces simbólicos: ${archivo}`);
    return estado;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function instalar({ recursos, base, sello }) {
  if (typeof sello !== 'string' || !/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(sello)) {
    throw new Error('Sello inválido: se requiere YYYY-MM-DD_HHMMSS.');
  }
  if (typeof base !== 'string' || !base.trim()) throw new Error('Falta la carpeta base de reuniones.');
  const raiz = path.resolve(base);
  const slug = 'ejemplo-acme', nombre = 'Ejemplo · Acme';
  const dirCliente = path.join(raiz, slug);
  const carpeta = path.join(dirCliente, sello);
  if (!dentroDeBase(carpeta, raiz)) throw new Error('La reunión está fuera de la carpeta base.');
  estadoSeguro(raiz);
  const estadoCliente = estadoSeguro(dirCliente);
  if (estadoCliente && !estadoCliente.isDirectory()) throw new Error('La carpeta del cliente no es un directorio.');
  if (estadoSeguro(carpeta)) throw new Error(`Ya existe una reunión con el sello ${sello}.`);
  const expediente = path.join(dirCliente, 'expediente.md');
  const datos = path.join(dirCliente, '.cliente.json');
  const hayExpediente = estadoSeguro(expediente);
  const hayDatos = estadoSeguro(datos);
  // Leer antes de crear carpetas evita reservar un sello cuando falta la fixture.
  const contenido = Object.fromEntries(['microfono.m4a', 'sistema.m4a', 'expediente.md']
    .map(archivo => [archivo, fs.readFileSync(path.join(recursos, archivo))]));
  fs.mkdirSync(dirCliente, { recursive: true });
  try {
    // mkdir exclusivo también rechaza dos instalaciones simultáneas con el mismo sello.
    fs.mkdirSync(carpeta);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Ya existe una reunión con el sello ${sello}.`);
    throw error;
  }
  try {
    if (!hayExpediente) ATOMICO.escribirAtomico(expediente, contenido['expediente.md']);
    if (!hayDatos) ATOMICO.escribirAtomico(datos, JSON.stringify({ nombre, expediente }, null, 2));
    for (const archivo of ['microfono.m4a', 'sistema.m4a']) {
      ATOMICO.escribirAtomico(path.join(carpeta, archivo), contenido[archivo]);
    }
    ATOMICO.escribirAtomico(path.join(carpeta, '.reunion.json'), JSON.stringify({ modo: 'llamada', ejemplo: true }, null, 2));
  } catch (error) {
    fs.rmSync(carpeta, { recursive: true, force: true });
    throw error;
  }
  return { carpeta, slug, nombre };
}

module.exports = { instalar, lineaDeTiempo, invariantes };
