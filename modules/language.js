/* Lingua del documento e correttore ortografico. L'attributo lang delle pagine dice al motore del browser quale
   dizionario usare (tra quelli installati nel sistema); il correttore si può anche spegnere. */
(function(){
'use strict';
const {State}=BB;
const LANGS=[['it','Italiano'],['en','English'],['es','Español'],['fr','Français'],['de','Deutsch'],['pt','Português'],['nl','Nederlands'],['ca','Català'],['ro','Română'],['pl','Polski']];
let cfg={code:'it',spell:true};

function apply(){
  State.pages.forEach(p=>{
    const c=p.content;
    if(c.getAttribute('lang')!==cfg.code) c.setAttribute('lang',cfg.code);
    const sp=cfg.spell?'true':'false'; if(c.getAttribute('spellcheck')!==sp) c.setAttribute('spellcheck',sp);
  });
}
function set(next,quiet){
  cfg=Object.assign({},cfg,next); apply();
  const sel=document.getElementById('bb-lang-sel'), chk=document.getElementById('bb-spell-chk');
  if(sel) sel.value=cfg.code; if(chk) chk.checked=cfg.spell;
  if(!quiet){ BB.Autosave.mark(); BB.History.snapshot(); }
}

BB.on('init',()=>{
  const layout=document.querySelector('.bb-panel[data-panel="layout"]'); if(!layout) return;
  const g=document.createElement('div'); g.className='bb-group';
  g.innerHTML='<div class="bb-group-body"><div class="bb-group-rows"><div class="bb-group-row"><span class="bb-small" style="width:54px">Lingua</span><select class="bb-select" id="bb-lang-sel" aria-label="Lingua del documento">'+
    LANGS.map(([c,n])=>'<option value="'+c+'">'+n+'</option>').join('')+'</select></div>'+
    '<div class="bb-group-row"><label class="bb-small" style="display:flex;align-items:center;gap:6px;cursor:pointer" title="Sottolinea le parole sbagliate mentre scrivi, con i dizionari installati nel sistema"><input type="checkbox" id="bb-spell-chk" checked> Correttore ortografico</label></div></div></div><div class="bb-group-label">Lingua e correzione</div>';
  layout.appendChild(g);
  document.getElementById('bb-lang-sel').addEventListener('change',e=>set({code:e.target.value}));
  document.getElementById('bb-spell-chk').addEventListener('change',e=>set({spell:e.target.checked}));
});
BB.extension('lang',()=>(cfg.code!=='it'||!cfg.spell)?Object.assign({},cfg):undefined,v=>{ cfg=Object.assign({code:'it',spell:true},v||{}); if(!LANGS.some(l=>l[0]===cfg.code)) cfg.code='it'; });
BB.on('renumber',apply); BB.on('deserialized',()=>set({},true)); BB.on('ready',()=>set({},true));
BB.Language={get:()=>Object.assign({},cfg),set,LANGS};
})();
