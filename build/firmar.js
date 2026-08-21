// Firma la app con un certificado propio y estable, en vez de ad-hoc.
//
// Por qué importa: con firma ad-hoc el "designated requirement" queda atado al
// hash del binario, así que CADA actualización es, para macOS, una app distinta
// — y el permiso de Grabación de Pantalla concedido deja de valer sin avisar:
// el interruptor sigue encendido en Ajustes y la captura falla igual.
// Con un certificado estable el requisito queda atado al certificado, y el
// permiso sobrevive a las actualizaciones.
//
// Quien compile sin tener el certificado no se queda bloqueado: se firma ad-hoc
// como antes y se avisa.
const { execFileSync } = require('child_process');
const path = require('path');

const HUELLA = process.env.ESCRIBA_FIRMA || '';

exports.default = async function (context) {
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  let identidad = HUELLA;
  if (!identidad) {
    try {
      const salida = execFileSync('security', ['find-certificate', '-c', 'Escriba (Kapitec Soluciones)', '-Z'],
                                  { encoding: 'utf8' });
      const m = salida.match(/SHA-1 hash:\s*([0-9A-F]+)/i);
      if (m) identidad = m[1];
    } catch { /* no está: se firma ad-hoc */ }
  }
  if (!identidad) {
    console.log('  • sin certificado de Escriba: se firma ad-hoc (el permiso de grabación se pedirá en cada actualización)');
    identidad = '-';
  }
  execFileSync('codesign', ['--force', '--deep', '--sign', identidad, app], { stdio: 'inherit' });
  const req = execFileSync('codesign', ['-d', '-r-', app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  console.log('  • firmado:', req.trim().split('\n').pop());
};
