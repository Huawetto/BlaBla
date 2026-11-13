/* Helper comuni per i moduli: icone, gruppi del ribbon, campi dei pannelli. Richiede window.BB. */
(function(){
'use strict';
const BBUI = {
  /** Aggiunge un'icona (contenuto SVG 24x24, tratto currentColor) allo sprite dell'app. */
  icon(id,inner){
    const sprite=document.querySelector('body>svg');
    if(!sprite || document.getElementById(id)) return;
    sprite.insertAdjacentHTML('beforeend','<symbol id="'+id+'" viewBox="0 0 24 24">'+inner+'</symbol>');
  },
  /** Aggiunge un gruppo di pulsanti grandi a una scheda del ribbon.
      buttons: [{id,label,icon,title,onClick}] */
  group(panel,label,buttons){
    const p=document.querySelector('.bb-panel[data-panel="'+panel+'"]');
    if(!p) return null;
    const g=document.createElement('div'); g.className='bb-group';
    const body=document.createElement('div'); body.className='bb-group-body';
    buttons.forEach(b=>{
      const el=document.createElement('button'); el.type='button'; el.className='bb-btn big'; if(b.id) el.id=b.id;
      if(b.title) el.title=b.title;
      el.innerHTML='<svg class="bb-ico bb-big-ico"><use href="#'+b.icon+'"></use></svg>'+BB.escapeHtml(b.label);
      el.addEventListener('click',e=>{ e.preventDefault(); b.onClick(e); });
      body.appendChild(el);
    });
    const lab=document.createElement('div'); lab.className='bb-group-label'; lab.textContent=label;
    g.appendChild(body); g.appendChild(lab); p.appendChild(g);
    return g;
  },
  /** Aggiunge pulsanti a un gruppo già esistente cercandolo per etichetta. */
  addToGroup(panel,labelText,buttons){
    const p=document.querySelector('.bb-panel[data-panel="'+panel+'"]'); if(!p) return false;
    const g=[...p.querySelectorAll('.bb-group')].find(x=>{ const l=x.querySelector('.bb-group-label'); return l && l.textContent.trim()===labelText; });
    if(!g) return false;
    const body=g.querySelector('.bb-group-body');
    buttons.forEach(b=>{
      const el=document.createElement('button'); el.type='button'; el.className='bb-btn big'; if(b.id) el.id=b.id; if(b.title) el.title=b.title;
      el.innerHTML='<svg class="bb-ico bb-big-ico"><use href="#'+b.icon+'"></use></svg>'+BB.escapeHtml(b.label);
      el.addEventListener('click',e=>{ e.preventDefault(); b.onClick(e); }); body.appendChild(el);
    });
    return true;
  },
  /** Opzioni <option> da una lista [[valore,etichetta],...] */
  options(list,current){
    return list.map(([v,l])=>'<option value="'+BB.escapeHtml(v)+'"'+(String(v)===String(current)?' selected':'')+'>'+BB.escapeHtml(l)+'</option>').join('');
  },
  /** Testo aggiornato dopo una modifica al documento (undo, autosave, statistiche). */
  changed(){ BB.Autosave.mark(); BB.Stats.update(); BB.History.snapshot(); }
};
window.BBUI=BBUI;
})();
