<p align="center">
  <img src="build/marca/icono-512.png" width="120" alt="Escriba">
</p>

<h1 align="center">Escriba</h1>

<p align="center">Graba la junta, saca los acuerdos.<br>
La minuta se escribe sola, con el expediente del cliente delante.</p>

---

## Qué lo hace distinto

Transcribir una reunión lo hace mucha gente. Escriba **lee el expediente del
cliente** antes de escribir, así que la minuta sabe qué quedó pendiente la vez
pasada.

Por eso, además de la minuta que le mandas al cliente, produce unas **notas
internas que nunca se envían**: lo que *no* se dijo, lo que se volvió a
posponer y las oportunidades que aparecieron.

- **Graba los dos lados.** Tu micrófono y el audio del Mac, así que sirve igual
  para una junta presencial que para una videollamada.
- **Sabe quién dijo qué.** Las dos pistas se graban por separado, así que la
  minuta distingue tus compromisos de los del cliente, sin necesidad de un
  modelo de diarización.
- **Todo se queda en tu Mac.** El audio nunca sale. La transcripción corre en
  tu propio equipo con whisper.cpp.
- **Tú eliges quién redacta.** En Automático prueba Claude Code, Codex, Ollama
  y tu propia llave, o puedes elegir cualquiera por separado.
- **PDF con tu marca**, listo para enviar.

## Qué necesitas

- macOS 15 o más nuevo (13 sirve solo para audio importado: sin 15 no se graba el micrófono), Apple Silicon
- [Homebrew](https://brew.sh) para `ffmpeg` y `whisper-cpp`
- Un motor de redacción: Claude Code 2.1.246 o posterior, Codex 0.149.1 o
  posterior, una llave de API u Ollama

La app revisa todo esto la primera vez que la abres e instala lo que falte.

## Instalación

Descarga el `.dmg` desde [Releases](https://github.com/kapitecsoluciones/escriba/releases)
y arrastra Escriba a Aplicaciones.

La app **no está notarizada**, así que la primera vez macOS se va a negar a
abrirla: haz clic derecho sobre ella y elige *Abrir*, y confirma. Solo hay que
hacerlo una vez.

## Cómo se usa

1. Elige el cliente en la lista, o pulsa **+ Nuevo cliente**. Al crearlo puedes enlazarle un
   expediente de los que ya tengas.
2. **Grabar reunión**. También funciona con `Cmd+Shift+R` sin abrir la ventana.
3. Al terminar, **Detener**. La app mezcla, transcribe, separa las voces y
   redacta.
4. Revisa la minuta, edítala si hace falta y **Exporta el PDF**.

El botón **Expediente** junta todas las reuniones de un cliente en un solo PDF,
con la tabla de compromisos de toda la relación. Sirve para juntas de revisión.

Los compromisos salen como lista al principio: se marcan como hechos y se
copian sueltos. Lo que **no** se dijo se resume arriba, siempre marcado como que
no se envía. Y pulsando una marca de tiempo del diálogo se oye ese momento, para
verificar una cita antes de mandar el PDF.

Mientras transcribe verás el porcentaje real, no un mensaje fijo, y puedes
**Cancelar** en cualquier momento: se detienen de verdad la transcripción y la
redacción, no solo el indicador. Nada de lo que escribas se pierde — al guardar
y al volver a redactar queda copia de la versión anterior, recuperable desde el
menú **Más**, y salir de una minuta a medio editar pregunta antes. Borrar una
reunión la manda a la Papelera, no la destruye.

## Pruebas

```bash
npm test
```

Más de 200 pruebas sobre `lib/`, sin instalar nada más que Node. Cubren los tres casos
que colgaban el conversor de Markdown, el margen de 2 dB que decide quién dijo
qué, la fusión de configuración, el encabezado exacto del que depende el filtro
de notas internas, y el escapado del PDF. Cada bloque se comprobó rompiendo el
código a propósito: una suite que no puede fallar no sirve de nada.

## Reuniones presenciales

Escriba se diseñó para videollamadas: tu micrófono eres tú y el audio del Mac es
el otro lado. De ahí sale la separación de voces sin ningún modelo de diarización.

**En una reunión presencial solo hay una pista con voces, así que no se separan
los hablantes** — y la app lo dice en vez de adivinar. También se lo dice al
motor de redacción, para que no reparta compromisos por su cuenta: un compromiso
sin responsable es mejor que un responsable equivocado en algo que se envía.

Puedes elegir con qué micrófono se graba. Con el iPhone cerca y Continuidad
activada aparece en la lista, y capta mucho mejor a quien está al otro lado de
una mesa.

## Privacidad, y algo que debes saber

Escriba graba conversaciones. **Avisar a los demás que estás grabando es tu
responsabilidad**, y en muchos lugares es obligatorio por ley. La app no lo
hace por ti.

A dónde van tus datos depende del motor que elijas, y la app lo dice sin
rodeos en la pantalla de Ajustes:

| Motor | Qué sale de tu Mac |
|---|---|
| Automático | La transcripción, memoria y expediente pueden llegar, en orden, a más de un motor hasta que uno responda |
| Claude Code | La transcripción, memoria y expediente, a Anthropic |
| Codex | La transcripción, memoria y expediente, a OpenAI |
| Tu llave de API | La transcripción, memoria y expediente, al proveedor que elijas |
| Ollama | Nada |

El audio nunca sale con ninguno. Si le indicas una carpeta de expedientes, el
contenido del expediente del cliente va dentro del prompt: elige el motor
sabiendo eso.

## Por qué ffmpeg y whisper no vienen incluidos

ffmpeg tiene licencia GPL: meterlo dentro de una app MIT obligaría a que toda la
app fuera GPL. whisper.cpp sí es MIT, pero son cientos de megas de binario y de
modelo, así que tampoco viaja dentro. Los dos se instalan con Homebrew desde
Ajustes. Lo único que sí va empaquetado es el grabador de audio propio.

## Licencia

MIT © Kapitec Soluciones
