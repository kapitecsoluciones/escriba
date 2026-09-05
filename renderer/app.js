let CLIENTES = [], EXPEDIENTES = [], REUNIONES = [], RESULTADOS = null;
let actual = null, reunionActual = null, hayResultados = false;
let grabando = false, t0 = 0, crono = null, editando = false, pestana = 'minuta', verCitas = false;
let borrador = null;      // texto en edición sin guardar; null = no hay nada pendiente
let modoGrabacion = 'llamada';   // 'llamada' | 'presencial'
let procesando = false;

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// El conversor de Markdown es el mismo de lib/md.js, cargado como <script>.
// Aquí había una copia con el mismo bucle infinito, que colgaba la ventana.
const md2html = t => window.MD.convertir(t || '');

// ---------- foco ----------
// Tab dentro de un diálogo se queda en el diálogo, y al cerrarlo el foco vuelve
// a donde estaba. Antes Tab se iba a la ventana de atrás y al cerrar el foco
// se perdía en el <body>.
function atraparTab(e, caja){
  const f = [...caja.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(x => x.offsetParent !== null);
  if(!f.length) return;
  const i = f.indexOf(document.activeElement);
  if(e.shiftKey ? i <= 0 : (i === -1 || i === f.length - 1)){ e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
}
window.atraparTab = atraparTab;   // también lo usa ajustes.js
const devolverFoco = (previo) => { if(previo && previo.focus && document.contains(previo)) previo.focus(); };

// ---------- confirmación ----------
// Todo lo que destruye trabajo pasa por aquí antes de ejecutarse.
function confirmar({ titulo, texto, aceptar = 'Continuar', peligro = false }) {
  return new Promise(res => {
    const previo = document.activeElement;
    const capa = el('div','confirmar');
    capa.innerHTML = `<div class="caja" role="alertdialog" aria-modal="true">
      <h3>${esc(titulo)}</h3><p>${esc(texto)}</p>
      <div class="botones"><button class="btn" data-no>Cancelar</button>
      <button class="btn ${peligro?'peligro':'primario'}" data-si>${esc(aceptar)}</button></div></div>`;
    let cerrado = false;
    const cerrar = (v) => { if (cerrado) return; cerrado = true;
      document.removeEventListener('keydown', tecla); capa.remove(); devolverFoco(previo); res(v); };
    // Enter desde cualquier sitio aceptaba el botón destructivo. Ahora solo
    // acepta si el foco está en un botón del diálogo (Enter sobre él).
    const tecla = (e) => {
      if (e.key === 'Tab') atraparTab(e, capa);
      if (e.key === 'Escape') cerrar(false);
      if (e.key === 'Enter' && capa.contains(document.activeElement)) {
        cerrar(document.activeElement.hasAttribute('data-si'));
      }
    };
    capa.querySelector('[data-no]').onclick = () => cerrar(false);
    capa.querySelector('[data-si]').onclick = () => cerrar(true);
    capa.onclick = (e) => { if (e.target === capa) cerrar(false); };
    document.addEventListener('keydown', tecla);
    document.body.appendChild(capa);
    // en las destructivas el foco va a Cancelar: Enter por inercia no borra nada
    capa.querySelector(peligro ? '[data-no]' : '[data-si]').focus();
  });
}
// Crear cliente estaba escondido: solo aparecía si escribías en el buscador un
// nombre que no existía. Nadie adivina eso, así que ahora hay un botón.
function dialogoNuevoCliente(nombrePrevio = '', op = {}) {
  const titulo = op.titulo || 'Nuevo cliente';
  const etiquetaOk = op.aceptar || 'Crear cliente';
  const soloExpediente = !!op.soloExpediente;
  return new Promise(res => {
    let elegido = null;
    const previo = document.activeElement;
    const capa = el('div','confirmar');
    capa.innerHTML = `<div class="caja nuevo" role="dialog" aria-modal="true">
      <h3>${esc(titulo)}</h3>
      <label class="et">${soloExpediente ? 'Buscar expediente' : 'Nombre'}</label>
      <input type="text" id="nuevoNombre" autocomplete="off"
        placeholder="${soloExpediente ? 'Escribe para filtrar' : 'Como quieras verlo en la lista'}">
      <div class="et">${soloExpediente ? 'Elige uno' : 'Enlazar un expediente <span>opcional</span>'}</div>
      <div class="ayuda">Escriba lee el expediente antes de redactar: de ahí sale lo que quedó pendiente de otras veces y lo que hoy no se dijo.</div>
      <div class="chips" id="listaExps"></div>
      <div class="botones"><button class="btn" data-no>Cancelar</button>
      <button class="btn primario" data-si>${esc(etiquetaOk)}</button></div></div>`;
    const campo = capa.querySelector('#nuevoNombre');
    const lista = capa.querySelector('#listaExps');
    campo.value = soloExpediente ? '' : nombrePrevio;

    const pintarExps = () => {
      const q = campo.value.toLowerCase().trim();
      const usados = new Set(CLIENTES.map(c => c.dossier).filter(Boolean));
      const hay = EXPEDIENTES.filter(e => !usados.has(e.archivo))
        .filter(e => !q || e.nombre.toLowerCase().includes(q)).slice(0, soloExpediente ? 10 : 6);
      lista.innerHTML = '';
      if(!EXPEDIENTES.length){
        lista.appendChild(el('div','ayuda','No hay carpeta de expedientes configurada. Puedes ponerla luego en Ajustes.'));
        return;
      }
      if(!hay.length){ lista.appendChild(el('div','ayuda',
        soloExpediente ? 'Ningún expediente coincide.' : 'Ningún expediente coincide. Se creará sin expediente.')); return; }
      hay.forEach(e => {
        const b = el('button','chip'+(elegido===e.archivo?' sel':''), esc(e.nombre));
        b.onclick = () => {
          elegido = elegido === e.archivo ? null : e.archivo;
          if(elegido && !soloExpediente && !campo.value.trim()) campo.value = e.nombre;
          pintarExps();
        };
        lista.appendChild(b);
      });
    };
    pintarExps();
    campo.oninput = pintarExps;

    let cerrado = false;
    const cerrar = (v) => { if(cerrado) return; cerrado = true;
      document.removeEventListener('keydown', tecla); capa.remove(); devolverFoco(previo); res(v); };
    const aceptar = () => {
      if(soloExpediente){ if(elegido) cerrar({ nombre: nombrePrevio, expediente: elegido }); return; }
      const nombre = campo.value.trim();
      if(!nombre){ campo.focus(); campo.classList.add('mal'); return; }
      cerrar({ nombre, expediente: elegido });
    };
    const tecla = (e) => {
      if (e.key === 'Tab') atraparTab(e, capa); if(e.key==='Escape') cerrar(null);
                           if(e.key==='Enter' && document.activeElement===campo) aceptar(); };
    capa.querySelector('[data-no]').onclick = () => cerrar(null);
    capa.querySelector('[data-si]').onclick = aceptar;
    capa.onclick = (e) => { if(e.target===capa) cerrar(null); };
    document.addEventListener('keydown', tecla);
    document.body.appendChild(capa);
    setTimeout(()=>campo.focus(), 0);
  });
}

// Enlazar un expediente a un cliente que ya existe.
async function enlazarExpediente(){
  const usados = new Set(CLIENTES.map(c=>c.dossier).filter(Boolean));
  const libres = EXPEDIENTES.filter(e=>!usados.has(e.archivo));
  if(!libres.length) return aviso('No hay expedientes sin enlazar.');
  const d = await dialogoNuevoCliente(actual.nombre,
    { titulo: `Expediente de ${actual.nombre}`, aceptar: 'Enlazar', soloExpediente: true });
  if(!d || !d.expediente) return;
  const r = await window.api.enlazarExpediente({slug: actual.slug, archivo: d.expediente});
  if(r && r.ok === false) return estado('error','No se pudo enlazar el expediente', r.error);
  await cargarClientes();
  actual = CLIENTES.find(c=>c.slug===actual.slug) || actual;
  await cargarReuniones();
  aviso('Expediente enlazado.');
}

async function crearClienteNuevo(nombrePrevio = ''){
  const d = await dialogoNuevoCliente(nombrePrevio);
  if(!d) return;
  const nuevo = await window.api.crearCliente(d);
  $('#q').value = ''; hayResultados = false;
  await cargarClientes();
  const c = CLIENTES.find(x => x.slug === nuevo.slug) || nuevo;
  await elegirCliente(c);
  aviso(d.expediente ? 'Cliente creado y expediente enlazado.' : 'Cliente creado.');
}

// Salir de una minuta a medio editar borraba los cambios sin avisar.
async function permisoParaSalir() {
  if (!editando || borrador == null || borrador === (reunionActual && reunionActual.minuta)) return true;
  const ok = await confirmar({ titulo: 'Tienes cambios sin guardar',
    texto: 'Si sales ahora se pierden las correcciones que hiciste a esta minuta.',
    aceptar: 'Salir y perderlos', peligro: true });
  if (ok) { editando = false; borrador = null; }
  return ok;
}

// ---------- clientes ----------
async function cargarClientes(){
  CLIENTES = await window.api.clientes();
  try { EXPEDIENTES = await window.api.expedientes(); } catch { EXPEDIENTES = []; }
  pintarClientes();
}
// Etiqueta de estado de una reunión, la misma en la lista y en la cabecera.
function estadoReunion(r){
  return (r.minuta ? 'Minuta lista' : (r.transcripcion ? 'Transcrita' : 'Solo audio')) + (r.tienePdf ? ' · PDF' : '');
}

// La barra lateral lleva clientes y, bajo el activo, sus reuniones. Antes las
// reuniones tenían una columna propia que con una o dos quedaba casi entera
// vacía, y le robaba el ancho al documento, que es lo único que se lee.
function pintarClientes(){
  const q = ($('#q').value||'').toLowerCase().trim();
  const cont = $('#clientes'); cont.innerHTML='';

  // buscando: la lista se convierte en los resultados
  if(RESULTADOS){
    if(!RESULTADOS.total){
      cont.appendChild(el('div','vacio-lateral',
        'Nada con esas palabras.<br>Prueba con menos palabras o con un nombre propio.'));
      return;
    }
    // se resaltan todas las palabras, y "catalogo" resalta "catálogo"
    const flex = p => p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
      .replace(/[aeioun]/g, ch => ({a:'[aáàä]',e:'[eéèë]',i:'[iíï]',o:'[oóö]',u:'[uúü]',n:'[nñ]'})[ch]);
    const re = new RegExp('('+RESULTADOS.palabras.map(flex).join('|')+')','ig');
    RESULTADOS.resultados.forEach(r=>{
      const limpio = r.fragmento.replace(/\*\*/g,'').replace(/^#+\s*/gm,'').replace(/^-\s+/,'');
      const frag = esc(limpio).replace(re,'<mark>$1</mark>');
      const b = el('button','res', `<div class="res-cliente">${esc(r.cliente)} · ${esc(fechaBonita(r.id))}</div>`+
        (r.titulo ? `<div class="res-titulo">${esc(r.titulo)}</div>` : '') + `<div class="res-frag">${frag}</div>`);
      b.onclick = async () => {
        if(!await permisoParaSalir()) return;
        const c = CLIENTES.find(x=>x.slug===r.slug); if(!c) return;
        $('#q').value=''; RESULTADOS=null; hayResultados=false; await elegirCliente(c);
        const reu = REUNIONES.find(x=>x.id===r.id); if(reu) await verReunion(reu);
      };
      cont.appendChild(b);
    });
    return;
  }

  const filtrados = CLIENTES.filter(c => !q || c.nombre.toLowerCase().includes(q));
  if(q && !filtrados.length && !hayResultados){
    const b = el('button','cli', `<span class="punto"></span><span class="cli-nombre">Crear "${esc($('#q').value.trim())}"</span>`);
    b.style.color = 'var(--gold-texto)'; b.style.fontWeight = '600';
    b.onclick = () => crearClienteNuevo($('#q').value.trim());
    cont.appendChild(b); return;
  }
  // Sin clientes y sin búsqueda, el panel quedaba en blanco: nadie adivina que
  // se crea un cliente escribiendo en el buscador.
  if(!filtrados.length && !q){
    const v = el('div','vacio-lateral',
      'Todavía no hay clientes.<br>Presiona <b>+ Nuevo cliente</b> para empezar.');
    cont.appendChild(v); return;
  }
  filtrados.forEach(c=>{
    const activo = actual && actual.slug===c.slug;
    const b = el('button','cli'+(activo?' activo':''),
      `<span class="punto"></span><span class="cli-nombre">${esc(c.nombre)}</span>`+
      (c.pendientes ? `<span class="cli-cuenta" title="${c.pendientes} compromiso${c.pendientes===1?'':'s'} pendiente${c.pendientes===1?'':'s'}">${c.pendientes}</span>` : ''));
    b.title = c.ultima ? `Última reunión: ${fechaBonita(c.ultima)}` : 'Sin reuniones todavía';
    b.onclick = async () => { if(await permisoParaSalir()) elegirCliente(c); };
    cont.appendChild(b);
    if(!activo) return;
    const caja = el('div','reus');
    if(!REUNIONES.length){
      caja.appendChild(el('div','reu-vacio','Aún no hay reuniones'));
    }
    REUNIONES.forEach(r=>{
      const rb = el('button','reu'+(reunionActual&&reunionActual.id===r.id?' activa':''), r.titulo
        ? `<div class="reu-fecha">${esc(r.titulo)}</div><div class="reu-estado">${esc(fechaCorta(r.id))} · ${estadoReunion(r)}</div>`
        : `<div class="reu-fecha">${esc(fechaBonita(r.id))}</div><div class="reu-estado">${estadoReunion(r)}</div>`);
      rb.title = r.titulo ? fechaBonita(r.id) : '';
      rb.onclick = async ()=>{ if(await permisoParaSalir()) await verReunion(r); };
      caja.appendChild(rb);
    });
    cont.appendChild(caja);
  });
}
async function elegirCliente(c){
  // Cambiar de cliente con la grabación en marcha hacía que, al detener, la
  // minuta se redactara y se anotara en la memoria del cliente NUEVO con el
  // audio del viejo. Sin ninguna pista.
  if(grabando && actual && c.slug !== actual.slug){
    aviso('Detén la grabación antes de cambiar de cliente.');
    return;
  }
  actual = c; reunionActual = null; editando = false; borrador = null;
  window.api.clienteActivo({slug:c.slug, nombre:c.nombre});
  $('#titulo').textContent = c.nombre;
  if(!procesando && !grabando){
    $('#btnGrabar').disabled = false; $('#btnImportar').disabled = false;
    $('#btnExpediente').disabled = false; $('#btnPreparar').disabled = false;
    $('#btnCliente').disabled = false;
  }
  await cargarReuniones();
}
async function cargarReuniones(){
  const rs = await window.api.reuniones(actual.slug);
  const sub = $('#subtitulo');
  sub.textContent = rs.length
    ? `${rs.length} ${rs.length===1?'reunión registrada':'reuniones registradas'}`
    : 'Sin reuniones todavía';
  // El expediente es lo que deja a Escriba detectar lo que NO se dijo: si falta,
  // conviene que se vea y se pueda enlazar sin ir a buscar dónde.
  if(!actual.dossier && EXPEDIENTES.length){
    sub.appendChild(document.createTextNode(' · sin expediente'));
    const b = el('button','enlazar','enlazar');
    b.onclick = () => enlazarExpediente();
    sub.appendChild(b);
  }
  REUNIONES = rs;
  pintarClientes();
  if(!reunionActual) pintarDetalleVacio();
  return rs;
}
// Con año: "12 de agosto · 14:30" de 2024 y de 2026 se veían igual.
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function fechaBonita(id){
  const m = id.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  if(!m) return id;
  return `${+m[3]} de ${MESES[+m[2]-1]} de ${m[1]} · ${m[4]}:${m[5]}`;
}
function fechaCorta(id){
  const m = id.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  if(!m) return id;
  return `${+m[3]} ${MESES[+m[2]-1].slice(0,3)} ${m[1]} · ${m[4]}:${m[5]}`;
}

// ---------- detalle ----------
function pintarDetalleVacio(){
  const d = $('#detalle');
  d.innerHTML = `<div class="vacio"><strong>${esc(actual?actual.nombre:'')}</strong>
    Presiona <em>Grabar reunión</em> cuando empiece la junta,<br>o importa un audio que ya tengas.
    <div class="atajo">También puedes empezar y detener con <kbd>⌘</kbd><kbd>⇧</kbd><kbd>R</kbd> desde cualquier app.</div></div>`;
  if(actual) pintarPendientes(actual);
}

// "Qué le debo a este cliente": los compromisos sin cumplir de todas sus
// reuniones. Existía para el prompt de Preparar y no se veía en ningún sitio.
async function pintarPendientes(c){
  const lista = await window.api.pendientes(c.slug);
  // mientras cargaba, pudo abrirse una reunión o cambiar el cliente
  if(!Array.isArray(lista) || !lista.length || reunionActual || !actual || actual.slug !== c.slug) return;
  if($('#detalle .pendientes')) return;   // dos llamadas seguidas no deben pintar dos tarjetas
  const caja = el('div','tarjeta compromisos pendientes');
  caja.appendChild(el('div','et', `${lista.length} pendiente${lista.length===1?'':'s'} con ${esc(c.nombre)}`));
  lista.forEach(p=>{
    const fila = el('div','comp');
    const reu = REUNIONES.find(r => r.id === p.reunion);
    const chk = el('button','casilla',''); chk.title = 'Marcar como cumplido';
    chk.onclick = async () => {
      if(!reu) return;
      const res = await window.api.marcarCompromiso({carpeta:reu.carpeta, texto:p.texto, hecho:true});
      if(res && res.ok === false) return estado('error','No se pudo guardar', res.error);
      fila.remove();
      const quedan = caja.querySelectorAll('.comp').length;
      if(!quedan) caja.remove();
      else caja.querySelector('.et').textContent = `${quedan} pendiente${quedan===1?'':'s'} con ${c.nombre}`;
      cargarClientes();   // el contador de la barra lateral
    };
    const cuerpo = el('div','comp-cuerpo');
    cuerpo.appendChild(el('div','comp-texto', esc(p.texto)));
    const meta = [p.quien, p.cuando, reu ? fechaCorta(reu.id) : null].filter(Boolean).join(' · ');
    if(meta) cuerpo.appendChild(el('div','comp-meta', esc(meta)));
    const ir = el('button','copiar','ver la reunión'); ir.title = 'Abrir la minuta de donde salió';
    ir.onclick = async () => { if(reu) await verReunion(reu, 'compromisos'); };
    fila.appendChild(chk); fila.appendChild(cuerpo); fila.appendChild(ir);
    caja.appendChild(fila);
  });
  const v = $('#detalle .vacio'); if(v) v.insertAdjacentElement('beforebegin', caja);
}
async function verReunion(r, pestanaInicial){
  reunionActual = r; editando = false; borrador = null; pestana = pestanaInicial || 'minuta';
  pintarClientes(); pintarDetalle();
  if(r.minuta && !r.extras){
    const x = await window.api.compromisos({carpeta:r.carpeta, minuta:r.minuta});
    if(x && x.ok){ r.extras = x; if(reunionActual===r) pintarDetalle(); }
  }
}

// Ruta file:// segura para un audio que puede tener acentos o espacios.
function urlAudio(carpeta){
  return 'file://' + carpeta.split('/').map(encodeURIComponent).join('/') + '/mezcla.m4a';
}

// Un reproductor delgado, para verificar una cita antes de mandar el PDF.
function reproductor(r){
  const caja = el('div','audio-caja');
  const a = document.createElement('audio');
  a.id = 'audioReunion'; a.controls = true; a.preload = 'metadata'; a.src = urlAudio(r.carpeta);
  a.onerror = () => { caja.textContent = 'No se pudo abrir el audio de esta reunión.'; caja.classList.add('mal'); };
  caja.appendChild(a);
  return caja;
}

// Los compromisos: lo más valioso de la minuta, hasta ahora texto plano a media
// página. Aquí se pueden marcar y copiar sueltos, sin tocar minuta.md. Viven en
// su propia pestaña, así que van todos: el plegado a cuatro existía solo porque
// empujaban el documento fuera de la pantalla.
function bloqueCompromisos(r){
  const todos = (r.extras && r.extras.lista) || [];
  if(!todos.length) return null;
  // pendientes primero: lo hecho ya no hace falta tenerlo delante
  const orden = [...todos.filter(c=>!c.hecho), ...todos.filter(c=>c.hecho)];
  const caja = el('div','tarjeta compromisos');
  const et = el('div','et'); caja.appendChild(et);
  // sobre TODOS: contar solo los visibles hacía que, con 6 de 10 marcados,
  // marcar uno más mostrara "1 de 10"
  const rotular = () => {
    const h = todos.filter(x=>x.hecho).length;
    et.textContent = h ? `${h} de ${todos.length} cumplidos` : `${todos.length} compromiso${todos.length===1?'':'s'} · marca los que se cumplan`;
    // la pestaña lleva los pendientes; se actualiza sin repintar
    const p = document.querySelector('#detalle .pestana[data-pestana="compromisos"]');
    if(p){ const n = todos.length - h; let num = p.querySelector('.num');
      if(n && !num){ num = el('span','num'); p.appendChild(num); }
      if(num){ if(n) num.textContent = n; else num.remove(); }
      p.title = n ? `${n} pendiente${n===1?'':'s'} de ${todos.length}` : 'Todos cumplidos'; }
  };
  rotular();
  orden.forEach(c=>{
    const fila = el('div','comp'+(c.hecho?' hecho':''));
    const chk = el('button','casilla', c.hecho?'✓':'');
    chk.title = c.hecho ? 'Marcar como pendiente' : 'Marcar como cumplido';
    chk.onclick = async () => {
      const nuevo = !c.hecho;
      const res = await window.api.marcarCompromiso({carpeta:r.carpeta, texto:c.texto, hecho:nuevo});
      if(res && res.ok === false) return estado('error','No se pudo guardar', res.error);
      // sin repintar: repintar entero reconstruía el <audio> y la reproducción
      // volvía a cero justo cuando estabas verificando una cita
      c.hecho = nuevo;
      fila.classList.toggle('hecho', nuevo);
      chk.textContent = nuevo ? '✓' : '';
      chk.title = nuevo ? 'Marcar como pendiente' : 'Marcar como cumplido';
      rotular();
    };
    const cuerpo = el('div','comp-cuerpo');
    cuerpo.appendChild(el('div','comp-texto', esc(c.texto)));
    const meta = [c.quien, c.cuando].filter(Boolean).join(' · ');
    if(meta || c.t != null){
      const linea = el('div','comp-meta', esc(meta));
      if(c.t != null) linea.appendChild(chipCita(mmss(c.t)));
      cuerpo.appendChild(linea);
    }
    const cop = el('button','copiar','copiar');
    cop.title = 'Copiar este compromiso';
    cop.onclick = async () => {
      await window.api.copiarTexto([c.texto, meta].filter(Boolean).join(' — '));
      aviso('Compromiso copiado.');
    };
    fila.appendChild(chk); fila.appendChild(cuerpo); fila.appendChild(cop);
    caja.appendChild(fila);
  });
  return caja;
}

// Citas de audio. Un [mm:ss] en compromisos, hallazgos o en la minuta se
// vuelve un botón que salta a ese momento: verificar antes de enviar.
function saltarA(t){
  const a = document.getElementById('audioReunion'); if(!a) return;
  const p = String(t).split(':').map(Number);
  a.currentTime = p.length===3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1];
  a.play().catch(()=>{});
}
const mmss = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
function chipCita(t){
  const b = el('button','salto cita', esc(t)); b.dataset.t = t; b.title = 'Oír este momento';
  b.onclick = (e) => { e.preventDefault(); saltarA(t); };
  return b;
}
// Sobre el HTML ya convertido: md.js escapa el texto y los corchetes se quedan
// tal cual, así que la marca se reconoce sin tocar el conversor.
const conChips = html => html.replace(/\[(\d{1,3}:\d{2})\]/g, (_,t)=>`<button class="salto cita" data-t="${t}" title="Oír este momento">${t}</button>`);
function activarSaltos(nodo){
  nodo.querySelectorAll('.salto').forEach(b => { b.onclick = (e) => { e.preventDefault(); saltarA(b.dataset.t); }; });
}

// La conversación por voces. Cada marca de tiempo salta a ese momento del audio.
function bloqueDialogo(r){
  const cont = el('div','minuta dialogo');
  cont.innerHTML = '<h2>Quién dijo qué</h2>' + r.dialogo.split('\n').filter(Boolean).map(l=>{
    const m = l.match(/^\[([\d:]+)\]\s+([^:]+):\s*([\s\S]*)$/);
    if(!m) return `<p>${esc(l)}</p>`;
    return `<p><button class="salto" data-t="${esc(m[1])}" title="Oír este momento">${esc(m[1])}</button>`+
           `<strong>${esc(m[2])}:</strong> ${esc(m[3])}</p>`;
  }).join('');
  activarSaltos(cont);
  return cont;
}

// Un solo handler para cerrar cualquier menú abierto. Registrarlo dentro de
// menuMas() añadía uno nuevo en cada repintado y nunca se quitaban.
document.addEventListener('click', () => {
  document.querySelectorAll('.mas .menu').forEach(m => { m.hidden = true; });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.mas .menu').forEach(m => { m.hidden = true; });
});

// Menú de acciones secundarias: seis botones en fila no dejaban ver cuál era
// la acción principal, y "Volver a redactar" quedaba junto a "Abrir carpeta".
function menuMas(r){
  const caja = el('div','mas');
  const b = el('button','btn','Más ▾'); b.setAttribute('aria-haspopup','true'); b.title = 'Compartir, copiar, volver a redactar, borrar…';
  const m = el('div','menu'); m.hidden = true;
  const item = (txt, fn, cls) => { const i = el('button','item'+(cls?' '+cls:''), txt);
    i.onclick = () => { m.hidden = true; fn(); }; m.appendChild(i); return i; };

  if(r.tienePdf){
    item('Compartir el PDF…', ()=>compartirPdf(r));
    item('Guardar el PDF como…', ()=>guardarPdfComo(r));
    item('Abrir el PDF', ()=>window.api.abrir(r.carpeta+'/minuta.pdf'));
  }
  if(r.minuta) item('Volver a redactar', async ()=>{
    const ok = await confirmar({ titulo: 'Volver a redactar la minuta',
      texto: 'La IA escribirá una minuta nueva sobre la actual. Se guardará una copia de la versión de ahora por si quieres volver.',
      aceptar: 'Redactar de nuevo' });
    if(ok) procesar(r.carpeta, {reemplazarMemoria:true});
  });
  if(r.anterior) item('Restaurar la versión anterior', async ()=>{
    const ok = await confirmar({ titulo: 'Restaurar la versión anterior',
      texto: 'Se recupera la minuta tal como estaba antes de la última redacción.', aceptar: 'Restaurar' });
    if(!ok) return;
    await window.api.guardarMinuta({carpeta:r.carpeta, texto:r.anterior});
    reunionActual.minuta = r.anterior; delete reunionActual.extras;
    await cargarReuniones(); await verReunion(reunionActual);
  });
  if(r.minuta) item('Copiar la minuta', async ()=>{
    await window.api.copiarMinuta(r.minuta);
    aviso('Minuta copiada, lista para pegar. Sin las notas internas.');
  });
  item('Abrir la carpeta', ()=>window.api.abrir(r.carpeta));
  item('Mostrar en el Finder', ()=>window.api.revelar(r.carpeta));
  item('Borrar esta reunión', ()=>borrarReunion(r), 'peligro');

  b.onclick = (e) => { e.stopPropagation(); m.hidden = !m.hidden; };
  caja.appendChild(b); caja.appendChild(m);
  return caja;
}

async function borrarReunion(r){
  const ok = await confirmar({ titulo: '¿Borrar esta reunión?',
    texto: `Se mandan a la Papelera el audio, la transcripción y la minuta de ${fechaBonita(r.id)}. Podrás recuperarlos desde el Finder.`,
    aceptar: 'Mandar a la Papelera', peligro: true });
  if(!ok) return;
  const res = await window.api.eliminarReunion({carpeta:r.carpeta, slug:actual.slug});
  if(!res.ok) return estado('error','No se pudo borrar', res.error);
  reunionActual = null; editando = false; borrador = null;
  await cargarClientes(); await cargarReuniones();
}

function pintarDetalle(){
  const d = $('#detalle'); d.innerHTML='';
  const r = reunionActual; if(!r) return pintarDetalleVacio();
  const barra = el('div','acciones acciones-reunion');
  const add=(txt,cls,fn,ayuda)=>{const b=el('button','btn'+(cls?' '+cls:''),txt);b.onclick=fn;if(ayuda)b.title=ayuda;barra.appendChild(b);return b};

  // En edición solo hay dos salidas. Antes seguían visibles "Exportar PDF" y
  // "Volver a redactar", que trabajaban sobre la versión vieja del texto.
  if(editando){
    add('Guardar cambios','primario', guardarEdicion, 'También con ⌘S');
    add('Descartar','', async ()=>{
      if(!await permisoParaSalir()) return;
      editando = false; borrador = null; pintarDetalle();
    }, 'Salir sin guardar (Esc)');
    d.appendChild(barra);
    const ta = el('textarea','editor'); ta.value = borrador!=null?borrador:r.minuta; ta.id='editor';
    ta.oninput = ()=>{ borrador = ta.value; };
    // ⌘S guarda, Escape sale preguntando
    ta.onkeydown = async (e)=>{
      if((e.metaKey||e.ctrlKey) && e.key==='s'){ e.preventDefault(); guardarEdicion(); }
      if(e.key==='Escape'){ e.preventDefault(); if(await permisoParaSalir()){ editando=false; borrador=null; pintarDetalle(); } }
    };
    d.appendChild(ta);
    setTimeout(()=>ta.focus(),0);
    return;
  }

  if(!r.minuta && r.carpeta){
    add('Procesar esta reunión','primario', ()=>procesar(r.carpeta), 'Transcribir y redactar la minuta');
  }
  if(r.minuta){
    add('Editar','', ()=>{ editando=true; borrador=r.minuta; pestana='minuta'; pintarDetalle(); }, 'Corregir el texto antes de enviarlo');
    // Mandar la minuta es la razón de ser de la app y vivía a cinco clics,
    // dentro de "Más". Con el PDF al día, Compartir es la acción principal;
    // si la minuta cambió después del PDF, vuelve a serlo Exportar.
    if(r.pdfVigente){
      add('Compartir…','primario', ()=>compartirPdf(r), 'Enviar el PDF por Mail, Mensajes o AirDrop');
      add('Generar PDF','', exportarPdf, 'Volver a generar el PDF (⌘E)');
    } else {
      add('Generar PDF','primario', exportarPdf,
        r.tienePdf ? 'La minuta cambió después del PDF: conviene volver a generarlo (⌘E)' : 'Generar el PDF para el cliente (⌘E)');
    }
  }
  barra.appendChild(menuMas(r));
  // El reproductor vive en la barra, no en una tarjeta: es una herramienta
  // para verificar una cita, no parte del documento.
  if(r.minuta && r.tieneAudio) barra.appendChild(reproductor(r));
  if(r.minuta && r.motor && r.motor.nombre){
    const c = r.extras && r.extras.citas;
    const n = (c && c.total) || 0;
    const usado = el('div','motor-usado',`Redactada con ${esc(r.motor.nombre)}` + (n ? ` · ${n} cita${n===1?'':'s'} de audio` : ''));
    usado.title = 'Motor que produjo esta versión de la minuta' +
      (c && c.descartadas ? `. Se retiraron ${c.descartadas} cita${c.descartadas===1?'':'s'} que no correspondían a la grabación.` : '');
    barra.appendChild(usado);
  }
  d.appendChild(barra);

  if(!r.minuta){
    d.appendChild(el('div','vacio', r.transcripcion
      ? 'Ya está transcrita. Presiona <em>Procesar</em> para redactar la minuta.'
      : 'Audio guardado. Presiona <em>Procesar</em> para transcribir y redactar la minuta.'));
    return;
  }
  // El corte viene del proceso principal (lib/minuta.js). Mientras no ha
  // llegado NO se pinta nada del texto: pintar la minuta entera un instante
  // enseñaba las notas internas, justo lo que la app promete no enseñar, y
  // compartiendo pantalla eso lo ve el cliente.
  const x = r.extras;
  if(!x){ d.appendChild(el('div','vacio','Cargando…')); return; }
  const cuerpo   = x.encontrado ? x.cliente  : r.minuta;
  const internas = x.encontrado ? x.internas : '';
  const lista = x.lista || [];
  const pendientes = lista.filter(c=>!c.hecho).length;

  // Pestañas. Apiladas, compromisos + hallazgos sumaban ~860 px antes de la
  // primera línea de la minuta en una ventana de 820: lo que revisas antes de
  // enviar no se veía sin scroll. Ahora cada cosa tiene su espacio entero y
  // la pestaña Minuta es exactamente lo que recibe el cliente.
  const nCitas = (x.citas && x.citas.total) || 0;
  const paneMinuta = el('div','minuta', md2html(cuerpo));
  const panes = [
    { id:'minuta', rotulo:'Minuta', ayuda:'Exactamente lo que recibe el cliente', nodo: paneMinuta },
  ];
  if(lista.length) panes.push({ id:'compromisos', rotulo:'Compromisos', num: pendientes || null,
    ayuda: pendientes ? `${pendientes} pendiente${pendientes===1?'':'s'} de ${lista.length}` : 'Todos cumplidos',
    nodo: bloqueCompromisos(r) });
  if(internas) panes.push({ id:'interno', rotulo:'Interno', priv:true,
    ayuda:'Lo que no se dijo, riesgos y oportunidades. No se envía al cliente.',
    nodo: el('div','notas', `<div class="et">Solo para ti · no va en el PDF del cliente</div>${conChips(md2html(internas))}`) });
  const paneInterno = panes.find(p=>p.id==='interno'); if(paneInterno) activarSaltos(paneInterno.nodo);
  if(r.dialogo) panes.push({ id:'dialogo', rotulo:'Quién dijo qué',
    ayuda:'La conversación por voces; cada marca de tiempo se puede oír',
    nodo: bloqueDialogo(r) });

  if(!panes.some(p=>p.id===pestana)) pestana = 'minuta';
  const tira = el('div','pestanas'); tira.setAttribute('role','tablist');
  panes.forEach(p => {
    const b = el('button','pestana'+(p.priv?' priv':''), esc(p.rotulo) + (p.num ? `<span class="num">${p.num}</span>` : ''));
    b.setAttribute('role','tab'); b.dataset.pestana = p.id; b.title = p.ayuda;
    b.onclick = () => mostrarPestana(p.id);
    tira.appendChild(b);
    p.nodo.classList.add('pestana-cuerpo'); p.nodo.dataset.pestana = p.id;
  });
  // Las citas se ven en Compromisos e Interno siempre; en la Minuta solo si se
  // piden, porque esa pestaña es exactamente lo que recibe el cliente.
  if(nCitas){
    const v = el('button','ver-citas', 'Ver citas de audio');
    v.type = 'button'; v.setAttribute('aria-pressed', verCitas ? 'true' : 'false');
    v.title = 'Mostrar en la minuta el momento del audio de cada punto. No salen en el PDF ni al copiar.';
    const pintar = () => {
      v.setAttribute('aria-pressed', verCitas ? 'true' : 'false');
      paneMinuta.innerHTML = verCitas ? conChips(md2html(x.clienteConCitas || cuerpo)) : md2html(cuerpo);
      if(verCitas) activarSaltos(paneMinuta);
    };
    v.onclick = () => { verCitas = !verCitas; pintar(); };
    if(verCitas) pintar();
    tira.appendChild(v);
  }
  // ← → entre pestañas, como en las preferencias del sistema
  tira.onkeydown = (e) => {
    if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
    const i = panes.findIndex(p=>p.id===pestana);
    const j = (i + (e.key==='ArrowRight'?1:-1) + panes.length) % panes.length;
    mostrarPestana(panes[j].id);
    const b = tira.querySelector('[aria-selected="true"]'); if(b) b.focus();
    e.preventDefault();
  };
  d.appendChild(tira);
  panes.forEach(p => d.appendChild(p.nodo));
  mostrarPestana(pestana);
}

// Cambiar de pestaña no repinta: así el audio sigue donde iba y la lista de
// compromisos no pierde lo marcado a medias.
function mostrarPestana(id){
  pestana = id;
  const d = $('#detalle');
  d.querySelectorAll('.pestanas .pestana').forEach(b => {
    const activa = b.dataset.pestana === id;
    b.setAttribute('aria-selected', activa ? 'true' : 'false'); b.tabIndex = activa ? 0 : -1;
  });
  d.querySelectorAll('.pestana-cuerpo').forEach(n => { n.hidden = n.dataset.pestana !== id; });
  d.scrollTop = 0;
}
async function guardarEdicion(){
  const ta = $('#editor'); if(!ta) return;
  const res = await window.api.guardarMinuta({carpeta:reunionActual.carpeta, texto:ta.value});
  if(res && res.ok === false) return estado('error','No se pudo guardar la minuta', res.error);
  reunionActual.minuta = ta.value;
  delete reunionActual.extras;          // el texto cambió: los compromisos también pueden
  await verReunion(reunionActual);
  aviso('Cambios guardados.');
}
async function exportarPdf(){
  const r = reunionActual;
  estado('spin','Generando el PDF…','');
  const res = await window.api.pdf({carpeta:r.carpeta, cliente:actual.nombre, fecha:fechaBonita(r.id), texto:r.minuta});
  quitarEstado();
  if(res.ok){
    r.tienePdf=true; await cargarReuniones(); pintarDetalle();
    // Antes se abría en Vista Previa sin decir dónde había quedado, y desde ahí
    // no había forma evidente de mandárselo al cliente.
    aviso('PDF listo.', [
      {texto:'Compartir',      fn:()=>compartirPdf(r)},
      {texto:'Guardar copia…', fn:()=>guardarPdfComo(r)},
      {texto:'Abrir',          fn:()=>window.api.abrir(res.ruta)},
    ]);
  }
  else estado('error','No se pudo generar el PDF', res.error || '');
}

// ---------- preparación ----------
// La app tenía delante lo que quedó pendiente y solo lo usaba DESPUÉS, dentro
// del prompt de la minuta. El usuario preparaba a mano, fuera de Escriba, y luego la
// propia minuta le reprochaba las preguntas que no hizo.
function mostrarPreparacion(texto, fecha){
  reunionActual = null; editando = false; borrador = null;
  pintarClientes();
  const d = $('#detalle'); d.innerHTML='';
  const barra = el('div','acciones'); barra.style.cssText='margin-bottom:14px;gap:8px';
  const add=(t,c,fn)=>{const b=el('button','btn'+(c?' '+c:''),t);b.onclick=fn;barra.appendChild(b);return b};
  add('Copiar','primario', async ()=>{ await window.api.copiarTexto(texto); aviso('Preparación copiada.'); });
  add('Generar PDF','', async ()=>{
    const r = await window.api.preparacionPdf({slug:actual.slug, nombre:actual.nombre, texto});
    if(r && r.ok===false) return estado('error','No se pudo generar el PDF', r.error);
    aviso('PDF listo.', [
      {texto:'Compartir', fn:()=>window.api.compartir({archivo:r.ruta})},
      {texto:'Abrir', fn:()=>window.api.abrir(r.ruta)},
    ]);
  });
  add('Rehacer','', ()=>prepararReunion(true));
  d.appendChild(barra);
  const aviso1 = el('div','aviso atencion');
  aviso1.appendChild(el('div','et','Preparación · solo para ti, no se envía al cliente'));
  // un informe de hace meses sin fecha parecía recién hecho
  if(fecha) aviso1.appendChild(el('div','ayuda','Generada el ' + new Date(fecha).toLocaleDateString('es-MX',{day:'numeric',month:'long'}) + ' a las ' + new Date(fecha).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}) + '. Con «Rehacer» se vuelve a redactar con lo más reciente.'));
  d.appendChild(aviso1);
  d.appendChild(el('div','minuta', md2html(texto)));
}

async function prepararReunion(rehacer){
  if(!actual) return;
  if(!rehacer){
    const guardada = await window.api.preparacionLeer({slug:actual.slug});
    if(guardada && guardada.ok && guardada.texto) return mostrarPreparacion(guardada.texto, guardada.fecha);
  }
  estado('spin','Preparando la reunión…', `Revisando lo pendiente de ${actual.nombre}`);
  ocupado(true);
  const r = await window.api.preparar({slug:actual.slug, nombre:actual.nombre});
  ocupado(false); quitarEstado();
  if(!r || r.ok===false) return estado('error','No se pudo preparar', (r&&r.error)||'');
  mostrarPreparacion(r.texto);
}

$('#btnPreparar').onclick = () => prepararReunion(false);

// Preparar, Historial e Importar viven en "Cliente ▾" junto al nombre: seis
// controles en la cabecera no cabían en la ventana mínima y partían en dos
// líneas. Los atajos del menú de la app siguen llegando a los mismos botones.
$('#btnCliente').onclick = (e) => {
  e.stopPropagation();
  const m = $('#menuCliente .menu'); m.hidden = !m.hidden;
  if(!m.hidden){ const p = m.querySelector('.item:not(:disabled)'); if(p) p.focus(); }
};

// ---------- modo de grabación ----------
const AYUDA_MODO = {
  llamada:    'La otra persona suena en el Mac (FaceTime, Zoom o una llamada del iPhone contestada aquí). Se separa quién dijo qué.',
  presencial: 'Todos en la misma sala. Conviene el micrófono del iPhone en medio de la mesa. No se separa quién dijo qué.',
};
function pintarModo(){
  document.querySelectorAll('#modoGrabacion .modo-op').forEach(b => {
    b.classList.toggle('activa', b.dataset.modo === modoGrabacion);
    b.title = AYUDA_MODO[b.dataset.modo];
  });
  $('#modoGrabacion').classList.toggle('bloqueado', grabando);
}
document.querySelectorAll('#modoGrabacion .modo-op').forEach(b => b.onclick = () => {
  if(grabando) return;                       // no se cambia a mitad de grabación
  modoGrabacion = b.dataset.modo; pintarModo();
  window.api.configGuardar({ grabacion: { modo: modoGrabacion } });
  aviso(AYUDA_MODO[modoGrabacion]);
});
window.api.configLeer().then(cfg => { modoGrabacion = (cfg.grabacion && cfg.grabacion.modo) === 'presencial' ? 'presencial' : 'llamada'; pintarModo(); });

// ---------- grabación ----------
$('#btnGrabar').onclick = async () => {
  if(!grabando){
    const res = await window.api.grabarIniciar(actual.slug, { modo: modoGrabacion });
    if(!res.ok){
      const causa = explicar(res.error);
      estado('error','No se pudo iniciar la grabación', causa.texto);
      if(causa.permisos){
        const e=$('#estado');
        if(e){ const b=el('button','btn chico permisos','Abrir Ajustes');
               b.onclick=()=>window.api.abrirPermisos(); e.appendChild(b); }
      }
      return;
    }
    grabando = true; t0 = Date.now(); pintarModo();
    $('#btnGrabar').textContent = 'Detener y procesar';
    $('#btnGrabar').classList.add('grabando');
    $('#btnImportar').disabled = true;
    estado('pulso','Grabando', modoGrabacion==='presencial' ? 'Presencial · una sola pista' : 'Tu micrófono y el audio del Mac');
    const e=$('#estado');
    if(e){ const m=el('div','medidores',
      `<div class="med" id="medMic"><span class="et">Tu voz</span><div class="med-pista"><div class="med-relleno"></div></div></div>
       <div class="med" id="medSis"><span class="et">Llamada</span><div class="med-pista"><div class="med-relleno"></div></div></div>`);
      e.insertBefore(m, e.querySelector('.crono')); }
    silencioMic = 0;
    crono = setInterval(()=>{ const s=Math.floor((Date.now()-t0)/1000);
      const c=document.querySelector('.crono'); if(c) c.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; },500);
  } else {
    clearInterval(crono); grabando=false; pintarModo();
    $('#btnGrabar').textContent='Grabar reunión';
    $('#btnGrabar').classList.remove('grabando');
    $('#btnGrabar').disabled = true;
    const res = await window.api.grabarDetener();
    if(res.ok) await procesar(res.carpeta);
    else {
      // Antes esta rama no decía nada: el botón volvía a "Grabar reunión" y el
      // usuario daba por hecho que la reunión se había procesado.
      quitarEstado();
      estado('error','La grabación no se guardó', res.error);
      $('#btnGrabar').disabled = false; $('#btnImportar').disabled = false;
    }
  }
};

$('#btnNuevoCliente').onclick = () => crearClienteNuevo();

$('#btnExpediente').onclick = async () => {
  estado('spin','Armando el expediente…','Juntando todas las reuniones del cliente');
  const r = await window.api.exportarHistorial({slug:actual.slug, nombre:actual.nombre, cliente:actual.nombre});
  quitarEstado();
  if(!r.ok) return estado('error','No se pudo exportar', r.error);
  window.api.abrir(r.ruta);
};

$('#btnImportar').onclick = async () => {
  const archivo = await window.api.importar(); if(!archivo) return;
  estado('spin','Importando el audio…','');
  const res = await window.api.importarACarpeta({slug:actual.slug, archivo});
  if(res && res.ok === false){ quitarEstado(); return estado('error','No se pudo importar el audio', res.error); }
  await procesar(res.carpeta);
};

// Mientras se procesa una reunión no se puede empezar otra: antes se podía
// desde tres de las cuatro entradas y las dos se pisaban.
function ocupado(v){
  procesando = v;
  for(const id of ['#btnGrabar','#btnImportar','#btnExpediente','#btnPreparar','#btnCliente']){
    const b = $(id); if(b) b.disabled = v || !actual;
  }
  // Detener tiene que poder pulsarse SIEMPRE mientras se graba: Preparar
  // durante una grabación lo dejaba gris 20–60 s, y ⌘⇧R hace click() sobre
  // un botón deshabilitado, que no dispara nada.
  if(grabando){ const g=$('#btnGrabar'); if(g) g.disabled = false; }
}

let procesandoPara = null;
async function procesar(carpeta, extra={}){
  procesandoPara = actual ? actual.nombre : null;
  ocupado(true);
  const res = await window.api.procesar({carpeta, slug:actual.slug, nombre:actual.nombre, ...extra});
  ocupado(false); procesandoPara = null;
  if(res.cancelado){ quitarEstado(); aviso('Procesamiento cancelado.'); await cargarReuniones(); return; }
  if(!res.ok){ estado('error','No se pudo procesar', res.error); return; }
  quitarEstado();
  const rs = await cargarReuniones();
  // Solo la reunión que acabamos de procesar. Antes, si cambiabas de cliente
  // mientras corría, el `|| rs[0]` abría la reunión más reciente del cliente que
  // estuvieras mirando justo tras el aviso "Minuta lista", y parecía la nueva.
  const nueva = (rs||[]).find(r=>r.carpeta===carpeta) || null;
  if(nueva) await verReunion(nueva);
  else { reunionActual = null; pintarDetalle(); aviso(procesandoPara ? 'Minuta lista en ' + procesandoPara + '.' : 'Minuta lista.'); }
  // Si la reunión no quedó anotada en el expediente, el usuario no se enteraba.
  if(res.dossier && res.dossier.ok === false && res.dossier.motivo !== 'ya registrada'){
    aviso('Minuta lista, pero no se pudo anotar en la memoria del cliente: ' + res.dossier.motivo + '.');
  }
}

// ---------- medidores ----------
let silencioMic = 0;
window.api.onNiveles(({sistema, microfono})=>{
  const pinta=(id,v)=>{ const n=document.querySelector('#'+id+' .med-relleno'); if(!n) return;
    n.style.width = Math.min(100, Math.round(Math.pow(v,0.5)*140))+'%'; };
  pinta('medMic', microfono); pinta('medSis', sistema);
  // avisar si el micrófono lleva ~8 s mudo: mejor enterarse ahora que al final
  const mMic=document.getElementById('medMic');
  if(mMic){
    if(microfono < 0.004){ silencioMic++; } else { silencioMic = 0; mMic.classList.remove('mudo'); quitarAvisoMudo(); }
    if(silencioMic > 26){ mMic.classList.add('mudo'); ponerAvisoMudo(); }
  }
});
function ponerAvisoMudo(){
  if(document.getElementById('avisoMudo')) return;
  const e=$('#estado'); if(!e) return;
  const a=el('div','aviso error','No se detecta tu voz. Revisa el micrófono.'); a.id='avisoMudo';
  e.parentNode.insertBefore(a, e.nextSibling);
}
function quitarAvisoMudo(){ const a=document.getElementById('avisoMudo'); if(a) a.remove(); }

// Los errores de ScreenCaptureKit llegan en inglés y en jerga del sistema. El
// más común con diferencia es que falte el permiso, y ahí lo único útil es
// decir qué hacer y llevar al interruptor.
function explicar(texto){
  const t = String(texto || '');
  // El texto viene de error.localizedDescription del sistema, así que en un Mac
  // en español llega traducido y el patrón en inglés no casaba: se quedaba sin
  // el botón "Abrir Ajustes" justo en el caso más probable del público objetivo.
  if(/declined TCC|not authorized|TCCs|permission|permiso|deneg|autoriza|no está autorizado/i.test(t))
    return { texto: 'macOS no está dando permiso para grabar la pantalla y el audio del sistema.',
             permisos: true };
  if(/no space|espacio/i.test(t)) return { texto: 'No queda espacio en el disco.' };
  return { texto: t || 'Revisa el espacio en disco.' };
}

// Avisos de la captura: que la grabación no se esté guardando es lo más grave
// que puede pasar, así que se dice en grande y en el momento.
window.api.onCapturaAviso(({tipo, texto, mb})=>{
  if(tipo==='fallo'){
    const causa = explicar(texto);
    const e=$('#estado');
    if(e){ e.classList.add('error');
           const t=e.querySelector('.txt'); if(t) t.textContent='La grabación NO se está guardando';
           const s=e.querySelector('.sub'); if(s) s.textContent=causa.texto;
           if(causa.permisos && !e.querySelector('.permisos')){
             const b = el('button','btn chico permisos','Abrir Ajustes');
             b.onclick = () => window.api.abrirPermisos();
             e.appendChild(b);
           }
    }
    if(!document.getElementById('avisoFallo') && e){
      const a=el('div','aviso error', causa.permisos
        ? 'Detén la grabación, concede el permiso y vuelve a empezar: ahora mismo no se está guardando nada.'
        : 'Detén la grabación: el audio no se está escribiendo en el disco.');
      a.id='avisoFallo'; e.parentNode.insertBefore(a, e.nextSibling);
    }
  }
  if(tipo==='microfono'){
    const m = document.getElementById('medMic');
    if(m){ const et = m.querySelector('.et'); if(et) et.title = 'Grabando con: ' + texto; }
    const e = $('#estado'); const sub = e && e.querySelector('.sub');
    if(sub) sub.textContent = 'Micrófono: ' + texto;
    return;
  }
  if(tipo==='sin-microfono'){
    const e=$('#estado'); if(!e || document.getElementById('avisoSinMic')) return;
    const a=el('div','aviso error',
      `Este Mac (macOS ${esc(texto)}) no puede grabar el micrófono: hace falta macOS 15. `+
      `Solo se está grabando el audio del sistema.`);
    a.id='avisoSinMic'; a.style.color='var(--rojo)';
    e.parentNode.insertBefore(a, e.nextSibling);
    return;
  }
  if(tipo==='microfono-ausente'){
    const e=$('#estado'); if(!e) return;
    if(document.getElementById('avisoMicro')) return;
    const a=el('div','aviso error','El micrófono que elegiste no está disponible. Se está grabando con el del sistema.');
    a.id='avisoMicro'; a.style.color='var(--gold-texto)';
    e.parentNode.insertBefore(a, e.nextSibling);
    return;
  }
  if(tipo==='disco'){
    if(document.getElementById('avisoDisco')) return;
    const e=$('#estado'); if(!e) return;
    const a=el('div','aviso error',`Queda poco espacio: ${mb} MB. Una hora de reunión ocupa unos 130 MB.`);
    a.id='avisoDisco'; a.style.color='var(--gold-texto)';
    e.parentNode.insertBefore(a, e.nextSibling);
  }
});

// ---------- estado ----------
// El recuadro de grabación (pulso, cronómetro, medidores) no se puede
// borrar por un estado pasajero: Preparar, Exportar o Expediente mientras
// grabas dejaban la grabación en marcha pero sin ninguna señal en pantalla.
// La única que puede quitar el recuadro de una grabación en marcha es
// detenerla (grabando=false): ni un estado pasajero ni el quitarEstado() con
// que terminan Preparar, Historial o el PDF.
const grabacionViva = () => { const e=$('#estado'); return grabando && e && e.classList.contains('grabando') ? e : null; };
function quitarEstadoPasajero(){
  const e=$('#estado'); if(e && e !== grabacionViva()) e.remove();
}
function estado(tipo, txt, sub, op={}){
  if(tipo==='pulso'){ const e=$('#estado'); if(e) e.remove(); quitarEstado(); } else quitarEstadoPasajero();
  if(tipo!=='pulso' && grabacionViva()){
    // hay una grabación viva: el estado pasajero va en su propio recuadro
    const prev=$('#estadoPasajero'); if(prev) prev.remove();
  }
  const icono = tipo==='pulso'?'<div class="pulso"></div>':(tipo==='spin'?'<div class="spin"></div>':'');
  const e = el('div','estado'+(tipo==='error'?' error':''),
    `${icono}<div class="estado-texto"><div class="estado-titulo">${esc(txt)}</div>${sub?`<div class="estado-sub">${esc(sub)}</div>`:''}</div>${tipo==='pulso'?'<div class="crono">00:00</div>':''}`);
  const hayGrabacion = tipo!=='pulso' && !!grabacionViva();
  e.id = hayGrabacion ? 'estadoPasajero' : 'estado';
  if(tipo==='pulso') e.classList.add('grabando');
  e.setAttribute('role','status'); e.setAttribute('aria-live','polite');
  // Barra de avance real: whisper informa su porcentaje y antes se tiraba,
  // así que diez minutos de espera se veían como un mensaje congelado.
  if(op.pct!=null && op.pct>=0){
    const b = el('div','avance', `<div class="avance-pista"><div class="avance-relleno" style="width:${Math.min(100,op.pct)}%"></div></div><span class="avance-pct">${Math.min(100,op.pct)}%</span>`);
    e.querySelector('.estado-texto').appendChild(b);
  }
  if(tipo==='error'){
    // un error no se iba nunca: el de un cliente seguía ahí leyendo otro
    const x = el('button','btn chico','Cerrar'); x.setAttribute('aria-label','Cerrar el aviso');
    x.onclick = () => e.remove(); e.appendChild(x);
  }
  if(op.cancelable){
    const c = el('button','btn chico','Cancelar');
    c.onclick = async () => { c.disabled = true; c.textContent='Cancelando…'; await window.api.cancelarProceso(); };
    e.appendChild(c);
  }
  $('#barraEstado').appendChild(e);
}
function quitarEstado(){
  const viva = grabacionViva();
  for(const id of ['estado','estadoPasajero','avisoMudo','avisoFallo','avisoDisco','avisoMicro','avisoSinMic']){ const a=document.getElementById(id); if(a && a !== viva) a.remove(); } }

// Mensaje breve que se va solo. Puede traer acciones: es lo que convierte
// "ya existe el PDF" en "ya se lo puedo mandar", sin ir a buscarlo al Finder.
function aviso(txt, acciones){
  const previo = document.getElementById('avisoBreve'); if(previo) previo.remove();
  const a = el('div','aviso-breve'); a.id='avisoBreve';
  a.appendChild(el('span','texto', esc(txt)));
  (acciones||[]).forEach(ac=>{
    const b = el('button','accion', esc(ac.texto));
    b.onclick = () => { a.remove(); ac.fn(); };
    a.appendChild(b);
  });
  document.body.appendChild(a);
  const espera = acciones && acciones.length ? 9000 : 2600;
  setTimeout(()=>{ if(!document.body.contains(a)) return;
    a.classList.add('fuera'); setTimeout(()=>a.remove(), 400); }, espera);
}

// Nombre con el que un PDF se puede reconocer en el Escritorio o en un correo.
function nombrePdf(r){
  const m = r.id.match(/(\d{4})-(\d{2})-(\d{2})/);
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fecha = m ? `${+m[3]} de ${meses[+m[2]-1]} de ${m[1]}` : r.id;
  return `Minuta - ${actual.nombre} - ${fecha}.pdf`.replace(/[/:]/g,'-');
}

// Guardar una copia donde el usuario quiera, y compartir por la hoja de macOS.
async function guardarPdfComo(r){
  const res = await window.api.guardarComo({origen: r.carpeta+'/minuta.pdf', nombre: nombrePdf(r)});
  if(res && res.ok === false) return estado('error','No se pudo guardar el PDF', res.error);
  if(res && res.cancelado) return;
  aviso('PDF guardado.', [{texto:'Mostrar', fn:()=>window.api.revelar(res.ruta)}]);
}
async function compartirPdf(r){
  const res = await window.api.compartir({archivo: r.carpeta+'/minuta.pdf'});
  if(res && res.ok === false) estado('error','No se pudo compartir', res.error);
}

window.api.onProgreso(({etapa, detalle, pct})=>{
  const textos = { mezclando:'Uniendo las pistas de audio', transcribiendo:'Transcribiendo la reunión',
                   atribuyendo:'Separando quién dijo cada cosa', redactando:'Redactando la minuta', guardando:'Guardando en el expediente', listo:'', error:'Error' };
  if(etapa==='listo') return quitarEstado();
  if(etapa==='cancelado') return quitarEstado();
  if(etapa==='error') return estado('error','No se pudo procesar', detalle);
  // decir de quién es: si cambias de cliente mientras se procesa, antes el aviso
  // desaparecía y era la única señal de que algo seguía corriendo
  const de = procesandoPara ? ` · ${procesandoPara}` : '';
  estado('spin', (textos[etapa]||etapa) + de, detalle, {pct, cancelable:true});
});

let tBusca=null;
$('#q').oninput = () => {
  clearTimeout(tBusca);
  const t = $('#q').value.trim();
  if(t.length < 3){
    hayResultados = false; RESULTADOS = null;
    pintarClientes();   // después de vaciar: antes quedaban los resultados viejos sin cliente activo
    // Al borrar la búsqueda el encabezado se quedaba en 'Resultados de "..."'
    if(actual){ $('#titulo').textContent = actual.nombre; cargarReuniones(); }
    else { $('#titulo').textContent = 'Elige un cliente'; $('#subtitulo').textContent = 'Sus reuniones aparecen aquí'; }
    return;
  }
  pintarClientes();
  tBusca = setTimeout(async ()=>{
    const res = await window.api.buscar(t);
    if($('#q').value.trim() !== t) return;   // ya se escribió otra cosa
    hayResultados = res.total > 0; RESULTADOS = res;
    // el término va en el subtítulo: en el título se truncaba a la mitad
    $('#titulo').textContent = 'Resultados';
    // "40 coincidencias" era el tope, no el total
    $('#subtitulo').textContent = `«${t}» · ` + (!res.total ? 'sin coincidencias'
      : `${res.total} reuni${res.total===1?'ón':'ones'}` + (res.total > res.resultados.length ? ` · se muestran las ${res.resultados.length} más recientes` : ''));
    pintarClientes();
  }, 260);
};
// ↑↓ recorren la barra lateral y Enter abre. Llegar a un cliente desde el
// buscador con Tab eran ~28 pulsaciones.
const itemsLaterales = () => [...document.querySelectorAll('#clientes button:not([disabled])')];
$('#q').onkeydown = (e) => {
  if(e.key === 'ArrowDown'){ const f = itemsLaterales()[0]; if(f){ e.preventDefault(); f.focus(); } }
  if(e.key === 'Enter'){
    // con resultados abre el primero; filtrando por nombre, si quedó uno solo, lo abre
    const f = itemsLaterales();
    if(f.length && (RESULTADOS || f.length === 1)){ e.preventDefault(); f[0].click(); }
  }
  if(e.key === 'Escape' && $('#q').value){ $('#q').value = ''; $('#q').dispatchEvent(new Event('input')); }
};
$('#clientes').onkeydown = (e) => {
  if(e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const f = itemsLaterales(); const i = f.indexOf(document.activeElement); if(i === -1) return;
  e.preventDefault();
  if(e.key === 'ArrowUp'){ if(i === 0) $('#q').focus(); else f[i-1].focus(); }
  else if(i < f.length - 1) f[i+1].focus();
};

// El menú de la aplicación dispara las mismas acciones que los botones.
window.api.onMenu(({accion})=>{
  const pulsar = (id) => { const b=$(id); if(b && !b.disabled) b.click(); };
  if(accion==='ajustes')        return window.abrirAjustes && window.abrirAjustes();
  if(accion==='nuevo-cliente')  return crearClienteNuevo();
  if(accion==='buscar')         { const q=$('#q'); q.focus(); q.select(); return; }
  if(accion==='grabar')         return pulsar('#btnGrabar');
  if(accion==='importar')       return pulsar('#btnImportar');
  if(accion==='expediente')     return pulsar('#btnExpediente');
  if(accion==='preparar')       return pulsar('#btnPreparar');
  if(accion==='pdf')            { if(reunionActual && reunionActual.minuta && !editando) exportarPdf(); return; }
  if(accion==='copiar'){
    if(!reunionActual || !reunionActual.minuta) return;
    window.api.copiarMinuta(reunionActual.minuta).then(()=>aviso('Minuta copiada, lista para pegar. Sin las notas internas.'));
    return;
  }
});

// el atajo global (Cmd+Shift+R) dispara el mismo botón
window.api.onAtajo(({accion})=>{
  const b = $('#btnGrabar');
  if(accion==='grabar' && !grabando && !b.disabled) b.click();
  if(accion==='detener' && grabando) b.click();
});

// Cerrar la ventana con una minuta a medio editar tampoco debe perderla.
// Un `invoke` lanzado aquí no llega a completarse: el renderer ya se está
// desmontando. En Electron, en cambio, devolver un valor CANCELA el cierre,
// así que se cancela, se pregunta, y se cierra después con la respuesta.
window.onbeforeunload = (e) => {
  const pendiente = editando && borrador != null && reunionActual && borrador !== reunionActual.minuta;
  if (!pendiente) return undefined;
  e.returnValue = false;
  confirmar({ titulo: 'Tienes cambios sin guardar',
    texto: 'Escribiste correcciones en esta minuta y no las has guardado.',
    aceptar: 'Guardar y cerrar' }).then(async (guardarlos) => {
      // Cancelar, Escape y clic fuera llegaban igual a window.close() y
      // tiraban la edición. Era el único diálogo cuyo Cancelar no cancelaba.
      if (!guardarlos) return;
      await window.api.guardarMinuta({ carpeta: reunionActual.carpeta, texto: borrador });
      editando = false; borrador = null;
      window.close();
    });
  return false;
};

window.api.onAvisoArranque(({texto}) => { cargarClientes(); aviso(texto); });
// Mensajes breves que no vienen de una acción del renderer (p. ej. el menú
// Ayuda › Copiar diagnóstico, que corre en el proceso principal).
window.api.onAvisoBreve(({texto}) => aviso(texto));
window.recargarClientes = cargarClientes;
cargarClientes();
