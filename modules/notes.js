/* Sommario automatico (dai titoli) e note a piè di pagina (in fondo alla pagina che le contiene). */
(function(){
'use strict';
const {State,Pages,escapeHtml,MM2PX}=BB;

/* ============================== SOMMARIO ============================== */
const TOC_LEVELS=3;
function headings(){
  const out=[];
  State.pages.forEach((pg,pi)=>pg.content.querySelectorAll('h1,h2,h3').forEach(h=>{
    if(h.closest('.bb-toc')) return;
    const text=h.textContent.replace(/\s+/g,' ').trim(); if(!text) return;
    out.push({el:h,level:+h.tagName[1],text,page:pi+1});
  }));
  return out.filter(h=>h.level<=TOC_LEVELS);
}
function tocHtml(list,title){
  let x='<p class="bb-toc-title">'+escapeHtml(title||'Sommario')+'</p>';
  if(!list.length) x+='<p class="bb-toc-line bb-toc-empty"><span class="t">Nessun titolo nel documento: applica lo stile Titolo 1/2/3 e aggiorna il sommario.</span></p>';
  list.forEach((h,i)=>{ x+='<p class="bb-toc-line lvl'+h.level+'" data-bb-i="'+i+'"><span class="t">'+escapeHtml(h.text)+'</span><span class="d"></span><span class="n">'+h.page+'</span></p>'; });
  return x;
}
function tocBlocks(){ return Array.from(document.querySelectorAll('.bb-page-content .bb-toc')); }
function signature(list){ return list.map(h=>h.level+'|'+h.text+'|'+h.page).join('\n'); }

const Toc={
  /** Inserisce un sommario nel punto del cursore. */
  insert(){
    const list=headings();
    const html='<div class="bb-toc" contenteditable="false" data-bb-toc="1">'+tocHtml(list)+'</div><p><br></p>';
    BB.restoreEditorSelection(); Pages.activeContent().focus();
    document.execCommand('insertHTML',false,html);
    this.update(true); BBUI.changed(); Pages.reflow(); this.update(true);
  },
  /** Ricostruisce tutti i sommari del documento; con `force` anche se nulla è cambiato. */
  update(force){
    const blocks=tocBlocks(); if(!blocks.length) return false;
    const list=headings(), sig=signature(list);
    const firsts=blocks.filter(b=>!b.hasAttribute('data-bb-cont'));
    if(!force && firsts.every(b=>b.dataset.bbSig===sig)) return false;
    // un sommario spezzato su due pagine ha una "continuazione": si rimuove e si ricostruisce da capo
    blocks.filter(b=>b.hasAttribute('data-bb-cont')).forEach(b=>b.remove());
    let changed=false;
    firsts.forEach(b=>{ b.innerHTML=tocHtml(list,(b.querySelector('.bb-toc-title')||{}).textContent); b.dataset.bbSig=sig; changed=true; });
    return changed;
  },
  /** Aggiorna solo se i titoli o i numeri di pagina sono cambiati (chiamato a riposo dopo le modifiche). */
  refreshIfNeeded(){
    if(!tocBlocks().length) return;
    if(this.update(false)){ Pages.reflow(); this.update(false); BB.Stats.update(); BB.Autosave.mark(); }
  },
  go(i){
    const h=headings()[i]; if(!h) return;
    h.el.scrollIntoView({block:'start',behavior:'smooth'});
    const r=document.createRange(); r.setStart(h.el,0); r.collapse(true);
    const pi=State.pages.findIndex(p=>p.content.contains(h.el)); if(pi>=0) State.active=pi;
    h.el.closest('.bb-page-content').focus({preventScroll:true}); const s=getSelection(); s.removeAllRanges(); s.addRange(r);
  }
};

/* ============================== NOTE A PIÈ DI PAGINA ============================== */
const FN_PAD_PX=10;     // spazio tra il testo e l'area delle note
const Footnotes={
  refs(root){ return Array.from((root||document).querySelectorAll('.bb-page-content sup.bb-fnref')); },
  /** Numeri progressivi in ordine di lettura. */
  renumber(){ this.refs().forEach((s,i)=>{ if(s.textContent!==String(i+1)) s.textContent=String(i+1); }); },
  /** Testi delle note della pagina `i`, e area in fondo alla pagina. Regola il margine inferiore del
      contenuto così che l'impaginazione lasci sempre lo spazio per le note. */
  layoutPage(i){
    const pg=State.pages[i]; if(!pg) return;
    const content=pg.content, refs=Array.from(content.querySelectorAll('sup.bb-fnref'));
    let area=pg.el.querySelector(':scope>.bb-fn-area');
    const m=State.margins, baseBottom=m.bottom*MM2PX;
    if(!refs.length){
      if(area){ area.remove(); }
      if(content.dataset.bbFn){ delete content.dataset.bbFn; content.style.paddingBottom=baseBottom+'px'; }
      return;
    }
    if(!area){ area=document.createElement('div'); area.className='bb-fn-area'; area.setAttribute('contenteditable','false'); pg.el.appendChild(area); }
    const html='<div class="bb-fn-sep"></div>'+refs.map(s=>'<div class="bb-fn-item" data-bb-fn-n="'+s.textContent+'"><sup>'+escapeHtml(s.textContent)+'</sup> '+escapeHtml(s.getAttribute('data-bb-fn')||'')+'</div>').join('');
    if(area.dataset.sig!==html){ area.innerHTML=html; area.dataset.sig=html; }
    area.style.left=m.left*MM2PX+'px'; area.style.right=m.right*MM2PX+'px'; area.style.bottom=baseBottom+'px';
    const h=Math.ceil(area.offsetHeight);
    const pad=baseBottom+h+FN_PAD_PX;
    content.dataset.bbFn='1';
    if(content.style.paddingBottom!==pad+'px') content.style.paddingBottom=pad+'px';
  },
  layoutAll(){ this.renumber(); State.pages.forEach((_,i)=>this.layoutPage(i)); },
  /** Finestra per scrivere/modificare/eliminare una nota. */
  edit(sup){
    const isNew=!sup;
    BB.Modal.open(isNew?'Nuova nota a piè di pagina':'Modifica nota','<label for="bb-fn-text">Testo della nota</label><textarea id="bb-fn-text" rows="4" placeholder="Scrivi qui la nota…">'+escapeHtml(isNew?'':(sup.getAttribute('data-bb-fn')||''))+'</textarea>'+
      (isNew?'':'<div class="bb-hint"><button type="button" class="bb-mini-btn" id="bb-fn-del">Elimina la nota</button></div>'),()=>{
      const t=document.getElementById('bb-fn-text').value.replace(/\s+/g,' ').trim();
      if(!t){ BB.toast('Scrivi il testo della nota','err'); return false; }
      if(isNew) Footnotes.insertRef(t); else { sup.setAttribute('data-bb-fn',t); Footnotes.afterChange(); }
    },isNew?'Inserisci':'Salva');
    const del=document.getElementById('bb-fn-del');
    if(del) del.addEventListener('click',()=>{ sup.remove(); BB.Modal.close(false); Footnotes.afterChange(); });
  },
  insertRef(text){
    BB.restoreEditorSelection(); Pages.activeContent().focus();
    document.execCommand('insertHTML',false,'<sup class="bb-fnref" contenteditable="false" data-bb-fn="'+escapeHtml(text)+'">1</sup>&#8203;');
    this.afterChange();
  },
  afterChange(){ this.layoutAll(); Pages.reflow(); this.layoutAll(); Toc.refreshIfNeeded(); BBUI.changed(); }
};

/* ============================== integrazione ============================== */
BB.on('init',()=>{
  BBUI.icon('ico-toc','<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="17" y2="18"/><line x1="17" y1="12" x2="20" y2="12"/>');
  BBUI.icon('ico-note','<path d="M5 4h10l4 4v12H5z"/><line x1="8" y1="12" x2="15" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>');
  BBUI.icon('ico-refresh','<path d="M20 11a8 8 0 1 0-2.3 5.7"/><polyline points="20 4 20 11 13 11"/>');
  BBUI.group('insert','Riferimenti',[
    {id:'bb-ins-toc',label:'Sommario',icon:'ico-toc',title:'Inserisce un sommario dai titoli (Titolo 1-3)',onClick:()=>Toc.insert()},
    {id:'bb-upd-toc',label:'Aggiorna',icon:'ico-refresh',title:'Aggiorna il sommario',onClick:()=>{ if(!tocBlocks().length) BB.toast('Non c\'è nessun sommario nel documento','err'); else { Toc.update(true); Pages.reflow(); Toc.update(true); BBUI.changed(); BB.toast('Sommario aggiornato','ok'); } }},
    {id:'bb-ins-fn',label:'Nota a piè',icon:'ico-note',title:'Inserisce una nota a piè di pagina al cursore',onClick:()=>Footnotes.edit(null)}
  ]);
  // clic su una voce del sommario = vai al titolo; clic su un richiamo di nota = modifica
  document.getElementById('bb-pages-scaler').addEventListener('click',e=>{
    const line=e.target.closest('.bb-toc-line[data-bb-i]'); if(line){ e.preventDefault(); Toc.go(+line.dataset.bbI); return; }
    const sup=e.target.closest('sup.bb-fnref'); if(sup){ e.preventDefault(); Footnotes.edit(sup); return; }
    const item=e.target.closest('.bb-fn-item'); if(item){ const n=item.getAttribute('data-bb-fn-n'); const s=Footnotes.refs().find(x=>x.textContent===n); if(s) Footnotes.edit(s); }
  });
});
// l'impaginazione chiede lo spazio per le note PRIMA di misurare ogni pagina
BB.hooks=BB.hooks||{};
BB.hooks.beforePageMeasure=i=>Footnotes.layoutPage(i);
BB.hooks.beforeReflow=()=>Footnotes.renumber();
// a riposo: se titoli o numeri di pagina sono cambiati, il sommario si aggiorna da solo
let idle=null;
const schedule=()=>{ clearTimeout(idle); idle=setTimeout(()=>{ try{ Toc.refreshIfNeeded(); }catch(e){ console.error(e); } },1800); };
BB.on('renumber',schedule);
document.addEventListener('input',e=>{ if(e.target.closest&&e.target.closest('.bb-page-content')) schedule(); });
BB.on('deserialized',()=>{ Footnotes.layoutAll(); });
BB.on('ready',()=>{ Footnotes.layoutAll(); });
BB.on('restyle',()=>{ Footnotes.layoutAll(); });
// prima di stampare/esportare: sommario e note aggiornati
window.addEventListener('beforeprint',()=>{ Toc.update(false); Footnotes.layoutAll(); });
BB.Toc=Toc; BB.Footnotes=Footnotes;
})();
