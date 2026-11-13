/* Revisione di un PDF importato: pannello con la pagina ORIGINALE accanto all'editor (segue la pagina che
   stai guardando) e navigazione tra le parole che l'OCR ha letto con poca sicurezza (evidenziate in giallo).
   L'originale resta in memoria solo per la sessione in cui il PDF è stato aperto. */
(function(){
'use strict';
const {State,Pages,toast}=BB;

let src=null;               // {pdfs, pageRefs, names}
let panel=null, canvas=null, shownKey='';
const SEL='.bb-page-content .bb-lowconf';
const marks=()=>Array.from(document.querySelectorAll(SEL));

/* ---------------- pagina PDF corrispondente ---------------- */
function pdfIndexForEditorPage(e){
  let n=1;                                         // ogni pagina PDF dopo la prima inizia con un blocco marcato
  for(let i=0;i<=e && i<State.pages.length;i++) if(State.pages[i].content.querySelector(':scope>[data-bb-pgstart]')) n++;
  return Math.max(0,Math.min(n-1,(src?src.pageRefs.length:1)-1));
}
function visiblePage(){
  const area=document.getElementById('bb-editor-area'); if(!area) return State.active;
  const ar=area.getBoundingClientRect(); let best=State.active, bv=-1;
  State.pages.forEach((p,i)=>{ const r=p.el.getBoundingClientRect(); const v=Math.min(r.bottom,ar.bottom)-Math.max(r.top,ar.top); if(v>bv){ bv=v; best=i; } });
  return best;
}
async function showOriginal(){
  if(!src || !panel || !panel.classList.contains('open')) return;
  const ei=visiblePage(), pi=pdfIndexForEditorPage(ei), ref=src.pageRefs[pi]; if(!ref) return;
  const body=panel.querySelector('.bb-cmp-body'), w=Math.max(200,body.clientWidth-16);
  const key=pi+'@'+w; if(key===shownKey) return; shownKey=key;
  panel.querySelector('#bb-cmp-page').textContent='Pagina '+ref.num+' di '+ref.doc.numPages+(src.pdfs.length>1?' · '+(src.names[src.pdfs.indexOf(ref.doc)]||''):'');
  try{
    const page=await ref.doc.getPage(ref.num), vp1=page.getViewport({scale:1}), dpr=Math.min(2,window.devicePixelRatio||1);
    const vp=page.getViewport({scale:w/vp1.width*dpr});
    const c=document.createElement('canvas'); c.width=Math.round(vp.width); c.height=Math.round(vp.height); c.style.width=w+'px'; c.style.height=Math.round(vp.height/dpr)+'px';
    await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    if(key!==shownKey) return;                          // nel frattempo si è cambiata pagina
    body.innerHTML=''; body.appendChild(c); canvas=c;
  }catch(e){ console.warn('Anteprima originale non riuscita',e); }
}

/* ---------------- parole dubbie ---------------- */
function updateCount(){
  const n=marks().length, el=document.getElementById('bb-cmp-count'); if(el) el.textContent=n?n+(n===1?' parola da ricontrollare':' parole da ricontrollare'):'Nessuna parola dubbia';
  document.querySelectorAll('#bb-cmp-prev,#bb-cmp-next,#bb-cmp-ok,#bb-cmp-all').forEach(b=>{ b.disabled=!n; });
  const btn=document.getElementById('bb-rev-next'); if(btn) btn.title=n?n+' parole da ricontrollare (F8)':'Nessuna parola dubbia';
}
let cur=-1;
function go(delta){
  const list=marks(); if(!list.length){ toast('Nessuna parola da ricontrollare','ok'); return; }
  // si parte dal cursore: la prima parola dubbia dopo (o prima) di esso
  const sel=getSelection(); let idx=-1;
  if(sel.rangeCount){ const r=sel.getRangeAt(0); idx=list.findIndex(m=>{ const c=document.createRange(); c.selectNode(m); return delta>0?c.compareBoundaryPoints(Range.START_TO_START,r)>0:c.compareBoundaryPoints(Range.START_TO_START,r)>=0; }); if(delta<0) idx=idx<0?list.length-1:idx-1; else idx=idx<0?0:idx; if(idx<0) idx=list.length-1; }
  else idx=delta>0?0:list.length-1;
  cur=idx; select(list[idx]);
}
function select(m){
  const page=m.closest('.bb-page-content'); const pi=State.pages.findIndex(p=>p.content===page); if(pi>=0) State.active=pi;
  m.scrollIntoView({block:'center',behavior:'smooth'});
  page.focus({preventScroll:true});
  const r=document.createRange(); r.selectNodeContents(m); const s=getSelection(); s.removeAllRanges(); s.addRange(r);
  setTimeout(showOriginal,350);
}
function unwrap(m){
  const parent=m.parentNode; if(!parent) return;
  while(m.firstChild) parent.insertBefore(m.firstChild,m); parent.removeChild(m); parent.normalize();
}
function confirmCurrent(){
  const sel=getSelection(); let m=null;
  if(sel.rangeCount){ const n=sel.anchorNode; const el=n&&(n.nodeType===1?n:n.parentElement); m=el&&el.closest('.bb-lowconf'); }
  if(!m) m=marks()[0]; if(!m){ return; }
  const keep=getSelection().rangeCount; unwrap(m); BBUI.changed(); updateCount(); go(1);
}
async function confirmAll(){
  const n=marks().length; if(!n) return;
  const ok=await BB.Confirm.ask('Le '+n+' parole evidenziate vengono considerate corrette e l\'evidenziazione sparisce.',{title:'Confermare tutte le parole?',yesLabel:'Sì, conferma tutte'}); if(!ok) return;
  marks().forEach(unwrap); BBUI.changed(); updateCount();
}

/* ---------------- pannello ---------------- */
function build(){
  if(panel) return;
  panel=document.createElement('aside'); panel.id='bb-compare'; panel.className='bb-chrome';
  panel.innerHTML='<div class="bb-cmp-head"><b>Originale</b><span id="bb-cmp-page"></span><button type="button" class="bb-mini-btn" id="bb-cmp-close" title="Chiudi il confronto">✕</button></div>'+
    '<div class="bb-cmp-review"><span id="bb-cmp-count"></span><div class="bb-cmp-btns"><button type="button" class="bb-mini-btn" id="bb-cmp-prev" title="Parola dubbia precedente (Maiusc+F8)">◀</button><button type="button" class="bb-mini-btn" id="bb-cmp-next" title="Parola dubbia successiva (F8)">▶</button>'+
    '<button type="button" class="bb-mini-btn accent" id="bb-cmp-ok" title="Considera corretta questa parola e passa alla successiva">Conferma</button><button type="button" class="bb-mini-btn" id="bb-cmp-all">Conferma tutte</button></div></div>'+
    '<div class="bb-cmp-body"><div class="bb-hint" style="padding:14px">Apri un PDF per vedere qui la pagina originale accanto al testo ricostruito.</div></div>';
  const area=document.getElementById('bb-editor-area'); area.parentNode.insertBefore(panel,area);
  panel.querySelector('#bb-cmp-close').addEventListener('click',()=>toggle(false));
  panel.querySelector('#bb-cmp-prev').addEventListener('click',()=>go(-1));
  panel.querySelector('#bb-cmp-next').addEventListener('click',()=>go(1));
  panel.querySelector('#bb-cmp-ok').addEventListener('click',confirmCurrent);
  panel.querySelector('#bb-cmp-all').addEventListener('click',confirmAll);
  let t=null; area.addEventListener('scroll',()=>{ clearTimeout(t); t=setTimeout(showOriginal,160); });
  window.addEventListener('resize',()=>{ shownKey=''; clearTimeout(t); t=setTimeout(showOriginal,200); });
}
function toggle(force){
  build();
  const open=force===undefined?!panel.classList.contains('open'):force;
  if(open && !src){ toast('Il confronto è disponibile dopo aver aperto un PDF in questa sessione','err'); return; }
  panel.classList.toggle('open',open); document.body.classList.toggle('bb-cmp-on',open); shownKey='';
  updateCount(); if(open) setTimeout(showOriginal,60);
}

BB.on('init',()=>{
  BBUI.icon('ico-compare','<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>');
  BBUI.icon('ico-warnword','<path d="M12 3l9 16H3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17.2"/>');
  BBUI.group('view','Revisione PDF',[
    {id:'bb-rev-compare',label:'Confronta',icon:'ico-compare',title:'Mostra la pagina originale del PDF accanto al testo',onClick:()=>toggle()},
    {id:'bb-rev-next',label:'Parole dubbie',icon:'ico-warnword',title:'Vai alla prossima parola da ricontrollare (F8)',onClick:()=>go(1)}
  ]);
  document.addEventListener('keydown',e=>{ if(e.key==='F8'){ e.preventDefault(); go(e.shiftKey?-1:1); } });
  // modificando il testo di una parola evidenziata, la si considera corretta
  document.addEventListener('input',e=>{
    const n=getSelection().anchorNode, el=n&&(n.nodeType===1?n:n.parentElement); const m=el&&el.closest&&el.closest('.bb-lowconf');
    if(m && m.closest('.bb-page-content')){ unwrap(m); updateCount(); }
    else if(panel&&panel.classList.contains('open')) updateCount();
  });
});
BB.on('pdfImported',d=>{
  src=d; build(); shownKey='';
  const n=marks().length;
  if(n){ toggle(true); toast(n+' parole lette con poca sicurezza sono evidenziate: usa F8 per ricontrollarle','ok'); }
  else updateCount();
});
BB.on('renumber',()=>{ if(panel&&panel.classList.contains('open')) updateCount(); });
BB.PdfReview={toggle,go,confirmAll,marks,source:()=>src};
})();
