# Changelog

## 0.7.0 — 2026-08-21

Una revisión a fondo del código, del ciclo de uso y de los datos que la app ya
había generado. Lo que salió pesa más que cualquier mejora visual, y parte de
ello era mío.

**Tres cosas que podían dañar lo que se envía al cliente**

- **Las notas internas se filtraban al PDF** si el modelo titulaba la sección
  con `**Notas internas**`, `# Notas internas` o `## 4. Notas internas` en vez
  de exactamente `## Notas internas`. El corte era un solo `split` sobre texto
  escrito por un LLM. Ahora se ancla a un título (encabezado de cualquier
  nivel, con numeración, emoji o prefijo; o una línea que sea solo el título en
  negrita), y **falla cerrado**: si ve una señal inequívoca de notas internas
  sin título delante, no exporta. Verificado sobre el PDF real con 17 formas de
  título. Y una frase que *empieza* por "notas internas" ya no parte la minuta
  por la mitad: eso pasó en una versión intermedia de este mismo arreglo.
- **Un cliente sin letras latinas podía borrar la carpeta de otro.** `"北京"`
  o `"###"` dejaban el identificador de carpeta vacío, y con él la lista de
  "reuniones" eran las carpetas de los demás clientes. *Borrar esta reunión*
  las mandaba a la Papelera. El identificador ya nunca queda vacío.
- **En una reunión presencial, media reproducida en el Mac contaba como el
  otro participante.** Pasó de verdad: tres ráfagas de audio en 47 minutos y
  dos turnos atribuidos a un cliente que no estaba, con el PDF ya generado. Se
  midieron 14 fuentes con `astats` y `aspectralstats` y ninguna métrica de
  forma de onda separa voz de media (los vídeos contienen voz). Lo que separa
  es la estructura: un participante habla repartido por toda la reunión; la
  media suena en islas. Dos puertas nuevas sobre la pista del sistema —
  dispersión en el tiempo y fracción de segmentos que gana — en AND; cualquier
  duda cae del lado de *no atribuir*. Los diálogos cacheados con el criterio
  viejo se invalidan.

**El motor de redacción leía el disco por su cuenta**

La CLI de Claude heredaba el directorio de trabajo de la app y, dentro de la
carpeta personal, cargaba la memoria de Claude Code y salía a leer documentos
del Escritorio con sus propias herramientas. Una minuta citó un "dossier" que
no existía. Ahora corre en una carpeta vacía fuera de la carpeta personal, sin
herramientas y sin servidores MCP. Verificado: no sabe nada que no esté en el
prompt. Y si esa carpeta no se puede crear, no se redacta — nunca un fallback
a un directorio ajeno.

**La memoria de Escriba nunca había cerrado el círculo**

El prompt leía los primeros 60.000 caracteres del expediente y Escriba escribía
al final: exactamente donde el lector no miraba. Con una sola reunión, el
bloque ya quedaba fuera. Y lo que escribía descartaba las tablas de
compromisos. Ahora Escriba lleva su propia `memoria.md` por cliente —acuerdos,
compromisos con su estado y lo que quedó sin resolver—, el expediente del
usuario pasa a **solo lectura**, y al arrancar se anotan las minutas que ya
existían. *Volver a redactar* y editar a mano actualizan el bloque.

**Preparar la reunión**

Botón **Preparar** (⌘P): con la memoria, los compromisos abiertos y el
expediente, genera qué está pendiente, qué preguntar y qué llevar listo. Es la
mitad del ciclo que faltaba: la app solo usaba ese material *después* de la
reunión.

**Ya no se pierden archivos a medias**

Todas las escrituras que importan (`minuta.md`, `config.json`, la memoria, los
compromisos) son atómicas: temporal en el mismo directorio, `fsync`, `rename`.
Un `config.json` corrupto ya no hace desaparecer a todos los clientes en
silencio: se aparta a `config.json.roto` y Ajustes lo dice.

**Y lo demás**

- Las grabaciones que no arrancaron dejaban carpetas vacías etiquetadas "Solo
  audio". Ya no se crean, y las existentes van a la Papelera al arrancar, con
  aviso.
- La casilla de compromisos **no se podía pulsar con el ratón**: una colisión
  de clase CSS la pintaba de 39×55 px dentro de una región de arrastre de
  ventana. Un `.click()` por código la atravesaba, así que las pruebas
  anteriores la dieron por buena.
- Dos grabaciones en el mismo minuto compartían carpeta y se pisaban.
- Si la captura moría sola, la app seguía diciendo "Grabando".
- Cancelar no mataba los `ffmpeg` de la atribución de voces.
- La fecha de la minuta era la de procesamiento, no la de la reunión.
- Sin macOS 15 no se graba el micrófono: ahora se avisa, y el requisito es
  el correcto en el sitio y los README.
- Sin Claude Code, Ajustes no dejaba elegir ningún motor: los tres radios
  salían deshabilitados y la caja de la llave solo se abría desde uno de ellos.
- El CI construye el `.dmg` y verifica que lleva el grabador, los módulos
  nuevos, y **que está firmado ad-hoc**: el certificado que hace sobrevivir el
  permiso de grabación se queda en la Mac del autor, a propósito.
- 163 pruebas. Cada grupo nuevo se verificó reintroduciendo su bug.

**Lo que queda sin resolver, y se dice:** una videollamada real con música de
fondo pasa las dos puertas de voz. Ninguna métrica de forma de onda lo separa.

## 0.6.1 — 2026-08-21

Salió de usar la app en una reunión de verdad y no poder mandar la minuta.

**El PDF se generaba, pero no había forma de enviarlo**

El botón funcionaba: escribía `minuta.pdf` dentro de la carpeta de la reunión y
lo abría en Vista Previa, sin decir dónde había quedado. Esa carpeta no es un
sitio al que nadie navegue, así que en la práctica el PDF no existía.

- Al exportar, ahora aparece **PDF listo** con tres cosas que hacer:
  **Compartir** (hoja de macOS: Mail, Mensajes, WhatsApp, AirDrop),
  **Guardar copia…** (con un nombre reconocible, tipo
  *Minuta - Acme - 21 de agosto de 2026.pdf*) y **Abrir**.
- Las tres están también en el menú **Más** para un PDF ya generado.

**El permiso de grabación ya no se pierde en cada actualización**

La app se firmaba ad-hoc, y esa firma va atada al hash del binario: cada
actualización era, para macOS, **una app distinta**. El permiso de Grabación de
Pantalla dejaba de valer sin avisar — el interruptor seguía encendido en Ajustes
y la captura fallaba igual, con un error en inglés. Ahora se firma con un
certificado estable, así que el requisito queda atado al certificado y el
permiso sobrevive.

> Al pasar de 0.6.0 a 0.6.1 hay que **conceder el permiso una última vez**,
> porque la firma cambia. A partir de ahí ya no.

**Cuando falta el permiso, se entiende y se puede arreglar**

- El error del sistema llegaba crudo y en inglés (*"The user declined TCCs for
  application, window, display capture"*). Ahora dice qué pasa, en español, y
  trae un botón **Abrir Ajustes** que lleva al interruptor.
- Ese mismo aviso mostraba el título y el detalle **en la misma línea y sin
  espacio**: la clase del recuadro chocaba con la del cuerpo de la ventana, que
  es un contenedor flex.
- La línea roja de aviso quedaba desalineada respecto al recuadro.

## 0.6.0 — 2026-08-20

Salió de un análisis de experiencia y de querer grabar una reunión presencial
con el micrófono del iPhone. Buscando eso apareció algo que pesaba más que
cualquier mejora visual.

**En una reunión presencial la minuta podía mentir sobre quién se comprometió a qué**

Escriba se diseñó para videollamadas: micrófono = tú, audio del sistema = el
otro lado. Una reunión presencial rompe ese supuesto y **fallaba en silencio**:

- Sin nada sonando en el Mac, la pista del sistema queda muda, pero existe y
  pesa. Las comprobaciones de tamaño la daban por buena.
- Al comparar energías, el micrófono ganaba siempre, así que **cada frase se
  atribuía a quien grabó**, incluidas las del otro.
- Y con eso al modelo se le decía, literalmente, que la separación era *fiable*,
  y se le pedía repartir los compromisos por hablante.

La tabla de compromisos del PDF que se envía al cliente podía salir con las
responsabilidades cambiadas, con toda seguridad aparente. Ahora, si solo una
pista tiene voz, **no se atribuye nada** y se le dice al modelo que no invente
atribuciones. Comprobado con audio real: una videollamada sigue separando voces
igual de bien.

**Micrófono a elegir, incluido el del iPhone**

- Selector de micrófono en Ajustes. Con el iPhone cerca y Continuidad activada,
  aparece como una entrada más — verificado grabando con él.
- Durante la grabación se ve **con qué micrófono** se está grabando. Antes no
  había forma de enterarse de que era el equivocado hasta el final.
- Si el elegido no está al empezar, graba con el del sistema y lo avisa, en vez
  de fallar.

**Dos columnas: el documento se lleva el espacio**

La ventana tenía tres columnas y el documento —lo único que se lee de verdad—
se quedaba con la más estrecha, con una columna de historial casi vacía al lado.
Las reuniones se anidan ahora bajo su cliente en la barra lateral, y el
documento tiene una **medida de lectura** fija: antes no había ningún límite, así
que maximizada en un monitor grande las líneas pasaban de 200 caracteres.

**Lo importante, arriba**

- **Los compromisos** salen como lista al principio: se pueden marcar como
  hechos y copiar sueltos. El estado vive aparte, sin tocar la minuta.
- **Lo que no se dijo** —el diferenciador— estaba al final del documento en un
  recuadro apagado. Ahora se resume arriba, siempre marcado como *no se envía al
  cliente*.

**Se puede oír la reunión**

Las marcas de tiempo de «Quién dijo qué» eran decorativas. Ahora hay
reproductor y pulsar una marca salta a ese momento, que es lo que deja
verificar una cita antes de mandar el PDF.

**Acabado de Mac**

- Menú de aplicación propio **en español**: antes se quedaba el de Electron, en
  inglés. Con atajos: ⌘N cliente nuevo · ⌘F buscar · ⌘R grabar · ⌘E exportar ·
  ⇧⌘C copiar la minuta · ⌘O importar.
- **Modo oscuro** siguiendo al sistema. Solo la ventana: el PDF de la minuta y
  el sitio se quedan claros, que es como se leen y se imprimen.

**Correcciones**

- **El buscador no encontraba palabras con tilde.** Buscar «catalogo» no daba
  «catálogo», lo que hacía parecer que no había nada.
- **El encabezado de las tablas se colaba como un compromiso más** en el PDF de
  expediente. El filtro usaba `qué\b`, y `\b` no casa después de una vocal
  acentuada. Ahora el encabezado se detecta por la fila separadora.
- El aviso de progreso vivía dentro del documento: cambiar de cliente mientras
  algo se procesaba **borraba la única señal** de que seguía corriendo. Ahora
  tiene sitio propio y dice de qué cliente es.

## 0.5.0 — 2026-08-20

Salió de usar la app para preparar una reunión real y chocar con dos cosas.

**La lista eran tus clientes, y tus proyectos, y tus notas sueltas**

Escriba armaba la lista con cada `.md` de la carpeta de expedientes. Pero esa
carpeta es de contexto general: junto a los clientes hay proyectos, specs y
documentos de trabajo. En un caso real salían **20 entradas de las que solo 3
eran clientes**. El filtro que intentaba adivinar cuáles no lo eran no daba
abasto, y no podía darlo.

Ahora **un cliente es alguien a quien has grabado o que creaste tú**. El
expediente se le enlaza, no al revés:

- Al crear un cliente, Escriba te ofrece los expedientes que tengas para
  enlazarlo en un clic. Si el archivo se llama igual, se enlaza solo.
- Un cliente sin expediente lo dice junto a su nombre, con un enlace para
  ponérselo en cualquier momento.
- No se borra ni se mueve nada: los expedientes siguen donde estaban.

**No había forma de crear un cliente**

Solo aparecía la opción si escribías en el buscador un nombre que no existía.
Eso no lo adivina nadie. Ahora hay un botón **+ Nuevo cliente** a la vista.

**El nombre queda como lo escribes**

Se reconstruía del nombre de la carpeta, capitalizando cada palabra: escribías
*Amigo del sitio web* y la app mostraba *Amigo Del Sitio Web*. Ahora se guarda
tal cual.

## 0.4.0 — 2026-08-20

Usability pass, plus the first automated tests. The 0.3.0 release stopped the
app from losing meetings; this one stops it from wasting your patience.

**A bug that could freeze the app forever**

- The Markdown converter had a reproducible infinite loop. A heading with five
  hashes, a `#` with no space after it, or a table the writing engine cut off
  mid-row would spin the CPU and never return. Exporting a PDF from such a
  minute froze the app with no error. The renderer carried a second copy of the
  same converter with the same defect, which froze the window itself; it is now
  gone and both share `lib/md.js`.

**You can see what is happening, and stop it**

- Transcribing an hour takes about ten minutes. whisper reports its own
  percentage on stderr and the app was throwing it away, showing a frozen
  message instead. There is now a real progress bar. Verified against a
  1 h 32 min recording.
- **Cancel**. It kills whisper, ffmpeg and the writing engine — previously
  there was no way to stop a process short of force-quitting the app.
- Starting a second meeting while one is still processing is no longer
  possible; three of the four entry points allowed it.

**You can undo things**

- The button that saved an edit was labelled **Ver**. It is now **Guardar
  cambios**, with **Descartar** beside it, and ⌘S works.
- Leaving a half-edited minute — by switching client, opening another meeting,
  or clicking a search result — silently discarded the changes. It now asks.
- **Volver a redactar** overwrote hand-corrected minutes with no confirmation
  and no way back. It now confirms, and every overwrite keeps the previous
  version, restorable from the menu.
- **Borrar esta reunión**, which did not exist. It moves the folder to the
  Trash rather than deleting it, refuses any path outside the meetings folder,
  and removes the now-dangling reference from the client's dossier.

**Less noise**

- Up to six same-weight buttons were shown at once. There is now one primary
  action and a **Más** menu for the rest.
- Folder settings are typed no more: they use the native picker.
- A failed install or download left its button dead and disabled, with no way
  to retry short of closing Settings. It now says why and offers a retry.
- The window remembers its size and position.
- Settings close with Escape or a click outside, focus the first field, and
  open with ⌘,.
- First run showed a bare form. It now says what the app is for.
- Secondary text was at 3.1:1 contrast, below the 4.5:1 minimum. Now 4.6:1 or
  better on every background it is used on.
- Terms like "engine", the raw binary names and "Keychain" are gone from the
  interface.
- An empty client list was a blank rectangle; searching, an empty result, and
  the keyboard shortcut are now discoverable.

**Tests, for the first time**

- 67 tests over `lib/`, using `node:test` — no new dependencies. They cover the
  converter's hang cases, speaker attribution's 2 dB margin, config merging,
  the exact heading the internal-notes filter depends on, PDF escaping, the
  dossier bookkeeping, and the path guard that stands between "delete a
  meeting" and "trash an arbitrary folder".
- Three pieces of logic moved out of `main.js` so they could be tested at all:
  the dossier read/write (`lib/dossier.js`), the delete path guard
  (`rutas.dentroDeBase`), and the speaker decision (`voces.decidir`).
- Every group was verified by breaking the code on purpose and confirming the
  tests go red — including the naive `startsWith` path guard, which lets
  `~/ReunionesViejas` pass as if it were inside `~/Reuniones`. The hang cases
  run in a child process, so a regression fails in seconds instead of hanging
  CI forever.
- CI gained a test job and two checks on the Swift helper.
- The Swift job had been failing since it was created: `macos-14` runners carry
  an SDK without `SCStreamConfiguration.captureMicrophone`, which the capture
  helper needs. Moved to `macos-15`.

**Correction**

- The 0.3.0 notes listed a **Copiar Markdown** button. It was never
  implemented. It ships now, as **Copiar la minuta**, in the Más menu.

## 0.3.0 — 2026-08-20

Robustness pass. Everything here came out of auditing the code for what happens
when things go wrong, not from a feature wish list.

**It can no longer lose your meeting**

- Audio write failures were swallowed by `try?`. Worse, the sample counter went
  up anyway, so the capture helper would report success with nothing on disk.
  Now failures are reported and the counter tells the truth.
- Recording refuses to start with less than 300 MB free, and warns below 2 GB.
  An hour of meeting is about 130 MB.
- Quitting the app mid-recording used to kill the helper without letting it
  close the `.m4a` container, leaving an unplayable file. It now waits.
- The app said "Recording" the moment the process spawned. If the Screen
  Recording permission was missing you would find out after the meeting. It now
  waits for the helper to confirm it actually started.
- Only one instance can run at a time.

**It no longer wastes your time**

- Retrying after a failed draft reuses the existing transcript instead of
  running whisper again — measured 111 s down to 41 s.
- New **Volver a redactar** button: regenerate the minute, optionally with a
  different engine, without transcribing again.
- **Copiar Markdown** copies the client-facing minute to the clipboard.

**Fixes**

- The prompt now goes to the writing engine through stdin. As a command-line
  argument, a long meeting could exceed the system limit and fail after the
  transcription had already been paid for.
- Every IPC handler returns an error instead of throwing, so a failure no longer
  leaves a spinner running forever.
- Values interpolated into the PDF template are escaped.
- Errors show inside the interface instead of a native `alert()`.

## 0.2.0 — 2026-08-20

First public release.
