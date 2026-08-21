let CLIENTES = [], actual = null, reunionActual = null, hayResultados = false;
let grabando = false, t0 = 0, crono = null, editando = false, vista = 'minuta';

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; };
const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ---------- markdown mínimo para la vista ----------
function md2html(md){
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  const L = (md||'').replace(/\r/g,'').split('\n'); const out=[]; let i=0;
  while(i<L.length){
    const l=L[i];
    if(!l.trim()){i++;continue}
    if(/^---+$/.test(l.trim())){out.push('<hr>');i++;continue}
    let m;
    if((m=l.match(/^(#{1,4})\s+(.*)$/))){out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`);i++;continue}
    if(/^\|/.test(l) && /^\|[\s:|-]+\|?$/.test((L[i+1]||'').trim())){
      const fila=s=>s.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const enc=fila(l); i+=2; const cu=[];
      while(i<L.length&&/^\|/.test(L[i])){cu.push(fila(L[i]));i++}
      out.push('<table><thead><tr>'+enc.map(c=>`<th>${inline(c)}</th>`).join('')+'</tr></thead><tbody>'+
        cu.map(r=>'<tr>'+r.map(c=>`<td>${inline(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table>');
      continue;
    }
    if(/^\s*[-*]\s+/.test(l)){const it=[];while(i<L.length&&/^\s*[-*]\s+/.test(L[i])){it.push(L[i].replace(/^\s*[-*]\s+/,''));i++}
      out.push('<ul>'+it.map(t=>`<li>${inline(t)}</li>`).join('')+'</ul>');continue}
    if(/^\s*\d+\.\s+/.test(l)){const it=[];while(i<L.length&&/^\s*\d+\.\s+/.test(L[i])){it.push(L[i].replace(/^\s*\d+\.\s+/,''));i++}
      out.push('<ol>'+it.map(t=>`<li>${inline(t)}</li>`).join('')+'</ol>');continue}
    const p=[];while(i<L.length&&L[i].trim()&&!/^(#|\||\s*[-*]\s|\s*\d+\.\s|---)/.test(L[i])){p.push(L[i]);i++}
    const txt=p.join(' ');
    const cls=/@|\+\d|https?:/.test(txt)&&txt.length<220?' class="contact"':'';
    out.push(`<p${cls}>${inline(txt)}</p>`);
  }
  return out.join('\n');
}

// ---------- clientes ----------
async function cargarClientes(){
  CLIENTES = await window.api.clientes();
  pintarClientes();
}
function pintarClientes(){
  const q = ($('#q').value||'').toLowerCase().trim();
  const cont = $('#clientes'); cont.innerHTML='';
  const filtrados = CLIENTES.filter(c => !q || c.nombre.toLowerCase().includes(q));
  if(q && !filtrados.length && !hayResultados){
    const b = el('button','cli', `<span class="punto"></span><span class="n">Crear "${esc($('#q').value.trim())}"</span>`);
    b.style.color = 'var(--gold)'; b.style.fontWeight = '600';
    b.onclick = async () => {
      const nuevo = await window.api.crearCliente($('#q').value.trim());
      $('#q').value=''; CLIENTES = await window.api.clientes();
      const c = CLIENTES.find(x=>x.slug===nuevo.slug) || nuevo;
      elegirCliente(c);
    };
    cont.appendChild(b); return;
  }
  filtrados.forEach(c=>{
    const b = el('button','cli'+(actual&&actual.slug===c.slug?' activo':''),
      `<span class="punto"></span><span class="n">${esc(c.nombre)}</span>`);
    b.onclick = () => elegirCliente(c);
    cont.appendChild(b);
  });
}
async function elegirCliente(c){
  actual = c; reunionActual = null; editando = false;
  window.api.clienteActivo({slug:c.slug, nombre:c.nombre});
  $('#titulo').textContent = c.nombre;
  $('#btnGrabar').disabled = false; $('#btnImportar').disabled = false;
  $('#btnExpediente').disabled = false;
  pintarClientes(); await cargarReuniones();
}
async function cargarReuniones(){
  const rs = await window.api.reuniones(actual.slug);
  $('#subtitulo').textContent = rs.length
    ? `${rs.length} ${rs.length===1?'reunión registrada':'reuniones registradas'}`
    : 'Sin reuniones todavía';
  const cont = $('#reuniones'); cont.innerHTML='';
  if(!rs.length){ cont.appendChild(el('div','vacio','Aún no hay reuniones<br>de este cliente.')); }
  rs.forEach(r=>{
    const b = el('button','reu'+(reunionActual&&reunionActual.id===r.id?' activa':''),
      `<div class="f">${esc(fechaBonita(r.id))}</div><div class="e">${r.minuta?'Minuta lista':(r.transcripcion?'Transcrita':'Solo audio')}${r.tienePdf?' · PDF':''}</div>`);
    b.onclick=()=>verReunion(r); cont.appendChild(b);
  });
  if(!reunionActual) pintarDetalleVacio();
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
    Pulsa <em>Grabar reunión</em> cuando empiece la junta,<br>o importa un audio que ya tengas.</div>`;
}
function verReunion(r){
  reunionActual = r; editando = false; vista = 'minuta'; cargarReuniones(); pintarDetalle();
}
function pintarDetalle(){
  const d = $('#detalle'); d.innerHTML='';
  const r = reunionActual; if(!r) return pintarDetalleVacio();
  const barra = el('div','acciones'); barra.style.cssText='margin-bottom:14px;gap:8px';
  const add=(txt,cls,fn)=>{const b=el('button','btn'+(cls?' '+cls:''),txt);b.onclick=fn;barra.appendChild(b);return b};

  if(!r.minuta && r.carpeta){
    add('Procesar esta reunión','primario', ()=>procesar(r.carpeta));
  }
  if(r.minuta){
    add(editando?'Ver':'Editar','', ()=>{ if(editando){ guardarEdicion(); } else { editando=true; vista='minuta'; pintarDetalle(); }});
    add('Exportar PDF','primario', exportarPdf);
    if(r.tienePdf) add('Abrir PDF','', ()=>window.api.abrir(r.carpeta+'/minuta.pdf'));
    if(r.dialogo) add(vista==='dialogo'?'Ver minuta':'Ver diálogo','', ()=>{
      vista = vista==='dialogo' ? 'minuta' : 'dialogo'; editando=false; pintarDetalle(); });
  }
  add('Abrir carpeta','', ()=>window.api.abrir(r.carpeta));
  d.appendChild(barra);

  if(!r.minuta){
    d.appendChild(el('div','vacio', r.transcripcion
      ? 'Ya está transcrita. Pulsa <em>Procesar</em> para redactar la minuta.'
      : 'Audio guardado. Pulsa <em>Procesar</em> para transcribir y redactar la minuta.'));
    return;
  }
  if(vista==='dialogo' && r.dialogo){
    const cont = el('div','minuta');
    cont.innerHTML = '<h2>Quién dijo qué</h2>' + r.dialogo.split('\n').filter(Boolean).map(l=>{
      const m = l.match(/^\[([\d:]+)\]\s+([^:]+):\s*([\s\S]*)$/);
      if(!m) return `<p>${esc(l)}</p>`;
      return `<p style="margin-bottom:11px"><span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--muted);margin-right:8px">${esc(m[1])}</span>`+
             `<strong style="color:var(--gold)">${esc(m[2])}:</strong> ${esc(m[3])}</p>`;
    }).join('');
    d.appendChild(cont); return;
  }
  const partes = r.minuta.split(/##\s*Notas internas[^\n]*/i);
  if(editando){
    const ta = el('textarea','editor'); ta.value = r.minuta; ta.id='editor';
    d.appendChild(ta); return;
  }
  d.appendChild(el('div','minuta', md2html(partes[0])));
  if(partes[1]){
    const n = el('div','notas', `<div class="et">Notas internas · no se envían al cliente</div>${md2html(partes[1])}`);
    d.appendChild(n);
  }
}
async function guardarEdicion(){
  const ta = $('#editor'); if(!ta) return;
  await window.api.guardarMinuta({carpeta:reunionActual.carpeta, texto:ta.value});
  reunionActual.minuta = ta.value; editando=false; pintarDetalle();
}
async function exportarPdf(){
  const r = reunionActual;
  estado('spin','Generando el PDF…','');
  const res = await window.api.pdf({carpeta:r.carpeta, cliente:actual.nombre, fecha:fechaBonita(r.id), texto:r.minuta});
  quitarEstado();
  if(res.ok){ r.tienePdf=true; await cargarReuniones(); pintarDetalle(); window.api.abrir(res.ruta); }
}

// ---------- grabación ----------
$('#btnGrabar').onclick = async () => {
  if(!grabando){
    const res = await window.api.grabarIniciar(actual.slug);
    if(!res.ok) return alert(res.error);
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
    $('#btnGrabar').disabled = false; $('#btnImportar').disabled = false;
  $('#btnExpediente').disabled = false;
  }
};

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
  const {carpeta} = await window.api.importarACarpeta({slug:actual.slug, archivo});
  await procesar(carpeta);
};

async function procesar(carpeta){
  const res = await window.api.procesar({carpeta, slug:actual.slug, nombre:actual.nombre});
  quitarEstado();
  if(!res.ok){ estado('error','No se pudo procesar', res.error); return; }
  await cargarReuniones();
  const rs = await window.api.reuniones(actual.slug);
  reunionActual = rs.find(r=>r.carpeta===carpeta) || rs[0];
  await cargarReuniones(); pintarDetalle();
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

// ---------- estado ----------
function estado(tipo, txt, sub){
  quitarEstado();
  const icono = tipo==='pulso'?'<div class="pulso"></div>':(tipo==='spin'?'<div class="spin"></div>':'');
  const e = el('div','estado'+(tipo==='error'?' error':''),
    `${icono}<div><div class="txt">${esc(txt)}</div>${sub?`<div class="sub">${esc(sub)}</div>`:''}</div>${tipo==='pulso'?'<div class="crono">00:00</div>':''}`);
  e.id='estado'; $('#detalle').prepend(e);
}
function quitarEstado(){ const e=$('#estado'); if(e) e.remove(); }

window.api.onProgreso(({etapa, detalle})=>{
  const textos = { mezclando:'Uniendo las pistas de audio', transcribiendo:'Transcribiendo la reunión',
                   atribuyendo:'Separando quién dijo cada cosa', redactando:'Redactando la minuta', guardando:'Guardando en el expediente', listo:'', error:'Error' };
  if(etapa==='listo') return quitarEstado();
  if(etapa==='error') return estado('error','No se pudo procesar', detalle);
  estado('spin', textos[etapa]||etapa, detalle);
});

let tBusca=null;
$('#q').oninput = () => {
  pintarClientes();
  clearTimeout(tBusca);
  const t = $('#q').value.trim();
  if(t.length < 3){ hayResultados = false; if(actual) cargarReuniones(); return; }
  tBusca = setTimeout(async ()=>{
    const res = await window.api.buscar(t);
    hayResultados = res.length > 0; pintarClientes();
    const cont = $('#reuniones'); cont.innerHTML='';
    $('#titulo').textContent = `Resultados de "${t}"`;
    $('#subtitulo').textContent = res.length ? `${res.length} coincidencia${res.length===1?'':'s'}` : 'Sin coincidencias';
    res.forEach(r=>{
      const limpio = r.fragmento.replace(/\*\*/g,'').replace(/^#+\s*/gm,'').replace(/^-\s+/,'');
      const frag = esc(limpio).replace(new RegExp('('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'),'<mark>$1</mark>');
      const b = el('button','res', `<div class="c">${esc(r.cliente)} · ${esc(fechaBonita(r.id))}</div><div class="frag">${frag}</div>`);
      b.onclick = async () => {
        const c = CLIENTES.find(x=>x.slug===r.slug); if(!c) return;
        $('#q').value=''; await elegirCliente(c);
        const rs = await window.api.reuniones(c.slug);
        const reu = rs.find(x=>x.id===r.id); if(reu) verReunion(reu);
      };
      cont.appendChild(b);
    });
  }, 260);
};
// el atajo global (Cmd+Shift+R) dispara el mismo botón
window.api.onAtajo(({accion})=>{
  const b = $('#btnGrabar');
  if(accion==='grabar' && !grabando && !b.disabled) b.click();
  if(accion==='detener' && grabando) b.click();
});

window.recargarClientes = cargarClientes;
cargarClientes();
