<p align="center">
  <img src="build/marca/icono-512.png" width="120" alt="Escriba">
</p>

<h1 align="center">Escriba</h1>

<p align="center">Graba la junta, saca los acuerdos.<br>
La minuta se escribe sola, con el expediente del cliente delante.</p>

---

## Qué te da en 5 minutos

- **Una minuta lista para enviar**, redactada en español.
- **Compromisos que puedes escuchar**: cada uno enlaza al momento exacto en que se dijo.
- **Lo que nunca se dijo**: los pendientes que nadie mencionó, comparados contra el expediente del cliente.

El camino: instalar → Ajustes instala lo demás → **Ayuda › Probar con una
reunión de ejemplo** para ver las tres cosas antes de tu primera reunión real.

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
  y tu propia llave, o puedes elegir cualquiera por separado. Si no tienes
  ninguno, Ajustes te ofrece instalar Ollama con un clic.
- **Cada cita se puede oír.** Los compromisos y los hallazgos llevan la marca
  de tiempo del audio donde se dijeron.
- **PDF con tu marca**, listo para enviar.

## Qué necesitas

- [ ] Mac con **Apple Silicon** y **macOS 15 o más nuevo**. Sin 15 la app no
      puede grabar el micrófono en absoluto: ni en una reunión presencial ni
      en una videollamada.
- [ ] [Homebrew](https://brew.sh) — es lo único que la app no puede instalar
      por ti. Desde ahí, Ajustes instala `ffmpeg`, `whisper-cpp` y el modelo
      de transcripción (1.5 GB, una sola vez).
- [ ] Algo que redacte la minuta: si ya usas **Claude Code** (2.1.246 o
      posterior) o **Codex** (0.149.1 o posterior) con sesión iniciada, no
      necesitas nada más. Si no, Ajustes detecta el hueco y ofrece
      **«Instalar Ollama»** —gratis, local, ~5 GB de modelo— con un clic. Una
      llave de API propia también sirve.

## Instalación

Descarga el `.dmg` desde [Releases](https://github.com/kapitecsoluciones/escriba/releases)
y arrastra Escriba a Aplicaciones.

La app **no está notarizada**, y en macOS 15 y posteriores el clásico
«clic derecho → Abrir» **ya no funciona**: esa opción desapareció del menú
contextual. Esto es lo que vas a ver la primera vez que abras Escriba (las
capturas están en inglés porque así estaba configurado el sistema donde se
tomaron; los pasos van en español):

<p align="center">
  <img src="docs/captura-gatekeeper-aviso.png" width="420" alt="Aviso de macOS: 'Escriba' Not Opened, con Move to Trash y Done">
  <img src="docs/captura-gatekeeper-ajustes.png" width="420" alt="Ajustes del Sistema: sección Security con el botón Open Anyway">
</p>

1. macOS muestra **«No se ha abierto "Escriba"»** («"Escriba" Not Opened» en
   la imagen), con dos botones: uno resaltado en azul («Move to Trash» /
   «Mover a la papelera») y otro junto a él («Done» / «Listo»). Pulsa
   **«Listo»** — **no** el botón resaltado, que borra la app.
2. Abre **Ajustes del Sistema › Privacidad y seguridad**, baja hasta la
   sección **Seguridad**, y junto a «Se bloqueó "Escriba" para proteger tu
   Mac» («"Escriba" was blocked to protect your Mac» en la imagen) pulsa
   **«Abrir de todos modos»** («Open Anyway»).
3. Confirma con tu contraseña o Touch ID.
4. Vuelve a abrir Escriba. Esto se hace una sola vez.

Si prefieres la terminal, el comando `xattr -dr com.apple.quarantine /Applications/Escriba.app`
hace lo mismo sin pasar por los diálogos.

Al abrir, Escriba te pide lo mínimo (tu nombre, tu empresa, tu línea de
contacto y la carpeta de reuniones) y, en esa misma pantalla de Ajustes, te
dice qué falta por instalar y lo instala por ti.

## Reunión de ejemplo

Antes de grabar nada, prueba **Ayuda › Probar con una reunión de ejemplo**.
Instala un cliente ficticio —«Ejemplo · Acme»— con una videollamada de
alrededor de 2.5 minutos, grabada en dos pistas (dos voces), y un expediente
con pendientes ya cargado. En unos tres minutos vas a ver la transcripción,
quién dijo qué, la minuta con sus citas de audio y, en la pestaña **Interno**,
qué pinta tiene «lo que no se dijo» con un expediente real detrás: en la
llamada nunca se menciona el precio, y el expediente lo tenía como pendiente
sin resolver.

No pide permiso de micrófono ni de grabación de pantalla, así que funciona
aunque todavía no hayas dado esos permisos. Sirve para ver toda la app antes
de tu primera reunión de verdad.

## Cómo grabar tu primera reunión real

1. Elige el cliente en la lista, o pulsa **+ Nuevo cliente**. Al crearlo puedes
   enlazarle un expediente de los que ya tengas.
2. Junto al botón **Grabar reunión** elige cómo entra la otra persona:
   - **Llamada en el Mac** — para Zoom, Meet, FaceTime, o una llamada del
     iPhone contestada en el Mac: la otra voz entra por el audio del sistema,
     la tuya por el micrófono, y la app separa quién dijo qué.
   - **Presencial** — todos en la misma sala, una sola pista de audio. Aquí no
     se puede saber quién dijo cada cosa, y la app lo dice en vez de
     adivinarlo.
3. **Grabar reunión**. También funciona con `Cmd+Shift+R` sin abrir la
   ventana.
4. Al terminar, **Detener**. La app mezcla, transcribe, separa las voces (si
   el modo lo permite) y redacta.
5. Revisa la minuta, edítala si hace falta y **Exporta el PDF**.

**Si vas a recibir una llamada telefónica, contéstala en el Mac, no en el
teléfono.** Si la otra persona suena por el altavoz del celular, todo entra
por el mismo micrófono y, para Escriba, es lo mismo que una reunión
presencial: no separa las voces.

**Historial en PDF**, en el menú **Cliente ▾** junto al nombre, junta todas
las reuniones de un cliente en un solo PDF, con la tabla de compromisos de
toda la relación. Sirve para juntas de revisión.

Los compromisos salen como lista al principio: se marcan como hechos y se
copian sueltos. Lo que **no** se dijo se resume arriba, siempre marcado como
que no se envía. Sin expediente y sin reuniones previas con ese cliente, «lo
que no se dijo» se limita a lo que faltó en esa conversación; desde la
segunda reunión con el mismo cliente, Escriba ya tiene su propia memoria de lo
acordado antes, sin que tengas que escribir un expediente a mano.

Mientras transcribe verás el porcentaje real, no un mensaje fijo, y puedes
**Cancelar** en cualquier momento: se detienen de verdad la transcripción y la
redacción, no solo el indicador. Nada de lo que escribas se pierde — al
guardar y al volver a redactar queda copia de la versión anterior, recuperable
desde el menú **Más**, y salir de una minuta a medio editar pregunta antes.
Borrar una reunión la manda a la Papelera, no la destruye.

## Citas de audio

Cada compromiso, cada punto de «Lo que quedó definido» y cada hallazgo de las
notas internas lleva la marca del momento del audio en que se dijo — un chip
`mm:ss` que se oye con un clic, en las pestañas **Compromisos** e **Interno**.
En la pestaña **Minuta** —que es exactamente lo que recibe el cliente— las
citas están apagadas por defecto; el interruptor **«Ver citas de audio»** las
muestra solo para tu lectura. Nunca salen en el PDF, ni al copiar la minuta,
ni en el historial del cliente.

Solo se conservan las citas que coinciden con marcas reales de la grabación:
las que el modelo se inventa se retiran antes de guardar, y se cuentan. La
cabecera de la minuta lo dice sin rodeos: «Redactada con Claude Code · 6 citas
de audio».

Una cita señala **dónde** se dijo algo, para que lo compruebes — no certifica
que la afirmación sea correcta. Granola, por comparar, borra el audio después
de procesar la reunión, y a sus usuarios no les queda cómo verificar una cita.
Escriba lo conserva y lo enlaza.

## Si algo falla

**Ayuda › Copiar diagnóstico** (también está en **Ajustes › Ayuda y
diagnóstico**) copia un texto con la versión de Escriba, la de macOS, los
binarios encontrados, los motores disponibles, los permisos y las carpetas en
uso — sin tu nombre de usuario — listo para pegarlo donde vayas a pedir ayuda.

**Ayuda › Reportar un problema…** abre el formulario de incidencias de
GitHub, con plantillas ya en español.

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

## Pruebas

```bash
npm test
```

Más de 200 pruebas sobre `lib/`, sin instalar nada más que Node. Cubren los tres casos
que colgaban el conversor de Markdown, el margen de 2 dB que decide quién dijo
qué, la fusión de configuración, el encabezado exacto del que depende el filtro
de notas internas, y el escapado del PDF. Cada bloque se comprobó rompiendo el
código a propósito: una suite que no puede fallar no sirve de nada.

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
sabiendo eso. Las citas de audio ([arriba](#citas-de-audio)) tampoco salen
nunca de tu Mac: se retiran antes de escribir la memoria, el historial o
cualquier documento que se comparta.

## Por qué ffmpeg y whisper no vienen incluidos

ffmpeg tiene licencia GPL: meterlo dentro de una app MIT obligaría a que toda la
app fuera GPL. whisper.cpp sí es MIT, pero son cientos de megas de binario y de
modelo, así que tampoco viaja dentro. Los dos se instalan con Homebrew desde
Ajustes. Lo único que sí va empaquetado es el grabador de audio propio.

## Licencia

MIT © Kapitec Soluciones
