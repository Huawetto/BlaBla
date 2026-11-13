/* Stili di paragrafo personalizzati: si creano dal testo selezionato (o da zero), si applicano a uno o più
   paragrafi (anche su più pagine) e, modificandoli, si aggiornano tutti i paragrafi che li usano.
   Le definizioni sono salvate nel documento (.blab → meta.ext.styles). */
(function(){
'use strict';
const {State,Pages,escapeHtml,toast,Modal}=BB;

let styles=[];            // [{id,name,block,font,size,color,bold,italic,underline,align,lh,before,after,indent}]
const BLOCKS=[['p','Paragrafo'],['h1','Titolo 1'],['h2','Titolo 2'],['h3','Titolo 3'],['blockquote','Citazione']];
const ALIGN=[['left','Sinistra'],['center','Centro'],['right','Destra'],['justify','Giustificato']];
const SEL='p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,div:not(.bb-toc):not(.bb-fn-area)';

function cssOf(st){
  const c=[];
  if(st.font) c.push("font-family:'"+String(st.font).replace(/['"\\;]/g,'')+"'");
  if(st.size) c.push('font-size:'+(+st.size)+'pt');
  if(st.color) c.push('color:'+st.color);
  c.push('font-weight:'+(st.bold?'700':'400'),'font-style:'+(st.italic?'italic':'normal'),'text-decoration:'+(st.underline?'underline':'none'));
  if(st.align) c.push('text-align:'+st.align);
  if(st.lh) c.push('line-height:'+(+st.lh));
  c.push('margin:'+(+st.before||0)+'pt 0 '+(+st.after||0)+'pt');
  if(st.indent) c.push('text-indent:'+(+st.indent)+'mm');
  return c.join(';');
}
const byId=id=>styles.find(s=>s.id===id);

/* ---------------- selezione → blocchi ---------------- */
function currentRanges(){
  const DS=BB.DocSelect;
  if(DS.active && DS.parts.length) return DS.parts.map(x=>x.range);
  BB.restoreEditorSelection();
  const sel=window.getSelection(); return sel.rangeCount?[sel.getRangeAt(0)]:[];
}
function blocksOf(ranges){
  const out=new Set();
  ranges.forEach(r=>{
    const host=(r.commonAncestorContainer.nodeType===1?r.commonAncestorContainer:r.commonAncestorContainer.parentElement);
    const content=host&&host.closest('.bb-page-content'); if(!content) return;
    const cand=Array.from(content.querySelectorAll(SEL)).filter(el=>{ try{ return r.intersectsNode(el); }catch(e){ return false; } });
    cand.forEach(el=>out.add(el));
    // il paragrafo che contiene il cursore (selezione vuota)
    if(!cand.length){ let n=r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement; while(n&&n.parentNode!==content) n=n.parentElement; if(n) out.add(n); }
  });
  // un contenitore con dentro altri blocchi (div con paragrafi) non è un paragrafo: si usa l'interno
  return Array.from(out).filter(el=>!Array.from(out).some(o=>o!==el&&el.contains(o)));
}
function retag(el,tag){
  if(!tag || el.tagName.toLowerCase()===tag || !/^(P|DIV|H[1-6]|BLOCKQUOTE)$/.test(el.tagName)) return el;
  const n=document.createElement(tag);
  Array.from(el.attributes).forEach(a=>n.setAttribute(a.name,a.value));
  while(el.firstChild) n.appendChild(el.firstChild);
  el.replaceWith(n); return n;
}
function applyTo(el,st){
  el=retag(el,st.block); el.setAttribute('style',cssOf(st)); el.setAttribute('data-bb-style',st.id);
  return el;
}
function applyStyle(id){
  const st=byId(id); if(!st) return;
  const ranges=currentRanges(); const blocks=blocksOf(ranges);
  if(!blocks.length){ toast('Posiziona il cursore in un paragrafo','err'); return; }
  const keep=ranges.map(r=>r.cloneRange());
  blocks.forEach(b=>applyTo(b,st));
  try{ const sel=getSelection(); sel.removeAllRanges(); sel.addRange(keep[0]); }catch(e){}
  Pages.reflow(); BBUI.changed(); refreshSelect();
}
function clearStyle(){
  const blocks=blocksOf(currentRanges());
  blocks.forEach(b=>{ b.removeAttribute('style'); b.removeAttribute('data-bb-style'); });
  Pages.reflow(); BBUI.changed(); toast('Stile rimosso dal paragrafo','ok');
}
/** Aggiorna TUTTI i paragrafi che usano lo stile (dopo averlo modificato). */
function propagate(st){
  State.pages.forEach(p=>p.content.querySelectorAll('[data-bb-style="'+st.id+'"]').forEach(el=>applyTo(el,st)));
  Pages.reflow();
}

/* ---------------- stile dal testo ---------------- */
function fromCaret(){
  const blocks=blocksOf(currentRanges()); const el=blocks[0]; if(!el) return null;
  const cs=getComputedStyle(el); const px=parseFloat(cs.fontSize)||14;
  const hex=c=>{ const m=/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/.exec(c); return m?'#'+[m[1],m[2],m[3]].map(v=>('0'+(+v).toString(16)).slice(-2)).join(''):'#000000'; };
  const tag=el.tagName.toLowerCase();
  const lh=parseFloat(cs.lineHeight);
  return { block:BLOCKS.some(b=>b[0]===tag)?tag:'p', font:(cs.fontFamily||'').split(',')[0].replace(/["']/g,'').trim(), size:Math.round(px*0.75*2)/2, color:hex(cs.color),
    bold:parseInt(cs.fontWeight,10)>=600, italic:cs.fontStyle==='italic', underline:/underline/.test(cs.textDecorationLine||''), align:['left','center','right','justify'].includes(cs.textAlign)?cs.textAlign:'left',
    lh:(lh&&cs.lineHeight!=='normal')?Math.round(lh/px*100)/100:1.4, before:Math.round((parseFloat(cs.marginTop)||0)*0.75), after:Math.round((parseFloat(cs.marginBottom)||0)*0.75),
    indent:Math.round((parseFloat(cs.textIndent)||0)/3.78) };
}

/* ---------------- finestre ---------------- */
function formHtml(st){
  const fonts=Array.from(new Set(State.fonts)).sort((a,b)=>a.localeCompare(b));
  return '<label for="bb-cs-name">Nome dello stile</label><input id="bb-cs-name" type="text" maxlength="40" value="'+escapeHtml(st.name||'')+'" placeholder="Es. Titolo capitolo">'+
    '<div class="bb-row two"><div><label for="bb-cs-block">Tipo di blocco</label><select id="bb-cs-block">'+BBUI.options(BLOCKS,st.block)+'</select></div>'+
    '<div><label for="bb-cs-align">Allineamento</label><select id="bb-cs-align">'+BBUI.options(ALIGN,st.align)+'</select></div></div>'+
    '<div class="bb-row two"><div><label for="bb-cs-font">Carattere</label><input id="bb-cs-font" list="bb-cs-fonts" value="'+escapeHtml(st.font||'')+'"><datalist id="bb-cs-fonts">'+fonts.map(f=>'<option value="'+escapeHtml(f)+'">').join('')+'</datalist></div>'+
    '<div><label for="bb-cs-size">Dimensione (pt)</label><input id="bb-cs-size" type="number" min="6" max="96" step="0.5" value="'+st.size+'"></div></div>'+
    '<div class="bb-row"><div><label for="bb-cs-color">Colore</label><input id="bb-cs-color" type="color" value="'+(st.color||'#000000')+'"></div>'+
    '<div><label for="bb-cs-lh">Interlinea</label><input id="bb-cs-lh" type="number" min="0.8" max="3" step="0.05" value="'+st.lh+'"></div>'+
    '<div><label for="bb-cs-indent">Rientro 1ª riga (mm)</label><input id="bb-cs-indent" type="number" min="0" max="40" step="1" value="'+(st.indent||0)+'"></div></div>'+
    '<div class="bb-row two"><div><label for="bb-cs-before">Spazio prima (pt)</label><input id="bb-cs-before" type="number" min="0" max="72" value="'+(st.before||0)+'"></div>'+
    '<div><label for="bb-cs-after">Spazio dopo (pt)</label><input id="bb-cs-after" type="number" min="0" max="72" value="'+(st.after||0)+'"></div></div>'+
    '<label class="bb-check"><input type="checkbox" id="bb-cs-b"'+(st.bold?' checked':'')+'> Grassetto</label><label class="bb-check"><input type="checkbox" id="bb-cs-i"'+(st.italic?' checked':'')+'> Corsivo</label><label class="bb-check"><input type="checkbox" id="bb-cs-u"'+(st.underline?' checked':'')+'> Sottolineato</label>';
}
function readForm(base){
  const v=id=>document.getElementById(id);
  const name=v('bb-cs-name').value.trim();
  if(!name){ toast('Dai un nome allo stile','err'); return null; }
  if(styles.some(s=>s.name.toLowerCase()===name.toLowerCase() && s.id!==(base&&base.id))){ toast('Esiste già uno stile con questo nome','err'); return null; }
  return Object.assign({},base,{name,block:v('bb-cs-block').value,align:v('bb-cs-align').value,font:v('bb-cs-font').value.trim(),size:+v('bb-cs-size').value||11,color:v('bb-cs-color').value,
    lh:+v('bb-cs-lh').value||1.4,indent:+v('bb-cs-indent').value||0,before:+v('bb-cs-before').value||0,after:+v('bb-cs-after').value||0,bold:v('bb-cs-b').checked,italic:v('bb-cs-i').checked,underline:v('bb-cs-u').checked});
}
function newStyle(fromSelection){
  const base=(fromSelection&&fromCaret())||{block:'p',font:'Calibri',size:11,color:'#000000',bold:false,italic:false,underline:false,align:'left',lh:1.4,before:0,after:6,indent:0};
  Modal.open('Nuovo stile di paragrafo',formHtml(base),()=>{
    const st=readForm({id:'s'+Date.now().toString(36)}); if(!st) return false;
    styles.push(st); refreshSelect(); BBUI.changed();
    toast('Stile «'+st.name+'» creato','ok');
    if(blocksOf(currentRanges()).length) applyStyle(st.id);
  },'Crea e applica',{wide:true});
}
function editStyle(id){
  const st=byId(id); if(!st) return;
  Modal.open('Modifica stile «'+st.name+'»',formHtml(st),()=>{
    const n=readForm(st); if(!n) return false;
    Object.assign(st,n); propagate(st); refreshSelect(); BBUI.changed(); toast('Stile aggiornato in tutto il documento','ok');
  },'Salva',{wide:true});
}
function manage(){
  const rows=!styles.length?'<div class="bb-hint">Non hai ancora stili personalizzati. «Nuovo stile» ne crea uno copiando la formattazione del paragrafo dove si trova il cursore.</div>':
    '<div class="bb-list">'+styles.map(s=>{ const n=State.pages.reduce((c,p)=>c+p.content.querySelectorAll('[data-bb-style="'+s.id+'"]').length,0);
      return '<div class="bb-list-item" data-id="'+s.id+'"><div style="min-width:0"><b>'+escapeHtml(s.name)+'</b><small>'+escapeHtml(s.font||'')+' '+s.size+' pt'+(s.bold?' · grassetto':'')+(s.italic?' · corsivo':'')+' — usato in '+n+' paragrafi</small></div>'+
      '<div class="bb-btns"><button type="button" class="bb-mini-btn accent" data-act="apply">Applica</button><button type="button" class="bb-mini-btn" data-act="edit">Modifica</button><button type="button" class="bb-mini-btn" data-act="del" title="Elimina stile">✕</button></div></div>'; }).join('')+'</div>';
  Modal.open('Stili di paragrafo',rows+'<div class="bb-hint" style="margin-top:12px"><button type="button" class="bb-mini-btn" id="bb-cs-new">Nuovo stile dal testo selezionato</button></div>',null,'Chiudi',{wide:true,hideCancel:true});
  document.getElementById('bb-modal-body').addEventListener('click',async e=>{
    if(e.target.id==='bb-cs-new'){ Modal.close(false); newStyle(true); return; }
    const b=e.target.closest('button[data-act]'); if(!b) return; const id=b.closest('[data-id]').dataset.id;
    if(b.dataset.act==='apply'){ Modal.close(false); applyStyle(id); }
    else if(b.dataset.act==='edit'){ Modal.close(false); editStyle(id); }
    else if(b.dataset.act==='del'){
      const ok=await BB.Confirm.ask('Lo stile viene eliminato; i paragrafi che lo usano mantengono l\'aspetto attuale.',{title:'Eliminare lo stile?',yesLabel:'Sì, elimina'}); if(!ok) return;
      styles=styles.filter(s=>s.id!==id); State.pages.forEach(p=>p.content.querySelectorAll('[data-bb-style="'+id+'"]').forEach(el=>el.removeAttribute('data-bb-style')));
      refreshSelect(); BBUI.changed(); Modal.close(false); manage();
    }
  });
}
function refreshSelect(){
  const sel=document.getElementById('bb-cs-sel'); if(!sel) return;
  sel.innerHTML='<option value="">Stili personalizzati…</option>'+styles.map(s=>'<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.name)+'</option>').join('')+(styles.length?'<option value="__clear">— Rimuovi stile</option>':'');
}

BB.on('init',()=>{
  const home=document.querySelector('.bb-panel[data-panel="home"]'); if(!home) return;
  const g=document.createElement('div'); g.className='bb-group';
  g.innerHTML='<div class="bb-group-body"><div class="bb-group-rows"><div class="bb-group-row"><select class="bb-select" id="bb-cs-sel" aria-label="Stili personalizzati" style="width:150px"></select></div>'+
    '<div class="bb-group-row"><button type="button" class="bb-mini-btn" id="bb-cs-add" title="Crea uno stile dalla formattazione del paragrafo attuale">+ Nuovo</button><button type="button" class="bb-mini-btn" id="bb-cs-manage">Gestisci</button></div></div></div><div class="bb-group-label">Stili di paragrafo</div>';
  const quick=[...home.querySelectorAll('.bb-group')].find(x=>/Stili rapidi/.test(x.textContent));
  (quick&&quick.after)?quick.after(g):home.appendChild(g);
  refreshSelect();
  document.getElementById('bb-cs-sel').addEventListener('change',e=>{ const v=e.target.value; e.target.value=''; if(v==='__clear') clearStyle(); else if(v) applyStyle(v); });
  document.getElementById('bb-cs-add').addEventListener('click',()=>newStyle(true));
  document.getElementById('bb-cs-manage').addEventListener('click',manage);
});
BB.extension('styles',()=>styles.length?JSON.parse(JSON.stringify(styles)):undefined,v=>{ styles=Array.isArray(v)?v.filter(s=>s&&s.id&&s.name):[]; refreshSelect(); });
BB.Styles={list:()=>styles.slice(),apply:applyStyle,create:st=>{ st.id=st.id||'s'+Date.now().toString(36); styles.push(st); refreshSelect(); return st; },css:cssOf,newStyle,manage};
})();
