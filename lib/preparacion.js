// El informe de antes de la reunión.
//
// La app tenía delante todo lo necesario —lo que quedó pendiente, los
// compromisos abiertos, lo que no se dijo la última vez— y solo lo usaba
// DESPUÉS, dentro del prompt de la minuta. El usuario preparaba a mano, fuera
// de Escriba: el 21-ago-2026 escribió 78 líneas con "las preguntas que
// necesitas hacerle" una hora antes de entrar, y la app no supo que existían.
// Después su propia minuta le reprochó no haber hecho esas preguntas.
const CONFIG = require('./config');

function construir({ cliente, memoria, dossier, pendientes = [], ultimaFecha }) {
  const cfg = CONFIG.leer();
  const yo = cfg.usuario.nombre || 'el usuario';
  const miEmpresa = cfg.usuario.empresa || 'su empresa';

  const recortar = (t, tope) => {
    const s = String(t || '');
    if (s.length <= tope) return s;
    const cabeza = Math.floor(tope * 0.3);
    return s.slice(0, cabeza) + '\n\n[…recortado…]\n\n' + s.slice(-(tope - cabeza));
  };

  const listaPendientes = pendientes.length
    ? pendientes.map(c => `- ${c.texto}${c.quien ? ` — ${c.quien}` : ''}${c.cuando ? ` · ${c.cuando}` : ''}`).join('\n')
    : '(ninguno registrado)';

  return `Eres el asistente de ${yo}${cfg.usuario.empresa ? ` (${miEmpresa})` : ''}.
${yo} va a entrar en una reunión con **${cliente}**${ultimaFecha ? ` y la anterior fue el ${ultimaFecha}` : ''}.

Tu trabajo es prepararlo, no resumirle lo que ya sabe. Escribe un documento breve, en español,
que se pueda leer en dos minutos antes de entrar.

## Con qué cuentas

${memoria ? `### Lo que Escriba registró de reuniones anteriores

<memoria>
${recortar(memoria, 30000)}
</memoria>
` : '(no hay reuniones anteriores registradas con este cliente)\n'}
${dossier ? `### Expediente interno del cliente

<expediente>
${recortar(dossier, 40000)}
</expediente>
` : ''}
### Compromisos que siguen abiertos

${listaPendientes}

## Qué escribir

1. **Dónde quedó esto** — dos o tres frases: en qué punto está la relación y qué se decidió la última vez.
2. **Lo que sigue abierto** — compromisos sin cerrar, separando lo que le toca a ${miEmpresa} de lo que
   debe entregar el cliente. Si alguno lleva tiempo sin moverse, dilo.
3. **Qué preguntar** — la parte más importante. Una lista numerada de preguntas concretas, en el orden
   en que conviene hacerlas. Prioriza las que se quedaron sin hacer la vez anterior y las que
   desbloquean una decisión o un cobro. Nada genérico: preguntas que solo tienen sentido con ESTE cliente.
4. **Antes de entrar** — qué conviene llevar listo o abierto: un documento, una cifra, una propuesta.

## Reglas duras

- **No inventes.** Si algo no está en el material, no lo supongas. Vale más un informe corto y cierto.
- **Sin emojis.** Sin jerga técnica.
- Si no hay historial suficiente para alguna sección, dilo en una línea y sigue: no la rellenes.
- Este documento es interno; nunca se le envía al cliente. Puedes ser directo sobre dinero, riesgos y
  sobre quién no ha cumplido.

Responde ÚNICAMENTE con el Markdown del documento. Sin preámbulo.`;
}

module.exports = { construir };
