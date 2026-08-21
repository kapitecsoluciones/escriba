// Pantalla de Ajustes: quién eres, dónde vive todo, y con qué motor se redacta.
(() => {
  const $$ = s => document.querySelector(s);
  const esc = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  async function pintar() {
    const cfg = await window.api.configLeer();
    const motores = await window.api.motoresEstado();
    const diag = await window.api.diagnostico();
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

    c.innerHTML = `
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

      <div class="seccion">Motor de redacción</div>
      ${motores.map(m => `
        <label class="motor ${cfg.motor.tipo === m.id ? 'sel' : ''} ${m.disponible ? '' : 'no'}">
          <input type="radio" name="motor" value="${m.id}" ${cfg.motor.tipo === m.id ? 'checked' : ''} ${m.disponible ? '' : 'disabled'}>
          <div>
            <div class="n">${esc(m.nombre)} ${m.disponible ? '' : '— no disponible'}</div>
            <div class="d">${esc(m.descripcion)}</div>
            <div class="p">${esc(m.privacidad)}</div>
          </div>
        </label>`).join('')}

      <div class="campo" id="cajaLlave" ${cfg.motor.tipo === 'api' ? '' : 'hidden'}>
        <label>Proveedor y llave</label>
        <select id="aProveedor">
          <option value="anthropic" ${cfg.motor.proveedor === 'anthropic' ? 'selected' : ''}>Anthropic</option>
          <option value="openai" ${cfg.motor.proveedor === 'openai' ? 'selected' : ''}>OpenAI</option>
        </select>
        <input type="password" id="aLlave" placeholder="Pega aquí tu llave" style="margin-top:7px">
        <div class="ayuda">Se guarda en el Keychain de macOS, nunca en un archivo del proyecto.</div>
      </div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="btn" id="btnProbar">Probar el motor</button>
      </div>
      <div id="resProbar"></div>

      <div class="seccion">Dónde se guarda todo</div>
      <div class="campo">
        <label>Carpeta de reuniones</label>
        <input type="text" id="aReuniones" value="${esc(cfg.rutas.reuniones)}">
      </div>
      <div class="campo">
        <label>Carpeta de expedientes de cliente (opcional)</label>
        <input type="text" id="aDossiers" value="${esc(cfg.rutas.dossiers)}" placeholder="Un archivo .md por cliente">
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

    c.querySelectorAll('[data-brew]').forEach(b => b.onclick = async () => {
      const formula = b.dataset.brew;
      b.disabled = true; b.textContent = 'Instalando…';
      const r = await window.api.instalarDep(formula);
      b.textContent = r.ok ? 'Instalado' : 'Falló';
      if (r.ok) setTimeout(pintar, 900);
    });
    const bm = $$('#btnModelo');
    if (bm) bm.onclick = async () => {
      bm.disabled = true; bm.textContent = 'Descargando… 0%';
      window.api.onDescarga(({pct}) => { bm.textContent = `Descargando… ${pct}%`; });
      const r = await window.api.descargarModelo();
      bm.textContent = r.ok ? 'Listo' : 'Falló: ' + (r.error || '');
      if (r.ok) setTimeout(pintar, 900);
    };

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
      motor: { tipo: $$('input[name=motor]:checked').value, proveedor: $$('#aProveedor') ? $$('#aProveedor').value : 'anthropic' },
    });
    if (cerrar) { $$('#modalAjustes').hidden = true; if (window.recargarClientes) window.recargarClientes(); }
  }

  window.abrirAjustes = async () => { $$('#modalAjustes').hidden = false; await pintar(); };
  document.addEventListener('DOMContentLoaded', () => {
    $$('#btnAjustes').onclick = window.abrirAjustes;
    $$('#cerrarAjustes').onclick = () => { $$('#modalAjustes').hidden = true; };
  });
})();
