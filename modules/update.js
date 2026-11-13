/* Controllo aggiornamenti: chiede a GitHub qual è l'ultima release pubblicata e la confronta con la versione
   installata. Non scarica né installa nulla: mostra l'avviso e apre la pagina della release nel browser.
   Una volta al giorno al massimo, in silenzio se si è offline; si può spegnere dalla finestra «Aggiornamenti». */
(function(){
'use strict';
const {Modal,toast}=BB;
const REPO='Huawetto/BlaBla', API='https://api.github.com/repos/'+REPO+'/releases/latest', PAGE='https://github.com/'+REPO+'/releases';
const KEY='bb-update', DAY=24*3600*1000;
let cfg={enabled:true,last:0,latest:'',skip:''};
try{ Object.assign(cfg,JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){}
const save=()=>{ try{ localStorage.setItem(KEY,JSON.stringify(cfg)); }catch(e){} };
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const current=()=>String(window.BB_VERSION||'0');

function parse(v){ return String(v).replace(/^v/i,'').split(/[.+-]/).slice(0,3).map(n=>parseInt(n,10)||0); }
function newer(a,b){ const x=parse(a), y=parse(b); for(let i=0;i<3;i++){ if((x[i]||0)!==(y[i]||0)) return (x[i]||0)>(y[i]||0); } return false; }

async function fetchLatest(){
  const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),8000);
  try{
    const r=await fetch(API,{headers:{Accept:'application/vnd.github+json'},signal:ctl.signal,cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j=await r.json();
    return {tag:String(j.tag_name||''),url:String(j.html_url||PAGE),notes:String(j.body||'').slice(0,1500),name:String(j.name||j.tag_name||'')};
  } finally { clearTimeout(t); }
}
/** Restituisce {status:'new'|'current'|'error', ...}. */
async function check(){
  try{
    const l=await fetchLatest();
    cfg.last=Date.now(); cfg.latest=l.tag; save();
    return newer(l.tag,current())?Object.assign({status:'new'},l):Object.assign({status:'current'},l);
  }catch(e){ return {status:'error',error:String(e&&e.message||e)}; }
}
function openRelease(url){
  if(!/^https:\/\/github\.com\/Huawetto\/BlaBla\//.test(url)) url=PAGE;
  const api=window.pywebview&&window.pywebview.api;
  if(api&&api.open_url) api.open_url(url); else window.open(url,'_blank','noopener');
}

function show(res){
  const cur=current();
  let body;
  if(res&&res.status==='new'){
    body='<p><b>È disponibile BlaBla '+esc(res.tag.replace(/^v/i,''))+'</b> (hai la '+esc(cur)+').</p>'+(res.notes?'<pre class="bb-upd-notes">'+esc(res.notes)+'</pre>':'')+'<div class="bb-hint">Scarica l\'installatore dalla pagina della release: aggiorna il programma mantenendo documenti e font.</div>';
  }else if(res&&res.status==='current'){
    body='<p>Hai già l\'ultima versione ('+esc(cur)+').</p>';
  }else if(res&&res.status==='error'){
    body='<p>Non riesco a contattare GitHub (serve internet solo per questo controllo).</p><div class="bb-hint">'+esc(res.error)+'</div>';
  }else body='<p>Versione installata: <b>'+esc(cur)+'</b></p>';
  body+='<label class="bb-upd-opt"><input type="checkbox" id="bb-upd-auto"'+(cfg.enabled?' checked':'')+'> Controlla automaticamente ogni giorno</label>';
  const isNew=res&&res.status==='new';
  Modal.open('Aggiornamenti',body,()=>{ if(isNew){ openRelease(res.url); } else { run(true); return false; } },isNew?'Apri la pagina':'Controlla ora',{wide:true});
  const chk=document.getElementById('bb-upd-auto'); if(chk) chk.addEventListener('change',()=>{ cfg.enabled=chk.checked; save(); });
}
async function run(manual){
  if(manual) toast('Controllo aggiornamenti…');
  const res=await check();
  if(manual) show(res);
  else if(res.status==='new' && cfg.skip!==res.tag){
    cfg.skip=res.tag; save();
    toast('È disponibile BlaBla '+res.tag.replace(/^v/i,'')+' — apri «Aggiornamenti» per i dettagli','ok');
  }
  return res;
}

BB.on('init',()=>{
  BBUI.icon('ico-update','<path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><line x1="5" y1="20" x2="19" y2="20"/>');
  const anchor=document.getElementById('bb-templates')||document.getElementById('bb-new'); if(!anchor) return;
  const btn=document.createElement('button'); btn.className='bb-menu-btn'; btn.id='bb-updates'; btn.type='button'; btn.title='Versione e controllo aggiornamenti';
  btn.innerHTML='<svg class="bb-ico"><use href="#ico-update"></use></svg> Aggiornamenti';
  anchor.after(btn); btn.addEventListener('click',()=>show(null));
});
BB.on('ready',()=>{
  if(!cfg.enabled || !/^https?:$/.test(location.protocol) || navigator.onLine===false) return;
  if(Date.now()-cfg.last<DAY) return;
  setTimeout(()=>run(false),6000);               // dopo che l'app si è assestata
});
BB.Update={check,run,show,newer,current};
})();
