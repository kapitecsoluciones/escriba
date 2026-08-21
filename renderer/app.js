let CLIENTES = [], EXPEDIENTES = [], REUNIONES = [], RESULTADOS = null;
let actual = null, reunionActual = null, hayResultados = false;
let grabando = false, t0 = 0, crono = null, editando = false, vista = 'minuta';
let borrador = null;      // texto en edición sin guardar; null = no hay nada pendiente
let procesando = false;

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
// El conversor de Markdown es el mismo de lib/md.js, cargado como <script>.
// Aquí había una copia con el mismo bucle infinito, que colgaba la ventana.
const md2html = t => window.MD.convertir(t || '');

// ---------- confirmación ----------
// Todo lo que destruye trabajo pasa por aquí antes de ejecutarse.
function confirmar({ titulo, texto, aceptar = 'Continuar', peligro = false }) {
  return new Promise(res => {
    const capa = el('div','confirmar');
    capa.innerHTML = `<div class="caja" role="alertdialog" aria-modal="true">
      <h3>${esc(titulo)}</h3><p>${esc(texto)}</p>
      <div class="fila"><button class="btn" data-no>Cancelar</button>
      <button class="btn ${peligro?'peligro':'primario'}" data-si>${esc(aceptar)}</button></div></div>`;
    let cerrado = false;
    const cerrar = (v) => { if (cerrado) return; cerrado = true;
      document.removeEventListener('keydown', tecla); capa.remove(); res(v); };
    const tecla = (e) => { if (e.key === 'Escape') cerrar(false); if (e.key === 'Enter') cerrar(true); };
    capa.querySelector('[data-no]').onclick = () => cerrar(false);
    capa.querySelector('[data-si]').onclick = () => cerrar(true);
    capa.onclick = (e) => { if (e.target === capa) cerrar(false); };
    document.addEventListener('keydown', tecla);
    document.body.appendChild(capa);
    capa.querySelector('[data-si]').focus();
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
    const capa = el('div','confirmar');
    capa.innerHTML = `<div class="caja nuevo" role="dialog" aria-modal="true">
      <h3>${esc(titulo)}</h3>
      <label class="et">${soloExpediente ? 'Buscar expediente' : 'Nombre'}</label>
      <input type="text" id="nuevoNombre" autocomplete="off"
        placeholder="${soloExpediente ? 'Escribe para filtrar' : 'Como quieras verlo en la lista'}">
      <div class="et2">${soloExpediente ? 'Elige uno' : 'Enlazar un expediente <span>opcional</span>'}</div>
      <div class="ayuda2">Escriba lee el expediente antes de redactar: de ahí sale lo que quedó pendiente de otras veces y lo que hoy no se dijo.</div>
      <div class="exps" id="listaExps"></div>
      <div class="fila"><button class="btn" data-no>Cancelar</button>
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
        lista.appendChild(el('div','ayuda2','No hay carpeta de expedientes configurada. Puedes ponerla luego en Ajustes.'));
        return;
      }
      if(!hay.length){ lista.appendChild(el('div','ayuda2',
        soloExpediente ? 'Ningún expediente coincide.' : 'Ningún expediente coincide. Se creará sin expediente.')); return; }
      hay.forEach(e => {
        const b = el('button','exp'+(elegido===e.archivo?' sel':''), esc(e.nombre));
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
      document.removeEventListener('keydown', tecla); capa.remove(); res(v); };
    const aceptar = () => {
      if(soloExpediente){ if(elegido) cerrar({ nombre: nombrePrevio, expediente: elegido }); return; }
      const nombre = campo.value.trim();
      if(!nombre){ campo.focus(); campo.classList.add('mal'); return; }
      cerrar({ nombre, expediente: elegido });
    };
    const tecla = (e) => { if(e.key==='Escape') cerrar(null);
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
    if(!RESULTADOS.length){
      cont.appendChild(el('div','vacio-lateral',
        'Nada con esas palabras.<br>Prueba con menos palabras o con un nombre propio.'));
      return;
    }
    const t = $('#q').value.trim();
    RESULTADOS.forEach(r=>{
      const limpio = r.fragmento.replace(/\*\*/g,'').replace(/^#+\s*/gm,'').replace(/^-\s+/,'');
      const frag = esc(limpio).replace(new RegExp('('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>');
      const b = el('button','res', `<div class="c">${esc(r.cliente)} · ${esc(fechaBonita(r.id))}</div><div class="frag">${frag}</div>`);
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
    const b = el('button','cli', `<span class="punto"></span><span class="n">Crear "${esc($('#q').value.trim())}"</span>`);
    b.style.color = 'var(--gold-texto)'; b.style.fontWeight = '600';
    b.onclick = () => crearClienteNuevo($('#q').value.trim());
    cont.appendChild(b); return;
  }
  // Sin clientes y sin búsqueda, el panel quedaba en blanco: nadie adivina que
  // se crea un cliente escribiendo en el buscador.
  if(!filtrados.length && !q){
    const v = el('div','vacio-lateral',
      'Todavía no hay clientes.<br>Pulsa <b>+ Nuevo cliente</b> para empezar.');
    cont.appendChild(v); return;
  }
  filtrados.forEach(c=>{
    const activo = actual && actual.slug===c.slug;
    const b = el('button','cli'+(activo?' activo':''),
      `<span class="punto"></span><span class="n">${esc(c.nombre)}</span>`);
    b.onclick = async () => { if(await permisoParaSalir()) elegirCliente(c); };
    cont.appendChild(b);
    if(!activo) return;
    const caja = el('div','reus');
    if(!REUNIONES.length){
      caja.appendChild(el('div','reu-vacio','Aún no hay reuniones'));
    }
    REUNIONES.forEach(r=>{
      const rb = el('button','reu'+(reunionActual&&reunionActual.id===r.id?' activa':''),
        `<div class="f">${esc(fechaBonita(r.id))}</div><div class="e">${estadoReunion(r)}</div>`);
      rb.onclick = async ()=>{ if(await permisoParaSalir()) await verReunion(r); };
      caja.appendChild(rb);
    });
    cont.appendChild(caja);
  });
}
async function elegirCliente(c){
  actual = c; reunionActual = null; editando = false; borrador = null;
  window.api.clienteActivo({slug:c.slug, nombre:c.nombre});
  $('#titulo').textContent = c.nombre;
  if(!procesando && !grabando){
    $('#btnGrabar').disabled = false; $('#btnImportar').disabled = false;
    $('#btnExpediente').disabled = false;
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
function fechaBonita(id){
  const m = id.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})/);
  if(!m) return id;
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${+m[3]} de ${meses[+m[2]-1]} · ${m[4]}:${m[5]}`;
}

// ---------- detalle ----------
function pintarDetalleVacio(){
  $('#detalle').innerHTML = `<div class="vacio"><strong>${esc(actual?actual.nombre:'')}</strong>
    Pulsa <em>Grabar reunión</em> cuando empiece la junta,<br>o importa un audio que ya tengas.
    <div class="atajo">También puedes empezar y detener con <kbd>⌘</kbd><kbd>⇧</kbd><kbd>R</kbd> desde cualquier app.</div></div>`;
}
async function verReunion(r){
  reunionActual = r; editando = false; borrador = null; vista = 'minuta'; compromisosAbiertos = false;
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
// página. Aquí se pueden marcar y copiar sueltos, sin tocar minuta.md.
let compromisosAbiertos = false;
const TOPE_COMPROMISOS = 4;
function bloqueCompromisos(r){
  const todos = (r.extras && r.extras.lista) || [];
  if(!todos.length) return null;
  const hechos = todos.filter(c=>c.hecho).length;
  // pendientes primero: lo hecho ya no hace falta tenerlo delante
  const orden = [...todos.filter(c=>!c.hecho), ...todos.filter(c=>c.hecho)];
  // Una reunión larga puede dejar quince o veinte compromisos, y todos juntos
  // empujan el documento fuera de la pantalla.
  const lista = compromisosAbiertos ? orden : orden.slice(0, TOPE_COMPROMISOS);
  const caja = el('div','tarjeta compromisos');
  caja.appendChild(el('div','et', `Compromisos${hechos?` · ${hechos} de ${todos.length} hechos`:''}`));
  lista.forEach(c=>{
    const fila = el('div','comp'+(c.hecho?' hecho':''));
    const chk = el('button','marca', c.hecho?'✓':'');
    chk.title = c.hecho ? 'Marcar como pendiente' : 'Marcar como hecho';
    chk.onclick = async () => {
      const nuevo = !c.hecho;
      const res = await window.api.marcarCompromiso({carpeta:r.carpeta, texto:c.texto, hecho:nuevo});
      if(res && res.ok === false) return estado('error','No se pudo guardar', res.error);
      c.hecho = nuevo; pintarDetalle();
    };
    const cuerpo = el('div','txt');
    cuerpo.appendChild(el('div','t', esc(c.texto)));
    const meta = [c.quien, c.cuando].filter(Boolean).join(' · ');
    if(meta) cuerpo.appendChild(el('div','m', esc(meta)));
    const cop = el('button','copiar','copiar');
    cop.onclick = async () => {
      await window.api.copiarTexto([c.texto, meta].filter(Boolean).join(' — '));
      aviso('Compromiso copiado.');
    };
    fila.appendChild(chk); fila.appendChild(cuerpo); fila.appendChild(cop);
    caja.appendChild(fila);
  });
  if(orden.length > TOPE_COMPROMISOS){
    const b = el('button','vertodo', compromisosAbiertos
      ? 'Ver menos'
      : `Ver los ${orden.length} compromisos`);
    b.onclick = () => { compromisosAbiertos = !compromisosAbiertos; pintarDetalle(); };
    caja.appendChild(b);
  }
  return caja;
}

// Lo que NO se dijo es el diferenciador y estaba al final del documento.
function bloqueHallazgos(r){
  const h = (r.extras && r.extras.hallazgos) || [];
  if(!h.length) return null;
  const caja = el('div','tarjeta hallazgos');
  caja.appendChild(el('div','et','Lo que no se dijo · no se envía al cliente'));
  h.forEach(x => caja.appendChild(el('div','h', esc(x))));
  const ver = el('button','vertodo','Ver todas las notas internas');
  ver.onclick = () => { const n = document.querySelector('#detalle .notas'); if(n) n.scrollIntoView({behavior:'smooth', block:'start'}); };
  caja.appendChild(ver);
  return caja;
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
  const b = el('button','btn','Más ▾'); b.setAttribute('aria-haspopup','true');
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
    if(ok) procesar(r.carpeta);
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
  const barra = el('div','acciones'); barra.style.cssText='margin-bottom:14px;gap:8px';
  const add=(txt,cls,fn)=>{const b=el('button','btn'+(cls?' '+cls:''),txt);b.onclick=fn;barra.appendChild(b);return b};

  // En edición solo hay dos salidas. Antes seguían visibles "Exportar PDF" y
  // "Volver a redactar", que trabajaban sobre la versión vieja del texto.
  if(editando){
    add('Guardar cambios','primario', guardarEdicion);
    add('Descartar','', async ()=>{
      if(!await permisoParaSalir()) return;
      editando = false; borrador = null; pintarDetalle();
    });
    d.appendChild(barra);
    const ta = el('textarea','editor'); ta.value = borrador!=null?borrador:r.minuta; ta.id='editor';
    ta.oninput = ()=>{ borrador = ta.value; };
    // ⌘S guarda, Escape sale preguntando
    ta.onkeydown = (e)=>{ if((e.metaKey||e.ctrlKey) && e.key==='s'){ e.preventDefault(); guardarEdicion(); } };
    d.appendChild(ta);
    setTimeout(()=>ta.focus(),0);
    return;
  }

  if(!r.minuta && r.carpeta){
    add('Procesar esta reunión','primario', ()=>procesar(r.carpeta));
  }
  if(r.minuta){
    add('Editar','', ()=>{ editando=true; borrador=r.minuta; vista='minuta'; pintarDetalle(); });
    if(r.dialogo) add(vista==='dialogo'?'Ver la minuta':'Ver quién dijo qué','', ()=>{
      vista = vista==='dialogo' ? 'minuta' : 'dialogo'; pintarDetalle(); });
    add('Exportar PDF','primario', exportarPdf);
  }
  barra.appendChild(menuMas(r));
  d.appendChild(barra);

  if(!r.minuta){
    d.appendChild(el('div','vacio', r.transcripcion
      ? 'Ya está transcrita. Pulsa <em>Procesar</em> para redactar la minuta.'
      : 'Audio guardado. Pulsa <em>Procesar</em> para transcribir y redactar la minuta.'));
    return;
  }
  if(vista==='dialogo' && r.dialogo){
    if(r.tieneAudio) d.appendChild(reproductor(r));
    const cont = el('div','minuta dialogo');
    cont.innerHTML = '<h2>Quién dijo qué</h2>' + r.dialogo.split('\n').filter(Boolean).map(l=>{
      const m = l.match(/^\[([\d:]+)\]\s+([^:]+):\s*([\s\S]*)$/);
      if(!m) return `<p>${esc(l)}</p>`;
      // la marca de tiempo era decorativa; ahora salta a ese momento del audio
      return `<p><button class="salto" data-t="${esc(m[1])}" title="Oír este momento">${esc(m[1])}</button>`+
             `<strong>${esc(m[2])}:</strong> ${esc(m[3])}</p>`;
    }).join('');
    cont.querySelectorAll('.salto').forEach(b => { b.onclick = () => {
      const a = document.getElementById('audioReunion'); if(!a) return;
      const p = b.dataset.t.split(':').map(Number);
      a.currentTime = p.length===3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1];
      a.play().catch(()=>{});
    }; });
    d.appendChild(cont); return;
  }
  const partes = r.minuta.split(/##\s*Notas internas[^\n]*/i);
  const comp = bloqueCompromisos(r); if(comp) d.appendChild(comp);
  const hall = bloqueHallazgos(r);   if(hall) d.appendChild(hall);
  if(r.tieneAudio) d.appendChild(reproductor(r));
  d.appendChild(el('div','minuta', md2html(partes[0])));
  if(partes[1]){
    const n = el('div','notas', `<div class="et">Notas internas · no se envían al cliente</div>${md2html(partes[1])}`);
    d.appendChild(n);
  }
}
async function guardarEdicion(){
  const ta = $('#editor'); if(!ta) return;
  const res = await window.api.guardarMinuta({carpeta:reunionActual.carpeta, texto:ta.value});
  if(res && res.ok === false) return estado('error','No se pudo guardar la minuta', res.error);
  reunionActual.minuta = ta.value;
  delete reunionActual.extras;          // el texto cambió: los compromisos también pueden
  await verReunion(reunionActual);
  aviso('Cambios guardados');
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

// ---------- grabación ----------
$('#btnGrabar').onclick = async () => {
  if(!grabando){
    const res = await window.api.grabarIniciar(actual.slug);
    if(!res.ok){
      const causa = explicar(res.error);
      estado('error','No se pudo iniciar la grabación', causa.texto);
      if(causa.permisos){
        const e=$('#estado');
        if(e){ const b=el('button','btn permisos','Abrir Ajustes');
               b.onclick=()=>window.api.abrirPermisos(); e.appendChild(b); }
      }
      return;
    }
    grabando = true; t0 = Date.now();
    $('#btnGrabar').textContent = 'Detener y procesar';
    $('#btnGrabar').classList.add('grabando');
    $('#btnImportar').disabled = true;
    estado('pulso','Grabando','Tu micrófono y el audio del Mac');
    const e=$('#estado');
    if(e){ const m=el('div','medidores',
      `<div class="med" id="medMic"><span class="et">Tu voz</span><div class="barra"><div class="relleno"></div></div></div>
       <div class="med" id="medSis"><span class="et">Llamada</span><div class="barra"><div class="relleno"></div></div></div>`);
      e.insertBefore(m, e.querySelector('.crono')); }
    silencioMic = 0;
    crono = setInterval(()=>{ const s=Math.floor((Date.now()-t0)/1000);
      const c=document.querySelector('.crono'); if(c) c.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; },500);
  } else {
    clearInterval(crono); grabando=false;
    $('#btnGrabar').textContent='Grabar reunión';
    $('#btnGrabar').classList.remove('grabando');
    $('#btnGrabar').disabled = true;
    const res = await window.api.grabarDetener();
    if(res.ok) await procesar(res.carpeta);
    else { $('#btnGrabar').disabled = false; $('#btnImportar').disabled = false; }
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
  for(const id of ['#btnGrabar','#btnImportar','#btnExpediente']){
    const b = $(id); if(b) b.disabled = v || !actual;
  }
}

let procesandoPara = null;
async function procesar(carpeta){
  procesandoPara = actual ? actual.nombre : null;
  ocupado(true);
  const res = await window.api.procesar({carpeta, slug:actual.slug, nombre:actual.nombre});
  ocupado(false); procesandoPara = null;
  if(res.cancelado){ quitarEstado(); aviso('Procesamiento cancelado'); await cargarReuniones(); return; }
  if(!res.ok){ estado('error','No se pudo procesar', res.error); return; }
  quitarEstado();
  const rs = await cargarReuniones();
  const nueva = (rs||[]).find(r=>r.carpeta===carpeta) || (rs||[])[0] || null;
  // por verReunion, no a mano: es lo que carga los compromisos y los hallazgos
  if(nueva) await verReunion(nueva); else { reunionActual = null; pintarDetalle(); }
  // Si la reunión no quedó anotada en el expediente, el usuario no se enteraba.
  if(res.dossier && res.dossier.ok === false && res.dossier.motivo === 'sin dossier'){
    aviso('Minuta lista. Este cliente no tiene expediente configurado.');
  }
}

// ---------- medidores ----------
let silencioMic = 0;
window.api.onNiveles(({sistema, microfono})=>{
  const pinta=(id,v)=>{ const n=document.querySelector('#'+id+' .relleno'); if(!n) return;
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
  const a=el('div','aviso-mudo','No se detecta tu voz. Revisa el micrófono.'); a.id='avisoMudo';
  e.parentNode.insertBefore(a, e.nextSibling);
}
function quitarAvisoMudo(){ const a=document.getElementById('avisoMudo'); if(a) a.remove(); }

// Los errores de ScreenCaptureKit llegan en inglés y en jerga del sistema. El
// más común con diferencia es que falte el permiso, y ahí lo único útil es
// decir qué hacer y llevar al interruptor.
function explicar(texto){
  const t = String(texto || '');
  if(/declined TCC|not authorized|TCCs|permission/i.test(t))
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
             const b = el('button','btn permisos','Abrir Ajustes');
             b.onclick = () => window.api.abrirPermisos();
             e.appendChild(b);
           }
    }
    if(!document.getElementById('avisoFallo') && e){
      const a=el('div','aviso-mudo', causa.permisos
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
  if(tipo==='microfono-ausente'){
    const e=$('#estado'); if(!e) return;
    if(document.getElementById('avisoMicro')) return;
    const a=el('div','aviso-mudo','El micrófono que elegiste no está disponible. Se está grabando con el del sistema.');
    a.id='avisoMicro'; a.style.color='var(--gold-texto)';
    e.parentNode.insertBefore(a, e.nextSibling);
    return;
  }
  if(tipo==='disco'){
    if(document.getElementById('avisoDisco')) return;
    const e=$('#estado'); if(!e) return;
    const a=el('div','aviso-mudo',`Queda poco espacio: ${mb} MB. Una hora de reunión ocupa unos 130 MB.`);
    a.id='avisoDisco'; a.style.color='var(--gold-texto)';
    e.parentNode.insertBefore(a, e.nextSibling);
  }
});

// ---------- estado ----------
function estado(tipo, txt, sub, op={}){
  quitarEstado();
  const icono = tipo==='pulso'?'<div class="pulso"></div>':(tipo==='spin'?'<div class="spin"></div>':'');
  const e = el('div','estado'+(tipo==='error'?' error':''),
    `${icono}<div class="texto"><div class="txt">${esc(txt)}</div>${sub?`<div class="sub">${esc(sub)}</div>`:''}</div>${tipo==='pulso'?'<div class="crono">00:00</div>':''}`);
  e.id='estado'; e.setAttribute('role','status'); e.setAttribute('aria-live','polite');
  // Barra de avance real: whisper informa su porcentaje y antes se tiraba,
  // así que diez minutos de espera se veían como un mensaje congelado.
  if(op.pct!=null && op.pct>=0){
    const b = el('div','avance', `<div class="pista"><div class="relleno" style="width:${Math.min(100,op.pct)}%"></div></div><span class="pct">${Math.min(100,op.pct)}%</span>`);
    e.querySelector('.texto').appendChild(b);
  }
  if(op.cancelable){
    const c = el('button','btn cancelar','Cancelar');
    c.onclick = async () => { c.disabled = true; c.textContent='Cancelando…'; await window.api.cancelarProceso(); };
    e.appendChild(c);
  }
  $('#barraEstado').appendChild(e);
}
function quitarEstado(){ const e=$('#estado'); if(e) e.remove();
  for(const id of ['avisoMudo','avisoFallo','avisoDisco','avisoMicro']){ const a=document.getElementById(id); if(a) a.remove(); } }

// Mensaje breve que se va solo. Puede traer acciones: es lo que convierte
// "ya existe el PDF" en "ya se lo puedo mandar", sin ir a buscarlo al Finder.
function aviso(txt, acciones){
  const previo = document.getElementById('avisoBreve'); if(previo) previo.remove();
  const a = el('div','aviso-breve'); a.id='avisoBreve';
  a.appendChild(el('span','t', esc(txt)));
  (acciones||[]).forEach(ac=>{
    const b = el('button','ac', esc(ac.texto));
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
  pintarClientes();
  clearTimeout(tBusca);
  const t = $('#q').value.trim();
  if(t.length < 3){
    hayResultados = false; RESULTADOS = null;
    // Al borrar la búsqueda el encabezado se quedaba en 'Resultados de "..."'
    if(actual){ $('#titulo').textContent = actual.nombre; cargarReuniones(); }
    else { $('#titulo').textContent = 'Elige un cliente'; $('#subtitulo').textContent = 'Sus reuniones aparecen aquí'; }
    return;
  }
  tBusca = setTimeout(async ()=>{
    const res = await window.api.buscar(t);
    hayResultados = res.length > 0; RESULTADOS = res;
    $('#titulo').textContent = `Resultados de "${t}"`;
    $('#subtitulo').textContent = res.length ? `${res.length} coincidencia${res.length===1?'':'s'}` : 'Sin coincidencias';
    pintarClientes();
  }, 260);
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
      if (guardarlos) await window.api.guardarMinuta({ carpeta: reunionActual.carpeta, texto: borrador });
      editando = false; borrador = null;
      window.close();
    });
  return false;
};

window.recargarClientes = cargarClientes;
cargarClientes();
