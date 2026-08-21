// Conversor Markdown -> HTML acotado a lo que usan las minutas.
//
// Se carga de dos maneras: con require() desde el proceso principal, y con una
// etiqueta <script> desde la ventana. Va dentro de una función para no dejar
// nada suelto en el ámbito global: como <script> clásico, un `function esc` de
// primer nivel se convierte en global y choca con el `const esc` de app.js, lo
// que tumba ese archivo entero con un error de redeclaración, en silencio y
// antes de que nada pueda registrarlo.
//
// El preload tampoco puede requerirlo: bajo el sandbox de Electron solo se
// puede requerir 'electron' y unos pocos módulos más, y un require prohibido
// ahí deja el puente `window.api` sin exponer, sin avisar.
(function (raiz) {
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function inline(s){
    return esc(s)
      .replace(/`([^`]+)`/g,'<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g,'$1<em>$2</em>');
  }
  function convertir(md){
    const out=[]; const lineas=md.replace(/\r/g,'').split('\n');
    let i=0;
    while(i<lineas.length){
      const l=lineas[i];
      if(/^\s*$/.test(l)){ i++; continue; }
      if(/^---+\s*$/.test(l)){ out.push('<hr>'); i++; continue; }
      let m;
      if((m=l.match(/^(#{1,6})\s*(.*)$/))){ const n=Math.min(m[1].length,4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
      if(/^\s*\|/.test(l)){
        const fila = s => s.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
        const enc=fila(l); i++;
        // la fila separadora es opcional: el LLM a veces corta la tabla a medias
        if(/^\s*\|[\s:|-]+\|?\s*$/.test(lineas[i]||'')) i++;
        const cuerpo=[];
        while(i<lineas.length && /^\s*\|/.test(lineas[i])){ cuerpo.push(fila(lineas[i])); i++; }
        out.push('<table><thead><tr>'+enc.map(c=>`<th>${inline(c)}</th>`).join('')+'</tr></thead><tbody>'+
          cuerpo.map(r=>'<tr>'+r.map(c=>`<td>${inline(c)}</td>`).join('')+'</tr>').join('')+'</tbody></table>');
        continue;
      }
      if(/^\s*[-*]\s+/.test(l)){
        const items=[]; while(i<lineas.length && /^\s*[-*]\s+/.test(lineas[i])){ items.push(lineas[i].replace(/^\s*[-*]\s+/,'')); i++; }
        out.push('<ul>'+items.map(t=>`<li>${inline(t)}</li>`).join('')+'</ul>'); continue;
      }
      if(/^\s*\d+\.\s+/.test(l)){
        const items=[]; while(i<lineas.length && /^\s*\d+\.\s+/.test(lineas[i])){ items.push(lineas[i].replace(/^\s*\d+\.\s+/,'')); i++; }
        out.push('<ol>'+items.map(t=>`<li>${inline(t)}</li>`).join('')+'</ol>'); continue;
      }
      const parr=[lineas[i++]]; while(i<lineas.length && !/^\s*$/.test(lineas[i]) && !/^(#|\||\s*[-*]\s|\s*\d+\.\s|---)/.test(lineas[i])){ parr.push(lineas[i]); i++; }
      const texto=parr.join(' ');
      // el último párrafo, si trae datos de contacto, se pinta como tarjeta
      const cls = /@|\+\d|https?:/.test(texto) && texto.length < 220 ? ' class="contact"' : '';
      out.push(`<p${cls}>${inline(texto)}</p>`);
    }
    return out.join('\n');
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { convertir };
  else raiz.MD = { convertir };
})(typeof globalThis !== 'undefined' ? globalThis : this);
