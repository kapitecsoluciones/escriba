import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import ejemplo from '../../lib/ejemplo.js';
import atomico from '../../lib/atomico.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const voces = { tu: 'Mónica', cliente: 'Paulina' };
const opciones = { '--voz-tu': 'tu', '--voz-cliente': 'cliente' };
for (let i = 2; i < process.argv.length; i += 2) {
  const quien = opciones[process.argv[i]];
  const voz = process.argv[i + 1];
  if (!quien || !voz || voz.startsWith('--')) {
    throw new Error('Uso: node build/ejemplo/render.mjs [--voz-tu Mónica] [--voz-cliente Paulina]');
  }
  voces[quien] = voz;
}

function binario(nombre) {
  const candidato = path.join('/opt/homebrew/bin', nombre);
  return fs.existsSync(candidato) ? candidato : nombre;
}

function duracion(archivo) {
  const segundos = Number(execFileSync(binario('ffprobe'), [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', archivo
  ], { encoding: 'utf8' }).trim());
  if (!Number.isFinite(segundos) || segundos <= 0) throw new Error(`Duración inválida: ${archivo}`);
  return segundos;
}

const guion = JSON.parse(fs.readFileSync(path.join(dir, 'guion.json'), 'utf8'));
const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-ejemplo-'));
try {
  const duraciones = guion.map((turno, i) => {
    const archivo = path.join(temporal, `${i}.aiff`);
    execFileSync('/usr/bin/say', ['-v', voces[turno.quien], '-o', archivo, turno.texto]);
    const segundos = duracion(archivo);
    console.log(`Turno ${i + 1}/${guion.length}: ${turno.quien}, ${segundos.toFixed(2)} s`);
    return segundos;
  });
  const linea = ejemplo.lineaDeTiempo(guion, duraciones);
  const invariantes = ejemplo.invariantes(linea);
  if (invariantes.solapes || !invariantes.alternancia || invariantes.islaMaxima > 40
      || invariantes.fraccionCliente < 0.45 || invariantes.fraccionCliente > 0.75) {
    throw new Error(`La fixture no cumple las invariantes: ${JSON.stringify(invariantes)}`);
  }
  const total = linea.at(-1).hasta + guion.at(-1).pausaDespues;
  const archivos = { tu: 'microfono.m4a', cliente: 'sistema.m4a' };
  const medidas = [];
  for (const [quien, nombre] of Object.entries(archivos)) {
    const indices = linea.map((turno, i) => turno.quien === quien ? i : -1).filter(i => i >= 0);
    const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono'];
    for (const i of indices) args.push('-i', path.join(temporal, `${i}.aiff`));
    const filtros = indices.map((i, j) =>
      `[${j + 1}:a]aresample=48000,adelay=${Math.round(linea[i].desde * 48000)}S:all=1[v${j}]`);
    // El silencio fija la duración y normalize=0 evita atenuar la voz por cada entrada muda.
    filtros.push(`[0:a]${indices.map((_, j) => `[v${j}]`).join('')}`
      + `amix=inputs=${indices.length + 1}:duration=first:normalize=0,atrim=duration=${total}[out]`);
    const salida = path.join(temporal, nombre);
    args.push('-filter_complex', filtros.join(';'), '-map', '[out]', '-t', String(total),
      '-c:a', 'aac', '-ar', '48000', '-ac', '1', '-b:a', '64k', '-movflags', '+faststart', salida);
    execFileSync(binario('ffmpeg'), args);
    medidas.push({ archivo: nombre, duracion: duracion(salida), bytes: fs.statSync(salida).size });
  }
  if (Math.abs(medidas[0].duracion - medidas[1].duracion) > 0.05
      || medidas.some(m => m.bytes >= 2_000_000)) {
    throw new Error(`Duración o tamaño fuera de límite: ${JSON.stringify(medidas)}`);
  }
  for (const nombre of Object.values(archivos)) {
    atomico.escribirAtomico(path.join(dir, nombre), fs.readFileSync(path.join(temporal, nombre)));
  }
  atomico.escribirAtomico(path.join(dir, 'linea-de-tiempo.json'), JSON.stringify(linea, null, 2) + '\n');
  console.log(JSON.stringify({ voces, medidas, invariantes }, null, 2));
} finally {
  fs.rmSync(temporal, { recursive: true, force: true });
}
