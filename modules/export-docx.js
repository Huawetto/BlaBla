/* Esportazione in Word (.docx): costruisce il pacchetto OOXML direttamente dal documento mostrato
   nell'editor (stili calcolati dal browser), con JSZip. Supporta paragrafi e titoli, formattazione dei
   caratteri, elenchi, tabelle (celle unite, bordi, sfondi), immagini (in linea e flottanti), note a piè di
   pagina, intestazione/piè di pagina con numeri di pagina, formato e margini della pagina. */
(function(){
'use strict';
const {State,Pages,MM2PX,toast,showLoading,hideLoading}=BB;

const NS_W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const NS_A='http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC='http://schemas.openxmlformats.org/drawingml/2006/picture';
const ROOT_NS='xmlns:w="'+NS_W+'" xmlns:r="'+NS_R+'" xmlns:wp="'+NS_WP+'" xmlns:a="'+NS_A+'" xmlns:pic="'+NS_PIC+'"';

const TW=px=>Math.round(px*15);                     // px CSS -> twip
const HP=px=>Math.max(2,Math.round(px*1.5));        // px CSS -> mezzi punti
const EMU=px=>Math.max(1,Math.round(px*9525));
const esc=s=>String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const BLOCK=new Set(['P','DIV','H1','H2','H3','H4','H5','H6','UL','OL','LI','TABLE','BLOCKQUOTE','PRE','HR','FIGURE','FIGCAPTION','THEAD','TBODY','TFOOT','TR','TD','TH']);
const HEADING={H1:1,H2:2,H3:3,H4:4,H5:5,H6:6};

function cssColor(c){
  if(!c) return null;
  const m=/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c); if(!m) return null;
  if(m[4]!==undefined && parseFloat(m[4])===0) return null;
  return [m[1],m[2],m[3]].map(v=>('0'+(+v).toString(16)).slice(-2)).join('').toUpperCase();
}
function firstFamily(ff){
  const f=(ff||'').split(',')[0].replace(/["']/g,'').trim();
  const generic={'sans-serif':'Arial','serif':'Times New Roman','monospace':'Courier New','ui-monospace':'Consolas','system-ui':'Segoe UI','cursive':'Comic Sans MS'};
  return generic[f.toLowerCase()]||f;
}

/* ===================================================================== */
class Builder{
  constructor(){
    this.media=new Map();        // src -> {name,ext,bytes,rid}
    this.rels=[]; this.nextRid=20;
    this.nums=[];                // istanze numbering: {abs,start}
    this.foot=[]; this.docPr=1; this.prevAfter=0;
    this.root=null; this.rootCs=null;
  }
  rid(){ return 'rId'+(this.nextRid++); }
  /* ---------------- stili dei caratteri ---------------- */
  runProps(el,over){
    const cs=getComputedStyle(el), o=Object.assign({},over||{});
    if(parseInt(cs.fontWeight,10)>=600) o.b=1;
    if(cs.fontStyle==='italic'||cs.fontStyle==='oblique') o.i=1;
    let sizeEl=el;
    for(let e=el;e && e!==this.root && !BLOCK.has(e.tagName);e=e.parentElement){
      const c=getComputedStyle(e), dl=c.textDecorationLine||'';
      if(/underline/.test(dl)) o.u=1; if(/line-through/.test(dl)) o.s=1;
      if(!o.bg && e.tagName!=='TD' && !(e.classList&&e.classList.contains('bb-lowconf'))){ const bg=cssColor(c.backgroundColor); if(bg) o.bg=bg; }
      if(c.verticalAlign==='super') o.vert='superscript'; else if(c.verticalAlign==='sub') o.vert='subscript';
    }
    if(o.vert){ sizeEl=el; while(sizeEl && sizeEl!==this.root){ const v=getComputedStyle(sizeEl).verticalAlign; if(v!=='super'&&v!=='sub') break; sizeEl=sizeEl.parentElement; } sizeEl=sizeEl||el; }
    const scs=getComputedStyle(sizeEl);
    const px=parseFloat(scs.fontSize)||14;
    if(Math.abs(px-this.rootPx)>0.4) o.sz=HP(px);
    const fam=firstFamily(cs.fontFamily); if(fam && fam!==this.rootFam) o.font=fam;
    const col=cssColor(cs.color); if(col && col!==this.rootColor) o.color=col;
    if(/small-caps/.test(cs.fontVariantCaps||cs.fontVariant||'')) o.smallCaps=1;
    if(cs.textTransform==='uppercase') o.caps=1;
    const ls=parseFloat(cs.letterSpacing); if(ls) o.spacing=Math.round(ls*15);
    return o;
  }
  rPr(o,forceNoSize){
    if(!o) return '';
    let x='';
    if(o.font) x+='<w:rFonts w:ascii="'+esc(o.font)+'" w:hAnsi="'+esc(o.font)+'" w:cs="'+esc(o.font)+'"/>';
    if(o.b) x+='<w:b/><w:bCs/>'; if(o.i) x+='<w:i/><w:iCs/>';
    if(o.caps) x+='<w:caps/>'; if(o.smallCaps) x+='<w:smallCaps/>';
    if(o.s) x+='<w:strike/>';
    if(o.color) x+='<w:color w:val="'+o.color+'"/>';
    if(o.spacing) x+='<w:spacing w:val="'+o.spacing+'"/>';
    if(o.sz && !forceNoSize) x+='<w:sz w:val="'+o.sz+'"/><w:szCs w:val="'+o.sz+'"/>';
    if(o.u) x+='<w:u w:val="single"/>';
    if(o.bg) x+='<w:shd w:val="clear" w:color="auto" w:fill="'+o.bg+'"/>';
    if(o.vert) x+='<w:vertAlign w:val="'+o.vert+'"/>';
    return x?'<w:rPr>'+x+'</w:rPr>':'';
  }
  /* ---------------- contenuto in linea ---------------- */
  /** Raccoglie i "pezzi" in linea di una lista di nodi: testo, <br>, immagini, note. */
  collect(nodes,out,state,over){
    nodes.forEach(n=>{
      if(n.nodeType===3){
        let t=n.nodeValue; const pre=n.parentElement && /pre/.test(getComputedStyle(n.parentElement).whiteSpace);
        if(!pre){ t=t.replace(/[\t\n\r\f ]+/g,' '); if(state.space && t[0]===' ') t=t.slice(1); }
        if(!t) return;
        state.space=!pre && /\s$/.test(t);
        out.push({k:'t',t,p:this.runProps(n.parentElement||this.root,over),pre});
      } else if(n.nodeType===1){
        const tag=n.tagName;
        if(tag==='BR'){ out.push({k:'br'}); state.space=true; }
        else if(tag==='IMG'){ out.push({k:'img',el:n}); state.space=false; }
        else if(tag==='SUP' && n.hasAttribute('data-bb-fn')){ out.push({k:'fn',el:n}); state.space=false; }
        else if(BLOCK.has(tag)){ /* gestito dal chiamante */ }
        else this.collect(Array.from(n.childNodes),out,state,over);
      }
    });
  }
  renderRuns(pieces){
    // niente spazio finale e niente <br> finale (segnaposto di riga vuota)
    while(pieces.length && pieces[pieces.length-1].k==='br') pieces.pop();
    for(let i=pieces.length-1;i>=0;i--){ const p=pieces[i]; if(p.k==='t'&&!p.pre){ p.t=p.t.replace(/ +$/,''); if(p.t==='') {pieces.splice(i,1); continue;} } break; }
    let x='';
    pieces.forEach(p=>{
      if(p.k==='t'){
        const parts=p.t.split('\n');
        parts.forEach((seg,i)=>{ if(i>0) x+='<w:r><w:br/></w:r>'; if(seg!=='') x+='<w:r>'+this.rPr(p.p)+'<w:t xml:space="preserve">'+esc(seg)+'</w:t></w:r>'; });
      }
      else if(p.k==='br') x+='<w:r><w:br/></w:r>';
      else if(p.k==='img') x+=this.imageRun(p.el);
      else if(p.k==='fn') x+=this.footnoteRef(p.el);
    });
    return x;
  }
  footnoteRef(el){
    const id=this.foot.length+1; this.foot.push(el.getAttribute('data-bb-fn')||'');
    return '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="'+id+'"/></w:r>';
  }
  /* ---------------- immagini ---------------- */
  imageRun(img){
    const m=this.media.get(img.getAttribute('src')); if(!m) return '';
    const r=img.getBoundingClientRect(), cs=getComputedStyle(img);
    let w=r.width||img.width||100, h=r.height||img.height||100;
    const rid=m.rid||(m.rid=this.rid()), id=this.docPr++;
    const alt=esc(img.getAttribute('alt')||'');
    const gfx='<a:graphic><a:graphicData uri="'+NS_PIC+'"><pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="'+esc(m.name)+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rid+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+EMU(w)+'" cy="'+EMU(h)+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>';
    const docPr='<wp:docPr id="'+id+'" name="Immagine '+id+'" descr="'+alt+'"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>';
    const pos=cs.position, fl=cs.float;
    if(pos==='absolute'){
      const page=img.closest('.bb-page'), pr=page?page.getBoundingClientRect():{left:0,top:0};
      const left=r.left-pr.left, top=r.top-pr.top;
      return '<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="'+(251658240+id)+'" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>'+
        '<wp:positionH relativeFrom="page"><wp:posOffset>'+EMU(left)+'</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>'+EMU(top)+'</wp:posOffset></wp:positionV>'+
        '<wp:extent cx="'+EMU(w)+'" cy="'+EMU(h)+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>'+docPr+gfx+'</wp:anchor></w:drawing></w:r>';
    }
    if(fl==='left'||fl==='right'){
      const d=k=>EMU(parseFloat(cs['margin'+k])||0);
      return '<w:r><w:drawing><wp:anchor distT="'+d('Top')+'" distB="'+d('Bottom')+'" distL="'+d('Left')+'" distR="'+d('Right')+'" simplePos="0" relativeHeight="'+(251658240+id)+'" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="0"><wp:simplePos x="0" y="0"/>'+
        '<wp:positionH relativeFrom="margin"><wp:align>'+fl+'</wp:align></wp:positionH><wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>'+
        '<wp:extent cx="'+EMU(w)+'" cy="'+EMU(h)+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapSquare wrapText="bothSides"/>'+docPr+gfx+'</wp:anchor></w:drawing></w:r>';
    }
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+EMU(w)+'" cy="'+EMU(h)+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'+docPr+gfx+'</wp:inline></w:drawing></w:r>';
  }
  /* ---------------- paragrafi ---------------- */
  pPr(el,opt){
    opt=opt||{};
    const cs=getComputedStyle(el); let x='';
    if(opt.style) x+='<w:pStyle w:val="'+opt.style+'"/>';
    if(opt.keepNext) x+='<w:keepNext/>';
    if(opt.pageBreak) x+='<w:pageBreakBefore/>';
    if(opt.num) x+='<w:numPr><w:ilvl w:val="'+opt.num.lvl+'"/><w:numId w:val="'+opt.num.id+'"/></w:numPr>';
    if(opt.border) x+=opt.border;
    const mt=parseFloat(cs.marginTop)||0, mb=parseFloat(cs.marginBottom)||0;
    const before=Math.max(0,mt-this.prevAfter); this.prevAfter=mb;
    let sp='<w:spacing w:before="'+TW(before)+'" w:after="'+TW(mb)+'"';
    const lh=parseFloat(cs.lineHeight), fs=parseFloat(cs.fontSize)||14;
    if(lh && cs.lineHeight!=='normal') sp+=' w:line="'+Math.round(lh/fs*240)+'" w:lineRule="auto"';
    x+=sp+'/>';
    let left=(parseFloat(cs.marginLeft)||0)+(opt.extraLeft||0), right=parseFloat(cs.marginRight)||0, first=parseFloat(cs.textIndent)||0;
    if(opt.num){ left=0; first=0; }
    if(left||right||first){ x+='<w:ind w:left="'+TW(left)+'" w:right="'+TW(right)+'"'+(first>0?' w:firstLine="'+TW(first)+'"':'')+(first<0?' w:hanging="'+TW(-first)+'"':'')+'/>'; }
    const ta=cs.textAlign; const jc={center:'center',right:'right',end:'right',justify:'both'}[ta];
    if(jc) x+='<w:jc w:val="'+jc+'"/>';
    return x?'<w:pPr>'+x+'</w:pPr>':'';
  }
  paragraph(el,nodes,opt){
    opt=opt||{};
    const pieces=[], state={space:true};
    this.collect(nodes,pieces,state,opt.over);
    return '<w:p>'+this.pPr(el,opt)+this.renderRuns(pieces)+'</w:p>';
  }
  /* ---------------- blocchi ---------------- */
  /** Converte i figli di `parent` (nodi di blocco e in linea) in XML di blocchi. */
  blocks(parent,opt){
    opt=opt||{};
    const out=[]; let buf=[];
    const flush=()=>{
      if(!buf.length) return;
      const meaningful=buf.some(n=>n.nodeType===1 || (n.nodeType===3 && n.nodeValue.trim()));
      if(meaningful) out.push(this.paragraph(parent,buf,Object.assign({},opt,{pageBreak:false}))); buf=[];
    };
    Array.from(parent.childNodes).forEach(n=>{
      if(n.nodeType===1 && BLOCK.has(n.tagName)){ flush(); out.push(...this.block(n,opt)); }
      else if(n.nodeType===1 && n.tagName==='IMG' && getComputedStyle(n).position==='absolute'){ flush(); out.push('<w:p>'+this.imageRun(n)+'</w:p>'); }
      else if(n.nodeType===1||n.nodeType===3) buf.push(n);
    });
    flush();
    return out;
  }
  block(el,opt){
    opt=opt||{}; const tag=el.tagName;
    const pb=el.hasAttribute('data-bb-pgstart');
    if(el.classList && el.classList.contains('bb-toc')) return this.toc(el,pb);
    if(tag==='TABLE') return [this.table([el],pb)];
    if(tag==='UL'||tag==='OL') return this.list(el,0,pb);
    if(tag==='HR') return ['<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr></w:pPr></w:p>'];
    if(tag==='BLOCKQUOTE'){
      const cs=getComputedStyle(el), col=cssColor(cs.borderLeftColor)||'2563EB', pad=parseFloat(cs.paddingLeft)||14;
      const border='<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="'+col+'"/></w:pBdr>';
      const kids=Array.from(el.children).some(c=>BLOCK.has(c.tagName));
      if(kids){ const r=this.blocks(el,Object.assign({},opt,{border,extraLeft:pad})); return r; }
      return [this.paragraph(el,Array.from(el.childNodes),Object.assign({},opt,{border,extraLeft:pad,pageBreak:pb}))];
    }
    if(tag==='PRE'){
      return [this.paragraph(el,Array.from(el.childNodes),Object.assign({},opt,{pageBreak:pb,over:{font:'Courier New'}}))];
    }
    if(tag==='FIGURE'||(tag==='DIV' && Array.from(el.children).some(c=>BLOCK.has(c.tagName)))){
      const r=this.blocks(el,opt); if(pb && r.length) r[0]=r[0].replace(/^<w:p>(<w:pPr>)?/,(m,a)=>a?'<w:p><w:pPr><w:pageBreakBefore/>':'<w:p><w:pPr><w:pageBreakBefore/></w:pPr>'); return r;
    }
    if(tag==='FIGCAPTION') return [this.paragraph(el,Array.from(el.childNodes),Object.assign({},opt,{style:'Caption'}))];
    if(tag==='LI') return [this.paragraph(el,Array.from(el.childNodes),Object.assign({},opt,{pageBreak:pb}))];
    if(HEADING[tag]) return [this.paragraph(el,Array.from(el.childNodes),Object.assign({},opt,{style:'Heading'+HEADING[tag],keepNext:true,pageBreak:pb}))];
    if(tag==='TR'||tag==='TD'||tag==='TH'||tag==='THEAD'||tag==='TBODY'||tag==='TFOOT') return this.blocks(el,opt);
    // P e DIV "di testo" (le didascalie usano lo stile Caption di Word)
    return [this.paragraph(el,Array.from(el.childNodes),Object.assign({},opt,{pageBreak:pb,style:(el.classList&&el.classList.contains('bb-caption'))?'Caption':undefined}))];
  }
  /** Sommario: campo TOC di Word con i risultati già calcolati (si aggiorna con F9 / «Aggiorna campo»). */
  toc(el,pb){
    const lines=Array.from(el.querySelectorAll('.bb-toc-line[data-bb-i]')), out=[];
    const title=el.querySelector('.bb-toc-title');
    if(title) out.push('<w:p><w:pPr><w:pStyle w:val="TOCHeading"/>'+(pb?'<w:pageBreakBefore/>':'')+'</w:pPr><w:r><w:t xml:space="preserve">'+esc(title.textContent)+'</w:t></w:r></w:p>');
    if(!lines.length) return out;
    const tabs='<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="'+this.textW+'"/></w:tabs>';
    lines.forEach((ln,i)=>{
      const lvl=ln.classList.contains('lvl3')?3:ln.classList.contains('lvl2')?2:1;
      const t=ln.querySelector('.t').textContent, n=ln.querySelector('.n').textContent;
      let x='<w:p><w:pPr><w:pStyle w:val="TOC'+lvl+'"/>'+tabs+'</w:pPr>';
      if(i===0) x+='<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
      x+='<w:r><w:t xml:space="preserve">'+esc(t)+'</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>'+esc(n)+'</w:t></w:r>';
      if(i===lines.length-1) x+='<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      out.push(x+'</w:p>');
    });
    this.prevAfter=0;
    return out;
  }
  /* ---------------- elenchi ---------------- */
  list(el,lvl,pb){
    const ordered=el.tagName==='OL';
    const id=this.newNum(ordered,parseInt(el.getAttribute('start'),10)||1,lvl);
    const out=[]; let first=true;
    Array.from(el.children).forEach(li=>{
      if(li.tagName!=='LI'){ if(li.tagName==='UL'||li.tagName==='OL') out.push(...this.list(li,Math.min(lvl+1,8),false)); return; }
      const inline=[], nested=[];
      Array.from(li.childNodes).forEach(n=>{ if(n.nodeType===1 && (n.tagName==='UL'||n.tagName==='OL')) nested.push(n); else inline.push(n); });
      // blocchi dentro <li> (p, div): ognuno diventa un paragrafo; il primo porta il numero
      const hasBlock=inline.some(n=>n.nodeType===1 && BLOCK.has(n.tagName));
      if(hasBlock){
        let firstP=true, buf=[];
        const flush=()=>{ if(buf.some(n=>n.nodeType===1||(n.nodeType===3&&n.nodeValue.trim()))){ out.push(this.paragraph(li,buf,{num:firstP?{id,lvl}:null,pageBreak:pb&&first,extraLeft:firstP?0:36*(lvl+1)/2*2})); firstP=false; first=false; } buf=[]; };
        inline.forEach(n=>{ if(n.nodeType===1&&BLOCK.has(n.tagName)){ flush(); out.push(this.paragraph(n,Array.from(n.childNodes),{num:firstP?{id,lvl}:null,pageBreak:pb&&first})); firstP=false; first=false; } else buf.push(n); });
        flush();
      } else { out.push(this.paragraph(li,inline,{num:{id,lvl},pageBreak:pb&&first})); first=false; }
      nested.forEach(nl=>out.push(...this.list(nl,Math.min(lvl+1,8),false)));
    });
    return out;
  }
  newNum(ordered,start,lvl){
    if(!ordered) return 1;                        // numId 1 = punti elenco (condiviso)
    this.nums.push({start,lvl}); return 1+this.nums.length;     // numId 2.. = elenchi numerati, ognuno riparte
  }
  /* ---------------- tabelle ---------------- */
  table(parts,pb){
    const t=parts[0], rows=[];
    parts.forEach(tb=>Array.from(tb.rows).forEach(r=>rows.push(r)));
    if(!rows.length) return '';
    const tr0=t.getBoundingClientRect();
    // colonne della griglia: bordi sinistri/destri di tutte le celle (copre colspan e larghezze libere)
    const edges=[]; const addEdge=v=>{ if(!edges.some(e=>Math.abs(e-v)<1.6)) edges.push(v); };
    rows.forEach(r=>Array.from(r.cells).forEach(c=>{ const b=c.getBoundingClientRect(); addEdge(b.left); addEdge(b.right); }));
    edges.sort((a,b)=>a-b);
    const colOf=v=>{ let k=0,bd=1e9; edges.forEach((e,i)=>{ const d=Math.abs(e-v); if(d<bd){ bd=d; k=i; } }); return k; };
    const ncol=Math.max(1,edges.length-1);
    const widths=[]; for(let i=0;i<ncol;i++) widths.push(Math.max(1,edges[i+1]-edges[i]));
    const slots=rows.map(()=>new Array(ncol).fill(null));
    rows.forEach((r,ri)=>Array.from(r.cells).forEach(c=>{
      const b=c.getBoundingClientRect(), c0=colOf(b.left), c1=Math.max(c0+1,colOf(b.right)), rs=Math.max(1,c.rowSpan||1);
      for(let rr=ri;rr<Math.min(rows.length,ri+rs);rr++) for(let cc=c0;cc<c1&&cc<ncol;cc++) if(!slots[rr][cc]) slots[rr][cc]={c,c0,c1,rs,first:rr===ri&&cc===c0,cont:rr>ri};
    }));
    const total=widths.reduce((a,b)=>a+b,0), tcs=getComputedStyle(t);
    let x='<w:tbl><w:tblPr><w:tblW w:w="'+TW(total)+'" w:type="dxa"/>'+
      '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="'+TW(parseFloat(getComputedStyle(rows[0].cells[0]||t).paddingLeft)||0)+'" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="'+TW(parseFloat(getComputedStyle(rows[0].cells[0]||t).paddingRight)||0)+'" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr>';
    x+='<w:tblGrid>'+widths.map(w=>'<w:gridCol w:w="'+TW(w)+'"/>').join('')+'</w:tblGrid>';
    const saved=this.prevAfter;
    rows.forEach((r,ri)=>{
      const rb=r.getBoundingClientRect();
      x+='<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="'+TW(rb.height)+'" w:hRule="atLeast"/></w:trPr>';
      let cc=0;
      while(cc<ncol){
        const sl=slots[ri][cc];
        if(!sl){ x+='<w:tc><w:tcPr><w:tcW w:w="'+TW(widths[cc])+'" w:type="dxa"/></w:tcPr><w:p/></w:tc>'; cc++; continue; }
        const span=sl.c1-sl.c0; let w=0; for(let k=sl.c0;k<sl.c1&&k<ncol;k++) w+=widths[k];
        if(sl.cont){
          x+='<w:tc><w:tcPr><w:tcW w:w="'+TW(w)+'" w:type="dxa"/>'+(span>1?'<w:gridSpan w:val="'+span+'"/>':'')+'<w:vMerge/></w:tcPr><w:p/></w:tc>';
        } else {
          const cell=sl.c, cs=getComputedStyle(cell);
          let pr='<w:tcW w:w="'+TW(w)+'" w:type="dxa"/>'+(span>1?'<w:gridSpan w:val="'+span+'"/>':'')+(sl.rs>1?'<w:vMerge w:val="restart"/>':'');
          const side=(n,css)=>{ const bw=parseFloat(cs['border'+css+'Width'])||0, st=cs['border'+css+'Style']; if(!bw||st==='none'||st==='hidden') return '<w:'+n+' w:val="nil"/>';
            return '<w:'+n+' w:val="single" w:sz="'+Math.max(2,Math.round(bw*6))+'" w:space="0" w:color="'+(cssColor(cs['border'+css+'Color'])||'000000')+'"/>'; };
          pr+='<w:tcBorders>'+side('top','Top')+side('left','Left')+side('bottom','Bottom')+side('right','Right')+'</w:tcBorders>';
          let bg=cssColor(cs.backgroundColor); if(!bg){ const rbg=cssColor(getComputedStyle(r).backgroundColor); if(rbg) bg=rbg; }
          if(bg) pr+='<w:shd w:val="clear" w:color="auto" w:fill="'+bg+'"/>';
          pr+='<w:tcMar><w:top w:w="'+TW(parseFloat(cs.paddingTop)||0)+'" w:type="dxa"/><w:left w:w="'+TW(parseFloat(cs.paddingLeft)||0)+'" w:type="dxa"/><w:bottom w:w="'+TW(parseFloat(cs.paddingBottom)||0)+'" w:type="dxa"/><w:right w:w="'+TW(parseFloat(cs.paddingRight)||0)+'" w:type="dxa"/></w:tcMar>';
          const va=cs.verticalAlign; if(va==='middle') pr+='<w:vAlign w:val="center"/>'; else if(va==='bottom') pr+='<w:vAlign w:val="bottom"/>';
          this.prevAfter=0;
          let inner=this.blocks(cell,{}); if(!inner.length) inner=['<w:p/>'];
          if(pb && ri===0 && cc===0) inner[0]=inner[0].replace(/^<w:p>(<w:pPr>)?/,(m,a)=>a?'<w:p><w:pPr><w:pageBreakBefore/>':'<w:p><w:pPr><w:pageBreakBefore/></w:pPr>');
          x+='<w:tc><w:tcPr>'+pr+'</w:tcPr>'+inner.join('')+'</w:tc>';
        }
        cc=Math.max(cc+1,sl.c1);
      }
      x+='</w:tr>';
    });
    this.prevAfter=saved;
    return x+'</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>';
  }
}

/* ===================================================================== */
function dataToBytes(src){
  const m=/^data:([^;,]+)(;base64)?,(.*)$/s.exec(src); if(!m) return null;
  let bin; try{ bin=m[2]?atob(m[3]):decodeURIComponent(m[3]); }catch(e){ return null; }
  const b=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i)&255;
  return {mime:m[1].toLowerCase(),bytes:b};
}
async function toPng(src){
  return new Promise(res=>{
    const im=new Image(); im.onload=()=>{ const c=document.createElement('canvas'); c.width=im.naturalWidth||1; c.height=im.naturalHeight||1; c.getContext('2d').drawImage(im,0,0);
      c.toBlob(async b=>res(b?new Uint8Array(await b.arrayBuffer()):null),'image/png'); }; im.onerror=()=>res(null); im.src=src;
  });
}
async function prepareMedia(builder,imgs){
  let n=0;
  for(const img of imgs){
    const src=img.getAttribute('src'); if(!src || builder.media.has(src)) continue;
    const d=dataToBytes(src); if(!d) continue;
    let ext={'image/png':'png','image/jpeg':'jpeg','image/jpg':'jpeg','image/gif':'gif'}[d.mime], bytes=d.bytes;
    if(!ext){ const png=await toPng(src); if(!png) continue; ext='png'; bytes=png; }
    builder.media.set(src,{name:'image'+(++n)+'.'+ext,ext,bytes,rid:null});
  }
}

/* ---------------- parti accessorie ---------------- */
function stylesXml(b){
  const heading=(n,sz)=>'<w:style w:type="paragraph" w:styleId="Heading'+n+'"><w:name w:val="heading '+n+'"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:outlineLvl w:val="'+(n-1)+'"/></w:pPr></w:style>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="'+NS_W+'"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="'+esc(b.rootFam)+'" w:hAnsi="'+esc(b.rootFam)+'" w:cs="'+esc(b.rootFam)+'"/><w:sz w:val="'+HP(b.rootPx)+'"/><w:szCs w:val="'+HP(b.rootPx)+'"/><w:lang w:val="'+esc(document.documentElement.lang||'it-IT')+'"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'+
    [1,2,3,4,5,6].map(n=>heading(n)).join('')+
    '<w:style w:type="paragraph" w:styleId="TOCHeading"><w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="200"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>'+
    [1,2,3].map(n=>'<w:style w:type="paragraph" w:styleId="TOC'+n+'"><w:name w:val="toc '+n+'"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:spacing w:after="60"/><w:ind w:left="'+((n-1)*220)+'"/></w:pPr></w:style>').join('')+
    '<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:i/><w:sz w:val="20"/></w:rPr></w:style>'+
    '<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/></w:style>'+
    '<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>'+
    '<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="18"/></w:rPr></w:style>'+
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>';
}
function numberingXml(b){
  const lvls=(ordered)=>{ let x=''; for(let l=0;l<9;l++){
      const fmt=ordered?['decimal','lowerLetter','lowerRoman'][l%3]:'bullet', txt=ordered?'%'+(l+1)+'.':['•','o','▪'][l%3];
      x+='<w:lvl w:ilvl="'+l+'"><w:start w:val="1"/><w:numFmt w:val="'+fmt+'"/><w:lvlText w:val="'+esc(txt)+'"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="'+(720*(l+1))+'" w:hanging="360"/></w:pPr>'+(ordered?'':'<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr>')+'</w:lvl>'; } return x; };
  let x='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="'+NS_W+'"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>'+lvls(false)+'</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>'+lvls(true)+'</w:abstractNum>';
  x+='<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
  b.nums.forEach((n,i)=>{ x+='<w:num w:numId="'+(i+2)+'"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="'+n.lvl+'"><w:startOverride w:val="'+n.start+'"/></w:lvlOverride></w:num>'; });
  return x+'</w:numbering>';
}
function footnotesXml(b){
  let x='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="'+NS_W+'"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>';
  b.foot.forEach((t,i)=>{ x+='<w:footnote w:id="'+(i+1)+'"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> '+esc(t)+'</w:t></w:r></w:p></w:footnote>'; });
  return x+'</w:footnotes>';
}
/** Intestazione o piè di pagina: tre zone allineate con tabulazioni (sinistra | centro | destra). */
function hfXml(kind,textW){
  const HF=BB.HeaderFooter; if(!HF) return null;
  const cfg=HF.get(); const zones=['l','c','r'].map(z=>HF.zoneText(kind==='hdr'?'h':'f',z));
  if(!zones.some(Boolean)) return null;
  const total=State.pages.length, title=(document.getElementById('bb-doc-title')||{}).value||'';
  const sz='<w:sz w:val="'+(cfg.size*2)+'"/><w:szCs w:val="'+(cfg.size*2)+'"/>', col=(cfg.color||'#6b7280').replace('#','').toUpperCase();
  const rp='<w:rPr><w:color w:val="'+col+'"/>'+sz+'</w:rPr>';
  const run=t=>t?'<w:r>'+rp+'<w:t xml:space="preserve">'+esc(t)+'</w:t></w:r>':'';
  const field=(instr,val)=>'<w:fldSimple w:instr=" '+instr+' "><w:r>'+rp+'<w:t>'+val+'</w:t></w:r></w:fldSimple>';
  const zoneRuns=text=>{
    let x='', last=0; const re=/\{(pagina|page|pagine|pages|titolo|title|data|date)\}/gi; let m;
    while((m=re.exec(text))){ x+=run(text.slice(last,m.index)); const k=m[1].toLowerCase();
      if(k==='pagina'||k==='page') x+=field('PAGE','1'); else if(k==='pagine'||k==='pages') x+=field('NUMPAGES',String(total));
      else if(k==='titolo'||k==='title') x+=run(title); else x+=run(new Date().toLocaleDateString(document.documentElement.lang||'it')); last=m.index+m[0].length; }
    return x+run(text.slice(last));
  };
  const line=kind==='hdr'?cfg.hLine:cfg.fLine;
  const border=line?'<w:pBdr><w:'+(kind==='hdr'?'bottom':'top')+' w:val="single" w:sz="4" w:space="4" w:color="'+col+'"/></w:pBdr>':'';
  const body='<w:p><w:pPr><w:pStyle w:val="'+(kind==='hdr'?'Header':'Footer')+'"/>'+border+'<w:tabs><w:tab w:val="center" w:pos="'+Math.round(textW/2)+'"/><w:tab w:val="right" w:pos="'+textW+'"/></w:tabs></w:pPr>'+zoneRuns(zones[0])+'<w:r><w:tab/></w:r>'+zoneRuns(zones[1])+'<w:r><w:tab/></w:r>'+zoneRuns(zones[2])+'</w:p>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:'+kind+' '+ROOT_NS+'>'+body+'</w:'+kind+'>';
}

/* ---------------- documento ---------------- */
async function buildDocx(){
  const b=new Builder();
  const pages=State.pages.map(p=>p.content);
  b.root=pages[0]; const rcs=getComputedStyle(b.root);
  b.rootPx=parseFloat(rcs.fontSize)||14; b.rootFam=firstFamily(rcs.fontFamily)||'Calibri'; b.rootColor=cssColor(rcs.color);
  const imgs=[]; pages.forEach(c=>c.querySelectorAll('img').forEach(i=>imgs.push(i)));
  await prepareMedia(b,imgs);
  /* blocchi di primo livello di tutte le pagine, riunendo ciò che l'impaginazione ha spezzato tra due pagine */
  const top=[];
  pages.forEach((c,pi)=>Array.from(c.children).forEach((el,k)=>{
    const prev=top[top.length-1];
    if(el.hasAttribute('data-bb-cont') && prev && prev.tag===el.tagName && !el.hasAttribute('data-bb-pgstart')){ prev.parts.push(el); return; }
    top.push({tag:el.tagName,parts:[el]});
  }));
  /* pagina */
  const {w,h}=Pages.dims(), land=w>h, m=State.margins, tw=mm=>Math.round(mm*56.6929);
  const hf=BB.HeaderFooter, cfg=hf?hf.get():null;
  const pageW=tw(w), pageH=tw(h), contentW=pageW-tw(m.left)-tw(m.right);
  b.textW=contentW;
  const body=[];
  top.forEach(blk=>{
    const el=blk.parts[0];
    if(blk.tag==='TABLE'){ body.push(b.table(blk.parts,el.hasAttribute('data-bb-pgstart'))); return; }
    if(blk.parts.length>1){          // paragrafo spezzato tra due pagine: si riuniscono i contenuti in un solo paragrafo
      const nodes=[]; blk.parts.forEach(pt=>Array.from(pt.childNodes).forEach(n=>nodes.push(n)));
      const pb=el.hasAttribute('data-bb-pgstart');
      if(HEADING[blk.tag]) body.push(b.paragraph(el,nodes,{style:'Heading'+HEADING[blk.tag],keepNext:true,pageBreak:pb}));
      else body.push(b.paragraph(el,nodes,{pageBreak:pb}));
      return;
    }
    if(el.tagName==='IMG' || (el.nodeType===1 && !BLOCK.has(el.tagName))){
      // elementi in linea al primo livello: raggruppati in un paragrafo
      body.push(b.paragraph(pages[0],[el],{})); return;
    }
    body.push(...b.block(el,{}));
  });
  const hdr=hfXml('hdr',contentW), ftr=hfXml('ftr',contentW);
  const parts={};
  let sect='';
  if(hdr){ parts['word/header1.xml']=hdr; b.rels.push({id:'rIdH1',type:'header',target:'header1.xml'}); sect+='<w:headerReference w:type="default" r:id="rIdH1"/>'; }
  if(ftr){ parts['word/footer1.xml']=ftr; b.rels.push({id:'rIdF1',type:'footer',target:'footer1.xml'}); sect+='<w:footerReference w:type="default" r:id="rIdF1"/>'; }
  sect+='<w:pgSz w:w="'+pageW+'" w:h="'+pageH+'"'+(land?' w:orient="landscape"':'')+'/><w:pgMar w:top="'+tw(m.top)+'" w:right="'+tw(m.right)+'" w:bottom="'+tw(m.bottom)+'" w:left="'+tw(m.left)+'" w:header="'+tw(Math.min(12.5,m.top/2))+'" w:footer="'+tw(Math.min(12.5,m.bottom/2))+'" w:gutter="0"/>';
  if(cfg && cfg.skipFirst && (hdr||ftr)) sect+='<w:titlePg/>';
  const doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document '+ROOT_NS+'><w:body>'+body.join('')+'<w:sectPr>'+sect+'</w:sectPr></w:body></w:document>';
  parts['word/document.xml']=doc;
  parts['word/styles.xml']=stylesXml(b);
  parts['word/numbering.xml']=numberingXml(b);
  if(b.foot.length) parts['word/footnotes.xml']=footnotesXml(b);
  parts['word/settings.xml']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="'+NS_W+'"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
  /* relazioni */
  let rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="'+NS_R+'/styles" Target="styles.xml"/><Relationship Id="rId2" Type="'+NS_R+'/numbering" Target="numbering.xml"/><Relationship Id="rId3" Type="'+NS_R+'/settings" Target="settings.xml"/>'+
    (b.foot.length?'<Relationship Id="rId4" Type="'+NS_R+'/footnotes" Target="footnotes.xml"/>':'');
  b.rels.forEach(r=>{ rels+='<Relationship Id="'+r.id+'" Type="'+NS_R+'/'+r.type+'" Target="'+r.target+'"/>'; });
  b.media.forEach(m=>{ if(m.rid) rels+='<Relationship Id="'+m.rid+'" Type="'+NS_R+'/image" Target="media/'+m.name+'"/>'; });
  parts['word/_rels/document.xml.rels']=rels+'</Relationships>';
  /* tipi di contenuto e proprietà */
  const exts=new Set(); b.media.forEach(m=>{ if(m.rid) exts.add(m.ext); });
  parts['[Content_Types].xml']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+
    [...exts].map(e=>'<Default Extension="'+e+'" ContentType="image/'+e+'"/>').join('')+
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'+
    (b.foot.length?'<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>':'')+
    (hdr?'<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>':'')+
    (ftr?'<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>':'')+
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
  parts['_rels/.rels']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+NS_R+'/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="'+NS_R+'/extended-properties" Target="docProps/app.xml"/></Relationships>';
  const now=new Date().toISOString().replace(/\.\d+Z$/,'Z'), title=(document.getElementById('bb-doc-title')||{}).value||'Documento';
  parts['docProps/core.xml']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>'+esc(title)+'</dc:title><dc:creator>BlaBla</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">'+now+'</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">'+now+'</dcterms:modified></cp:coreProperties>';
  parts['docProps/app.xml']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>BlaBla '+BB.version+'</Application></Properties>';
  b.media.forEach(m=>{ if(m.rid) parts['word/media/'+m.name]=m.bytes; });
  return parts;
}

async function exportDocx(name){
  showLoading('Esportazione DOCX…','Creazione del documento Word');
  const restore=BB.ExportFile._printState();            // tema chiaro: i colori calcolati sono quelli della carta
  try{
    await BB.loadLib('jszip');
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const parts=await buildDocx();
    const zip=new window.JSZip();
    zip.file('[Content_Types].xml',parts['[Content_Types].xml']);
    Object.keys(parts).filter(k=>k!=='[Content_Types].xml').forEach(k=>zip.file(k,parts[k]));
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    if(await BB.download(blob,BB.SaveAs.fileName(name)+'.docx')) toast('File Word salvato','ok');
  }catch(e){ console.error(e); toast('Errore esportazione DOCX: '+e.message,'err'); }
  finally{ restore(); hideLoading(); }
}

BB.ExportFile.docx=exportDocx;
BB.on('init',()=>{ if(!BB.SaveAs.formats.some(f=>f.id==='docx')) BB.SaveAs.formats.splice(1,0,{id:'docx',label:'Word (.docx)',desc:'Documento Word modificabile: titoli, elenchi, tabelle, immagini, intestazioni e note'}); });
BB.DocxExport={build:buildDocx};
})();
