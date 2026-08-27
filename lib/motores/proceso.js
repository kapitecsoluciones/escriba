const USA_GRUPO = process.platform !== 'win32';

function aislado() {
  return USA_GRUPO;
}

function terminar(p, senal) {
  if (!p || !p.pid) return;
  try {
    // Las CLIs pueden abrir helpers propios; matar solo al PID principal deja
    // esos procesos usando la transcripción mientras ya corre otro proveedor.
    process.kill(USA_GRUPO ? -p.pid : p.pid, senal);
  } catch (e) {
    if (e.code === 'ESRCH') return;
    try { p.kill(senal); } catch {}
  }
}

function activo(p) {
  if (!p || !p.pid) return false;
  try {
    process.kill(USA_GRUPO ? -p.pid : p.pid, 0);
    return true;
  } catch (e) {
    if (e.code === 'ESRCH') return false;
    return true;
  }
}

module.exports = { activo, aislado, terminar };
