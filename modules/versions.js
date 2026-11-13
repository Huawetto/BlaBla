/* Cronologia delle versioni: copie del documento salvate automaticamente (a intervalli e prima di operazioni
   che lo sostituiscono) o a mano, da cui ripristinare. Archivio IndexedDB separato dal salvataggio normale. */
(function(){
'use strict';
const {State,Pages,escapeHtml,toast}=BB;

const DB='blabla-versions', STORE='v';
const AUTO_EVERY_MS=10*60*1000;      // una versione automatica al massimo ogni 10 minuti
const KEEP_ALL_MS=24*3600*1000;      // nelle ultime 24 ore si tengono tutte (fino a MAX_RECENT)
const MAX_RECENT=60, KEEP_DAYS=30, MAX_BYTES=150*1024*1024;

let dbp=null, lastSig=null, lastAuto=0, busy=Promise.resolve();
function open(){
  return dbp||(dbp=new Promise((res,rej)=>{
    if(!window.indexedDB) return rej(new Error('IndexedDB non disponibile'));
    const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>{ const s=r.result.createObjectStore(STORE,{keyPath:'id'}); s.createIndex('t','t'); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  }));
}
const tx=async(mode,fn)=>{ const db=await open(); return new Promise((res,rej)=>{ const t=db.transaction(STORE,mode), st=t.objectStore(STORE); let out; try{ out=fn(st); }catch(e){ rej(e); return; } t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }); };
const all=async()=>{ const db=await open(); return new Promise((res,rej)=>{ const q=db.transaction(STORE,'readonly').objectStore(STORE).getAll(); q.onsuccess=()=>res(q.result||[]); q.onerror=()=>rej(q.error); }); };

function summary(json){
  let words=0,chars=0,pages=0,text='';
  try{
    const d=JSON.parse(json); pages=(d.pages||[]).length;
    const div=document.createElement('div');
    (d.pages||[]).forEach((h,i)=>{ div.innerHTML=BB.HtmlSanitizer.sanitize(h); const t=(div.textContent||'').replace(/\s+/g,' ').trim(); if(i===0) text=t.slice(0,120); chars+=t.length; words+=t?t.split(' ').length:0; });
  }catch(e){}
  return {words,chars,pages,text};
}
const sigOf=json=>json.length+':'+hash(json);
function hash(s){ let h=5381; const step=Math.max(1,Math.floor(s.length/4000)); for(let i=0;i<s.length;i+=step) h=((h<<5)+h+s.charCodeAt(i))|0; return h; }

/** Salva una versione. `kind`: 'auto' | 'manual' | 'safety'. Ritorna true se è stata creata. */
function save(json,label,kind){
  const sig=sigOf(json);
  if(kind!=='manual' && sig===lastSig) return Promise.resolve(false);     // nulla è cambiato dall'ultima versione
  lastSig=sig;
  const s=summary(json);
  const rec={id:Date.now()+'-'+Math.random().toString(36).slice(2,7),t:Date.now(),label:label||'',kind:kind||'auto',
    title:(document.getElementById('bb-doc-title')||{}).value||'',words:s.words,chars:s.chars,pages:s.pages,preview:s.text,size:json.length,json};
  busy=busy.then(()=>tx('readwrite',st=>st.put(rec))).then(()=>prune()).then(()=>true).catch(e=>{ console.warn('Cronologia non salvata',e); return false; });
  return busy;
}

async function prune(){
  const list=(await all()).sort((a,b)=>b.t-a.t), now=Date.now(), del=new Set();
  const autos=list.filter(v=>v.kind!=='manual');
  const recent=autos.filter(v=>now-v.t<KEEP_ALL_MS);
  recent.slice(MAX_RECENT).forEach(v=>del.add(v.id));
  const perDay=new Set();
  autos.filter(v=>now-v.t>=KEEP_ALL_MS).forEach(v=>{
    const day=new Date(v.t).toDateString();
    if(now-v.t>KEEP_DAYS*86400000 || perDay.has(day)) del.add(v.id); else perDay.add(day);
  });
  let total=list.filter(v=>!del.has(v.id)).reduce((n,v)=>n+v.size,0);
  for(let i=list.length-1;i>=0 && total>MAX_BYTES;i--){ const v=list[i]; if(!del.has(v.id)){ del.add(v.id); total-=v.size; } }
  if(del.size) await tx('readwrite',st=>{ del.forEach(id=>st.delete(id)); });
}

/* ------------------------- interfaccia ------------------------- */
const fmtDate=t=>{ try{ return new Date(t).toLocaleString((BB.uiLang&&BB.uiLang()==='en')?'en-GB':(document.documentElement.lang||'it'),{dateStyle:'medium',timeStyle:'short'}); }catch(e){ return new Date(t).toLocaleString(); } };
function ago(t){
  const m=Math.round((Date.now()-t)/60000);
  if(m<1) return 'adesso'; if(m<60) return m+' min fa'; const h=Math.round(m/60); if(h<24) return h+(h===1?' ora fa':' ore fa');
  const d=Math.round(h/24); return d+(d===1?' giorno fa':' giorni fa');
}
const KIND={manual:'Manuale',auto:'Automatica',safety:'Di sicurezza'};
async function openList(){
  let list=[]; try{ list=(await all()).sort((a,b)=>b.t-a.t); }catch(e){}
  const body=!list.length?'<div class="bb-hint">Non ci sono ancora versioni. Se ne crea una ogni 10 minuti di lavoro, prima di aprire un file o creare un nuovo documento, e quando premi «Salva versione».</div>':
    '<div class="bb-list" id="bb-ver-list">'+list.map(v=>'<div class="bb-list-item" data-id="'+v.id+'"><div style="min-width:0"><b>'+escapeHtml(v.label||KIND[v.kind]||'Versione')+'</b> · '+escapeHtml(ago(v.t))+
      '<small>'+escapeHtml(fmtDate(v.t))+' — '+v.pages+(v.pages===1?' pagina':' pagine')+', '+v.words+' parole'+(v.preview?' — «'+escapeHtml(v.preview.slice(0,60))+'…»':'')+'</small></div>'+
      '<div class="bb-btns"><button type="button" class="bb-mini-btn accent" data-act="restore">Ripristina</button><button type="button" class="bb-mini-btn" data-act="del" title="Elimina questa versione">✕</button></div></div>').join('')+'</div>';
  BB.Modal.open('Cronologia versioni',body+'<div class="bb-hint" style="margin-top:12px"><button type="button" class="bb-mini-btn" id="bb-ver-new">Salva la versione attuale</button></div>',null,'Chiudi',{wide:true,hideCancel:true});
  const root=document.getElementById('bb-modal-body');
  root.addEventListener('click',async e=>{
    if(e.target.id==='bb-ver-new'){ await saveManual(); BB.Modal.close(false); openList(); return; }
    const btn=e.target.closest('button[data-act]'); if(!btn) return;
    const id=btn.closest('[data-id]').dataset.id, v=list.find(x=>x.id===id); if(!v) return;
    if(btn.dataset.act==='del'){ await tx('readwrite',st=>st.delete(id)); BB.Modal.close(false); openList(); return; }
    if(btn.dataset.act==='restore'){
      const ok=await BB.Confirm.ask('Il documento attuale sarà sostituito dalla versione del '+fmtDate(v.t)+'. L\'attuale viene comunque salvato come versione, così puoi tornarci.',{title:'Ripristinare questa versione?',yesLabel:'Sì, ripristina'});
      if(!ok) return;
      await save(JSON.stringify(Pages.serialize()),'Prima del ripristino','safety');
      BB.History.suspended=true; try{ Pages.deserialize(JSON.parse(v.json)); }finally{ BB.History.suspended=false; }
      Pages.reflow(); BB.Stats.update(); BB.History.snapshot(); BB.Autosave.mark(); BB.Modal.close(false); toast('Versione ripristinata','ok');
    }
  });
}
async function saveManual(){
  const label=(document.getElementById('bb-doc-title')||{}).value||'';
  const ok=await save(JSON.stringify(Pages.serialize()),'Versione salvata a mano','manual');
  toast(ok?'Versione salvata':'Impossibile salvare la versione','ok'); return ok;
}

/* ------------------------- aggancio ------------------------- */
BB.on('init',()=>{
  BBUI.icon('ico-clock','<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>');
  BBUI.icon('ico-bookmark','<path d="M6 3h12v18l-6-4-6 4z"/>');
  BBUI.group('view','Versioni',[
    {id:'bb-ver-open',label:'Cronologia',icon:'ico-clock',title:'Versioni precedenti del documento',onClick:openList},
    {id:'bb-ver-save',label:'Salva versione',icon:'ico-bookmark',title:'Salva ora una copia del documento nella cronologia',onClick:saveManual}
  ]);
});
BB.on('ready',()=>{ lastAuto=Date.now(); try{ save(JSON.stringify(Pages.serialize()),'All\'apertura','auto'); }catch(e){} });
BB.on('saved',json=>{ if(Date.now()-lastAuto>=AUTO_EVERY_MS){ lastAuto=Date.now(); save(json,'','auto'); } });
BB.on('beforeReplace',label=>{ try{ save(JSON.stringify(Pages.serialize()),label,'safety'); }catch(e){} });
BB.Versions={save,list:all,openList,saveManual};
})();
