// Conversor Markdown -> HTML acotado a lo que usan las minutas.
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
    if((m=l.match(/^(#{1,4})\s+(.*)$/))){ const n=m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if(/^\|/.test(l) && /^\|[\s:|-]+\|?\s*$/.test(lineas[i+1]||'')){
      const fila = s => s.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
      const enc=fila(l); i+=2; const cuerpo=[];
      while(i<lineas.length && /^\|/.test(lineas[i])){ cuerpo.push(fila(lineas[i])); i++; }
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
    const parr=[]; while(i<lineas.length && !/^\s*$/.test(lineas[i]) && !/^(#|\||\s*[-*]\s|\s*\d+\.\s|---)/.test(lineas[i])){ parr.push(lineas[i]); i++; }
    const texto=parr.join(' ');
    // el último párrafo, si trae datos de contacto, se pinta como tarjeta
    const cls = /@|\+\d|https?:/.test(texto) && texto.length < 220 ? ' class="contact"' : '';
    out.push(`<p${cls}>${inline(texto)}</p>`);
  }
  return out.join('\n');
}
module.exports={convertir};
