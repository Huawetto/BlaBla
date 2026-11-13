/* Lingua dell'interfaccia (italiano / inglese). I testi dell'app sono scritti in italiano; con l'inglese attivo
   un traduttore li sostituisce al volo (testi, suggerimenti, segnaposto) in tutta l'interfaccia, comprese finestre
   e avvisi che compaiono dopo, usando il dizionario di modules/i18n-en.js. Il CONTENUTO dei documenti non viene
   mai toccato. La scelta è salvata nel browser; BB.uiLang() la restituisce agli altri moduli. */
(function(){
'use strict';
const KEY='bb-ui-lang', ATTRS=['title','placeholder','aria-label'];
let lang='it';
try{ const v=localStorage.getItem(KEY); if(v==='en'||v==='it') lang=v; }catch(e){}
const orig=new WeakMap();                 // nodo/elemento -> testo italiano originale
const origAttr=new WeakMap();             // elemento -> {attr: valore italiano}
let obs=null, busy=false;
const SKIP='.bb-page-content,.bb-thumb-mini,script,style,.bb-no-i18n,#bb-doc-title,.bb-fontlist-name';

// parole italiane con più significati: la traduzione dipende da dove compaiono
function ctx(t,el){
  if(!el) return undefined;
  if(t==='Annulla') return el.id==='bb-modal-cancel'?'Cancel':'Undo';
  if(t==='Righe') return el.closest&&el.closest('.bb-stat')?'Lines':'Rows';
  return undefined;
}
function tr(s,el){
  const t=s.replace(/\s+/g,' ').trim(); if(!t) return null;
  const pack=BB.I18N_EN; if(!pack) return null;
  let out=ctx(t,el); if(out===undefined) out=pack.dict[t];
  if(out===undefined){
    for(const [re,rep] of pack.rules){ if(re.test(t)){ out=t.replace(re,rep); break; } }
  }
  if(out===undefined||out===t) return null;
  const lead=s.match(/^\s*/)[0], trail=s.match(/\s*$/)[0];
  return lead+out+trail;
}
const inSkip=el=>!!(el&&el.closest&&el.closest(SKIP));

function doText(n){
  const p=n.parentElement; if(!p||inSkip(p)||p.closest('textarea')) return;
  if(lang==='en'){
    const src=orig.has(n)?orig.get(n):n.nodeValue;
    const out=tr(src,p);
    if(out!==null){ if(!orig.has(n)) orig.set(n,n.nodeValue); if(n.nodeValue!==out) n.nodeValue=out; }
  }else if(orig.has(n)){ n.nodeValue=orig.get(n); orig.delete(n); }
}
function doAttrs(el){
  if(inSkip(el)) return;
  for(const a of ATTRS){
    const v=el.getAttribute(a); if(v===null) continue;
    let rec=origAttr.get(el);
    if(lang==='en'){
      const src=rec&&a in rec?rec[a]:v, out=tr(src,el);
      if(out!==null){ if(!rec){ rec={}; origAttr.set(el,rec); } if(!(a in rec)) rec[a]=v; if(v!==out) el.setAttribute(a,out); }
    }else if(rec&&a in rec){ el.setAttribute(a,rec[a]); delete rec[a]; }
  }
}
function walk(root){
  if(!root) return;
  if(root.nodeType===3){ doText(root); return; }
  if(root.nodeType!==1||inSkip(root)) return;
  doAttrs(root);
  const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===1&&inSkip(n)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  let n; while((n=w.nextNode())){ if(n.nodeType===3) doText(n); else doAttrs(n); }
}
function apply(){
  busy=true; try{ walk(document.body); }finally{ busy=false; if(obs) obs.takeRecords(); }
  document.querySelectorAll('select.bb-select option, select option').forEach(o=>{ if(!inSkip(o)) doText(o.firstChild||o); });
}
function observe(){
  if(obs) return;
  obs=new MutationObserver(recs=>{
    if(busy) return;
    busy=true;
    try{
      for(const r of recs){
        const t=r.target;
        if(r.type==='childList'){ r.addedNodes.forEach(n=>walk(n)); if(t.nodeType===1&&!inSkip(t)) { /* testo sostituito in un nodo esistente */ } }
        else if(r.type==='characterData'){ if(t.parentElement&&!inSkip(t.parentElement)){ orig.delete(t); doText(t); } }
        else if(r.type==='attributes'){ if(!inSkip(t)){ const rec=origAttr.get(t); if(rec) delete rec[r.attributeName]; doAttrs(t); } }
      }
    }finally{ busy=false; obs.takeRecords(); }
  });
  obs.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS});
}
function set(next,quiet){
  lang=next==='en'?'en':'it';
  try{ localStorage.setItem(KEY,lang); }catch(e){}
  document.documentElement.setAttribute('data-ui-lang',lang);
  if(lang==='en') observe();
  apply();
  const btn=document.getElementById('bb-uilang'); if(btn){ btn.textContent=lang==='en'?'IT':'EN'; btn.title=lang==='en'?'Passa all\'interfaccia in italiano':'Switch the interface to English'; btn.setAttribute('data-bb-i18n-skip','1'); }
  const ti=document.getElementById('bb-doc-title');
  if(ti){ const A='Documento senza titolo', B='Untitled document'; if(lang==='en'&&ti.value===A) ti.value=B; else if(lang==='it'&&ti.value===B) ti.value=A; }
  if(!quiet) BB.emit('uilang',lang);
}
BB.on('init',()=>{
  const anchor=document.getElementById('bb-updates')||document.getElementById('bb-templates')||document.getElementById('bb-new'); if(!anchor) return;
  const btn=document.createElement('button'); btn.className='bb-menu-btn'; btn.id='bb-uilang'; btn.type='button'; btn.classList.add('bb-no-i18n');
  btn.textContent=lang==='en'?'IT':'EN'; btn.title=lang==='en'?'Passa all\'interfaccia in italiano':'Switch the interface to English';
  anchor.after(btn); btn.addEventListener('click',()=>set(lang==='en'?'it':'en'));
});
BB.on('ready',()=>{ if(lang==='en') set('en',true); });
BB.uiLang=()=>lang;
BB.I18N={set,get:()=>lang,tr:s=>(lang==='en'&&tr(String(s)))||s,apply};
})();
