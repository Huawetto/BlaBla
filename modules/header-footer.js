/* Intestazione, piè di pagina e numeri di pagina. Salvati nel .blab (meta.ext.hf) e stampati/esportati
   con il documento. Campi: {pagina} {pagine} {titolo} {data}. */
(function(){
'use strict';
const {State,Pages,escapeHtml,MM2PX}=BB;

const DEFAULT={ size:9, color:'#6b7280', hLine:false, fLine:false, skipFirst:false,
  header:{l:'',c:'',r:''}, footer:{l:'',c:'',r:''}, num:{pos:'',fmt:'n'} };
let cfg=clone(DEFAULT);
function clone(o){ return JSON.parse(JSON.stringify(o)); }

const FORMATS=[['n','1'],['pagina','Pagina 1'],['di','Pagina 1 di N'],['slash','1 / N'],['dash','- 1 -']];
const POS=[['','Nessuno'],['f-r','Piè di pagina — a destra'],['f-c','Piè di pagina — al centro'],['f-l','Piè di pagina — a sinistra'],
  ['h-r','Intestazione — a destra'],['h-c','Intestazione — al centro'],['h-l','Intestazione — a sinistra']];
const numText=f=>({n:'{pagina}',pagina:'Pagina {pagina}',di:'Pagina {pagina} di {pagine}',slash:'{pagina} / {pagine}',dash:'- {pagina} -'}[f]||'{pagina}');

function isActive(){
  const z=a=>a.l||a.c||a.r;
  return !!(z(cfg.header)||z(cfg.footer)||cfg.num.pos);
}
function fill(text,i,total){
  const lang=document.documentElement.lang||'it';
  const title=(document.getElementById('bb-doc-title')||{}).value||'';
  let date; try{ date=new Date().toLocaleDateString(lang); }catch(e){ date=new Date().toLocaleDateString(); }
  return String(text)
    .replace(/\{(pagina|page)\}/gi,i+1).replace(/\{(pagine|pages)\}/gi,total)
    .replace(/\{(titolo|title)\}/gi,()=>title).replace(/\{(data|date)\}/gi,date);
}
function zoneText(kind,z){            // kind 'h'|'f', z 'l'|'c'|'r'
  const free=(kind==='h'?cfg.header:cfg.footer)[z]||'';
  const hasNum=cfg.num.pos===kind+'-'+z;
  return hasNum?[free,numText(cfg.num.fmt)].filter(Boolean).join('   '):free;
}

function ensure(pg,cls){
  let d=pg.el.querySelector(':scope>.'+cls);
  if(!d){ d=document.createElement('div'); d.className='bb-hf '+cls; d.setAttribute('aria-hidden','true'); pg.el.appendChild(d); }
  return d;
}

function render(){
  const total=State.pages.length, m=State.margins;
  const active=isActive(), fs=cfg.size, fsMm=fs*0.3528;
  State.pages.forEach((pg,i)=>{
    const h=ensure(pg,'bb-hf-header'), f=ensure(pg,'bb-hf-footer');
    const show=active && !(cfg.skipFirst && i===0);
    [[h,'h',cfg.hLine,m.top,true],[f,'f',cfg.fLine,m.bottom,false]].forEach(([el,kind,line,margin,isTop])=>{
      const parts=['l','c','r'].map(z=>zoneText(kind,z));
      const any=show && parts.some(Boolean);
      el.style.display=any?'flex':'none';
      if(!any){ el.innerHTML=''; return; }
      el.innerHTML=parts.map((t,k)=>'<span class="'+'lcr'[k]+'">'+escapeHtml(fill(t,i,total))+'</span>').join('');
      el.classList.toggle('line',!!line);
      el.style.fontSize=fs+'pt'; el.style.color=cfg.color;
      el.style.paddingLeft=m.left*MM2PX+'px'; el.style.paddingRight=m.right*MM2PX+'px';
      el.style.setProperty('--hf-l',m.left*MM2PX+'px'); el.style.setProperty('--hf-r',m.right*MM2PX+'px');
      // il testo sta nel margine: a ~12 mm dal bordo, ma sempre dentro il margine disponibile
      const edge=Math.max(4,Math.min(12.5,margin-fsMm-5));
      el.style[isTop?'top':'bottom']=edge*MM2PX+'px';
      el.style[isTop?'bottom':'top']='auto';
    });
  });
}

/** Con intestazione/piè attivi il margine deve poterli contenere (≥ 18 mm). */
function ensureMargins(){
  const z=a=>a.l||a.c||a.r;
  const needTop=z(cfg.header)||/^h-/.test(cfg.num.pos), needBottom=z(cfg.footer)||/^f-/.test(cfg.num.pos);
  const m=Object.assign({},State.margins); let changed=false;
  if(needTop && m.top<18){ m.top=18; changed=true; }
  if(needBottom && m.bottom<18){ m.bottom=18; changed=true; }
  if(changed){ BB.PdfMedia.applyMargins(m); Pages.restyleAll(); BB.toast('Margini aumentati a 18 mm per fare spazio a intestazione/piè di pagina','ok'); }
}

function apply(next){
  cfg=Object.assign(clone(DEFAULT),next);
  ensureMargins(); render(); BBUI.changed();
}

/* ------------------------- interfaccia ------------------------- */
function tokenButtons(){
  return '<div class="bb-tokens" data-for="hf">'+[['{pagina}','Pagina'],['{pagine}','Totale pagine'],['{titolo}','Titolo'],['{data}','Data']]
    .map(([t,l])=>'<button type="button" data-tok="'+t+'">'+l+'</button>').join('')+'</div>';
}
function openMain(){
  const h=cfg.header, f=cfg.footer;
  const row=(kind,o)=>'<div class="bb-row">'+['l','c','r'].map((z,k)=>'<input type="text" data-z="'+kind+z+'" value="'+escapeHtml(o[z])+'" placeholder="'+['Sinistra','Centro','Destra'][k]+'" aria-label="'+(kind==='h'?'Intestazione':'Piè di pagina')+' '+['sinistra','centro','destra'][k]+'">').join('')+'</div>';
  const body='<h4>Intestazione</h4>'+row('h',h)+'<label class="bb-check"><input type="checkbox" id="bb-hf-hline"'+(cfg.hLine?' checked':'')+'> Linea sotto l\'intestazione</label>'+
    '<h4>Piè di pagina</h4>'+row('f',f)+'<label class="bb-check"><input type="checkbox" id="bb-hf-fline"'+(cfg.fLine?' checked':'')+'> Linea sopra il piè di pagina</label>'+
    tokenButtons()+'<div class="bb-hint">Clicca un campo per scriverci, poi un pulsante per inserire Pagina, Totale pagine, Titolo del documento o Data.</div>'+
    '<h4>Aspetto</h4><div class="bb-row two"><div><label for="bb-hf-size">Dimensione (pt)</label><select id="bb-hf-size">'+BBUI.options([8,9,10,11,12].map(x=>[x,x]),cfg.size)+'</select></div>'+
    '<div><label for="bb-hf-color">Colore</label><input type="color" id="bb-hf-color" value="'+cfg.color+'"></div></div>'+
    '<label class="bb-check"><input type="checkbox" id="bb-hf-skip"'+(cfg.skipFirst?' checked':'')+'> Non mostrare nella prima pagina</label>'+
    '<h4>Numero di pagina</h4><div class="bb-row two"><div><label for="bb-hf-numpos">Posizione</label><select id="bb-hf-numpos">'+BBUI.options(POS,cfg.num.pos)+'</select></div>'+
    '<div><label for="bb-hf-numfmt">Formato</label><select id="bb-hf-numfmt">'+BBUI.options(FORMATS,cfg.num.fmt)+'</select></div></div>';
  BB.Modal.open('Intestazione e piè di pagina',body,()=>{
    const v=id=>document.getElementById(id);
    const zone=k=>({l:document.querySelector('[data-z="'+k+'l"]').value,c:document.querySelector('[data-z="'+k+'c"]').value,r:document.querySelector('[data-z="'+k+'r"]').value});
    apply({ size:+v('bb-hf-size').value, color:v('bb-hf-color').value, hLine:v('bb-hf-hline').checked, fLine:v('bb-hf-fline').checked,
      skipFirst:v('bb-hf-skip').checked, header:zone('h'), footer:zone('f'), num:{pos:v('bb-hf-numpos').value,fmt:v('bb-hf-numfmt').value} });
  },'Applica',{wide:true});
  let last=null;
  const body_=document.getElementById('bb-modal-body');
  body_.addEventListener('focusin',e=>{ if(e.target.matches('[data-z]')) last=e.target; });
  body_.querySelector('.bb-tokens').addEventListener('click',e=>{
    const t=e.target.closest('[data-tok]'); if(!t) return;
    const inp=last||body_.querySelector('[data-z="fc"]'); const s=inp.selectionStart==null?inp.value.length:inp.selectionStart;
    inp.value=inp.value.slice(0,s)+t.dataset.tok+inp.value.slice(inp.selectionEnd==null?s:inp.selectionEnd); inp.focus();
  });
}
function openNumbers(){
  const body='<div class="bb-row two"><div><label for="bb-pn-pos">Posizione</label><select id="bb-pn-pos">'+BBUI.options(POS,cfg.num.pos||'f-c')+'</select></div>'+
    '<div><label for="bb-pn-fmt">Formato</label><select id="bb-pn-fmt">'+BBUI.options(FORMATS,cfg.num.fmt)+'</select></div></div>'+
    '<label class="bb-check"><input type="checkbox" id="bb-pn-skip"'+(cfg.skipFirst?' checked':'')+'> Non numerare la prima pagina</label>'+
    '<div class="bb-hint">Scegli «Nessuno» per togliere la numerazione.</div>';
  BB.Modal.open('Numeri di pagina',body,()=>{
    const n=clone(cfg); n.num={pos:document.getElementById('bb-pn-pos').value,fmt:document.getElementById('bb-pn-fmt').value}; n.skipFirst=document.getElementById('bb-pn-skip').checked;
    apply(n);
  },'Applica');
}

BB.on('init',()=>{
  BBUI.icon('ico-header','<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="4" y1="8" x2="20" y2="8"/><line x1="8" y1="5.5" x2="16" y2="5.5"/>');
  BBUI.icon('ico-hash','<line x1="9" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="15" y2="20"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="3" y1="15" x2="19" y2="15"/>');
  BBUI.group('insert','Pagina',[
    {id:'bb-ins-hf',label:'Intest./piè',icon:'ico-header',title:'Intestazione e piè di pagina',onClick:openMain},
    {id:'bb-ins-pn',label:'N. pagina',icon:'ico-hash',title:'Numeri di pagina',onClick:openNumbers}
  ]);
});
BB.extension('hf',()=>isActive()||cfg.size!==DEFAULT.size?clone(cfg):undefined,v=>{ cfg=Object.assign(clone(DEFAULT),v||{}); });
BB.on('renumber',render); BB.on('restyle',render); BB.on('deserialized',render); BB.on('ready',render);
const titleEl=()=>document.getElementById('bb-doc-title');
BB.on('init',()=>{ const t=titleEl(); if(t) t.addEventListener('input',()=>{ if(/\{(titolo|title)\}/i.test(JSON.stringify(cfg))) render(); }); });
BB.HeaderFooter={ get:()=>clone(cfg), set:apply, render, isActive, fill, zoneText, numText };
})();
