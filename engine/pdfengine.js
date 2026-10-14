/* =============================================================================
   BlaBla PdfEngine — motore di analisi layout per PDF (testo, tabelle, figure)
   -----------------------------------------------------------------------------
   Un PDF non contiene "tabelle" né "paragrafi": solo glifi e tracciati
   posizionati. Questo motore li ricostruisce:

   1. Righe di griglia (rulings): da vettoriale (operator list di pdf.js) oppure
      da raster (analisi dei pixel di una pagina scansionata/immagine).
   2. Tabelle: griglie di righe collegate -> celle, con celle unite
      (rowspan/colspan), bordi per lato e colori di sfondo.
   3. Testo: righe -> segmenti -> (tabelle "senza bordi") -> ordine di lettura
      (taglio XY, colonne) -> paragrafi/titoli con allineamento e spaziature.
   4. Figure: immagini incorporate e grafica residua (loghi, icone, foto).
   5. Pagine scansionate: OCR (Tesseract) per cella e per blocchi di pagina.

   Tutte le coordinate interne sono in punti PDF (1pt = 1/72"), origine in alto
   a sinistra. Il rendering HTML scala tutto con un unico fattore K (px/pt) in
   modo che il contenuto stia SEMPRE dentro la pagina dell'editor.
   ============================================================================= */
(function(root){
'use strict';

const PT2MM=25.4/72, MM2PX=96/25.4, PT2PX=96/72;

const U={
  med(a){ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y), m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; },
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
  r1:v=>Math.round(v*10)/10,
  pct(a,p){ if(!a.length) return 0; const s=a.slice().sort((x,y)=>x-y); return s[Math.min(s.length-1,Math.floor(p*s.length))]; },
  /** Come cluster, ma unisce due posizioni vicine solo se sono MOLTO più vicine tra
      loro che ai rispettivi vicini: i bordi sfalsati di celle accostate (colonna
      sinistra e destra di una tabella storta) diventano un solo confine, senza
      fondere righe vere ma strette. */
  clusterAdaptive(vals,tolMin,tolMax){
    const c=U.cluster(vals,tolMin);
    for(let again=c.length>2;again;){
      again=false;
      for(let i=0;i+1<c.length;i++){
        const g=c[i+1]-c[i]; if(g>tolMax) continue;
        const gl=i>0?c[i]-c[i-1]:Infinity, gr=i+2<c.length?c[i+2]-c[i+1]:Infinity, m=Math.min(gl,gr);
        if(m!==Infinity && (g<=0.6*m || g<=6.5)){ c.splice(i,2,(c[i]+c[i+1])/2); again=c.length>2; break; }
      }
    }
    return c;
  },
  cluster(vals,tol){
    const s=vals.slice().sort((a,b)=>a-b), out=[];
    s.forEach(v=>{ const l=out[out.length-1]; if(l && v-l.sum/l.n<=tol){ l.sum+=v; l.n++; } else out.push({sum:v,n:1}); });
    return out.map(c=>c.sum/c.n);
  },
  bbox(list){
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    list.forEach(b=>{ x0=Math.min(x0,b.x0); y0=Math.min(y0,b.y0); x1=Math.max(x1,b.x1); y1=Math.max(y1,b.y1); });
    return list.length?{x0,y0,x1,y1}:null;
  },
  inside(it,r){ const cx=(it.x0+it.x1)/2, cy=(it.y0+it.y1)/2; return cx>=r.x0&&cx<=r.x1&&cy>=r.y0&&cy<=r.y1; }
};

/* ---------------------------------------------------------------------------
   Filtro rumore OCR (parole a bassa confidenza / sequenze ripetute)
   --------------------------------------------------------------------------- */
const GLYPH_TARGET=22, OCR_CONF_MIN=40, GARBAGE=/(.)\1{3,}/i;
function keepWord(text,conf,minConf){
  const t=(text||'').trim(); if(!t) return false;
  const c=typeof conf==='number'?conf:100;
  if(c<(minConf==null?OCR_CONF_MIN:minConf)) return false;
  if(!/^[0-9.,]+$/.test(t) && GARBAGE.test(t)) return false;
  if(t.length<=3 && c<85 && /^[^0-9A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(t)) return false;
  return true;
}
function ocrWords(data){
  let ws=data&&data.words;
  if(!ws||!ws.length){ ws=[]; ((data&&data.lines)||[]).forEach(l=>(l.words||[]).forEach(w=>ws.push(w))); }
  return ws||[];
}

/* ===========================================================================
   RASTER: binarizzazione, rilevamento righe di griglia sui pixel
   =========================================================================== */
const Raster={
  gray(canvas){
    const w=canvas.width,h=canvas.height;
    const d=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;
    const n=w*h, gray=new Uint8Array(n), hist=new Uint32Array(256);
    for(let i=0,p=0;p<n;i+=4,p++){ const g=(d[i]*77+d[i+1]*151+d[i+2]*28)>>8; gray[p]=g; hist[g]++; }
    let sum=0; for(let t=0;t<256;t++) sum+=t*hist[t];
    let sumB=0,wB=0,best=-1,thr=128;
    for(let t=0;t<256;t++){
      wB+=hist[t]; if(!wB) continue; const wF=n-wB; if(!wF) break;
      sumB+=t*hist[t]; const mB=sumB/wB, mF=(sum-sumB)/wF, v=wB*wF*(mB-mF)*(mB-mF);
      if(v>best){ best=v; thr=t; }
    }
    let bg=255, bestN=-1; for(let t=thr;t<256;t++) if(hist[t]>bestN){ bestN=hist[t]; bg=t; }
    return {w,h,gray,thr:U.clamp(thr,100,200),bg};
  },
  /** Punti d'inchiostro campionati (al più ~300k) per le stime di inclinazione. */
  _inkPoints(g){
    const {w,h,gray}=g, thr=Math.max(g.thr,Math.min(235,g.bg-40));
    const stride=Math.max(1,Math.floor(Math.sqrt(w*h/300000)));
    const xs=[], ys=[];
    for(let y=0;y<h;y+=stride){ const r=y*w; for(let x=0;x<w;x+=stride) if(gray[r+x]<thr){ xs.push(x); ys.push(y); } }
    return {xs:Int32Array.from(xs),ys:Int32Array.from(ys),w,h};
  },
  /** Somma dei quadrati del profilo di proiezione ruotato di `deg` gradi: è
      massima quando le righe di testo/tabella sono orizzontali (vertical=false)
      o le colonne verticali (vertical=true). */
  _profileScore(P,deg,vertical,minRun){
    const a=deg*Math.PI/180, c=Math.cos(a), s=Math.sin(a), off=Math.max(P.w,P.h)+2;
    const hist=new Int32Array(P.w+P.h+2*off);
    const {xs,ys}=P;
    if(!vertical){ for(let i=0;i<xs.length;i++) hist[((ys[i]*c-xs[i]*s)|0)+off]++; }
    else { for(let i=0;i<xs.length;i++) hist[((xs[i]*c+ys[i]*s)|0)+off]++; }
    let sum=0; const T=minRun||0;
    for(let i=0;i<hist.length;i++){ const c=hist[i]; if(c>T) sum+=c*c; }
    return sum;
  },
  _bestAngle(P,vertical,lo,hi,step,minRun){
    let best=-Infinity, ang=0;
    for(let d=lo;d<=hi+1e-9;d+=step){ const sc=this._profileScore(P,d,vertical,minRun); if(sc>best){ best=sc; ang=d; } }
    return {ang,score:best};
  },
  /** Inclinazione (gradi, positiva = orario) delle righe di testo/tabella, e se
      la pagina è girata di 90° (le "righe" corrono in verticale). */
  orientation(g){
    const P=this._inkPoints(g);
    if(P.xs.length<400) return {angle:0,rot90:false,confidence:0};
    const row=this._bestAngle(P,false,-6,6,0.5), col=this._bestAngle(P,true,-6,6,0.5);
    const rot90=col.score>1.3*row.score;
    const vertical=rot90;
    // se ci sono righe LUNGHE (bordi di tabella), l'angolo si ricava da quelle: un
    // sottolineato corto o una riga di testo perfettamente dritti non devono
    // prevalere su una tabella inclinata
    const T=0.1*P.w;
    // candidati: i picchi più alti del profilo grossolano; ciascuno si affina con la
    // soglia "righe lunghe" e vince quello con più inchiostro allineato in righe lunghe
    const coarse=[]; for(let d=-6;d<=6+1e-9;d+=0.5) coarse.push({d,s:this._profileScore(P,d,vertical)});
    const peaks=coarse.filter((c,i)=>(i===0||c.s>=coarse[i-1].s)&&(i===coarse.length-1||c.s>=coarse[i+1].s)).sort((x,y)=>y.s-x.s).slice(0,4);
    let best=null;
    for(const pk of peaks){
      const f=this._bestAngle(P,vertical,pk.d-0.5,pk.d+0.5,0.05,T);
      if(f.score>0 && (!best||f.score>best.score)) best=f;
    }
    const fine=best||this._bestAngle(P,vertical,(vertical?col.ang:row.ang)-0.5,(vertical?col.ang:row.ang)+0.5,0.05);
    return {angle:fine.ang,rot90,confidence:Math.max(row.score,col.score)/Math.min(row.score,col.score)};
  },
  /** Altezza mediana (px) dei "caratteri" = componenti connessi di inchiostro
      di dimensione compatibile con una lettera/cifra. Serve a scegliere la
      scala di rasterizzazione: Tesseract legge meglio con glifi di altezza
      attesa, non troppo piccoli né ingranditi a forza (che li sfoca). */
  glyphHeight(g){
    const {w,h,gray,thr}=g;
    const par=[], bx0=[], bx1=[], by0=[], by1=[];
    let prev=[], total=0;
    const find=i=>{ while(par[i]!==i){ par[i]=par[par[i]]; i=par[i]; } return i; };
    for(let y=0;y<h;y++){
      const row=y*w, cur=[]; let x=0;
      while(x<w){
        if(gray[row+x]<thr){
          let s=x; while(x<w&&gray[row+x]<thr) x++;
          const e=x-1; let id=-1;
          for(const p of prev){
            if(p.e<s-1) continue; if(p.s>e+1) break;
            const r=find(p.id);
            if(id<0){ id=r; } else if(r!==id){ par[r]=id; bx0[id]=Math.min(bx0[id],bx0[r]); bx1[id]=Math.max(bx1[id],bx1[r]); by0[id]=Math.min(by0[id],by0[r]); by1[id]=Math.max(by1[id],by1[r]); }
          }
          if(id<0){ id=par.length; par.push(id); bx0.push(s); bx1.push(e); by0.push(y); by1.push(y); }
          else { bx0[id]=Math.min(bx0[id],s); bx1[id]=Math.max(bx1[id],e); by1[id]=y; }
          cur.push({s,e,id});
        } else x++;
      }
      prev=cur;
    }
    const hs=[];
    for(let i=0;i<par.length;i++){
      if(find(i)!==i) continue;
      const cw=bx1[i]-bx0[i]+1, ch=by1[i]-by0[i]+1;
      if(ch>=5 && ch<=90 && cw<=3*ch+6 && cw>=2) hs.push(ch);
    }
    return hs.length>=15?U.med(hs):0;
  },
  /** Segmenta l'inchiostro rimasto (fuori da tabelle e righe) in righe/blocchi:
      bande orizzontali separate da righe vuote, poi spezzate dove c'è un
      vuoto largo (colonne diverse, logo accanto al testo). Ogni segmento è
      un candidato "riga di testo" per l'OCR, o una figura se non è testo. */
  segments(g,hG){
    const {w,h,gray}=g;
    // soglia più permissiva di quella di binarizzazione: tratti sottili e
    // anti-aliasing grigio chiaro devono comunque contare come inchiostro,
    // altrimenti una parola si spezza in pezzi e il testo si frammenta
    const thr=Math.max(g.thr,Math.min(235,g.bg-40));
    const rowCnt=new Uint32Array(h);
    for(let y=0;y<h;y++){ let c=0; const r=y*w; for(let x=0;x<w;x++) if(gray[r+x]<thr) c++; rowCnt[y]=c; }
    const g1=Math.max(1,Math.round(0.2*hG)), g2=Math.round(1.8*hG), out=[];
    const bands=[]; let st=-1,last=-1;
    for(let y=0;y<h;y++){
      if(rowCnt[y]>=2){ if(st<0) st=y; last=y; }
      else if(st>=0 && y-last>g1){ bands.push([st,last]); st=-1; }
    }
    if(st>=0) bands.push([st,last]);
    const col=new Uint32Array(w);
    for(const [y0,y1] of bands){
      col.fill(0);
      for(let y=y0;y<=y1;y++){ const r=y*w; for(let x=0;x<w;x++) if(gray[r+x]<thr) col[x]++; }
      const spans=[]; let sx=-1,lx=-1;
      for(let x=0;x<w;x++){
        if(col[x]>0){ if(sx<0) sx=x; lx=x; }
        else if(sx>=0 && x-lx>g2){ spans.push([sx,lx]); sx=-1; }
      }
      if(sx>=0) spans.push([sx,lx]);
      for(const [a,b] of spans){
        let ya=y1,yb=y0;
        for(let y=y0;y<=y1;y++){ const r=y*w; for(let x=a;x<=b;x++) if(gray[r+x]<thr){ if(y<ya) ya=y; if(y>yb) yb=y; break; } }
        const sw=b-a+1, sh=yb-ya+1;
        if(sw<0.5*hG && sh<0.5*hG) continue;
        out.push({x0:a,y0:ya,x1:b+1,y1:yb+1});
      }
    }
    return out;
  },
  /** Gruppi di "run" adiacenti (stessa linea ma spessa più pixel) -> linee. */
  groupRuns(runs,maxThick){
    runs.sort((p,q)=>p.a-q.a||p.s0-q.s0);
    const done=[]; let active=[];
    for(const r of runs){
      const keep=[]; for(const g of active){ if(g.a1<r.a-1) done.push(g); else keep.push(g); } active=keep;
      let g=null;
      for(const c of active){
        const ov=Math.min(c.s1,r.s1)-Math.max(c.s0,r.s0);
        if(ov>=0.6*Math.min(c.s1-c.s0,r.s1-r.s0)){ g=c; break; }
      }
      if(g){ g.a1=r.a; g.s0=Math.min(g.s0,r.s0); g.s1=Math.max(g.s1,r.s1); }
      else active.push({a0:r.a,a1:r.a,s0:r.s0,s1:r.s1});
    }
    done.push(...active);
    return done.filter(g=>g.a1-g.a0+1<=maxThick).map(g=>({a:(g.a0+g.a1)/2,t:g.a1-g.a0+1,s0:g.s0,s1:g.s1}));
  },
  /** Linee orizzontali/verticali (in px) con run-length sul pixel scuro. */
  rulings(g,scale){
    const {w,h,gray,thr}=g;
    const minLen=Math.max(30,Math.round(28*scale));
    const maxThick=Math.max(4,Math.round(3.4*scale));
    const gapTol=Math.max(2,Math.round(0.9*scale));
    const hr=[];
    for(let y=0;y<h;y++){
      const row=y*w; let st=-1,ls=-1;
      for(let x=0;x<w;x++){
        if(gray[row+x]<thr){ if(st<0) st=x; ls=x; }
        else if(st>=0 && x-ls>gapTol){ if(ls-st+1>=minLen) hr.push({a:y,s0:st,s1:ls}); st=-1; }
      }
      if(st>=0 && ls-st+1>=minLen) hr.push({a:y,s0:st,s1:ls});
    }
    const vr=[], vs=new Int32Array(w).fill(-1), vl=new Int32Array(w);
    for(let y=0;y<h;y++){
      const row=y*w;
      for(let x=0;x<w;x++){
        if(gray[row+x]<thr){ if(vs[x]<0) vs[x]=y; vl[x]=y; }
        else if(vs[x]>=0 && y-vl[x]>gapTol){ if(vl[x]-vs[x]+1>=minLen) vr.push({a:x,s0:vs[x],s1:vl[x]}); vs[x]=-1; }
      }
    }
    for(let x=0;x<w;x++) if(vs[x]>=0 && vl[x]-vs[x]+1>=minLen) vr.push({a:x,s0:vs[x],s1:vl[x]});
    // una vera linea di griglia ha spazio bianco ai due lati; la fila di barre
    // di T/E/L o di basi di lettere (stessa riga di pixel) ha invece glifi
    // attaccati da una parte: va scartata, altrimenti si cancella il testo
    const iso=(l,horiz)=>{
      const o1=Math.ceil(l.t/2)+2, o2=o1+Math.max(2,Math.round(0.8*scale));
      const c=Math.round(l.a), step=Math.max(1,Math.floor((l.s1-l.s0)/240));
      let ia=0,ib=0,n=0;
      for(let s=Math.round(l.s0);s<=l.s1;s+=step){
        for(let o=o1;o<=o2;o++){
          const a=c-o, b=c+o;
          if(horiz){ if(a>=0&&gray[a*w+s]<thr) ia++; if(b<h&&gray[b*w+s]<thr) ib++; }
          else { if(a>=0&&gray[s*w+a]<thr) ia++; if(b<w&&gray[s*w+b]<thr) ib++; }
          n++;
        }
      }
      return n>0 && Math.max(ia,ib)/n<0.22;
    };
    const H=Geo.mergeCollinear(this.groupRuns(hr,maxThick).filter(l=>iso(l,true)),4.5*scale,8*scale);
    const V=Geo.mergeCollinear(this.groupRuns(vr,maxThick).filter(l=>iso(l,false)),4.5*scale,8*scale);
    const toPt=l=>({a:l.a/scale,t:l.t/scale,s0:l.s0/scale,s1:l.s1/scale});
    return {h:H.map(toPt), v:V.map(toPt)};
  }
};

/* ===========================================================================
   GEOMETRIA: unione linee, tabelle a griglia
   =========================================================================== */
const Geo={
  mergeCollinear(lines,tolA,gap){
    let list=lines.map(l=>Object.assign({},l)), merged=true, guard=0;
    while(merged && guard++<20){
      merged=false; const out=[];
      list.sort((p,q)=>p.a-q.a||p.s0-q.s0);
      for(const l of list){
        const o=out.find(o=>Math.abs(o.a-l.a)<=tolA && l.s0<=o.s1+gap && l.s1>=o.s0-gap);
        if(o){ o.s0=Math.min(o.s0,l.s0); o.s1=Math.max(o.s1,l.s1); o.t=Math.max(o.t,l.t); merged=true; }
        else out.push(l);
      }
      list=out;
    }
    return list;
  },
  /** Frazione dell'intervallo [s0,s1] coperta da linee alla posizione `pos`. */
  coverage(lines,pos,s0,s1,tol){
    const len=s1-s0; if(len<=0) return {f:0,t:0};
    const iv=[]; let t=0;
    for(const l of lines){
      if(Math.abs(l.a-pos)<=tol+l.t/2){
        const a=Math.max(l.s0,s0), b=Math.min(l.s1,s1);
        if(b>a){ iv.push([a,b]); t=Math.max(t,l.t); }
      }
    }
    if(!iv.length) return {f:0,t:0};
    iv.sort((p,q)=>p[0]-q[0]);
    let tot=0, cs=iv[0][0], ce=iv[0][1];
    for(let i=1;i<iv.length;i++){ if(iv[i][0]<=ce+tol) ce=Math.max(ce,iv[i][1]); else { tot+=ce-cs; cs=iv[i][0]; ce=iv[i][1]; } }
    tot+=ce-cs;
    return {f:tot/len,t};
  },
  /** Tabelle da insiemi di righe orizzontali/verticali collegate tra loro. */
  tables(hL,vL,opt,items){
    opt=Object.assign({minLen:12,tolConn:4,tolSnap:3},opt||{});
    const H=hL.filter(l=>l.s1-l.s0>=opt.minLen), V=vL.filter(l=>l.s1-l.s0>=opt.minLen);
    if(V.length<2||H.length>600||V.length>600) return [];
    const n=H.length+V.length, par=Array.from({length:n},(_,i)=>i);
    const find=i=>{ while(par[i]!==i){ par[i]=par[par[i]]; i=par[i]; } return i; };
    const tc=opt.tolConn;
    for(let i=0;i<H.length;i++) for(let j=0;j<V.length;j++){
      const hl=H[i], vl=V[j];
      if(vl.a>=hl.s0-tc && vl.a<=hl.s1+tc && hl.a>=vl.s0-tc && hl.a<=vl.s1+tc){
        const a=find(i), b=find(H.length+j); if(a!==b) par[a]=b;
      }
    }
    const comps=new Map();
    for(let i=0;i<n;i++){ const r=find(i); if(!comps.has(r)) comps.set(r,{h:[],v:[]}); (i<H.length?comps.get(r).h.push(H[i]):comps.get(r).v.push(V[i-H.length])); }
    const tables=[], loneV=[];
    comps.forEach(c=>{
      if(!c.h.length){ loneV.push(...c.v); return; }
      const t=this._buildTable(c.h,c.v,opt,items); if(t) tables.push(t);
    });
    // solo righe verticali (colonne separate da filetti, senza righe orizzontali)
    if(items && loneV.length>=2){
      loneV.sort((a,b)=>a.a-b.a);
      const used=new Set();
      for(let i=0;i<loneV.length;i++){
        if(used.has(i)) continue;
        const grp=[loneV[i]]; used.add(i);
        for(let j=i+1;j<loneV.length;j++){
          if(used.has(j)) continue;
          const g=loneV[j], last=grp[grp.length-1];
          const ov=Math.min(g.s1,last.s1)-Math.max(g.s0,last.s0), mn=Math.min(g.s1-g.s0,last.s1-last.s0);
          if(ov>=0.7*mn && g.a-last.a>=25 && g.s1-g.s0>=40){ grp.push(g); used.add(j); }
        }
        if(grp.length>=2){ const t=this._buildTable([],grp,opt,items); if(t) tables.push(t); }
      }
    }
    return tables;
  },
  _buildTable(hs,vs,opt,items){
    if(vs.length<2) return null;
    const tol=opt.tolSnap;
    const vmin=Math.min(...vs.map(l=>l.s0)), vmax=Math.max(...vs.map(l=>l.s1));
    // bordi mancanti: gli estremi delle righe verticali chiudono la tabella in alto/in basso,
    // quelli delle orizzontali a sinistra/a destra (tabelle moderne senza cornice)
    let yvals=hs.map(l=>l.a).concat([vmin,vmax]);
    let xvals=vs.map(l=>l.a);
    if(hs.length){ xvals.push(Math.min(...hs.map(l=>l.s0)),Math.max(...hs.map(l=>l.s1))); }
    else if(items){
      const firstV=Math.min(...xvals), lastV=Math.max(...xvals);
      const inY=items.filter(it=>(it.y0+it.y1)/2>=vmin&&(it.y0+it.y1)/2<=vmax);
      const left=inY.filter(it=>it.x1<=firstV+2), right=inY.filter(it=>it.x0>=lastV-2);
      if(left.length) xvals.push(Math.min(...left.map(it=>it.x0))-2);
      if(right.length) xvals.push(Math.max(...right.map(it=>it.x1))+2);
    }
    const ys=opt.adaptive?U.clusterAdaptive(yvals,3,opt.tolMax||12):U.cluster(yvals,tol), xs=opt.adaptive?U.clusterAdaptive(xvals,3,opt.tolMax||12):U.cluster(xvals,tol);
    if(ys.length<2||xs.length<2) return null;
    const R=ys.length-1, C=xs.length-1;
    if(R*C<2||R>120||C>40) return null;
    // bordo verticale in xs[j] per la riga i; orizzontale in ys[i] per la colonna j
    const bV=[],bH=[],tV=[],tH=[]; let thick=0;
    for(let i=0;i<R;i++){ bV[i]=[]; tV[i]=[]; const a=ys[i]+Math.min(tol,(ys[i+1]-ys[i])/4), b=ys[i+1]-Math.min(tol,(ys[i+1]-ys[i])/4);
      for(let j=0;j<=C;j++){ const c=Geo.coverage(vs,xs[j],a,b,tol); bV[i][j]=c.f>=0.6; tV[i][j]=c.f>=0.6?c.t:0; if(c.f>=0.6) thick=Math.max(thick,c.t); } }
    for(let i=0;i<=R;i++){ bH[i]=[]; tH[i]=[]; for(let j=0;j<C;j++){ const a=xs[j]+Math.min(tol,(xs[j+1]-xs[j])/4), b=xs[j+1]-Math.min(tol,(xs[j+1]-xs[j])/4);
      const c=Geo.coverage(hs,ys[i],a,b,tol); bH[i][j]=c.f>=0.6; tH[i][j]=c.f>=0.6?c.t:0; if(c.f>=0.6) thick=Math.max(thick,c.t); } }
    const used=Array.from({length:R},()=>new Array(C).fill(false)), cells=[];
    for(let i=0;i<R;i++) for(let j=0;j<C;j++){
      if(used[i][j]) continue;
      let cs=1; while(j+cs<C && !bV[i][j+cs] && !used[i][j+cs]) cs++;
      let rs=1;
      outer: while(i+rs<R){
        for(let k=0;k<cs;k++){ if(bH[i+rs][j+k] || used[i+rs][j+k]) break outer; if(k>0 && bV[i+rs][j+k]) break outer; }
        rs++;
      }
      for(let a=0;a<rs;a++) for(let b=0;b<cs;b++) used[i+a][j+b]=true;
      const maj=(arr)=>arr.filter(Boolean).length>=arr.length/2;
      const top=[],bot=[],lef=[],rig=[], tt=[],tb=[],tl=[],tr=[];
      for(let k=0;k<cs;k++){ top.push(bH[i][j+k]); bot.push(bH[i+rs][j+k]); tt.push(tH[i][j+k]); tb.push(tH[i+rs][j+k]); }
      for(let k=0;k<rs;k++){ lef.push(bV[i+k][j]); rig.push(bV[i+k][j+cs]); tl.push(tV[i+k][j]); tr.push(tV[i+k][j+cs]); }
      cells.push({r:i,c:j,rs,cs,x0:xs[j],x1:xs[j+cs],y0:ys[i],y1:ys[i+rs],
        b:{t:maj(top),b:maj(bot),l:maj(lef),r:maj(rig)},
        bt:{t:Math.max(...tt),b:Math.max(...tb),l:Math.max(...tl),r:Math.max(...tr)},items:[],bg:null});
    }
    return {x0:xs[0],y0:ys[0],x1:xs[C],y1:ys[R],xs,ys,cells,thick:thick||1,R,C};
  }
};

/* ===========================================================================
   VETTORIALE: righe, riempimenti e immagini dalla operator list di pdf.js
   =========================================================================== */
const Vector={
  async scan(page){
    const vp=page.getViewport({scale:1}), W=vp.width, H=vp.height;
    const OPS=root.pdfjsLib.OPS, Util=root.pdfjsLib.Util;
    const out={W,H,h:[],v:[],fills:[],images:[],complex:0,items:null};
    let ol; try{ ol=await page.getOperatorList(); }catch(e){ return out; }
    let ctm=[1,0,0,1,0,0], lw=1, fillRgb=null; const stack=[];
    let path=[];  // sottotracciati: {pts:[[x,y]..], rect:bool, closed:bool}
    const tp=(x,y)=>{ const p=Util.applyTransform([x,y],ctm); const q=vp.convertToViewportPoint(p[0],p[1]); return [q[0],q[1]]; };
    const sc=()=>Math.sqrt(Math.abs(ctm[0]*ctm[3]-ctm[1]*ctm[2]))||1;
    const addLine=(p,q,t)=>{
      const dx=Math.abs(p[0]-q[0]), dy=Math.abs(p[1]-q[1]);
      if(dy<=0.7 && dx>=3) out.h.push({a:(p[1]+q[1])/2,t:Math.max(t,0.5),s0:Math.min(p[0],q[0]),s1:Math.max(p[0],q[0])});
      else if(dx<=0.7 && dy>=3) out.v.push({a:(p[0]+q[0])/2,t:Math.max(t,0.5),s0:Math.min(p[1],q[1]),s1:Math.max(p[1],q[1])});
      else if(dx>1&&dy>1) out.complex++;
    };
    const paintPath=(stroke,fill)=>{
      for(const sp of path){
        const pts=sp.pts; if(pts.length<2) continue;
        if(stroke){
          const t=lw*sc();
          for(let i=0;i+1<pts.length;i++) addLine(pts[i],pts[i+1],t);
          if(sp.closed||sp.rect) addLine(pts[pts.length-1],pts[0],t);
        }
        if(fill){
          if(sp.rect && pts.length===4){
            const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
            const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys), w=x1-x0, h=y1-y0;
            if(Math.min(w,h)<=2.8 && Math.max(w,h)>=6){
              if(w>h) out.h.push({a:(y0+y1)/2,t:Math.max(h,0.5),s0:x0,s1:x1});
              else out.v.push({a:(x0+x1)/2,t:Math.max(w,0.5),s0:y0,s1:y1});
            } else if(w>4&&h>4 && w*h<0.92*W*H && fillRgb){
              out.fills.push({x0,y0,x1,y1,rgb:fillRgb});
            }
          } else out.complex++;
        }
      }
      path=[];
    };
    for(let i=0;i<ol.fnArray.length;i++){
      const fn=ol.fnArray[i], a=ol.argsArray[i];
      switch(fn){
        case OPS.save: stack.push({ctm,lw,fillRgb}); break;
        case OPS.restore: { const s=stack.pop(); if(s){ ctm=s.ctm; lw=s.lw; fillRgb=s.fillRgb; } break; }
        case OPS.transform: ctm=Util.transform(ctm,a); break;
        case OPS.paintFormXObjectBegin: stack.push({ctm,lw,fillRgb}); if(a&&a[0]) ctm=Util.transform(ctm,a[0]); break;
        case OPS.paintFormXObjectEnd: { const s=stack.pop(); if(s){ ctm=s.ctm; lw=s.lw; fillRgb=s.fillRgb; } break; }
        case OPS.setLineWidth: lw=a[0]; break;
        case OPS.setFillRGBColor: fillRgb=[a[0],a[1],a[2]]; break;
        case OPS.constructPath: {
          const ops=a[0], co=a[1]; let k=0, cur=null, start=null;
          for(const op of ops){
            if(op===OPS.moveTo){ cur={pts:[tp(co[k],co[k+1])],rect:false,closed:false}; path.push(cur); k+=2; }
            else if(op===OPS.lineTo){ if(!cur){ cur={pts:[],rect:false,closed:false}; path.push(cur); } cur.pts.push(tp(co[k],co[k+1])); k+=2; }
            else if(op===OPS.curveTo){ out.complex++; if(cur) cur.pts.push(tp(co[k+4],co[k+5])); k+=6; }
            else if(op===OPS.curveTo2||op===OPS.curveTo3){ out.complex++; if(cur) cur.pts.push(tp(co[k+2],co[k+3])); k+=4; }
            else if(op===OPS.closePath){ if(cur) cur.closed=true; }
            else if(op===OPS.rectangle){
              const x=co[k],y=co[k+1],w=co[k+2],h=co[k+3]; k+=4;
              path.push({pts:[tp(x,y),tp(x+w,y),tp(x+w,y+h),tp(x,y+h)],rect:true,closed:true});
              cur=null;
            }
          }
          break;
        }
        case OPS.stroke: case OPS.closeStroke: paintPath(true,false); break;
        case OPS.fill: case OPS.eoFill: paintPath(false,true); break;
        case OPS.fillStroke: case OPS.eoFillStroke: case OPS.closeFillStroke: case OPS.closeEOFillStroke: paintPath(true,true); break;
        case OPS.endPath: path=[]; break;
        case OPS.shadingFill: out.complex++; break;
        case OPS.paintImageXObject: case OPS.paintInlineImageXObject: case OPS.paintImageMaskXObject: {
          const cs=[[0,0],[1,0],[0,1],[1,1]].map(([x,y])=>tp(x,y));
          const xs=cs.map(c=>c[0]), ys=cs.map(c=>c[1]);
          const r={x0:Math.max(0,Math.min(...xs)),y0:Math.max(0,Math.min(...ys)),x1:Math.min(W,Math.max(...xs)),y1:Math.min(H,Math.max(...ys))};
          if(r.x1-r.x0>=8 && r.y1-r.y0>=8) out.images.push(r);
          break;
        }
      }
    }
    return out;
  }
};

/* ===========================================================================
   TESTO: item -> righe -> segmenti
   =========================================================================== */
const FONT_BOLD=/bold|black|heavy|semibold|demi|\bBd\b/i, FONT_ITAL=/italic|oblique|\bIt\b|ital$/i;

function itemsFromPdfjs(tc,page,vp){
  const out=[];
  const fontInfo={};
  const info=name=>{
    if(name in fontInfo) return fontInfo[name];
    let b=false,i=false;
    try{
      if(page.commonObjs.has(name)){
        const f=page.commonObjs.get(name);
        const n=(f&&f.name)||'';
        b=!!(f&&f.bold)||FONT_BOLD.test(n); i=!!(f&&f.italic)||FONT_ITAL.test(n);
      }
    }catch(e){}
    return (fontInfo[name]={b,i});
  };
  out.dropped=0;
  tc.items.forEach(it=>{
    if(!it.str||!it.str.trim()) return;
    // in coordinate pagina (origine in alto a sinistra, già con rotazione e
    // CropBox applicati dal viewport)
    const t=root.pdfjsLib.Util.transform(vp.transform,it.transform);
    if(Math.abs(t[1])>0.35*Math.hypot(t[0],t[1])){ out.dropped++; return; }      // testo ruotato/verticale: non gestito
    const size=Math.hypot(t[2],t[3])||it.height||10, base=t[5];
    const wpt=(it.width||0)*vp.scale;
    const fi=info(it.fontName);
    out.push({s:it.str,x0:t[4],x1:t[4]+wpt,y0:base-size*0.8,y1:base+size*0.2,size,base,bold:fi.b,italic:fi.i});
  });
  return out;
}
function itemsFromWords(words,scale,ox,oy,minConf){
  const out=[];
  words.forEach(w=>{
    const txt=(w.text||'').trim().replace(/^[|¦]+|[|¦]+$/g,''); if(!txt || (minConf!==-1 && !keepWord(txt,w.confidence,minConf))) return;
    const b=w.bbox; const x0=(b.x0+ox)/scale, x1=(b.x1+ox)/scale, y0=(b.y0+oy)/scale, y1=(b.y1+oy)/scale;
    const h=y1-y0;
    // la bbox di una parola dipende dalle lettere che contiene: con discendenti
    // (g,p,y…) scende sotto la riga, con sole minuscole senza aste è bassa.
    // Si risale al corpo reale dalla proporzione tipica dei glifi.
    const tall=/[A-Z0-9bdfhijklt!?()\/&%@#$"'|À-ÖØ-Þ]/.test(txt), desc=/[gjpqy,;()Q]/.test(txt), letters=/[A-Za-zÀ-ÿ0-9]/.test(txt);
    const em=(tall?0.72:0.52)+(desc?0.21:0);
    const size=letters?Math.max(3,h/em):0;
    out.push({s:txt,x0,x1,y0,y1,size,base:desc?y1-0.21*size:y1,bold:!!w.is_bold,italic:!!w.is_italic,ocr:true,conf:w.confidence});
  });
  return out;
}

function groupLines(items){
  const its=items.filter(i=>i.s&&i.s.trim()).sort((a,b)=>(a.y0+a.y1)-(b.y0+b.y1));
  const lines=[];
  for(const it of its){
    const cy=(it.y0+it.y1)/2, h=it.y1-it.y0; let L=null;
    for(let k=lines.length-1;k>=Math.max(0,lines.length-8);k--){
      const c=lines[k]; if(Math.abs(cy-c.cy)<=0.45*Math.max(h,c.h)){ L=c; break; }
    }
    if(L){ L.items.push(it); L.cy=(L.cy*(L.items.length-1)+cy)/L.items.length; L.h=Math.max(L.h,h*0.9); }
    else lines.push({items:[it],cy,h});
  }
  lines.forEach(L=>L.items.sort((a,b)=>a.x0-b.x0));
  return lines;
}

function flagsHtml(items,gapOf){
  const runs=[];
  items.forEach((it,k)=>{
    let t=U.esc(it.s);
    if(k>0){
      const prev=items[k-1], gap=it.x0-prev.x1, sz=it.size||10;
      if(gap>0.12*sz && !/\s$/.test(prev.s) && !/^\s/.test(it.s)) t=' '+t;
    }
    const last=runs[runs.length-1];
    if(last && last.b===it.bold && last.i===it.italic) last.t+=t; else runs.push({t,b:it.bold,i:it.italic});
  });
  return runs.map(r=>{ let t=r.t; if(r.i) t='<i>'+t+'</i>'; if(r.b) t='<b>'+t+'</b>'; return t; }).join('');
}
function boldRatio(items){ let b=0,n=0; items.forEach(i=>{ const l=i.s.length; n+=l; if(i.bold) b+=l; }); return n?b/n:0; }

function finalizeSeg(items){
  const b=U.bbox(items);
  const sizes=[]; items.forEach(i=>{ if(i.size>0) for(let k=0;k<Math.min(i.s.length,40);k++) sizes.push(i.size); });
  const size=U.med(sizes)||U.med(items.map(i=>i.y1-i.y0))||10;
  return {items,x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1,size,base:U.med(items.map(i=>i.base)),
    html:flagsHtml(items), text:items.map(i=>i.s).join(' '), bold:boldRatio(items)};
}
function lineSegments(L){
  const ref=U.med(L.items.map(i=>i.size).filter(s=>s>0))||10, gap=Math.max(1.5*ref,8);
  const segs=[]; let cur=null;
  for(const it of L.items){
    if(cur && it.x0-cur[cur.length-1].x1>gap){ segs.push(cur); cur=null; }
    (cur||(cur=[])).push(it);
  }
  if(cur) segs.push(cur);
  return segs.map(finalizeSeg);
}

/* ---------------------------------------------------------------------------
   Tabelle "senza bordi": più righe consecutive con colonne ben allineate
   --------------------------------------------------------------------------- */
function streamTables(lineSegs,medSize){
  const out=[], used=new Set();
  let i=0;
  while(i<lineSegs.length){
    if(lineSegs[i].length<2){ i++; continue; }
    let j=i+1;
    while(j<lineSegs.length && lineSegs[j].length>=2){
      const prev=lineSegs[j-1], cur=lineSegs[j];
      const gap=Math.min(...cur.map(s=>s.y0))-Math.max(...prev.map(s=>s.y1));
      if(gap>1.6*medSize) break;
      j++;
    }
    if(j-i>=2){
      const run=lineSegs.slice(i,j);
      const t=bandsFromRun(run,medSize);
      if(t){ out.push(t); run.forEach(l=>l.forEach(s=>used.add(s))); }
    }
    i=j;
  }
  return {tables:out,used};
}
function bandsFromRun(run,medSize){
  const segs=[]; run.forEach(l=>l.forEach(s=>segs.push(s)));
  const iv=segs.map(s=>[s.x0,s.x1]).sort((a,b)=>a[0]-b[0]);
  const bands=[]; const minGap=Math.max(0.9*medSize,5);
  iv.forEach(([a,b])=>{ const l=bands[bands.length-1]; if(l && a-l[1]<minGap) l[1]=Math.max(l[1],b); else bands.push([a,b]); });
  if(bands.length<2||bands.length>20) return null;
  const rows=run.map(l=>{
    const cells=new Array(bands.length).fill(null).map(()=>[]);
    l.forEach(s=>{ const cx=(s.x0+s.x1)/2; let k=bands.findIndex(b=>cx>=b[0]-1&&cx<=b[1]+1); if(k<0) k=0; cells[k].push(s); });
    return {cells,y0:Math.min(...l.map(s=>s.y0)),y1:Math.max(...l.map(s=>s.y1))};
  });
  // colonne di testo che scorre (giornale, articolo): celle lunghe e piene su
  // tante righe -> non è una tabella, lo gestisce l'ordine di lettura a colonne
  const lens=[]; rows.forEach(r=>r.cells.forEach(c=>{ if(c.length) lens.push(c.reduce((n,s)=>n+s.text.length,0)); }));
  if(rows.length>=4 && U.med(lens)>=28) return null;
  // testo che scorre in colonne: ogni cella riempie quasi tutta la larghezza
  // della sua colonna (giustificato o quasi), cosa che una tabella di dati non fa
  if(rows.length>=4){
    let fullBands=0;
    bands.forEach((bd,k)=>{
      const fills=[]; rows.forEach(r=>{ const c=r.cells[k]; if(c.length){ const w=Math.max(...c.map(s=>s.x1))-Math.min(...c.map(s=>s.x0)); fills.push(w/Math.max(1,bd[1]-bd[0])); } });
      if(fills.length>=3 && U.med(fills)>=0.72) fullBands++;
    });
    if(fullBands>=2) return null;
  }
  const multi=rows.filter(r=>r.cells.filter(c=>c.length).length>=2).length;
  if(multi<rows.length*0.6) return null;
  // ogni colonna deve avere almeno 2 celle piene: altrimenti è solo testo con uno spazio largo
  for(let k=0;k<bands.length;k++){ if(rows.filter(r=>r.cells[k].length).length<2) return null; }
  const xs=[bands[0][0]-2]; for(let k=1;k<bands.length;k++) xs.push((bands[k-1][1]+bands[k][0])/2); xs.push(bands[bands.length-1][1]+2);
  const ys=[rows[0].y0-1]; for(let r=1;r<rows.length;r++) ys.push((rows[r-1].y1+rows[r].y0)/2); ys.push(rows[rows.length-1].y1+1);
  const cells=[];
  rows.forEach((row,r)=>row.cells.forEach((c,k)=>{
    cells.push({r,c:k,rs:1,cs:1,x0:xs[k],x1:xs[k+1],y0:ys[r],y1:ys[r+1],b:{t:false,b:false,l:false,r:false},items:[].concat(...c.map(s=>s.items)),bg:null});
  }));
  return {x0:xs[0],y0:ys[0],x1:xs[xs.length-1],y1:ys[ys.length-1],xs,ys,cells,thick:0,R:rows.length,C:bands.length,borderless:true};
}

/* ---------------------------------------------------------------------------
   Contenuto di una cella: righe, allineamento, dimensione carattere
   --------------------------------------------------------------------------- */
function cellContent(cell){
  const items=cell.items.filter(i=>i.s&&i.s.trim());
  if(!items.length) return {html:'<br>',size:0,align:'left',valign:'top',empty:true};
  const lines=groupLines(items).sort((a,b)=>a.cy-b.cy);
  const segLines=lines.map(L=>{ const s=finalizeSeg(L.items); return s; });
  const size=U.med(segLines.map(s=>s.size))||10;
  let html='';
  segLines.forEach((s,k)=>{
    if(k===0){ html=s.html; return; }
    const prev=segLines[k-1], gap=s.y0-prev.y1;
    const full=prev.x1>=cell.x1-2.2*size-3 || (cell.x1-3-prev.x1)<firstWordW(s)+0.4*size;
    if(gap>0.55*size) html+='<br><br>'+s.html;
    else if(full) html=joinLines(html,s.html);
    else html+='<br>'+s.html;
  });
  const bb=U.bbox(segLines), cw=cell.x1-cell.x0, ch=cell.y1-cell.y0;
  const cx=(bb.x0+bb.x1)/2-(cell.x0+cell.x1)/2, cy=(bb.y0+bb.y1)/2-(cell.y0+cell.y1)/2;
  let align='left';
  if(bb.x1-bb.x0>=0.85*cw) align='left';
  else if(Math.abs(cx)<=0.09*cw+1) align='center';
  else if(cell.x1-bb.x1<0.07*cw && bb.x0-cell.x0>0.3*cw) align='right';
  if(cell.forceAlign) align=cell.forceAlign;
  let valign='top';
  if(Math.abs(cy)<=0.14*ch+1) valign='middle'; else if(cell.y1-bb.y1<0.12*ch && bb.y0-cell.y0>0.4*ch) valign='bottom';
  const allBold=segLines.every(s=>s.bold>=0.98);
  if(allBold) html=html.replace(/<\/?b>/g,'');
  return {html,size,align,valign,bold:allBold,nLines:segLines.length};
}

/* ---------------------------------------------------------------------------
   Estensione della tabella con intestazioni/etichette esterne alla griglia
   (es. "LUN MAR MER…" sopra e orari "8.00 8.50…" a sinistra)
   --------------------------------------------------------------------------- */
function extendTable(t,lineSegs,medSize){
  const C=t.C, R=t.R;
  // intestazione
  const above=lineSegs.map((segs,i)=>({segs,i})).filter(o=>{
    const y1=Math.max(...o.segs.map(s=>s.y1));
    return y1<=t.y0+2 && y1>=t.y0-4.2*medSize && o.segs.every(s=>(s.x0+s.x1)/2>=t.x0-4&&(s.x0+s.x1)/2<=t.x1+4);
  });
  let topRow=null;
  if(above.length){
    above.sort((a,b)=>Math.max(...b.segs.map(s=>s.y1))-Math.max(...a.segs.map(s=>s.y1)));
    const cand=above[0], cols=new Map(); let ok=true;
    cand.segs.forEach(s=>{
      const cx=(s.x0+s.x1)/2; let k=-1;
      for(let c=0;c<C;c++) if(cx>=t.xs[c]-2&&cx<=t.xs[c+1]+2){ k=c; break; }
      if(k<0||cols.has(k)) ok=false; else cols.set(k,s);
    });
    if(ok && cols.size>=Math.max(2,Math.ceil(0.6*C))){ topRow={cand,cols}; }
  }
  // etichette a sinistra
  const leftMax=Math.max(60,10*medSize);
  const leftCands=[];
  lineSegs.forEach((segs,i)=>segs.forEach(s=>{
    if(topRow && topRow.cand===undefined) return;
    if(s.x1<=t.x0+2 && s.x0>=t.x0-leftMax && (s.y0+s.y1)/2>=t.y0-0.8*medSize && (s.y0+s.y1)/2<=t.y1+0.8*medSize
       && !(topRow&&topRow.cand.segs.includes(s)) && s.text.length<=24) leftCands.push({s,i});
  }));
  let left=null;
  if(leftCands.length>=2){
    const rowOf=new Map();
    leftCands.forEach(({s})=>{
      const cy=(s.y0+s.y1)/2; let r=-1, best=Infinity;
      for(let k=0;k<R;k++){ const d=Math.abs(cy-t.ys[k]); if(d<=0.9*medSize && d<best){ best=d; r=k; } }
      if(r<0) for(let k=0;k<R;k++) if(cy>=t.ys[k]&&cy<t.ys[k+1]){ r=k; break; }
      if(r>=0 && !rowOf.has(r)) rowOf.set(r,s);
    });
    if(rowOf.size>=2) left={rowOf,segs:[...rowOf.values()]};
  }
  if(!topRow && !left) return t;
  const consumed=new Set();
  const nt=Object.assign({},t);
  let dc=0, dr=0;
  let leftAlign=null;
  if(left){
    const x1s=left.segs.map(s=>s.x1); leftAlign=(Math.max(...x1s)-Math.min(...x1s)<=3)?'right':'left';
    const lx0=Math.min(...left.segs.map(s=>s.x0))-0.5*medSize-2;
    nt.xs=[lx0].concat(t.xs); nt.x0=lx0; dc=1; nt.C=C+1;
    left.segs.forEach(s=>consumed.add(s));
  }
  if(topRow){
    const ty0=Math.min(...topRow.cand.segs.map(s=>s.y0))-2;
    nt.ys=[ty0].concat(t.ys); nt.y0=ty0; dr=1; nt.R=R+1;
    topRow.cand.segs.forEach(s=>consumed.add(s));
  }
  nt.cells=t.cells.map(c=>Object.assign({},c,{r:c.r+dr,c:c.c+dc}));
  const nb={t:false,b:false,l:false,r:false};
  if(left) for(let r=0;r<R;r++){
    const s=left.rowOf.get(r);
    nt.cells.push({r:r+dr,c:0,rs:1,cs:1,x0:nt.xs[0],x1:nt.xs[1],y0:nt.ys[r+dr],y1:nt.ys[r+dr+1],b:nb,items:s?s.items:[],bg:null,outer:true,forceAlign:leftAlign});
  }
  if(topRow) for(let c=0;c<C;c++){
    const s=topRow.cols.get(c);
    nt.cells.push({r:0,c:c+dc,rs:1,cs:1,x0:nt.xs[c+dc],x1:nt.xs[c+dc+1],y0:nt.ys[0],y1:nt.ys[1],b:nb,items:s?s.items:[],bg:null,outer:true});
  }
  if(left&&topRow) nt.cells.push({r:0,c:0,rs:1,cs:1,x0:nt.xs[0],x1:nt.xs[1],y0:nt.ys[0],y1:nt.ys[1],b:nb,items:[],bg:null,outer:true});
  nt.consumed=consumed;
  return nt;
}

/* ===========================================================================
   ORDINE DI LETTURA: taglio XY ricorsivo
   =========================================================================== */
function textBounds(els){
  const t=els.filter(e=>e.type==='seg'); if(!t.length) return null;
  return U.bbox(t);
}
function xyOrder(els,bounds,medSize,out){
  if(!els.length) return;
  if(els.length===1){ els[0].col=bounds; out.push(els[0]); return; }
  // taglio verticale (colonne): gutter largo che attraversa TUTTO
  const byX=els.slice().sort((a,b)=>a.x0-b.x0);
  let maxX=byX[0].x1, best=null; const minG=Math.max(1.8*medSize,12);
  for(let k=1;k<byX.length;k++){
    const gap=byX[k].x0-maxX;
    if(gap>=minG && k>=2 && byX.length-k>=2 && (!best||gap>best.gap)) best={k,gap,at:maxX};
    maxX=Math.max(maxX,byX[k].x1);
  }
  if(best){
    const A=byX.slice(0,best.k), B=byX.slice(best.k);
    // due elementi lontani (un numero di pagina in alto e uno in basso a destra) non sono
    // una colonna: ogni lato deve coprire una buona parte dell'altezza della regione
    const span=Math.max(...els.map(e=>e.y1))-Math.min(...els.map(e=>e.y0));
    const cover=g=>{ const iv=g.map(e=>[e.y0,e.y1]).sort((p,q)=>p[0]-q[0]); let t=0,cs=iv[0][0],ce=iv[0][1]; for(let i=1;i<iv.length;i++){ if(iv[i][0]<=ce) ce=Math.max(ce,iv[i][1]); else { t+=ce-cs; cs=iv[i][0]; ce=iv[i][1]; } } return t+ce-cs; };
    if(Math.min(cover(A),cover(B))>=0.25*span){
      xyOrder(A,textBounds(A)||bounds,medSize,out); xyOrder(B,textBounds(B)||bounds,medSize,out); return;
    }
  }
  const byY=els.slice().sort((a,b)=>a.y0-b.y0||a.x0-b.x0);
  let maxY=byY[0].y1, hb=null;
  for(let k=1;k<byY.length;k++){
    const gap=byY[k].y0-maxY;
    if(gap>0.2 && (!hb||gap>hb.gap)) hb={k,gap};
    maxY=Math.max(maxY,byY[k].y1);
  }
  if(hb){
    xyOrder(byY.slice(0,hb.k),bounds,medSize,out); xyOrder(byY.slice(hb.k),bounds,medSize,out); return;
  }
  // nessun taglio possibile: elementi sovrapposti. Si ordina per fasce orizzontali (stessa riga =
  // sovrapposizione verticale), e dentro la fascia da sinistra a destra: un piè di pagina a
  // sinistra non deve passare davanti a una tabella alta che inizia più in alto
  const groups=[];
  byY.forEach(el=>{
    const g=groups.find(g=>Math.min(g.y1,el.y1)-Math.max(g.y0,el.y0)>0.5*Math.min(g.y1-g.y0,el.y1-el.y0));
    if(g){ g.items.push(el); g.y0=Math.min(g.y0,el.y0); g.y1=Math.max(g.y1,el.y1); } else groups.push({items:[el],y0:el.y0,y1:el.y1});
  });
  groups.sort((a,b)=>a.y0-b.y0).forEach(g=>g.items.sort((a,b)=>a.x0-b.x0).forEach(e=>{ e.col=bounds; out.push(e); }));
}

/** I corpi misurati (soprattutto da OCR) oscillano di poco da una riga all'altra:
    si raggruppano quelli entro il 12% e si assegna a tutti la mediana pesata,
    così il testo uguale nell'originale resta uguale anche nel documento. */
function snapSizes(blocks,tables,loose){
  const ent=[];
  blocks.forEach(b=>{ if(b.type==='para') ent.push({size:b.size,w:Math.max(1,b.chars),set:v=>{ b.size=v; }}); });
  tables.forEach(t=>t.cells.forEach(c=>{ const k=c.content; if(k&&k.size) ent.push({size:k.size,w:Math.max(1,c.items.reduce((n,i)=>n+i.s.length,0)),set:v=>{ k.size=v; }}); }));
  ent.sort((a,b)=>a.size-b.size);
  const cl=[];
  ent.forEach(e=>{ const l=cl[cl.length-1]; if(l && e.size/l.mean<=1.12){ l.items.push(e); l.mean=l.items.reduce((n,x)=>n+x.size,0)/l.items.length; } else cl.push({items:[e],mean:e.size}); });
  cl.forEach(c=>{
    const sorted=c.items.slice().sort((a,b)=>a.size-b.size); c.tot=sorted.reduce((n,x)=>n+x.w,0);
    let acc=0, m=sorted[0].size; for(const x of sorted){ acc+=x.w; if(acc>=c.tot/2){ m=x.size; break; } }
    c.med=m;
  });
  // da OCR le misure sono rumorose: i gruppi vicini al dominante (entro il
  // 40%) sono lo stesso corpo letto in modo diverso
  const dom=cl.reduce((a,b)=>b.tot>a.tot?b:a,cl[0]||{tot:0});
  cl.forEach(c=>{
    let m=c.med;
    if(loose && dom && dom.med && c!==dom){
      const r=c.med/dom.med;
      // corpi più piccoli del dominante (fino a metà) sono quasi sempre una lettura
      // sbagliata di un OCR rumoroso; i più grandi (titoli) si conservano
      if(r<1 ? r>0.5 : r<=1.4) m=dom.med;
    }
    c.items.forEach(x=>x.set(m));
  });
}

/* ---------------------------------------------------------------------------
   Paragrafi
   --------------------------------------------------------------------------- */
function segAlign(s,col){
  const cw=col.x1-col.x0; if(cw<20) return 'left';
  const cx=(s.x0+s.x1)/2, ccx=(col.x0+col.x1)/2, w=s.x1-s.x0;
  if(Math.abs(cx-ccx)<=0.03*cw+1.5 && w<=0.9*cw && s.x0-col.x0>=0.05*cw) return 'center';
  if(Math.abs(s.x1-col.x1)<=0.02*cw+1.5 && s.x0-col.x0>=0.3*cw) return 'right';
  return 'left';
}
/** Larghezza stimata della prima parola di un segmento: serve a capire se la
    riga precedente è andata a capo "per forza" (la parola non ci stava) o
    perché il paragrafo è finito. */
function firstWordW(seg){
  const it=seg.items&&seg.items[0]; if(!it) return 0;
  const t=it.s.trim(); if(!t) return 0;
  const fw=t.split(/\s+/)[0];
  return (it.x1-it.x0)*fw.length/t.length;
}
function joinLines(a,b){
  if(/[A-Za-zÀ-ÿ]-$/.test(a) && /^[a-zà-ÿ]/.test(b.replace(/<[^>]+>/g,''))) return a.slice(0,-1)+b;
  return a+' '+b;
}
/** Segmenti consecutivi sulla stessa riga e nella stessa colonna (es. "ORARIO
    CLASSE - 1AM" o il piè di pagina con "Pag. 1/36" a destra) diventano UN
    paragrafo con parti distanziate, invece di righe impilate una sull'altra. */
function mergeSameLine(ordered){
  const out=[];
  for(const el of ordered){
    const prev=out[out.length-1];
    if(el.type==='seg' && prev && prev.type==='seg' && prev.col===el.col){
      const a=prev.seg, b=el.seg;
      if(Math.abs(a.base-b.base)<0.5*Math.max(a.size,b.size) && b.x0>=a.x1-1){
        const parts=a.parts||[{html:a.html,x0:a.x0,x1:a.x1}];
        parts.push({html:b.html,x0:b.x0,x1:b.x1});
        const ns=finalizeSeg(a.items.concat(b.items));
        ns.parts=parts; ns.html=parts.map(p=>p.html).join(' '); ns.col=a.col;
        prev.seg=ns; prev.x0=ns.x0; prev.x1=ns.x1; prev.y0=ns.y0; prev.y1=ns.y1;
        continue;
      }
    }
    out.push(el);
  }
  return out;
}
function buildParas(ordered){
  ordered=mergeSameLine(ordered);
  const blocks=[]; let P=null;
  const flush=()=>{ if(P){ blocks.push(finishPara(P)); P=null; } };
  const canJoin=(P,s,al)=>{
    if(P.col!==s.col || P.align!=='left' || al!=='left' || s.parts || P.lines[0].parts) return false;
    const prev=P.lines[P.lines.length-1], first=P.lines[0], sz=Math.max(prev.size,s.size);
    if(Math.abs(prev.size-s.size)>0.14*sz) return false;
    const pitch=s.base-prev.base;
    if(pitch<0.55*sz || pitch>1.6*sz) return false;
    const cw=P.col.x1-P.col.x0;
    if(prev.x1<P.col.x1-Math.max(2.2*sz,0.09*cw) && (P.col.x1-prev.x1)>=firstWordW(s)+0.4*sz) return false;
    const ref=P.lines.length>1?P.lines[1].x0:first.x0;
    if(P.lines.length===1){
      if(s.x0-first.x0>0.7*sz) return false;       // la nuova riga rientra: nuovo paragrafo
    } else if(Math.abs(s.x0-ref)>0.7*sz) return false;
    return true;
  };
  for(const el of ordered){
    if(el.type!=='seg'){ flush(); blocks.push(el.block); continue; }
    const s=el.seg; s.col=el.col;
    const al=s.parts?'left':segAlign(s,el.col);
    if(P && canJoin(P,s,al)) P.lines.push(s); else { flush(); P={lines:[s],col:el.col,align:al}; }
  }
  flush();
  return blocks;
}
function finishPara(P){
  const L=P.lines;
  let html=L[0].html; for(let k=1;k<L.length;k++) html=joinLines(html,L[k].html);
  const size=U.med(L.map(l=>l.size)), bold=L.every(l=>l.bold>=0.98);
  if(bold) html=html.replace(/<\/?b>/g,'');
  const diffs=[]; for(let k=1;k<L.length;k++) diffs.push(L[k].base-L[k-1].base);
  const bb=U.bbox(L);
  return {type:'para',html,parts:L.length===1?L[0].parts:null,size,bold,align:P.align,col:P.col,nLines:L.length,pitch:diffs.length?U.med(diffs):null,
    base0:L[0].base,firstX0:L[0].x0,bodyX0:L.length>1?U.med(L.slice(1).map(l=>l.x0)):L[0].x0,
    x0:bb.x0,y0:L[0].y0,x1:bb.x1,y1:L[L.length-1].y1,chars:L.reduce((n,l)=>n+l.text.length,0)};
}

/* ===========================================================================
   FIGURE: grafica residua (loghi, icone, foto) tolti testo, righe e tabelle
   =========================================================================== */
const Figures={
  /** Un'immagine disegnata PRIMA e poi parzialmente coperta da un'altra (card con
      ombra sotto una foto) ne mostra solo la parte scoperta: la si restringe,
      altrimenti i due rettangoli si sovrapporrebbero e non si potrebbero affiancare. */
  trimCovered(rects){
    const out=rects.map(r=>Object.assign({},r));
    const area=r=>(r.x1-r.x0)*(r.y1-r.y0);
    for(let i=0;i<out.length;i++) for(let j=i+1;j<out.length;j++){
      // si restringe il più piccolo dei due (di solito la card/ombra, non la foto)
      let A=out[i], B=out[j]; if(area(A)>area(B)){ const t=A; A=B; B=t; }
      const ox=Math.min(A.x1,B.x1)-Math.max(A.x0,B.x0), oy=Math.min(A.y1,B.y1)-Math.max(A.y0,B.y0);
      if(ox<=2||oy<=2) continue;
      // quasi tutta dentro l'altra (foto doppia, icona sopra una miniatura): il ritaglio
      // dell'altra, preso dalla pagina già disegnata, la contiene già
      if(ox*oy>=0.6*area(A)){ A.x1=A.x0; continue; }
      if(B.y0<=A.y0+2 && B.y1>=A.y1-2){ if(B.x0>A.x0+2) A.x1=Math.min(A.x1,B.x0); else if(B.x1<A.x1-2) A.x0=Math.max(A.x0,B.x1); }
      else if(B.x0<=A.x0+2 && B.x1>=A.x1-2){ if(B.y0>A.y0+2) A.y1=Math.min(A.y1,B.y0); else if(B.y1<A.y1-2) A.y0=Math.max(A.y0,B.y1); }
    }
    return out.filter(r=>r.x1-r.x0>=8&&r.y1-r.y0>=8);
  },
  /** Unisce i blocchi vicini (tratti di una linea tratteggiata, pezzi di un logo). */
  merge(rects,gap){
    let fr=rects.map(r=>({x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1}));
    for(let again=true;again;){
      again=false;
      for(let i=0;i<fr.length&&!again;i++) for(let j=i+1;j<fr.length&&!again;j++){
        const a=fr[i],b=fr[j];
        if(a.x0-gap<=b.x1&&b.x0-gap<=a.x1&&a.y0-gap<=b.y1&&b.y0-gap<=a.y1){
          fr[i]={x0:Math.min(a.x0,b.x0),y0:Math.min(a.y0,b.y0),x1:Math.max(a.x1,b.x1),y1:Math.max(a.y1,b.y1)}; fr.splice(j,1); again=true;
        }
      }
    }
    return fr;
  },
  /** `g` = {w,h,gray,thr} già ripulito (righe/testo/tabelle in bianco). */
  find(g,scale,exclude){
    const {w,h,gray,thr}=g;
    const B=Math.max(5,Math.round(3.5*scale)), bw=Math.ceil(w/B), bh=Math.ceil(h/B);
    const cnt=new Uint16Array(bw*bh);
    for(let y=0;y<h;y++){
      const row=y*w, by=((y/B)|0)*bw;
      for(let x=0;x<w;x++) if(gray[row+x]<thr) cnt[by+((x/B)|0)]++;
    }
    const need=Math.max(3,Math.round(B*B*0.07));
    const mark=new Uint8Array(bw*bh);
    for(let i=0;i<cnt.length;i++) mark[i]=cnt[i]>=need?1:0;
    // dilata di 1 blocco per unire parti vicine di una stessa figura
    const dil=new Uint8Array(mark.length);
    for(let y=0;y<bh;y++) for(let x=0;x<bw;x++){
      if(!mark[y*bw+x]) continue;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const xx=x+dx,yy=y+dy; if(xx>=0&&yy>=0&&xx<bw&&yy<bh) dil[yy*bw+xx]=1; }
    }
    const seen=new Uint8Array(mark.length), res=[];
    for(let i=0;i<mark.length;i++){
      if(!dil[i]||seen[i]) continue;
      let x0=bw,y0=bh,x1=-1,y1=-1, ink=0; const st=[i]; seen[i]=1;
      while(st.length){
        const k=st.pop(), cx=k%bw, cy=(k/bw)|0;
        x0=Math.min(x0,cx); x1=Math.max(x1,cx); y0=Math.min(y0,cy); y1=Math.max(y1,cy); if(mark[k]) ink+=cnt[k];
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
          const xx=cx+dx,yy=cy+dy; if(xx<0||yy<0||xx>=bw||yy>=bh) continue;
          const n=yy*bw+xx; if(dil[n]&&!seen[n]){ seen[n]=1; st.push(n); }
        }
      }
      const r={x0:x0*B/scale,y0:y0*B/scale,x1:(x1+1)*B/scale,y1:(y1+1)*B/scale,ink};
      res.push(r);
    }
    return res;
  }
};

/* ===========================================================================
   ANALISI DI UNA PAGINA
   =========================================================================== */
/** Ruota il canvas di `quarter` quarti di giro orari e di `deg` gradi (antiorari
    se positivi: raddrizza una pagina inclinata in senso orario), su sfondo bianco. */
function transformCanvas(src,quarter,deg){
  const swap=quarter%2===1, dw=swap?src.height:src.width, dh=swap?src.width:src.height;
  const c=document.createElement('canvas'); c.width=dw; c.height=dh;
  const cx=c.getContext('2d',{willReadFrequently:true}); cx.fillStyle='#fff'; cx.fillRect(0,0,dw,dh);
  cx.translate(dw/2,dh/2); cx.rotate(quarter*Math.PI/2-deg*Math.PI/180);
  cx.imageSmoothingQuality='high';
  cx.drawImage(src,-src.width/2,-src.height/2);
  return c;
}
/** Qualità del testo incorporato (livello OCR di una scansione): quota di
    "parole" plausibili. Un OCR scadente produce frammenti come `Ll4 l{\:`. */
function textSanity(items){
  let ok=0,n=0;
  items.forEach(it=>it.s.split(/\s+/).filter(Boolean).forEach(t=>{
    n++;
    const core=t.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9]+$/g,'');
    if(/^[0-9.,:\/\-]+$/.test(core) || (/^[A-Za-zÀ-ÿ'’-]{2,24}$/.test(core) && /[aeiouàèéìòùAEIOU]/.test(core))) ok++;
  }));
  return n?ok/n:0;
}
/** Sposta in verticale (pt) tutto il contenuto prodotto dall'analisi di una fascia. */
function shiftResult(r,dy){
  const si=it=>{ it.y0+=dy; it.y1+=dy; it.base+=dy; };
  r.items.forEach(si);
  r.tables.forEach(t=>{
    t.y0+=dy; t.y1+=dy; t.ys=t.ys.map(v=>v+dy);
    t.cells.forEach(c=>{ c.y0+=dy; c.y1+=dy; c.items.forEach(si); });
  });
  r.figures.forEach(f=>{ f.y0+=dy; f.y1+=dy; });
}
/** Confidenza media (pesata sui caratteri) delle parole lette. */
function meanConf(ws){
  let n=0,t=0; ws.forEach(w=>{ const L=(w.text||'').length; if(L){ n+=L; t+=w.confidence*L; } });
  return n? t/n : 0;
}
/** Copia ridotta di `f` con contrasto esteso (il nero diventa nero, il grigio
    chiaro del fondo bianco): aiuta Tesseract su testo sfocato. */
function shrinkStretch(src,f){
  const u=document.createElement('canvas'); u.width=Math.max(8,Math.round(src.width*f)); u.height=Math.max(8,Math.round(src.height*f));
  const ux=u.getContext('2d',{willReadFrequently:true}); ux.imageSmoothingQuality='high'; ux.drawImage(src,0,0,u.width,u.height);
  const id=ux.getImageData(0,0,u.width,u.height), d=id.data; let mn=255;
  for(let i=0;i<d.length;i+=4) if(d[i]<mn) mn=d[i];
  const span=Math.max(30,235-mn);
  for(let i=0;i<d.length;i+=4){ const v=Math.max(0,Math.min(255,Math.round((d[i]-mn)/span*255))); d[i]=d[i+1]=d[i+2]=v; }
  ux.putImageData(id,0,0); return u;
}
function cropCanvas(src,r,scale,maxSide,mask){
  const sx=Math.max(0,Math.floor(r.x0*scale)), sy=Math.max(0,Math.floor(r.y0*scale));
  const sw=Math.min(src.width-sx,Math.ceil((r.x1-r.x0)*scale)), sh=Math.min(src.height-sy,Math.ceil((r.y1-r.y0)*scale));
  if(sw<2||sh<2) return null;
  let k=Math.min(1,maxSide/Math.max(sw,sh));
  const c=document.createElement('canvas'); c.width=Math.max(1,Math.round(sw*k)); c.height=Math.max(1,Math.round(sh*k));
  const cx=c.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,c.width,c.height);
  cx.drawImage(src,sx,sy,sw,sh,0,0,c.width,c.height);
  if(mask&&mask.length){
    cx.fillStyle='#fff';
    mask.forEach(m=>{
      const x=(m.x0*scale-sx)*k, y=(m.y0*scale-sy)*k, w=(m.x1-m.x0)*scale*k, h=(m.y1-m.y0)*scale*k;
      if(x+w>0&&y+h>0&&x<c.width&&y<c.height) cx.fillRect(x-1,y-1,w+2,h+2);
    });
  }
  return c;
}
function sampleBg(src,cell,scale){
  // colore medio dei pixel chiari (sfondo) dentro la cella
  const x0=Math.round((cell.x0+1.5)*scale), y0=Math.round((cell.y0+1.5)*scale);
  const x1=Math.round((cell.x1-1.5)*scale), y1=Math.round((cell.y1-1.5)*scale);
  const w=x1-x0, h=y1-y0; if(w<4||h<4) return null;
  let d; try{ d=src.getContext('2d',{willReadFrequently:true}).getImageData(x0,y0,Math.min(w,400),Math.min(h,400)).data; }catch(e){ return null; }
  let r=0,g=0,b=0,n=0, step=Math.max(1,Math.floor(d.length/4/900))*4;
  const rs=[],gs=[],bs=[];
  for(let i=0;i<d.length;i+=step){ const lum=(d[i]*77+d[i+1]*151+d[i+2]*28)>>8; if(lum>90){ rs.push(d[i]); gs.push(d[i+1]); bs.push(d[i+2]); } }
  if(rs.length<10) return null;
  const mr=U.med(rs),mg=U.med(gs),mb=U.med(bs);
  if(mr>=243&&mg>=243&&mb>=243) return null;
  return [Math.round(mr),Math.round(mg),Math.round(mb)];
}

const Analyze={
  /** Costruisce il modello della pagina (blocchi in ordine di lettura). */
  buildModel(ctx){
    let {W,H,items,tables:rawTables,figures,fills}=ctx;
    if(ctx.mode==='raster'){
      // macchie di scansione lette come 1-3 lettere isolate ("e", "iii")
      items=items.filter((it,i)=>{
        if(!(it.s.length<=3 && it.conf<60 && /^[A-Za-zÀ-ÿ|!.,'`]{1,3}$/.test(it.s))) return true;
        return items.some((o,j)=>j!==i && o.x0-it.x1<3*o.size && it.x0-o.x1<3*o.size && Math.abs((o.y0+o.y1)/2-(it.y0+it.y1)/2)<1.2*o.size);
      });
    }
    const medSize=U.med(items.map(i=>i.size))||10;
    const model={W,H,mode:ctx.mode,blocks:[],medSize,stats:{tables:0,figures:0,paras:0}};
    // 1. tabelle a griglia: assegna gli item alle celle
    const tables=[]; const inTable=new Set();
    rawTables.forEach(t=>{
      if(ctx.assignItems!==false){
        items.forEach(it=>{
          if(inTable.has(it)) return;
          if(!U.inside(it,t)) return;
          const c=t.cells.find(c=>U.inside(it,c)); if(c){ c.items.push(it); inTable.add(it); }
        });
      }
      tables.push(t);
    });
    // sfondo celle (vettoriale: riempimenti; raster: campione colore)
    tables.forEach(t=>t.cells.forEach(c=>{
      if(fills){
        const f=fills.filter(f=>f.x0<=c.x0+2&&f.x1>=c.x1-2&&f.y0<=c.y0+2&&f.y1>=c.y1-2);
        const hit=f.length?f[f.length-1]:null;
        if(hit){ const [r,g,b]=hit.rgb; if(!(r>=243&&g>=243&&b>=243)) c.bg=hit.rgb; }
      } else if(ctx.canvas){ c.bg=sampleBg(ctx.canvas,c,ctx.scale); }
    }));
    // 2. testo libero -> righe -> segmenti
    const free=items.filter(it=>!inTable.has(it));
    let lineSegs=groupLines(free).map(lineSegments);
    // 3. tabelle senza bordi
    const st=streamTables(lineSegs,medSize);
    const streamT=st.tables;
    lineSegs=lineSegs.map(l=>l.filter(s=>!st.used.has(s))).filter(l=>l.length);
    // 4. intestazioni/etichette esterne
    const finalTables=tables.map(t=>{
      const nt=extendTable(t,lineSegs,medSize);
      if(nt.consumed&&nt.consumed.size) lineSegs=lineSegs.map(l=>l.filter(s=>!nt.consumed.has(s))).filter(l=>l.length);
      return nt;
    });
    const allTables=finalTables.concat(streamT);
    // 5. elementi per l'ordine di lettura
    const els=[];
    lineSegs.forEach(l=>l.forEach(s=>els.push({type:'seg',seg:s,x0:s.x0,y0:s.y0,x1:s.x1,y1:s.y1})));
    allTables.forEach(t=>{ t.type='table'; els.push({type:'table',block:t,x0:t.x0,y0:t.y0,x1:t.x1,y1:t.y1}); });
    (figures||[]).forEach(f=>{ f.type='figure'; els.push({type:'figure',block:f,x0:f.x0,y0:f.y0,x1:f.x1,y1:f.y1}); });
    const ordered=[]; const b0=textBounds(els)||{x0:0,y0:0,x1:W,y1:H};
    xyOrder(els,b0,medSize,ordered);
    model.blocks=buildParas(ordered);
    allTables.forEach(t=>t.cells.forEach(c=>{ c.content=cellContent(c); }));
    snapSizes(model.blocks,allTables,ctx.mode==='raster');
    model.stats.tables=allTables.length; model.stats.figures=(figures||[]).length;
    model.stats.paras=model.blocks.filter(b=>b.type==='para').length;
    // dimensione corpo testo (per i titoli): mediana pesata sui caratteri
    const sz=[]; model.blocks.forEach(b=>{ if(b.type==='para') for(let k=0;k<Math.min(b.chars,200);k+=4) sz.push(b.size); });
    model.bodySize=U.med(sz)||medSize;
    const bb=U.bbox(model.blocks.map(b=>b.type==='para'?{x0:b.x0,y0:b.y0,x1:b.x1,y1:b.y1}:b));
    model.bbox=bb||{x0:0,y0:0,x1:W,y1:H};
    return model;
  },

  /** Ultima risorsa (pagina illeggibile per il motore, o analisi andata in
      errore): la pagina intera come immagine, così non si perde nulla. */
  async pageAsFigure(page){
    const vp1=page.getViewport({scale:1}), W=vp1.width, H=vp1.height;
    const sc=U.clamp(1800/Math.max(W,H),1,2.5), vpx=page.getViewport({scale:sc});
    const cv=document.createElement('canvas'); cv.width=Math.round(vpx.width); cv.height=Math.round(vpx.height);
    await page.render({canvasContext:cv.getContext('2d'),viewport:vpx}).promise;
    const fig={x0:0,y0:0,x1:W,y1:H,dataUrl:cv.toDataURL('image/jpeg',0.9)};
    const m=this.buildModel({W,H,items:[],tables:[],figures:[fig],fills:null,mode:'vector',scale:sc,canvas:null});
    m.textChars=0; return m;
  },
  /** Pagina con testo vero (e grafica vettoriale). */
  async vector(page,opt){
    const vp=page.getViewport({scale:1}), W=vp.width, H=vp.height;
    const vs=await Vector.scan(page);
    const tc=(opt&&opt.tc)||await page.getTextContent();
    const items=itemsFromPdfjs(tc,page,vp);
    let h=vs.h, v=vs.v, snap=3;
    const pageArea=W*H;
    // pagina il cui testo è per lo più verticale/ruotato: non ricostruibile come
    // testo, si conserva come figura intera (meglio che perdere il contenuto)
    if(items.dropped>=6 && items.dropped>items.length){
      const m=await this.pageAsFigure(page); m.rotatedPage=true; return m;
    }
    const fullImg=vs.images.find(r=>(r.x1-r.x0)*(r.y1-r.y0)>=0.8*pageArea);
    let canvas=null, scale=0;
    const needRender=!!fullImg || vs.images.length>0 || vs.complex>0;
    if(needRender){
      scale=U.clamp(2400/Math.max(W,H),1,3);
      const vp2=page.getViewport({scale});
      canvas=document.createElement('canvas'); canvas.width=Math.round(vp2.width); canvas.height=Math.round(vp2.height);
      await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport:vp2}).promise;
    }
    if(fullImg && canvas){
      // scansione con livello di testo: le righe della tabella vanno cercate nell'immagine
      const g=Raster.gray(canvas);
      // scansione inclinata/girata o con livello di testo scadente: meglio rifare
      // tutto da capo (raddrizzare + OCR proprio) che fidarsi di quel livello
      const ori=Raster.orientation(g);
      if(textSanity(items)<0.85 || ori.rot90 || Math.abs(ori.angle)>=0.3){
        return {fullPageImage:true,needsRaster:true,textChars:0,stats:{tables:0,figures:0,paras:0}};
      }
      const rl=Raster.rulings(g,scale);
      h=h.concat(rl.h); v=v.concat(rl.v); snap=7;
    }
    let tables=Geo.tables(h,v,snap>3?{tolSnap:8,tolConn:10,adaptive:true,tolMax:12}:{},items);
    // figure: immagini incorporate (non a pagina intera) + grafica residua
    let figures=[];
    if(canvas){
      const g=Raster.gray(canvas), {w:gw,h:gh,gray}=g;
      const erase=(r,pad)=>{
        const x0=Math.max(0,Math.floor((r.x0-pad)*scale)), x1=Math.min(gw,Math.ceil((r.x1+pad)*scale));
        const y0=Math.max(0,Math.floor((r.y0-pad)*scale)), y1=Math.min(gh,Math.ceil((r.y1+pad)*scale));
        for(let y=y0;y<y1;y++) gray.fill(255,y*gw+x0,y*gw+x1);
      };
      const medSizeEst=U.med(items.map(i=>i.size))||10;
      // testo SU una forma piena (bianco su un cerchio colorato, titolo su un
      // banner): il bordo appena fuori dal testo è inchiostro. Rimane parte
      // della figura, non va nel flusso.
      const ringInk=(it)=>{
        const d=Math.max(2,Math.round(1.2*scale));
        const x0=Math.max(0,Math.round(it.x0*scale)-d), x1=Math.min(gw-1,Math.round(it.x1*scale)+d);
        const y0=Math.max(0,Math.round(it.y0*scale)-d), y1=Math.min(gh-1,Math.round(it.y1*scale)+d);
        let ink=0,n=0;
        for(let x=x0;x<=x1;x+=2){ n+=2; if(gray[y0*gw+x]<g.thr) ink++; if(gray[y1*gw+x]<g.thr) ink++; }
        for(let y=y0;y<=y1;y+=2){ n+=2; if(gray[y*gw+x0]<g.thr) ink++; if(gray[y*gw+x1]<g.thr) ink++; }
        return n? ink/n : 0;
      };
      items.forEach(it=>{ it.overlay=ringInk(it)>0.55; });
      items.forEach(it=>erase(it,1));
      tables.forEach(t=>erase(t,2));
      h.forEach(l=>erase({x0:l.s0,x1:l.s1,y0:l.a-l.t/2,y1:l.a+l.t/2},1.5));
      v.forEach(l=>erase({x0:l.a-l.t/2,x1:l.a+l.t/2,y0:l.s0,y1:l.s1},1.5));
      const imgRects=Figures.trimCovered(vs.images.filter(r=>(r.x1-r.x0)*(r.y1-r.y0)<0.8*pageArea));
      const covered=(a,b)=>{ const ox=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0), oy=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0); return ox>0&&oy>0&&ox*oy>=0.5*(a.x1-a.x0)*(a.y1-a.y0); };
      let cand=Figures.find(g,scale).filter(r=>(r.x1-r.x0)>=10&&(r.y1-r.y0)>=10&&(r.x1-r.x0)*(r.y1-r.y0)<0.7*pageArea);
      cand=cand.filter(r=>!imgRects.some(im=>covered(r,im)) && !tables.some(t=>covered(r,t)));
      const resid=Figures.merge(cand,Math.max(10,medSizeEst*1.2)).filter(r=>!imgRects.some(im=>covered(r,im)) && !tables.some(t=>covered(r,t)));
      const emb=imgRects.filter(r=>!tables.some(t=>covered(r,t)));
      emb.concat(resid).forEach((r,idx)=>{
        const isEmb=idx<emb.length;
        const mask=isEmb?null:items.filter(it=>!it.overlay&&(it.x0+it.x1)/2>r.x0-1&&(it.x0+it.x1)/2<r.x1+1&&(it.y0+it.y1)/2>r.y0-1&&(it.y0+it.y1)/2<r.y1+1);
        const c=cropCanvas(canvas,{x0:r.x0-1,y0:r.y0-1,x1:r.x1+1,y1:r.y1+1},scale,1600,mask);
        if(c) figures.push({x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1,dataUrl:c.toDataURL('image/png'),emb:isEmb});
      });
    }
    // il testo che sta SOPRA un'immagine/figura (titolo su una foto, didascalia
    // nel banner) è già visibile nel ritaglio: tenerlo anche nel flusso lo
    // duplicherebbe in un punto sbagliato della pagina
    let flowItems=items;
    if(figures.length){
      flowItems=items.filter(it=>{
        const cx=(it.x0+it.x1)/2, cy=(it.y0+it.y1)/2;
        return !figures.some(f=>(f.emb||it.overlay)&&cx>f.x0+1&&cx<f.x1-1&&cy>f.y0+1&&cy<f.y1-1);
      });
      flowItems.dropped=items.dropped;
    }
    const model=this.buildModel({W,H,items:flowItems,tables,figures,fills:vs.fills,mode:'vector',scale,canvas});
    model.fullPageImage=!!fullImg;
    model.textChars=items.reduce((n,i)=>n+i.s.length,0);
    return model;
  },

  /** Pagina senza testo: rasterizza, trova la griglia, OCR per cella e per pagina. */
  /** Confidenza media × quantità di testo letto da una fascia centrale della pagina:
      serve a scegliere il verso giusto (0°/180°, 90°/270°). */
  async _bandConf(canvas,ocr){
    const h=canvas.height, w=canvas.width, bh=Math.round(h*0.22), y0=Math.round(h*0.35);
    const c=document.createElement('canvas'); c.width=w; c.height=bh;
    const cx=c.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,w,bh); cx.drawImage(canvas,0,y0,w,bh,0,0,w,bh);
    try{
      const d=await ocr.run(c,6); const ws=ocrWords(d).filter(x=>keepWord(x.text,x.confidence,10));
      return ws.length? ws.reduce((n,x)=>n+x.confidence,0)/ws.length*Math.min(ws.length,40) : 0;
    }catch(err){ return 0; }
  },
  /** Analisi di un canvas già raddrizzato: griglie, OCR per cella, segmenti di
      testo e figure. Coordinate in punti relative al canvas. */
  async _rasterCore(canvas,scale,glyphPx,ocr,opt){
    const W=canvas.width/scale, H=canvas.height/scale;
    const g=Raster.gray(canvas), {w,h,gray,thr}=g;
    const rl=Raster.rulings(g,scale);
    const tables=Geo.tables(rl.h,rl.v,{minLen:26,tolSnap:8,tolConn:10,adaptive:true,tolMax:12});
    // cancella le righe dal livello di grigio (le celle si leggono meglio senza bordi)
    const erase=(r,pad)=>{
      const x0=Math.max(0,Math.floor((r.x0-pad)*scale)), x1=Math.min(w,Math.ceil((r.x1+pad)*scale));
      const y0=Math.max(0,Math.floor((r.y0-pad)*scale)), y1=Math.min(h,Math.ceil((r.y1+pad)*scale));
      for(let y=y0;y<y1;y++) gray.fill(255,y*w+x0,y*w+x1);
    };
    // si cancella solo la striscia della riga (poco margine ai lati): il testo
    // grassetto attaccato al bordo della cella non deve perdere le sue aste
    rl.h.forEach(l=>erase({x0:l.s0-0.9,x1:l.s1+0.9,y0:l.a-l.t/2-0.3,y1:l.a+l.t/2+0.3},0));
    rl.v.forEach(l=>erase({x0:l.a-l.t/2-0.3,x1:l.a+l.t/2+0.3,y0:l.s0-0.9,y1:l.s1+0.9},0));
    const mkCanvas=(x0,y0,cw,ch,pad,up)=>{
      const c=document.createElement('canvas'); c.width=cw+2*pad; c.height=ch+2*pad;
      const cx=c.getContext('2d'), id=cx.createImageData(c.width,c.height), d=id.data;
      d.fill(255);
      for(let y=0;y<ch;y++){ const sr=(y0+y)*w+x0; let o=((y+pad)*c.width+pad)*4;
        for(let x=0;x<cw;x++,o+=4){ const v=gray[sr+x]; d[o]=d[o+1]=d[o+2]=v; } }
      cx.putImageData(id,0,0);
      if(!up||up===1) return c;
      const u=document.createElement('canvas'); u.width=Math.round(c.width*up); u.height=Math.round(c.height*up);
      const ux=u.getContext('2d'); ux.imageSmoothingEnabled=true; ux.imageSmoothingQuality='high'; ux.drawImage(c,0,0,u.width,u.height);
      return u;
    };
    const inkIn=(x0,y0,x1,y1)=>{ let n=0; for(let y=y0;y<y1;y++){ const r=y*w; for(let x=x0;x<x1;x++) if(gray[r+x]<thr) n++; } return n; };
    // OCR delle celle (in parallelo con il pool di worker)
    const jobs=[]; let total=0, done=0;
    const report=()=>opt&&opt.onProgress&&opt.onProgress(done,total);
    const up=(opt&&opt.cellUp)||1;
    tables.forEach(t=>t.cells.forEach(c=>{
      const x0=Math.max(0,Math.round((c.x0+1.2)*scale)), y0=Math.max(0,Math.round((c.y0+1.2)*scale));
      const x1=Math.min(w,Math.round((c.x1-1.2)*scale)), y1=Math.min(h,Math.round((c.y1-1.2)*scale));
      const cw=x1-x0, ch=y1-y0; if(cw<6||ch<6) return;
      if(inkIn(x0,y0,x1,y1)<Math.max(12,cw*ch*0.0004)) return;
      total++;
      jobs.push((async()=>{
        const cv=mkCanvas(x0,y0,cw,ch,12,up);
        const minC=(opt&&opt.cellMinConf!=null)?opt.cellMinConf:5;
        let best={data:await ocr.run(cv,6),f:1};
        best.conf=meanConf(ocrWords(best.data));
        // testo sfocato o grassetto impastato: un secondo tentativo a scala ridotta
        // e con contrasto esteso spesso legge meglio; si tiene il risultato più sicuro
        if(best.conf<85){
          const alt=shrinkStretch(cv,0.8);
          const d2=await ocr.run(alt,6), c2=meanConf(ocrWords(d2));
          if(c2>best.conf+2) best={data:d2,f:0.8,conf:c2};
        }
        c.items=itemsFromWords(ocrWords(best.data),scale*up*best.f,(x0-12)*up*best.f,(y0-12)*up*best.f,minC);
      })().catch(()=>{}).then(()=>{ done++; report(); }));
    }));
    // fuori dalle tabelle: segmenti di testo/figure sull'inchiostro rimasto
    tables.forEach(t=>erase(t,0.5));
    const hG=Math.max(8,glyphPx||GLYPH_TARGET);
    const segs=Raster.segments(g,hG);
    const figRects=[], items=[];
    segs.forEach(s=>{
      const sw=s.x1-s.x0, sh=s.y1-s.y0;
      if(sh>12*hG){ figRects.push(s); return; }
      total++;
      const pad=10;
      jobs.push(ocr.run(mkCanvas(s.x0,s.y0,sw,sh,pad,1),sh>2.8*hG?6:(sw<10*hG&&sh<1.9*hG?8:7)).then(data=>{
        // una parola vera ma incerta ("Orario" a 23) in una riga letta bene si tiene; il rumore
        // tipico (token corti/strani) resta scartato
        const all=ocrWords(data), lineConf=meanConf(all);
        const ws=all.filter(wd=>{
          const t=(wd.text||'').trim();
          if(keepWord(t,wd.confidence,30)) return true;
          if(lineConf<70) return false;
          if(wd.confidence>=15 && /^[A-Za-zÀ-ÿ]{4,}$/.test(t) && /[aeiouàèéìòù]/i.test(t) && keepWord(t,100,0)) return true;
          return wd.confidence>=50 && /^[-–—\/&•*+=]$/.test(t);
        });
        if(!ws.length){ figRects.push(s); return; }
        const conf=ws.reduce((n,wd)=>n+wd.confidence,0)/ws.length;
        if(conf<35){ figRects.push(s); return; }
        itemsFromWords(ws,scale,s.x0-pad,s.y0-pad,-1).forEach(it=>items.push(it));
      }).catch(()=>{}).then(()=>{ done++; report(); }));
    });
    await Promise.all(jobs);
    // figure: segmenti che non sono testo (loghi, icone, foto), unendo i vicini
    const pageArea=W*H;
    const fr=Figures.merge(figRects.map(s=>({x0:s.x0/scale,y0:s.y0/scale,x1:s.x1/scale,y1:s.y1/scale})),Math.max(10,hG/scale*1.2));
    const figures=[];
    fr.filter(r=>{
      const fw=r.x1-r.x0, fh=r.y1-r.y0;
      if(fw<12||fh<12||fw*fh>=0.6*pageArea) return false;
      if((fw>0.8*W&&fh<0.03*H)||(fh>0.8*H&&fw<0.03*W)) return false;
      if(Math.min(fw,fh)<16 && Math.max(fw,fh)>3*Math.min(fw,fh)) return false;   // filetto/residuo di riga
      return true;
    }).forEach(r=>{
      const c=cropCanvas(canvas,{x0:r.x0-1,y0:r.y0-1,x1:r.x1+1,y1:r.y1+1},scale,1600);
      if(c) figures.push({x0:r.x0,y0:r.y0,x1:r.x1,y1:r.y1,dataUrl:c.toDataURL('image/png')});
    });
    return {items,tables,figures};
  },
  /** Fasce orizzontali di inchiostro separate da vuoti larghi: ognuna può avere
      una sua inclinazione (tabelle fotocopiate/scansionate una per una). */
  _bands(g,hG){
    const {w,h,gray}=g, thr=Math.max(g.thr,Math.min(235,g.bg-40));
    const gap=Math.round(2.5*hG), bands=[]; let st=-1,last=-1;
    for(let y=0;y<h;y++){
      let c=0; const r=y*w; for(let x=0;x<w;x+=2) if(gray[r+x]<thr){ c++; if(c>=2) break; }
      if(c>=2){ if(st<0) st=y; last=y; }
      else if(st>=0 && y-last>gap){ bands.push([st,last]); st=-1; }
    }
    if(st>=0) bands.push([st,last]);
    return {bands,gap};
  },
  async raster(page,ocr,opt){
    const vp1=page.getViewport({scale:1}), W0=vp1.width, H0=vp1.height; let W=W0, H=H0;
    const renderAt=async s=>{
      const v=page.getViewport({scale:s}), c=document.createElement('canvas'); c.width=Math.round(v.width); c.height=Math.round(v.height);
      await page.render({canvasContext:c.getContext('2d',{willReadFrequently:true}),viewport:v}).promise; return c;
    };
    // scala di rasterizzazione: i glifi devono avere l'altezza con cui Tesseract
    // legge meglio (ingrandire una scansione a bassa risoluzione la sfoca e
    // peggiora la lettura; ridurre un 300 DPI nitido non fa danni)
    let scale=opt&&opt.scale, canvas=null, glyphPx=0;
    const st=(opt&&opt.state)||{};
    let quarter=0, skew=0;
    const sp=Math.min(2.0,Math.sqrt(12e6/(W*H)));
    let pc=await renderAt(sp);
    // 1. orientamento: pagina girata di 90° o capovolta; 2. inclinazione fine
    let ori=Raster.orientation(Raster.gray(pc));
    if(ori.rot90){
      // quale dei due versi? si prova l'OCR su una fascia centrale in entrambi
      const cand=[1,3].map(q=>({q,c:transformCanvas(pc,q,0)}));
      const sc=await Promise.all(cand.map(o=>this._bandConf(o.c,ocr)));
      quarter=sc[0]>=sc[1]?1:3;
    } else if(st.flipChecked!==true){
      // 0° o 180°: si verifica una volta sola sul primo documento raster (le scansioni di un
      // file hanno quasi sempre lo stesso verso)
      const a=await this._bandConf(pc,ocr), b=await this._bandConf(transformCanvas(pc,2,0),ocr);
      st.flipChecked=true; st.flip=b>a*1.4 && b>30;
    }
    if(!ori.rot90 && st.flip) quarter=2;
    if(quarter){ pc=transformCanvas(pc,quarter,0); ori=Raster.orientation(Raster.gray(pc)); }
    skew=Math.abs(ori.angle)>=0.15 && !ori.rot90 ? ori.angle : 0;
    const pcFix=(quarter||skew)?transformCanvas(pc,0,skew):pc;
    const rotated=quarter%2===1;
    const W1=rotated?H0:W0, H1=rotated?W0:H0; W=W1; H=H1;
    const maxScale=Math.min(300/72,4000/Math.max(W1,H1),Math.sqrt(40e6/(W1*H1)));
    if(!scale){
      const gh=Raster.glyphHeight(Raster.gray(pcFix));
      scale=gh?U.clamp(sp*GLYPH_TARGET/gh,1.0,maxScale):maxScale;
      glyphPx=gh?gh*scale/sp:0;
      if(Math.abs(scale-sp)/sp<0.12){ scale=sp; canvas=pcFix; }
    }
    if(!canvas){
      let full=await renderAt(scale);
      canvas=(quarter||skew)?transformCanvas(full,quarter,skew):full;
    }
    // fasce con inclinazione propria (tabelle storte, ciascuna a modo suo)
    const gG=Raster.gray(canvas);
    const hGg=Math.max(8,glyphPx||GLYPH_TARGET);
    const {bands,gap}=this._bands(gG,hGg);
    const info=bands.map(([y0,y1])=>{
      if(y1-y0<hGg*3) return {y0,y1,angle:0};
      const sub={w:gG.w,h:y1-y0+1,gray:gG.gray.subarray(y0*gG.w,(y1+1)*gG.w),thr:gG.thr,bg:gG.bg};
      return {y0,y1,angle:Raster.orientation(sub).angle};
    });
    let res;
    if(info.some(b=>Math.abs(b.angle)>=0.25)){
      const parts=[];
      const padMax=Math.round(Math.min(0.02*gG.w,gap*0.45));
      for(const b of info){
        const y0=Math.max(0,b.y0-padMax), y1=Math.min(gG.h,b.y1+1+padMax);
        let bc=document.createElement('canvas'); bc.width=gG.w; bc.height=y1-y0;
        const bx=bc.getContext('2d',{willReadFrequently:true}); bx.fillStyle='#fff'; bx.fillRect(0,0,bc.width,bc.height); bx.drawImage(canvas,0,y0,gG.w,y1-y0,0,0,gG.w,y1-y0);
        if(Math.abs(b.angle)>=0.25) bc=transformCanvas(bc,0,b.angle);
        const r=await this._rasterCore(bc,scale,glyphPx,ocr,opt);
        shiftResult(r,y0/scale);
        parts.push(r);
      }
      res={items:[].concat(...parts.map(p=>p.items)),tables:[].concat(...parts.map(p=>p.tables)),figures:[].concat(...parts.map(p=>p.figures))};
    } else res=await this._rasterCore(canvas,scale,glyphPx,ocr,opt);
    const {items,tables,figures}=res;
    const model=this.buildModel({W,H,items,tables,figures,fills:null,mode:'raster',scale,canvas,assignItems:false});
    model.ocr=true;
    return model;
  }
};

/* ===========================================================================
   LAYOUT DOCUMENTO + RENDERING HTML
   =========================================================================== */
const Layout={
  /** Sceglie margini e fattore di scala K (px per punto sorgente) perché il
      contenuto di OGNI pagina PDF stia dentro la pagina dell'editor. */
  compute(models,pageMm){
    const [pw,ph]=pageMm;
    const W=Math.max(...models.map(m=>m.W)), H=Math.max(...models.map(m=>m.H));
    const K0=Math.min(pw*MM2PX/W,ph*MM2PX/H);
    const minX0=Math.min(...models.map(m=>m.bbox.x0)), maxX1=Math.max(...models.map(m=>m.bbox.x1));
    const minY0=Math.min(...models.map(m=>m.bbox.y0)), maxY1=Math.max(...models.map(m=>m.bbox.y1));
    const toMm=pt=>pt*K0/MM2PX;
    const mm={left:U.clamp(toMm(minX0),6,25),right:U.clamp(toMm(W-maxX1),6,25),
      top:U.clamp(toMm(minY0),6,25),bottom:U.clamp(toMm(H-maxY1),8,25)};
    const cwPx=(pw-mm.left-mm.right)*MM2PX, chPx=(ph-mm.top-mm.bottom)*MM2PX;
    const bw=Math.max(1,maxX1-minX0), bh=Math.max(1,maxY1-minY0);
    const K=Math.min(K0*1.25,cwPx/bw,chPx/bh)*0.985;
    const bodies=models.map(m=>m.bodySize).filter(Boolean);
    return {K,mm,minX0,minY0,maxX1,maxY1,bodySize:U.med(bodies)||10,
      contentWpx:cwPx,contentHpx:chPx,pageMm:[pw,ph],factor:K/PT2PX};
  },
  pt(size,L){ return U.clamp(Math.round(size*L.K*0.75*2)/2,5,72); },
  px(v){ return (Math.round(v*10)/10)+'px'; },
  render(model,L){
    // figure accanto al testo (icona a sinistra di un titolo, logo a destra di
    // un indirizzo…): si affiancano con float invece di impilarsi
    const blocks=model.blocks.slice();
    const ov=(a,b)=>Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);
    // "a sinistra di": un'ombra o un bordo possono invadere di poco l'altro blocco
    const leftOf=(a,b)=>a.x1<=b.x0+0.12*Math.min(a.x1-a.x0,b.x1-b.x0)+2;
    for(let i=0;i<blocks.length;i++){
      const f=blocks[i]; if(f.type!=='figure') continue;
      if(f.float) continue;
      const hgt=f.y1-f.y0, nx=blocks[i+1];
      if(nx && !nx.float && ov(f,nx)>0.4*Math.min(hgt,nx.y1-nx.y0) && leftOf(f,nx)) { f.float='left'; continue; }
      // figura a destra di blocchi già emessi: si anticipa prima del PRIMO blocco
      // con cui si sovrappone in altezza (tutto alla sua sinistra) e fluttua a destra
      let first=-1;
      for(let k=i-1;k>=0;k--){
        const b=blocks[k];
        if(b.float || !leftOf(b,f) || b.y1<f.y0-2) break;
        if(ov(f,b)>0.4*Math.min(hgt,b.y1-b.y0)) first=k;
      }
      if(first>=0){ f.float='right'; blocks.splice(i,1); blocks.splice(first,0,f); }
    }
    let html='', prevBottom=L.minY0, flo=null;
    blocks.forEach(b=>{
      let clear='';
      if(flo && b.type!=='figure'){
        if(flo.pair===undefined) flo.pair=b;
        else if(b.y0>=flo.bottom-1){ clear=';clear:both'; flo=null; }
      }
      if(b.type==='para'){ const r=this.para(b,L,prevBottom,model.ocr,clear,model.bodySize); html+=r.html; prevBottom=r.bottom; }
      else if(b.type==='table'){ html+=this.table(b,L,prevBottom,model,clear); prevBottom=b.y1; }
      else if(b.type==='figure'){
        html+=this.figure(b,L,prevBottom,model);
        if(b.float){ flo={bottom:b.y1,pair:undefined}; } else prevBottom=b.y1;
      }
    });
    return html||'<p><br></p>';
  },
  para(p,L,prevBottom,model_ocr,clear,bodySize){
    const K=L.K, pt=this.pt(p.size,L);
    const pitch=p.pitch||p.size*1.22, lh=U.clamp(pitch/p.size,1.0,2.4);
    const top=p.base0-(pitch/2+0.3*p.size);
    const mt=Math.max(0,Math.min(top-prevBottom,400))*K;
    const col=p.col||{x0:p.x0,x1:p.x1};
    const leftEdge=p.align==='left'?p.bodyX0:col.x0;
    // margine destro con un po' di respiro: il font di sostituzione ha larghezze
    // diverse dall'originale e una colonna stretta per un titolo andrebbe a capo
    const slack=(0.15*(col.x1-col.x0)+1.2*p.size)*K;
    const ml=Math.max(0,(leftEdge-L.minX0)*K), mr=Math.max(0,(L.maxX1-col.x1)*K-slack);
    const indent=p.align==='left'&&p.nLines>1&&p.firstX0-p.bodyX0>0.7*p.size?(p.firstX0-p.bodyX0)*K:0;
    const ratio=p.size/(bodySize||L.bodySize);
    let tag='p';
    if(p.nLines<=3 && p.chars<=140){ if(ratio>=1.7) tag='h1'; else if(ratio>=1.4) tag='h2'; else if(ratio>=1.18) tag='h3'; }
    let inner=p.html;
    if(p.parts){
      const parts=p.parts.slice(), last=parts[parts.length-1];
      let fl='';
      if(parts.length>=2 && last.x1>=col.x1-1.5*p.size && last.x0-parts[parts.length-2].x1>3*p.size){ fl='<span style="float:right">'+last.html+'</span>'; parts.pop(); }
      inner=fl+parts[0].html;
      for(let k=1;k<parts.length;k++) inner+='<span style="display:inline-block;margin-left:'+this.px(Math.max(0,(parts[k].x0-parts[k-1].x1)*K))+'">'+parts[k].html+'</span>';
    }
    let st='margin:'+this.px(mt)+' '+this.px(mr)+' 0 '+this.px(ml)+';font-size:'+pt+'pt;line-height:'+(Math.round(lh*100)/100);
    if(p.align!=='left') st+=';text-align:'+p.align;
    if(indent>1) st+=';text-indent:'+this.px(indent);
    st+=';font-weight:'+((p.bold||(tag!=='p'&&model_ocr))?'bold':'normal');
    if(clear) st+=clear;
    return {html:'<'+tag+' data-bb-src="pdf" style="'+st+'">'+inner+'</'+tag+'>',bottom:top+p.nLines*pitch};
  },
  figure(f,L,prevBottom,model){
    const K=L.K, mt=Math.max(0,Math.min(f.y0-prevBottom,400))*K, ml=Math.max(0,(f.x0-L.minX0)*K);
    const w=(f.x1-f.x0)*K, h=(f.y1-f.y0)*K;
    if(f.float){
      const side=f.float, mrg=side==='left'?this.px(mt)+' 0 0 '+this.px(ml):this.px(mt)+' '+this.px(Math.max(0,(L.maxX1-f.x1)*K))+' 0 0';
      return '<p data-bb-src="pdf" style="margin:0;height:0;line-height:0"><img data-bb-extract="image" src="'+f.dataUrl+'" alt="Figura" style="float:'+side+';margin:'+mrg+';width:'+this.px(w)+';height:'+this.px(h)+'"></p>';
    }
    return '<p data-bb-src="pdf" style="margin:'+this.px(mt)+' 0 0 '+this.px(ml)+';line-height:0"><img data-bb-extract="image" src="'+f.dataUrl+'" alt="Figura" style="width:'+this.px(w)+';height:'+this.px(h)+'"></p>';
  },
  table(t,L,prevBottom,model,clear){
    const K=L.K;
    const mt=Math.max(0,Math.min(t.y0-prevBottom,400))*K, ml=Math.max(0,(t.x0-L.minX0)*K);
    const widths=[]; for(let c=0;c<t.C;c++) widths.push((t.xs[c+1]-t.xs[c])*K);
    const heights=[]; for(let r=0;r<t.R;r++) heights.push((t.ys[r+1]-t.ys[r])*K);
    const totalW=widths.reduce((a,b)=>a+b,0);
    // occupazione: ogni posizione della griglia deve avere una cella
    const occ=Array.from({length:t.R},()=>new Array(t.C).fill(false));
    const cells=t.cells.slice();
    cells.forEach(c=>{ for(let a=0;a<c.rs;a++) for(let b=0;b<c.cs;b++) if(occ[c.r+a]) occ[c.r+a][c.c+b]=true; });
    for(let r=0;r<t.R;r++) for(let c=0;c<t.C;c++) if(!occ[r][c]) cells.push({r,c,rs:1,cs:1,x0:t.xs[c],x1:t.xs[c+1],y0:t.ys[r],y1:t.ys[r+1],b:{t:false,b:false,l:false,r:false},items:[],bg:null,outer:true});
    cells.sort((a,b)=>a.r-b.r||a.c-b.c);
    const bw=Math.max(1,Math.min(3,Math.round((t.thick||1)*K)));
    const lineCol='#222';
    const tableSize=U.med(cells.map(c=>c.content&&c.content.size).filter(Boolean));
    let html='<table data-bb-src="pdf" style="width:'+this.px(totalW)+';max-width:100%;margin:'+this.px(mt)+' 0 0 '+this.px(ml)+';table-layout:fixed'+(clear||'')+'"><colgroup>'+
      widths.map(w=>'<col style="width:'+this.px(w)+'">').join('')+'</colgroup><tbody>';
    for(let r=0;r<t.R;r++){
      html+='<tr style="height:'+this.px(heights[r])+'">';
      cells.filter(c=>c.r===r).forEach(c=>{
        const cc=c.content||cellContent(c);
        let st=cc.empty?'padding:0;line-height:1px;font-size:1px':'padding:1px 3px;line-height:1.15';
        const sides=[]; ['t','r','b','l'].forEach(k=>{ const nm={t:'top',r:'right',b:'bottom',l:'left'}[k];
          const wpx=c.bt&&c.bt[k]?U.clamp(Math.round(c.bt[k]*K),1,4):bw;
          sides.push('border-'+nm+':'+(c.b[k]?wpx+'px solid '+lineCol:'none')); });
        st+=';'+sides.join(';');
        if(cc.size){
          // in una tabella il testo ha di norma un corpo solo: quello tipico, salvo titoli
          // chiaramente più grandi. Poi non deve far crescere la riga oltre l'altezza
          // originale, ma senza scendere sotto l'80% del corpo tipico (meglio una riga alta)
          const typ=tableSize||cc.size;
          const size=cc.size>typ*1.3?cc.size:typ;
          let pt=this.pt(size,L);
          if(cc.nLines){
            let rowH=0; for(let k=0;k<c.rs;k++) rowH+=heights[c.r+k]||0;
            const maxPx=(rowH-3)/(Math.min(cc.nLines,4)*1.15);
            if(maxPx>0 && pt*PT2PX>maxPx) pt=Math.max(pt*0.8,Math.floor(maxPx/PT2PX*2)/2);
          }
          st+=';font-size:'+pt+'pt';
        }
        if(cc.align!=='left') st+=';text-align:'+cc.align;
        if(cc.valign!=='top') st+=';vertical-align:'+cc.valign; else st+=';vertical-align:top';
        if(cc.bold) st+=';font-weight:bold';
        if(c.outer) st+=';white-space:nowrap';
        if(c.bg) st+=';background-color:rgb('+c.bg.join(',')+')';
        const span=(c.cs>1?' colspan="'+c.cs+'"':'')+(c.rs>1?' rowspan="'+c.rs+'"':'');
        html+='<td'+span+' style="'+st+'">'+cc.html+'</td>';
      });
      html+='</tr>';
    }
    return html+'</tbody></table>';
  }
};

/* ===========================================================================
   OCR: pool di worker Tesseract (celle in parallelo + worker per pagina)
   =========================================================================== */
const OcrPool={
  async create(opt){
    opt=opt||{};
    const T=root.Tesseract; if(!T) throw new Error('Tesseract non caricato');
    const lang=opt.lang||'ita+eng', langPath=opt.langPath||'vendor/tessdata';
    const logger=opt.logger||(()=>{});
    const mk=async()=>{
      let w;
      // tutto in locale (worker, core WASM e modelli lingua da vendor/): senza, Tesseract.js
      // scaricherebbe worker e core da un CDN e l'OCR non funzionerebbe offline. Percorsi
      // assoluti: il worker li risolve rispetto alla propria origine, non alla pagina.
      const abs=p=>new URL(p,location.href).href;
      w=await T.createWorker(lang,1,{langPath:abs(langPath),workerPath:abs('vendor/tesseract/worker.min.js'),corePath:abs('vendor/tesseract/'),logger});
      await w.setParameters({user_defined_dpi:'300',tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
      w.__psm='6';
      return w;
    };
    const n=U.clamp((navigator.hardwareConcurrency||4)-1,1,3);
    const workers=await Promise.all(Array.from({length:n},mk));
    const free=workers.slice(), q=[];
    const pump=()=>{
      while(free.length&&q.length){
        const w=free.pop(), job=q.shift();
        (async()=>{
          const psm=String(job.psm);
          if(w.__psm!==psm){ await w.setParameters({tessedit_pageseg_mode:psm}); w.__psm=psm; }
          return (await w.recognize(job.canvas)).data;
        })().then(job.res,job.rej).finally(()=>{ free.push(w); pump(); });
      }
    };
    return {
      n,
      run:(canvas,psm)=>new Promise((res,rej)=>{ q.push({canvas,psm:psm||6,res,rej}); pump(); }),
      async terminate(){ await Promise.all(workers.map(w=>w.terminate().catch(()=>{}))); }
    };
  }
};

root.PdfEngine={Analyze,Layout,OcrPool,Raster,Geo,Vector,U,keepWord,transformCanvas,textSanity,PT2MM,MM2PX};
})(typeof window!=='undefined'?window:globalThis);
