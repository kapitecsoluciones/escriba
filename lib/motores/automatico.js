function esCancelacion(error, senal) {
  return !!(senal && senal.aborted) || !!(error && (error.cancelado || error.name === 'AbortError'));
}

function observar(callback, motor) {
  try { if (callback) callback(motor); } catch {}
}

function cancelado() {
  return Object.assign(new Error('Cancelado'), { cancelado: true });
}

async function conCancelacion(promesa, senal) {
  if (!senal) return promesa;
  if (senal.aborted) throw cancelado();
  let alAbortar;
  const aborto = new Promise((_res, rej) => {
    alAbortar = () => rej(cancelado());
    senal.addEventListener('abort', alAbortar, { once: true });
  });
  try { return await Promise.race([promesa, aborto]); }
  finally { senal.removeEventListener('abort', alAbortar); }
}

async function redactarConPlazo(motor, prompt, senal, timeoutMs) {
  const ac = new AbortController();
  let vencio = false;
  const cancelarUsuario = () => ac.abort();
  if (senal) {
    if (senal.aborted) throw cancelado();
    senal.addEventListener('abort', cancelarUsuario, { once: true });
  }
  let timer;
  let cierreForzado;
  let rechazarLimite;
  const limite = new Promise((_res, rej) => {
    rechazarLimite = rej;
    timer = setTimeout(() => {
      vencio = true;
      ac.abort();
      cierreForzado = setTimeout(() => {
        rechazarLimite(new Error(`${motor.nombre} excedió el tiempo máximo de respuesta`));
      }, 3500);
    }, timeoutMs);
  });
  try {
    return await Promise.race([motor.redactar(prompt, { senal: ac.signal }), limite]);
  } catch (e) {
    if (senal && senal.aborted) throw cancelado();
    if (vencio) throw new Error(`${motor.nombre} excedió el tiempo máximo de respuesta`);
    throw e;
  } finally {
    clearTimeout(timer);
    if (cierreForzado) clearTimeout(cierreForzado);
    if (senal) senal.removeEventListener('abort', cancelarUsuario);
  }
}

function crearAutomatico(motores, { timeoutMs = 5 * 60 * 1000 } = {}) {
  const cadena = [...motores];
  return {
    id: 'automatico',
    nombre: 'Automático',
    descripcion: 'Prueba Claude Code, después Codex y, si están configurados, los motores local o con llave.',
    privacidad: 'La transcripción, la memoria y el expediente enlazado pueden enviarse, en orden, a más de un motor hasta que uno responda. El audio nunca sale del equipo.',

    async disponible() {
      for (const motor of cadena) {
        try { if (await motor.disponible()) return true; } catch {}
      }
      return false;
    },

    async probar() {
      try {
        let usado = null;
        const texto = await this.redactar('Responde solo con la palabra LISTO.', {
          alExito: (motor) => { usado = motor; },
        });
        const detalle = `${usado ? usado.nombre + ': ' : ''}${texto.trim().slice(0, 120)}`;
        return { ok: /LISTO/i.test(texto), detalle };
      } catch (e) { return { ok: false, detalle: e.message }; }
    },

    async redactar(prompt, { senal, alIntentar, alExito } = {}) {
      const fallos = [];
      for (const motor of cadena) {
        let disponible = false;
        try { disponible = await conCancelacion(Promise.resolve().then(() => motor.disponible()), senal); }
        catch (e) {
          if (esCancelacion(e, senal)) throw e;
          fallos.push(`${motor.nombre}: ${e.message}`);
          continue;
        }
        if (!disponible) { fallos.push(`${motor.nombre}: no disponible`); continue; }

        try {
          observar(alIntentar, motor);
          const texto = await redactarConPlazo(motor, prompt, senal, timeoutMs);
          if (!texto || !texto.trim()) throw new Error('no devolvió texto');
          observar(alExito, motor);
          return texto;
        } catch (e) {
          if (esCancelacion(e, senal)) throw e;
          fallos.push(`${motor.nombre}: ${e.message}`);
        }
      }
      throw new Error('Ningún motor pudo redactar la minuta.\n' + fallos.join('\n'));
    },
  };
}

module.exports = { crearAutomatico, esCancelacion, redactarConPlazo };
