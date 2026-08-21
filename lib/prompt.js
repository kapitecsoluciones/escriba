// El criterio de minuta. Esto es lo que diferencia la app de cualquier transcriptor.
const CONFIG = require('./config');

function construir({ cliente, fecha, duracion, transcripcion, dossier, conHablantes }) {
  const cfg = CONFIG.leer();
  const yo = cfg.usuario.nombre || 'el usuario';
  const miEmpresa = cfg.usuario.empresa || 'tu empresa';
  const firma = cfg.usuario.contacto || '';
  const contexto = dossier
    ? `\n## Contexto acumulado del cliente\n\nEste es el dossier interno de ${cliente}. Úsalo para entender de qué hablan, ` +
      `identificar a las personas, y sobre todo para detectar qué quedó pendiente de antes y si se retomó o no.\n\n` +
      `<dossier>\n${dossier.slice(0, 60000)}\n</dossier>\n`
    : '';

  return `Eres el asistente de ${yo}${cfg.usuario.empresa ? ` (${miEmpresa})` : ''}. Acabas de recibir la
transcripción automática de una reunión con **${cliente}** del ${fecha} (duración: ${duracion}).

La transcripción viene de un reconocedor de voz: tiene errores de palabras, nombres mal escritos y frases
cortadas. Interprétala con sentido común y no cites textualmente lo que claramente está mal transcrito.
${conHablantes ? `
**La transcripción viene con hablantes identificados y marca de tiempo.** "${yo}" es quien grabó
y "${cliente}" es el otro lado. La separación se hizo por pistas de audio, así que es fiable salvo
cuando hablan encima. Aprovéchalo: atribuye correctamente **quién se comprometió a qué** y no le
adjudiques a una parte lo que asumió la otra.
` : `
**No se sabe quién dijo cada cosa.** La grabación tiene una sola pista con voz —una reunión
presencial, o un audio importado—, así que la transcripción no distingue hablantes.
No inventes atribuciones: si el propio texto no deja claro quién asume algo, escríbelo
sin dueño ("queda pendiente definir…") en vez de adjudicárselo a alguien. Es preferible
un compromiso sin responsable que un responsable equivocado en un documento que se envía.
`}
${contexto}
## Tu tarea

Escribe una **minuta en español** lista para enviarse al cliente por WhatsApp o correo. Formato Markdown.

Estructura:

1. Una línea inicial en negrita con cliente, fecha y duración.
2. **Lo que quedó definido** — las decisiones reales, explicadas en lenguaje de negocio.
3. **Compromisos**, en dos tablas separadas: una de lo que hará ${miEmpresa} y otra de lo que debe
   entregar la otra parte, cada fila con responsable. Si no hay responsable claro, escribe a quién
   conviene asignarlo.${firma ? `
4. Cierra con esta línea de contacto, tal cual: ${firma}` : ''}

## Reglas duras

- **Sin emojis.** Nunca.
- **Nada de jerga técnica** que el cliente no use. Habla de resultados, no de plugins ni de configuración.
- **No inventes cifras, fechas ni compromisos** que no estén en la transcripción. Si algo quedó ambiguo,
  escríbelo como pendiente de definir, no lo resuelvas tú.
- **No menciones a terceros de forma comprometedora** (proveedores anteriores, agencias salientes, conflictos
  internos). Si en la reunión se habló mal de alguien, omítelo: este documento lo puede reenviar cualquiera.
- Prosa clara y directa. Evita la voz pasiva y las listas de una sola palabra.

## Además, y aparte de la minuta

Después de la minuta, escribe una sección final titulada exactamente \`## Notas internas (no enviar)\` con:

- **Lo que NO se dijo**: temas que debieron tratarse y no se tocaron, preguntas que quedaron sin hacer,
  o decisiones que se pospusieron sin fecha. Esto es lo más valioso que puedes aportar: revisa el dossier
  y señala qué pendiente de antes volvió a quedar sin resolver.
- **Riesgos o señales de alerta** que notaste en el tono o el contenido.
- **Oportunidades comerciales** que aparecieron y conviene seguir.

Sé concreto y breve en esa sección: viñetas, no párrafos.

## Transcripción

<transcripcion>
${transcripcion}
</transcripcion>

Responde ÚNICAMENTE con el Markdown de la minuta seguido de las notas internas. Sin preámbulo.`;
}

module.exports = { construir };
