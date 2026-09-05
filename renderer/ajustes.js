// Un solo listener por canal de progreso: cada clic en Instalar/Reintentar
// registraba otro con ipcRenderer.on y nunca se quitaban.
let alDescargar = null, alInstalar = null;
window.api.onDescarga((d) => { if (alDescargar) alDescargar(d); });
window.api.onInstalando((d) => { if (alInstalar) alInstalar(d); });

// Pantalla de Ajustes: quién eres, dónde vive todo, y con qué motor se redacta.
(() => {
  const $$ = s => document.querySelector(s);
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  // copias de lib/pdf.js (el renderer no puede requerir lib): solo #RRGGBB o #RGB, y el tono de texto
  const normalizarAcento = (v) => { const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v || '').trim()); if (!m) return null;
    const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1]; return '#' + h.toUpperCase(); };
  const oscurecer = (hex) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.72).toString(16).padStart(2, '0')).join('');

  async function pintar() {
    // Todo esto puede ir en paralelo: redaccionFalta() prueba disponible() de
    // cada motor igual que motoresEstado(), y encadenarlas una tras otra
    // duplicaba la espera al abrir Ajustes.
    const [cfg, motores, diag, rm, faltaMotor] = await Promise.all([
      window.api.configLeer(),
      window.api.motoresEstado(),
      window.api.diagnostico(),
      window.api.micros().catch(() => ({ ok: false })),
      window.api.redaccionFalta().catch(() => null),
    ]);
    const micros = (rm && rm.ok && rm.micros) || [];
    const c = $$('#cuerpoAjustes');

    // "Quién redacta la minuta" entra a la misma lista de qué falta: sin
    // motor no hay minuta, igual que sin transcriptor no hay transcripción.
    const listaFaltantes = [...diag.faltantes, ...(faltaMotor ? [faltaMotor] : [])];
    const faltantes = listaFaltantes.length
      ? `<div class="et seccion">Falta por instalar</div>` +
        listaFaltantes.map(f => {
          const brew = /brew install (\S+)/.exec(f.como);
          const boton = brew ? `<button class="btn" style="margin-top:7px" data-brew="${brew[1]}">Instalar ahora</button>` : '';
          const modelo = /modelo/.test(f.que) ? `<button class="btn" style="margin-top:7px" id="btnModelo">Descargar (1.5 GB)</button>` : '';
          const ollama = f.accion === 'ollama'
            ? `<button class="btn" style="margin-top:7px" id="btnOllama" data-aviso="${esc(f.aviso || '')}">Instalar Ollama</button>`
            : '';
          return `<div class="aviso atencion"><b>${esc(f.que)}</b> — ${esc(f.como)}${boton}${modelo}${ollama}</div>`;
        }).join('')
      : '';

    const bienvenida = diag.configurado ? '' : `
      <div class="bienvenida">
        <strong>Bienvenido a Escriba.</strong>
        Graba tus juntas, las transcribe en tu propio Mac y redacta la minuta con lo acordado,
        quién se comprometió a qué, y lo que quedó sin decir.
        Para empezar solo hace falta tu nombre; lo demás se puede dejar como está.
      </div>`;

    const configRoto = diag.configRoto ? `
      <div class="aviso atencion" style="margin-bottom:14px">
        <b>Tu configuración no se pudo leer y se empezó de cero.</b>
        El archivo dañado se guardó en <code>${esc(diag.configRoto.respaldo)}</code> por si quieres
        recuperar algo. Vuelve a escribir tus datos aquí y se arregla.
      </div>` : '';

    c.innerHTML = `
      ${configRoto}
      ${bienvenida}
      <div class="et seccion">Quién eres</div>
      <div class="campo">
        <label>Tu nombre</label>
        <input type="text" id="aNombre" value="${esc(cfg.usuario.nombre)}" placeholder="Nombre y apellido">
        <div class="ayuda">Sirve para saber cuál de las voces eres tú cuando grabas una llamada.</div>
      </div>
      <div class="campo">
        <label>Tu empresa</label>
        <input type="text" id="aEmpresa" value="${esc(cfg.usuario.empresa)}" placeholder="Opcional">
      </div>
      <div class="campo">
        <label>Línea de contacto para el pie de la minuta</label>
        <input type="text" id="aContacto" value="${esc(cfg.usuario.contacto)}" placeholder="Nombre · correo · teléfono">
      </div>

      <div class="et seccion">Tu marca</div>
      <div class="campo">
        <label>Así sale el encabezado del PDF que recibe el cliente</label>
        <div class="marca-vista" id="marcaVista"></div>
        <div class="marca-botones">
          <button class="btn" id="btnLogo">Elegir logo…</button>
          <button class="btn" id="btnQuitarLogo" hidden>Quitar el logo</button>
          <label class="marca-acento" title="El color de las líneas y los rótulos del PDF"><input type="color" id="aAcento" value="${normalizarAcento((cfg.marca || {}).acento) || '#B58A3E'}"> Color de acento</label>
        </div>
        <div class="ayuda">PNG, JPG, WebP o SVG, hasta 2 MB. Se copia a tu configuración, así que puedes mover el original. Sin logo va el nombre de tu empresa. Lo de esta sección se aplica al momento, sin pulsar Guardar.</div>
      </div>

      <div class="et seccion">Con qué se graba</div>
      <div class="campo">
        <label>Micrófono para llamadas en el Mac</label>
        <select id="aMicrofono">
          <option value="">El del sistema${micros.length ? ` — ahora ${esc((micros.find(m => m.porDefecto) || {}).nombre || '')}` : ''}</option>
          ${micros.map(m => `<option value="${esc(m.id)}" ${cfg.grabacion && cfg.grabacion.microfono === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}
        </select>
        <div class="ayuda">La otra persona suena en el Mac y tú hablas al micrófono del Mac. Es el caso normal: déjalo en el del sistema.</div>
      </div>
      <div class="campo">
        <label>Micrófono para reuniones presenciales</label>
        <select id="aMicrofonoPresencial">
          <option value="">El del sistema</option>
          ${micros.map(m => `<option value="${esc(m.id)}" ${cfg.grabacion && cfg.grabacion.microfonoPresencial === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}
        </select>
        <div class="ayuda">Todos en la misma sala: el micrófono del iPhone, en medio de la mesa, capta mucho mejor a quien está enfrente. Aparece aquí si lo tienes cerca y con Continuidad. Si el que elijas no está al empezar, se graba con el del sistema y se avisa.</div>
      </div>

      <div class="et seccion">Quién escribe la minuta</div>
      ${motores.map(m => `
        <label class="motor ${cfg.motor.tipo === m.id ? 'sel' : ''} ${m.disponible ? '' : 'no'}">
          <input type="radio" name="motor" value="${m.id}" ${cfg.motor.tipo === m.id ? 'checked' : ''}>
          <div>
            <div class="motor-nombre">${esc(m.nombre)} ${m.disponible ? '' : '— no disponible'}</div>
            <div class="motor-desc">${esc(m.descripcion)}</div>
            <div class="motor-priv">${esc(m.privacidad)}</div>
          </div>
        </label>`).join('')}

      ${motores.some(m => m.disponible) ? '' : `<div class="aviso atencion" style="margin-bottom:12px">
        <b>Ninguno está listo todavía.</b> Puedes elegir uno igualmente y configurarlo:
        con <b>Claude Code</b> o <b>Codex</b> basta instalarlos y autenticarlos; con
        <b>tu propia llave</b> solo hay que pegarla aquí abajo; <b>Ollama</b> necesita
        estar corriendo en este equipo.
      </div>`}
      <div class="campo" id="cajaLlave" ${cfg.motor.tipo === 'api' ? '' : 'hidden'}>
        <label>Proveedor y llave</label>
        <select id="aProveedor">
          <option value="anthropic" ${cfg.motor.proveedor === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          <option value="openai" ${cfg.motor.proveedor === 'openai' ? 'selected' : ''}>OpenAI</option>
        </select>
        <input type="password" id="aLlave" placeholder="Pega aquí la llave de tu cuenta" style="margin-top:7px">
        <div class="ayuda">Se guarda en el llavero de macOS, el mismo donde el sistema guarda tus contraseñas. Nunca queda escrita en un archivo.</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn" id="btnProbar">Probar que funciona</button>
      </div>
      <div id="resProbar" role="status" aria-live="polite"></div>

      <div class="et seccion">Dónde se guarda todo</div>
      <div class="campo">
        <label>Carpeta de reuniones</label>
        <div class="ruta"><input type="text" id="aReuniones" value="${esc(cfg.rutas.reuniones)}">
        <button class="btn" data-elegir="aReuniones">Elegir…</button></div>
      </div>
      <div class="campo">
        <label>Carpeta de expedientes de cliente (opcional)</label>
        <div class="ruta"><input type="text" id="aDossiers" value="${esc(cfg.rutas.dossiers)}" placeholder="Un archivo .md por cliente">
        <button class="btn" data-elegir="aDossiers">Elegir…</button></div>
        <div class="ayuda">Si la defines, Escriba lee el expediente del cliente antes de redactar y detecta lo que quedó pendiente de reuniones anteriores. Ese texto se envía al motor que elijas.</div>
      </div>
      ${faltantes}
      <div style="display:flex;gap:8px;margin-top:22px">
        <button class="btn primario" id="btnGuardar">Guardar</button>
      </div>

      <div class="et seccion">Ayuda y diagnóstico</div>
      <div class="campo">
        <div class="ayuda">Si algo no funcionó, copia este diagnóstico y pégalo donde vayas a reportar el problema.</div>
        <pre class="diag-texto" id="diagTexto">Reuniendo datos…</pre>
        <button class="btn" id="btnCopiarDiagnostico" disabled>Copiar diagnóstico</button>
      </div>`;

    // La vista previa dibuja lo mismo que lib/pdf.js: el logo propio (o el
    // nombre) a la izquierda, «Para · cliente» a la derecha, el acento en la
    // barra y el rótulo. El logo se pide UNA vez (y al cambiarlo): arrastrar
    // el selector de color dispara decenas de eventos por segundo, y pedir un
    // logo de 2 MB en base64 por IPC en cada uno congelaba el panel.
    let vistaMarca = null;
    const pintarMarca = () => {
      const caja = $$('#marcaVista'); if (!caja) return;
      const v = vistaMarca || { logo: null, emisor: '', acento: '#B58A3E' };
      const acento = normalizarAcento($$('#aAcento').value) || v.acento;
      caja.style.setProperty('--acento', acento);
      caja.style.setProperty('--acento-texto', oscurecer(acento));
      caja.innerHTML = `<div class="marca-vista-cab">
          ${v.logo ? `<img src="${v.logo}" alt="">` : `<div class="marca-vista-emisor">${esc($$('#aEmpresa').value.trim() || $$('#aNombre').value.trim() || v.emisor || 'Tu empresa')}</div>`}
          <div class="marca-vista-para">Para<b>Cliente</b></div></div>
        <div class="marca-vista-ojo">Minuta de reunión</div>
        <div class="marca-vista-titulo">Acuerdos y siguientes pasos</div>
        <div class="marca-vista-barra"></div>`;
      $$('#btnQuitarLogo').hidden = !v.logo;
    };
    const cargarMarca = async () => {
      const v = await window.api.marcaVista().catch(() => null);
      vistaMarca = v && v.ok !== false ? v : null;
      pintarMarca();
    };
    cargarMarca();
    $$('#aAcento').oninput = pintarMarca;
    // el acento se guarda al elegirlo, igual que el logo: cerrar con Escape no lo descarta
    $$('#aAcento').onchange = () => { const a = normalizarAcento($$('#aAcento').value); if (a) window.api.configGuardar({ marca: { acento: a } }); };
    $$('#aEmpresa').oninput = pintarMarca; $$('#aNombre').oninput = pintarMarca;
    $$('#btnLogo').onclick = async () => {
      const r = await window.api.marcaElegirLogo();
      if (r && r.ok === false) { $$('#btnLogo').textContent = r.error; setTimeout(() => { $$('#btnLogo').textContent = 'Elegir logo…'; }, 4000); }
      cargarMarca();
    };
    $$('#btnQuitarLogo').onclick = async () => { await window.api.marcaQuitarLogo(); cargarMarca(); };

    c.querySelectorAll('input[name=motor]').forEach(r => r.onchange = () => {
      c.querySelectorAll('.motor').forEach(m => m.classList.toggle('sel', m.querySelector('input').checked));
      $$('#cajaLlave').hidden = $$('input[name=motor]:checked').value !== 'api';
    });

    $$('#btnProbar').onclick = async () => {
      const boton = $$('#btnProbar');
      if (boton.disabled) return;
      boton.disabled = true;
      const id = $$('input[name=motor]:checked').value;
      const r = $$('#resProbar');
      r.setAttribute('aria-busy', 'true');
      r.innerHTML = '<div class="aviso">Probando…</div>';
      try {
        if (id === 'api' && $$('#aLlave').value.trim()) {
          await window.api.guardarLlave({ proveedor: $$('#aProveedor').value, llave: $$('#aLlave').value.trim() });
        }
        await guardar(false);
        const res = await window.api.motorProbar(id);
        r.innerHTML = `<div class="aviso ${res.ok ? 'bien' : 'error'}">${res.ok ? 'Funciona.' : 'No respondió.'} ${esc(res.detalle || '')}</div>`;
      } catch (e) {
        r.innerHTML = `<div class="aviso error">No respondió. ${esc(e.message || String(e))}</div>`;
      } finally {
        boton.disabled = false;
        r.removeAttribute('aria-busy');
      }
    };

    c.querySelectorAll('[data-elegir]').forEach(b => b.onclick = async () => {
      const campo = $$('#' + b.dataset.elegir);
      const elegida = await window.api.elegirCarpeta(campo.value);
      if (elegida) campo.value = elegida;
    });

    // Si algo falla, el botón vuelve a estar disponible: antes se quedaba en
    // "Falló" y deshabilitado, y había que cerrar y reabrir Ajustes.
    const conReintento = (b, etiqueta, tarea) => {
      b.onclick = async () => {
        b.disabled = true;
        const previo = b.textContent;
        const r = await tarea(b);
        if (r && r.ok) { b.textContent = etiqueta.ok; setTimeout(pintar, 900); return; }
        b.disabled = false;
        b.textContent = 'Reintentar';
        const caja = b.closest('.aviso');
        if (caja && !caja.querySelector('.motivo')) {
          const m = document.createElement('div');
          m.className = 'aviso error motivo';
          m.textContent = (r && (r.error || (r.salida || '').trim().split('\n').slice(-2).join(' '))) || 'No se pudo completar.';
          caja.appendChild(m);
        } else if (caja) {
          caja.querySelector('.motivo').textContent = (r && (r.error || (r.salida || '').trim().split('\n').slice(-2).join(' '))) || 'No se pudo completar.';
        }
        void previo;
      };
    };

    c.querySelectorAll('[data-brew]').forEach(b => conReintento(b, { ok: 'Instalado' }, async () => {
      b.textContent = 'Instalando…';
      return window.api.instalarDep(b.dataset.brew);
    }));
    const bm = $$('#btnModelo');
    if (bm) conReintento(bm, { ok: 'Listo' }, async () => {
      bm.textContent = 'Descargando… 0%';
      alDescargar = ({ pct }) => { if (bm.disabled) bm.textContent = `Descargando… ${pct}%`; };
      return window.api.descargarModelo();
    });

    // Instalar Ollama no usa conReintento: antes de tocar nada hay que avisar
    // cuánto se va a bajar, y si el usuario cancela ahí no pasó nada — no es
    // un fallo que amerite "Reintentar".
    const bo = $$('#btnOllama');
    if (bo) bo.onclick = async () => {
      if (bo.disabled) return;
      const aviso = bo.dataset.aviso || 'Se instalará Ollama y se descargará el modelo configurado.';
      // confirmar() la define app.js (declaración de función, mismo ámbito
      // global de scripts clásicos): para cuando se hace clic aquí, ya cargó.
      const ok = await confirmar({ titulo: 'Instalar Ollama', texto: aviso, aceptar: 'Instalar' });
      if (!ok) return;
      bo.disabled = true;
      bo.textContent = 'Instalando…';
      const caja = bo.closest('.aviso');
      // Igual que conReintento: el motivo del fallo cuelga como aviso propio
      // dentro de la misma tarjeta, con los enlaces (brew.sh si falta Homebrew)
      // convertidos en botones — un <a> normal no navega dentro de la app.
      const marcarError = (texto) => {
        if (!caja) return;
        let m = caja.querySelector('.motivo');
        if (!m) { m = document.createElement('div'); m.className = 'aviso error motivo'; caja.appendChild(m); }
        m.innerHTML = '';
        String(texto || 'No se pudo completar.').split(/(https?:\/\/\S+)/g).forEach(parte => {
          if (/^https?:\/\//.test(parte)) {
            const enlace = document.createElement('button');
            enlace.type = 'button'; enlace.className = 'enlace-externo'; enlace.textContent = parte;
            enlace.onclick = () => window.api.abrirExterno(parte);
            m.appendChild(enlace);
          } else if (parte) {
            m.appendChild(document.createTextNode(parte));
          }
        });
      };
      alInstalar = ({ formula, linea }) => {
        if (bo.disabled && String(formula || '').startsWith('ollama:') && linea) bo.textContent = linea.slice(0, 44);
      };
      try {
        const r = await window.api.instalarOllama();
        if (r && r.ok) { bo.textContent = 'Listo'; setTimeout(pintar, 900); }
        else { bo.disabled = false; bo.textContent = 'Reintentar'; marcarError(r && r.error); }
      } catch (e) {
        bo.disabled = false; bo.textContent = 'Reintentar'; marcarError(e && e.message);
      }
    };

    $$('#btnGuardar').onclick = () => guardar(true);

    // El diagnóstico se pide una vez al abrir Ajustes (pintar() no corre en
    // cada tecla), no cada vez que alguien mira esta sección. El botón queda
    // deshabilitado hasta que llega: si no, un clic rápido copiaría el
    // "Reuniendo datos…" en vez del diagnóstico real.
    let diagnosticoActual = '';
    const preDiag = $$('#diagTexto'), btnDiag = $$('#btnCopiarDiagnostico');
    window.api.diagnosticoTexto()
      .then(r => (r && r.ok !== false && r.texto) || 'No se pudo generar el diagnóstico.')
      .catch(() => 'No se pudo generar el diagnóstico.')
      .then(texto => {
        diagnosticoActual = texto;
        if (preDiag) preDiag.textContent = texto;
        if (btnDiag) btnDiag.disabled = false;
      });
    if (btnDiag) btnDiag.onclick = async () => {
      await window.api.diagnosticoCopiar(diagnosticoActual);
      const previo = btnDiag.textContent;
      btnDiag.textContent = 'Copiado';
      setTimeout(() => { if (document.contains(btnDiag)) btnDiag.textContent = previo; }, 1500);
    };
  }

  async function guardar(cerrar) {
    if ($$('#aLlave') && $$('#aLlave').value.trim()) {
      await window.api.guardarLlave({ proveedor: $$('#aProveedor').value, llave: $$('#aLlave').value.trim() });
      $$('#aLlave').value = '';
    }
    await window.api.configGuardar({
      usuario: { nombre: $$('#aNombre').value.trim(), empresa: $$('#aEmpresa').value.trim(), contacto: $$('#aContacto').value.trim() },
      rutas: { reuniones: $$('#aReuniones').value.trim(), dossiers: $$('#aDossiers').value.trim() },
      grabacion: { microfono: $$('#aMicrofono') ? $$('#aMicrofono').value : '',
                   microfonoPresencial: $$('#aMicrofonoPresencial') ? $$('#aMicrofonoPresencial').value : '' },
      motor: { tipo: $$('input[name=motor]:checked').value, proveedor: $$('#aProveedor') ? $$('#aProveedor').value : 'anthropic' },
      marca: { acento: normalizarAcento($$('#aAcento').value) || '#B58A3E' },
    });
    if (cerrar) { cerrarAjustes(); if (window.recargarClientes) window.recargarClientes(); }
  }

  // el foco vuelve a donde estaba al cerrar (antes se perdía en el <body>)
  let focoPrevio = null;
  const cerrarAjustes = () => {
    $$('#modalAjustes').hidden = true;
    if (focoPrevio && focoPrevio.focus && document.contains(focoPrevio)) focoPrevio.focus();
    focoPrevio = null;
  };

  window.abrirAjustes = async () => {
    if (!$$('#modalAjustes').hidden) return;
    focoPrevio = document.activeElement;
    $$('#modalAjustes').hidden = false;
    await pintar();
    const primero = $$('#aNombre'); if (primero) primero.focus();
  };
  document.addEventListener('DOMContentLoaded', () => {
    $$('#btnAjustes').onclick = window.abrirAjustes;
    $$('#cerrarAjustes').onclick = cerrarAjustes;
    // Escape y clic fuera cierran el modal; antes la única salida era acertarle al botón.
    $$('#modalAjustes').addEventListener('click', (e) => { if (e.target === $$('#modalAjustes')) cerrarAjustes(); });
    document.addEventListener('keydown', (e) => {
      if (!$$('#modalAjustes').hidden && !document.querySelector('.confirmar')) {
        if (e.key === 'Escape') cerrarAjustes();
        if (e.key === 'Tab' && window.atraparTab) window.atraparTab(e, $$('#modalAjustes'));
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); window.abrirAjustes(); }
    });
  });
})();
