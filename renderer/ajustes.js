// Pantalla de Ajustes: quién eres, dónde vive todo, y con qué motor se redacta.
(() => {
  const $$ = s => document.querySelector(s);
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  async function pintar() {
    const cfg = await window.api.configLeer();
    const motores = await window.api.motoresEstado();
    const diag = await window.api.diagnostico();
    const rm = await window.api.micros().catch(() => ({ ok: false }));
    const micros = (rm && rm.ok && rm.micros) || [];
    const c = $$('#cuerpoAjustes');

    const faltantes = diag.faltantes.length
      ? `<div class="seccion">Falta por instalar</div>` +
        diag.faltantes.map(f => {
          const brew = /brew install (\S+)/.exec(f.como);
          const boton = brew ? `<button class="btn" style="margin-top:7px" data-brew="${brew[1]}">Instalar ahora</button>` : '';
          const modelo = /modelo/.test(f.que) ? `<button class="btn" style="margin-top:7px" id="btnModelo">Descargar (1.5 GB)</button>` : '';
          return `<div class="falta"><b>${esc(f.que)}</b> — ${esc(f.como)}${boton}${modelo}</div>`;
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
      <div class="falta" style="margin-bottom:14px">
        <b>Tu configuración no se pudo leer y se empezó de cero.</b>
        El archivo dañado se guardó en <code>${esc(diag.configRoto.respaldo)}</code> por si quieres
        recuperar algo. Vuelve a escribir tus datos aquí y se arregla.
      </div>` : '';

    c.innerHTML = `
      ${configRoto}
      ${bienvenida}
      <div class="seccion">Quién eres</div>
      <div class="campo">
        <label>Tu nombre</label>
        <input type="text" id="aNombre" value="${esc(cfg.usuario.nombre)}" placeholder="Nombre y apellido">
        <div class="ayuda">Se usa para saber cuál voz eres tú cuando grabas una videollamada.</div>
      </div>
      <div class="campo">
        <label>Tu empresa</label>
        <input type="text" id="aEmpresa" value="${esc(cfg.usuario.empresa)}" placeholder="Opcional">
      </div>
      <div class="campo">
        <label>Línea de contacto para el pie de la minuta</label>
        <input type="text" id="aContacto" value="${esc(cfg.usuario.contacto)}" placeholder="Nombre · correo · teléfono">
      </div>

      <div class="seccion">Con qué se graba</div>
      <div class="campo">
        <label>Micrófono</label>
        <select id="aMicrofono">
          <option value="">El que use el sistema${micros.length ? ` — ahora ${esc((micros.find(m => m.porDefecto) || {}).nombre || '')}` : ''}</option>
          ${micros.map(m => `<option value="${esc(m.id)}" ${cfg.grabacion && cfg.grabacion.microfono === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}
        </select>
        <div class="ayuda">Para una reunión presencial, el micrófono del iPhone capta mejor a quien está al otro lado de la mesa. Aparece aquí si lo tienes cerca y con Continuidad activada. Si el que elijas no está al empezar, se graba con el del sistema y se avisa.</div>
      </div>

      <div class="seccion">Quién escribe la minuta</div>
      ${motores.map(m => `
        <label class="motor ${cfg.motor.tipo === m.id ? 'sel' : ''} ${m.disponible ? '' : 'no'}">
          <input type="radio" name="motor" value="${m.id}" ${cfg.motor.tipo === m.id ? 'checked' : ''}>
          <div>
            <div class="n">${esc(m.nombre)} ${m.disponible ? '' : '— no disponible'}</div>
            <div class="d">${esc(m.descripcion)}</div>
            <div class="p">${esc(m.privacidad)}</div>
          </div>
        </label>`).join('')}

      ${motores.some(m => m.disponible) ? '' : `<div class="falta" style="margin-bottom:12px">
        <b>Ninguno está listo todavía.</b> Puedes elegir uno igualmente y configurarlo:
        con <b>Claude Code</b> basta instalarlo y autenticarlo; con <b>tu propia llave</b>
        solo hay que pegarla aquí abajo; <b>Ollama</b> necesita estar corriendo en este equipo.
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
      <div id="resProbar"></div>

      <div class="seccion">Dónde se guarda todo</div>
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
      </div>`;

    c.querySelectorAll('input[name=motor]').forEach(r => r.onchange = () => {
      c.querySelectorAll('.motor').forEach(m => m.classList.toggle('sel', m.querySelector('input').checked));
      $$('#cajaLlave').hidden = $$('input[name=motor]:checked').value !== 'api';
    });

    $$('#btnProbar').onclick = async () => {
      const id = $$('input[name=motor]:checked').value;
      const r = $$('#resProbar');
      r.innerHTML = '<div class="estado-linea">Probando…</div>';
      if (id === 'api' && $$('#aLlave').value.trim()) {
        await window.api.guardarLlave({ proveedor: $$('#aProveedor').value, llave: $$('#aLlave').value.trim() });
      }
      await guardar(false);
      const res = await window.api.motorProbar(id);
      r.innerHTML = `<div class="estado-linea ${res.ok ? 'ok' : 'mal'}">${res.ok ? 'Funciona.' : 'No respondió.'} ${esc(res.detalle || '')}</div>`;
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
        const caja = b.closest('.falta');
        if (caja && !caja.querySelector('.motivo')) {
          const m = document.createElement('div');
          m.className = 'estado-linea mal motivo';
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
      window.api.onDescarga(({ pct }) => { if (bm.disabled) bm.textContent = `Descargando… ${pct}%`; });
      return window.api.descargarModelo();
    });

    $$('#btnGuardar').onclick = () => guardar(true);
  }

  async function guardar(cerrar) {
    if ($$('#aLlave') && $$('#aLlave').value.trim()) {
      await window.api.guardarLlave({ proveedor: $$('#aProveedor').value, llave: $$('#aLlave').value.trim() });
      $$('#aLlave').value = '';
    }
    await window.api.configGuardar({
      usuario: { nombre: $$('#aNombre').value.trim(), empresa: $$('#aEmpresa').value.trim(), contacto: $$('#aContacto').value.trim() },
      rutas: { reuniones: $$('#aReuniones').value.trim(), dossiers: $$('#aDossiers').value.trim() },
      grabacion: { microfono: $$('#aMicrofono') ? $$('#aMicrofono').value : '' },
      motor: { tipo: $$('input[name=motor]:checked').value, proveedor: $$('#aProveedor') ? $$('#aProveedor').value : 'anthropic' },
    });
    if (cerrar) { $$('#modalAjustes').hidden = true; if (window.recargarClientes) window.recargarClientes(); }
  }

  const cerrarAjustes = () => { $$('#modalAjustes').hidden = true; };

  window.abrirAjustes = async () => {
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
      if (e.key === 'Escape' && !$$('#modalAjustes').hidden && !document.querySelector('.confirmar')) cerrarAjustes();
      if ((e.metaKey || e.ctrlKey) && e.key === ',') { e.preventDefault(); window.abrirAjustes(); }
    });
  });
})();
