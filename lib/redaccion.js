const fs = require('node:fs');
const path = require('node:path');
const ATOMICO = require('./atomico');
const R = require('./rutas');
const { redactarConPlazo } = require('./motores/automatico');

async function redactarMotor({ motor, prompt, senal, alIntentar, alExito, timeoutMs = 5 * 60 * 1000 }) {
  if (motor.id === 'automatico') return motor.redactar(prompt, { senal, alIntentar, alExito });
  return redactarConPlazo(motor, prompt, senal, timeoutMs);
}

async function redactarYGuardar({
  motor, prompt, senal, alIntentar, antesDeGuardar = () => {}, carpeta,
  timeoutMs = 5 * 60 * 1000,
  fsImpl = fs, escribirAtomico = ATOMICO.escribirAtomico,
  guardarMotor = R.guardarMotorReunion,
}) {
  if (motor.id !== 'automatico' && !(await motor.disponible())) {
    throw new Error(`El motor de redacción "${motor.nombre}" no está disponible. Revísalo en Ajustes.`);
  }

  let motorUsado = motor.id === 'automatico' ? null : motor;
  const minuta = await redactarMotor({
    motor, prompt, senal, alIntentar, timeoutMs,
    alExito: (usado) => { motorUsado = usado; },
  });
  antesDeGuardar();

  const destino = path.join(carpeta, 'minuta.md');
  const destinoRespaldo = path.join(carpeta, 'minuta-anterior.md');
  let teniaAnterior = false;
  let anterior = null;
  let teniaRespaldo = false;
  let respaldoAnterior = null;
  try {
    if (fsImpl.existsSync(destinoRespaldo)) {
      teniaRespaldo = true;
      respaldoAnterior = fsImpl.readFileSync(destinoRespaldo);
    }
    if (fsImpl.existsSync(destino)) {
      teniaAnterior = true;
      anterior = fsImpl.readFileSync(destino);
      if (fsImpl.statSync(destino).size > 0) {
        escribirAtomico(destinoRespaldo, anterior);
      }
    }
  } catch {}
  escribirAtomico(destino, minuta);
  if (motorUsado) {
    try { guardarMotor(carpeta, motorUsado); }
    catch (e) {
      try {
        if (teniaAnterior) escribirAtomico(destino, anterior);
        else fsImpl.unlinkSync(destino);
        if (teniaRespaldo) escribirAtomico(destinoRespaldo, respaldoAnterior);
        else if (fsImpl.existsSync(destinoRespaldo)) fsImpl.unlinkSync(destinoRespaldo);
      } catch {}
      throw e;
    }
  }

  return { minuta, motorUsado };
}

module.exports = { redactarYGuardar, redactarMotor };
