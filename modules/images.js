/* Immagini: disposizione rispetto al testo (in linea, a fianco, sopra e sotto, libera), testo alternativo,
   didascalie numerate e ritaglio. Si aggiunge alla barra che compare cliccando un'immagine. */
(function(){
'use strict';
const {State,Pages,Media,escapeHtml,toast,Modal}=BB;

/* ============================ disposizione ============================ */
const WRAPS=[
  ['inline','In linea con il testo','L\'immagine sta nella riga, come un carattere'],
  ['left','Testo a destra','Immagine a sinistra, il testo le scorre accanto'],
  ['right','Testo a sinistra','Immagine a destra, il testo le scorre accanto'],
  ['block','Sopra e sotto','Immagine centrata, il testo resta sopra e sotto'],
  ['free','Libera (sopra il testo)','Si sposta dove vuoi; il testo non la evita']
];
function wrapOf(img){
  const cs=getComputedStyle(img);
  if(img.style.position==='absolute') return 'free';
  if(cs.float==='left') return 'left'; if(cs.float==='right') return 'right';
  if(img.style.display==='block') return 'block';
  return 'inline';
}
function setWrap(img,mode){
  if(img.closest('td,th')){ toast('Dentro una tabella l\'immagine resta nella cella','err'); return; }
  const keepW=img.style.width;
  if(mode==='free'){ Media._freeFloat(img); }
  else{
    ['position','left','top','float','display','margin'].forEach(k=>img.style[k]='');
    if(mode==='left'){ img.style.float='left'; img.style.margin='4px 14px 6px 0'; }
    else if(mode==='right'){ img.style.float='right'; img.style.margin='4px 0 6px 14px'; }
    else if(mode==='block'){ img.style.display='block'; img.style.margin='10px auto'; }
  }
  if(keepW) img.style.width=keepW;
  Media._after(); Pages.reflow(); Media._positionToolbar(); Media._updateHandles();
}
function openProps(img){
  const cur=wrapOf(img);
  const body='<h4>Disposizione del testo</h4><div class="bb-wraplist">'+WRAPS.map(([id,n,d])=>'<label class="bb-wrap-opt"><input type="radio" name="bb-wrap" value="'+id+'"'+(id===cur?' checked':'')+'><span><b>'+escapeHtml(n)+'</b><small>'+escapeHtml(d)+'</small></span></label>').join('')+'</div>'+
    '<h4>Testo alternativo</h4><input id="bb-img-alt" type="text" maxlength="200" value="'+escapeHtml(img.getAttribute('alt')||'')+'" placeholder="Descrivi l\'immagine per chi non la vede (lettori di schermo)"><div class="bb-hint">Viene usato anche nel file Word e nel PDF.</div>';
  Modal.open('Proprietà immagine',body,()=>{
    const mode=(document.querySelector('input[name="bb-wrap"]:checked')||{}).value||cur;
    img.setAttribute('alt',document.getElementById('bb-img-alt').value.trim());
    if(mode!==cur) setWrap(img,mode); else BBUI.changed();
  },'Applica',{wide:true});
}

/* ============================ didascalie ============================ */
const CAP={it:'Figura',en:'Figure',es:'Figura',fr:'Figure',de:'Abbildung',pt:'Figura',nl:'Figuur',ca:'Figura',ro:'Figura',pl:'Rysunek'};
const capWord=()=>CAP[(BB.Language&&BB.Language.get().code)||'it']||'Figura';
const captions=()=>Array.from(document.querySelectorAll('.bb-page-content p.bb-caption'));
function renumberCaptions(){
  const w=capWord();
  captions().forEach((p,i)=>{ const l=p.querySelector('.bb-cap-label'); const t=w+' '+(i+1); if(l && l.textContent!==t) l.textContent=t; });
}
function topBlock(img){ let n=img; while(n && n.parentNode && !(n.parentNode.classList&&n.parentNode.classList.contains('bb-page-content'))) n=n.parentNode; return n; }
function addCaption(img){
  const anchor=topBlock(img); if(!anchor) return;
  let cap=anchor.nextElementSibling;
  if(!(cap && cap.classList.contains('bb-caption'))){
    cap=document.createElement('p'); cap.className='bb-caption';
    cap.innerHTML='<span class="bb-cap-label" contenteditable="false">'+capWord()+' 1</span>: Didascalia';
    anchor.after(cap);
  }
  renumberCaptions(); Pages.reflow(); BBUI.changed();
  // seleziona il testo "Didascalia" per sovrascriverlo subito
  const t=Array.from(cap.childNodes).find(n=>n.nodeType===3); if(t){ cap.closest('.bb-page-content').focus(); const r=document.createRange(); r.setStart(t,2); r.setEnd(t,t.length); const s=getSelection(); s.removeAllRanges(); s.addRange(r); }
}

/* ============================ ritaglio ============================ */
function openCrop(img){
  const src=img.getAttribute('src');
  if(!/^data:image\//.test(src||'')){ toast('Questa immagine non si può ritagliare','err'); return; }
  const body='<div class="bb-crop-wrap" id="bb-crop-wrap"><img id="bb-crop-img" src="'+src+'" alt="" draggable="false"><div id="bb-crop-box"><i data-h="nw"></i><i data-h="n"></i><i data-h="ne"></i><i data-h="e"></i><i data-h="se"></i><i data-h="s"></i><i data-h="sw"></i><i data-h="w"></i></div></div>'+
    '<div class="bb-row two" style="margin-top:10px"><div><label for="bb-crop-ratio">Proporzioni</label><select id="bb-crop-ratio"><option value="0">Libere</option><option value="1">1 : 1</option><option value="1.3333">4 : 3</option><option value="1.7778">16 : 9</option></select></div>'+
    '<div><label>&nbsp;</label><button type="button" class="bb-mini-btn" id="bb-crop-reset">Tutta l\'immagine</button></div></div>'+
    '<div class="bb-hint">Trascina il riquadro o i suoi bordi. Il ritaglio sostituisce l\'immagine nel documento (si può annullare con «Annulla»).</div>';
  Modal.open('Ritaglia immagine',body,()=>{ doCrop(img); },'Ritaglia',{wide:true});
  const wrap=document.getElementById('bb-crop-wrap'), im=document.getElementById('bb-crop-img'), box=document.getElementById('bb-crop-box');
  let R={x:0,y:0,w:0,h:0};
  const ratio=()=>+document.getElementById('bb-crop-ratio').value||0;
  const W=()=>im.clientWidth, H=()=>im.clientHeight;
  const paint=()=>{ box.style.left=R.x+'px'; box.style.top=R.y+'px'; box.style.width=R.w+'px'; box.style.height=R.h+'px'; box.dataset.rect=JSON.stringify(R); };
  const reset=()=>{ R={x:0,y:0,w:W(),h:H()}; const r=ratio(); if(r){ if(R.w/R.h>r){ R.w=R.h*r; R.x=(W()-R.w)/2; } else { R.h=R.w/r; R.y=(H()-R.h)/2; } } paint(); };
  im.addEventListener('load',reset); if(im.complete) reset();
  document.getElementById('bb-crop-ratio').addEventListener('change',reset);
  document.getElementById('bb-crop-reset').addEventListener('click',()=>{ document.getElementById('bb-crop-ratio').value='0'; reset(); });
  box.addEventListener('pointerdown',e=>{
    e.preventDefault(); const h=e.target.dataset&&e.target.dataset.h, sx=e.clientX, sy=e.clientY, o=Object.assign({},R); box.setPointerCapture(e.pointerId);
    const mv=ev=>{
      const dx=ev.clientX-sx, dy=ev.clientY-sy; let n=Object.assign({},o);
      if(!h){ n.x=Math.min(Math.max(0,o.x+dx),W()-o.w); n.y=Math.min(Math.max(0,o.y+dy),H()-o.h); }
      else{
        if(h.includes('w')){ n.x=Math.min(Math.max(0,o.x+dx),o.x+o.w-20); n.w=o.w+(o.x-n.x); }
        if(h.includes('e')){ n.w=Math.min(Math.max(20,o.w+dx),W()-o.x); }
        if(h.includes('n')){ n.y=Math.min(Math.max(0,o.y+dy),o.y+o.h-20); n.h=o.h+(o.y-n.y); }
        if(h.includes('s')){ n.h=Math.min(Math.max(20,o.h+dy),H()-o.y); }
        const r=ratio(); if(r){ if(h==='n'||h==='s'){ n.w=Math.min(n.h*r,W()-n.x); } else { n.h=Math.min(n.w/r,H()-n.y); if(h.includes('n')) n.y=o.y+o.h-n.h; } }
      }
      R=n; paint();
    };
    const up=()=>{ box.removeEventListener('pointermove',mv); box.removeEventListener('pointerup',up); };
    box.addEventListener('pointermove',mv); box.addEventListener('pointerup',up);
  });
}
function doCrop(img){
  const im=document.getElementById('bb-crop-img'), box=document.getElementById('bb-crop-box');
  const R=JSON.parse(box.dataset.rect||'null'); if(!R||!im.naturalWidth) return;
  const k=im.naturalWidth/im.clientWidth;
  const sx=Math.round(R.x*k), sy=Math.round(R.y*k), sw=Math.max(1,Math.round(R.w*k)), sh=Math.max(1,Math.round(R.h*k));
  if(sw>=im.naturalWidth-1 && sh>=im.naturalHeight-1) return;           // nessun ritaglio
  const c=document.createElement('canvas'); c.width=sw; c.height=sh; c.getContext('2d').drawImage(im,sx,sy,sw,sh,0,0,sw,sh);
  const png=/^data:image\/png/.test(img.getAttribute('src'));
  const url=c.toDataURL(png?'image/png':'image/jpeg',0.92);
  const dispW=img.offsetWidth||img.width, frac=R.w/im.clientWidth;
  img.setAttribute('src',url); img.style.width=Math.max(20,Math.round(dispW*frac))+'px'; img.style.height='auto';
  Media._after(); Pages.reflow(); Media._positionToolbar(); Media._updateHandles(); toast('Immagine ritagliata','ok');
}

/* ============================ integrazione ============================ */
const origSelect=Media.select;
Media.select=function(img){
  origSelect.call(this,img);
  const tb=document.getElementById('bb-img-toolbar'), del=tb.querySelector('button.danger');
  const mk=(label,fn,title)=>{ const b=document.createElement('button'); b.textContent=label; if(title) b.title=title; b.onclick=e=>{ e.preventDefault(); e.stopPropagation(); fn(); }; return b; };
  const extra=[mk('🧷 Disposizione…',()=>openProps(img),'Disposizione del testo e testo alternativo'),mk('🏷 Didascalia',()=>addCaption(img),'Aggiunge una didascalia numerata sotto l\'immagine'),mk('✂ Ritaglia',()=>openCrop(img),'Ritaglia l\'immagine')];
  extra.forEach(b=>tb.insertBefore(b,del)); Media._positionToolbar();
};
BB.on('renumber',renumberCaptions); BB.on('deserialized',renumberCaptions);
BB.Images={setWrap,wrapOf,addCaption,openCrop,renumberCaptions,WRAPS};
})();
