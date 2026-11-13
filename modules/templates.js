/* Modelli di documento: lettera, relazione, curriculum, verbale, avviso. Ogni modello imposta testo guida,
   margini, intestazione/piè di pagina e stili. Testi in italiano e inglese (lingua dell'interfaccia). */
(function(){
'use strict';
const {State,Pages,escapeHtml,toast,Modal}=BB;

const J='text-align:justify';
const h=(t,s)=>'<h1 style="'+(s||'font-size:22pt;font-weight:700;margin:0 0 8pt')+'">'+t+'</h1>';
const h2=t=>'<h2 style="font-size:14pt;font-weight:700;margin:14pt 0 4pt;color:#1d4ed8">'+t+'</h2>';
const p=(t,s)=>'<p'+(s?' style="'+s+'"':'')+'>'+t+'</p>';
const ul=a=>'<ul>'+a.map(x=>'<li>'+x+'</li>').join('')+'</ul>';
const sp=()=>'<p><br></p>';
const ch=t=>'<h1 style="font-size:22pt;font-weight:700;margin:0 0 8pt">'+t+'</h1>';

const T={
  it:{
    letter:{name:'Lettera formale',desc:'Mittente, destinatario, oggetto e firma',
      html:()=>[p('[Nome e Cognome]<br>[Via e numero civico]<br>[CAP Città (Provincia)]<br>[Telefono] · [Email]','text-align:right'),sp(),p('[Luogo], [data]','text-align:right'),sp(),
        p('Spett.le [Destinatario]<br>[Ufficio / Reparto]<br>[Indirizzo]'),sp(),p('<b>Oggetto: [descrivi in una riga lo scopo della lettera]</b>'),sp(),
        p('Gentile [Nome Cognome],',J),p('[Apri con il motivo della lettera in una o due frasi chiare.]',J),p('[Sviluppa il contenuto: informazioni, richieste, date. Un paragrafo per ogni concetto.]',J),
        p('[Concludi con ciò che ti aspetti e un ringraziamento.]',J),sp(),p('Cordiali saluti,'),sp(),sp(),p('[Firma]<br>[Nome e Cognome]')].join('')},
    report:{name:'Relazione',desc:'Frontespizio, sommario e capitoli numerati',
      html:()=>[sp(),sp(),h('[Titolo della relazione]','font-size:30pt;font-weight:700;text-align:center;margin:60pt 0 10pt'),p('[Sottotitolo o descrizione]','text-align:center;font-size:14pt;color:#5b6470'),sp(),
        p('[Autore] — [Data]','text-align:center'),'<p><br></p>',
        '<div class="bb-toc" contenteditable="false" data-bb-toc="1"></div>',
        ch('1. Introduzione'),p('[Presenta il contesto, lo scopo e la struttura del documento.]',J),
        ch('2. Analisi'),p('[Descrivi dati, metodo e osservazioni.]',J),h2('2.1 Primo aspetto'),p('[Dettagli.]',J),
        ch('3. Risultati'),p('[Esponi i risultati principali.]',J),ul(['[Risultato 1]','[Risultato 2]','[Risultato 3]']),
        ch('4. Conclusioni'),p('[Sintesi e prossimi passi.]',J)].join(''),
      hf:{header:{l:'{titolo}',c:'',r:''},footer:{l:'',c:'',r:''},num:{pos:'f-c',fmt:'di'},skipFirst:true,size:9,color:'#6b7280',hLine:true,fLine:false}},
    cv:{name:'Curriculum vitae',desc:'Dati personali, esperienze, formazione, competenze',
      html:()=>[h('[Nome Cognome]','font-size:26pt;font-weight:700;margin:0'),p('[Professione desiderata]','font-size:13pt;color:#1d4ed8;margin:0 0 6pt'),p('[Città] · [Telefono] · [Email] · [Sito o profilo]','color:#5b6470;border-bottom:1px solid #cbd2dc;padding-bottom:6pt'),
        h2('Profilo'),p('[Due o tre righe che riassumono esperienza, punti di forza e obiettivi.]',J),
        h2('Esperienze lavorative'),p('<b>[Ruolo]</b> — [Azienda], [Città] <span style="float:right;color:#5b6470">[mm/aaaa – mm/aaaa]</span>'),ul(['[Attività o risultato concreto, con numeri se possibile]','[Attività o risultato]']),
        p('<b>[Ruolo]</b> — [Azienda], [Città] <span style="float:right;color:#5b6470">[mm/aaaa – mm/aaaa]</span>'),ul(['[Attività o risultato]']),
        h2('Istruzione e formazione'),p('<b>[Titolo di studio]</b> — [Istituto] <span style="float:right;color:#5b6470">[anno]</span>'),
        h2('Competenze'),ul(['[Competenza tecnica] — [livello]','[Lingue] — [livello]','[Altre competenze]']),
        h2('Altre informazioni'),p('[Patente, disponibilità, interessi.]'),
        p('Autorizzo il trattamento dei dati personali ai sensi del Regolamento UE 2016/679.','font-size:8pt;color:#5b6470;margin-top:14pt')].join(''),
      margins:{top:18,bottom:18,left:20,right:20}},
    minutes:{name:'Verbale di riunione',desc:'Presenti, ordine del giorno, decisioni e azioni',
      html:()=>[h('Verbale di riunione','font-size:22pt;font-weight:700;margin:0 0 8pt'),p('<b>Data:</b> [gg/mm/aaaa] &nbsp;&nbsp; <b>Ora:</b> [inizio – fine] &nbsp;&nbsp; <b>Luogo:</b> [sede o link]'),p('<b>Presenti:</b> [nomi]'),p('<b>Assenti:</b> [nomi]'),p('<b>Verbalizzante:</b> [nome]'),
        h2('Ordine del giorno'),'<ol><li>[Punto 1]</li><li>[Punto 2]</li><li>[Punto 3]</li></ol>',
        h2('Discussione'),p('<b>1. [Punto 1]</b>'),p('[Sintesi di quanto emerso.]',J),p('<b>2. [Punto 2]</b>'),p('[Sintesi di quanto emerso.]',J),
        h2('Decisioni prese'),ul(['[Decisione]','[Decisione]']),
        h2('Azioni da svolgere'),ul(['[Azione] — responsabile: [nome] — scadenza: [data]','[Azione] — responsabile: [nome] — scadenza: [data]']),
        p('Prossima riunione: [data e ora].','margin-top:12pt')].join(''),
      hf:{header:{l:'',c:'',r:'{data}'},footer:{l:'',c:'',r:''},num:{pos:'f-r',fmt:'di'},skipFirst:false,size:9,color:'#6b7280',hLine:false,fLine:false}},
    notice:{name:'Avviso / Circolare',desc:'Comunicazione ufficiale con oggetto e firma',
      html:()=>[p('[Nome dell\'ente o dell\'organizzazione]','text-align:center;font-size:16pt;font-weight:700;margin:0'),p('[Indirizzo · Telefono · Email]','text-align:center;color:#5b6470;border-bottom:2px solid #1d4ed8;padding-bottom:8pt'),sp(),
        p('Prot. n. [numero] del [data]','text-align:right'),sp(),p('<b>CIRCOLARE / AVVISO N. [numero]</b>','text-align:center;font-size:14pt'),sp(),p('<b>Oggetto: [oggetto della comunicazione]</b>'),sp(),
        p('Ai [destinatari]',''),sp(),p('[Testo della comunicazione: cosa, quando, dove, chi è coinvolto, cosa deve fare il destinatario.]',J),p('[Eventuali scadenze o indicazioni operative.]',J),sp(),
        p('[Luogo], [data]'),sp(),p('Il [ruolo]<br>[Nome Cognome]','text-align:right')].join('')}
  },
  en:{
    letter:{name:'Formal letter',desc:'Sender, recipient, subject and signature',
      html:()=>[p('[Full name]<br>[Street and number]<br>[City, postal code]<br>[Phone] · [Email]','text-align:right'),sp(),p('[Place], [date]','text-align:right'),sp(),
        p('[Recipient name]<br>[Company / Department]<br>[Address]'),sp(),p('<b>Subject: [one-line summary of the letter]</b>'),sp(),
        p('Dear [Name],',J),p('[Open with the reason for writing in one or two clear sentences.]',J),p('[Develop the content: information, requests, dates. One paragraph per idea.]',J),
        p('[Close with what you expect and a thank-you.]',J),sp(),p('Yours sincerely,'),sp(),sp(),p('[Signature]<br>[Full name]')].join('')},
    report:{name:'Report',desc:'Cover, table of contents and numbered chapters',
      html:()=>[sp(),sp(),h('[Report title]','font-size:30pt;font-weight:700;text-align:center;margin:60pt 0 10pt'),p('[Subtitle or description]','text-align:center;font-size:14pt;color:#5b6470'),sp(),
        p('[Author] — [Date]','text-align:center'),'<p><br></p>',
        '<div class="bb-toc" contenteditable="false" data-bb-toc="1"></div>',
        ch('1. Introduction'),p('[Present the context, purpose and structure of the document.]',J),
        ch('2. Analysis'),p('[Describe data, method and observations.]',J),h2('2.1 First aspect'),p('[Details.]',J),
        ch('3. Results'),p('[Present the main results.]',J),ul(['[Result 1]','[Result 2]','[Result 3]']),
        ch('4. Conclusions'),p('[Summary and next steps.]',J)].join(''),
      hf:{header:{l:'{titolo}',c:'',r:''},footer:{l:'',c:'',r:''},num:{pos:'f-c',fmt:'di'},skipFirst:true,size:9,color:'#6b7280',hLine:true,fLine:false}},
    cv:{name:'Résumé / CV',desc:'Contact details, experience, education, skills',
      html:()=>[h('[Full name]','font-size:26pt;font-weight:700;margin:0'),p('[Target job title]','font-size:13pt;color:#1d4ed8;margin:0 0 6pt'),p('[City] · [Phone] · [Email] · [Website or profile]','color:#5b6470;border-bottom:1px solid #cbd2dc;padding-bottom:6pt'),
        h2('Profile'),p('[Two or three lines summarising experience, strengths and goals.]',J),
        h2('Work experience'),p('<b>[Role]</b> — [Company], [City] <span style="float:right;color:#5b6470">[mm/yyyy – mm/yyyy]</span>'),ul(['[Task or concrete result, with numbers if possible]','[Task or result]']),
        p('<b>[Role]</b> — [Company], [City] <span style="float:right;color:#5b6470">[mm/yyyy – mm/yyyy]</span>'),ul(['[Task or result]']),
        h2('Education'),p('<b>[Degree]</b> — [Institution] <span style="float:right;color:#5b6470">[year]</span>'),
        h2('Skills'),ul(['[Technical skill] — [level]','[Languages] — [level]','[Other skills]']),
        h2('Additional information'),p('[Driving licence, availability, interests.]')].join(''),
      margins:{top:18,bottom:18,left:20,right:20}},
    minutes:{name:'Meeting minutes',desc:'Attendees, agenda, decisions and action items',
      html:()=>[h('Meeting minutes','font-size:22pt;font-weight:700;margin:0 0 8pt'),p('<b>Date:</b> [dd/mm/yyyy] &nbsp;&nbsp; <b>Time:</b> [start – end] &nbsp;&nbsp; <b>Place:</b> [venue or link]'),p('<b>Present:</b> [names]'),p('<b>Absent:</b> [names]'),p('<b>Minute taker:</b> [name]'),
        h2('Agenda'),'<ol><li>[Item 1]</li><li>[Item 2]</li><li>[Item 3]</li></ol>',
        h2('Discussion'),p('<b>1. [Item 1]</b>'),p('[Summary of what was said.]',J),p('<b>2. [Item 2]</b>'),p('[Summary of what was said.]',J),
        h2('Decisions'),ul(['[Decision]','[Decision]']),
        h2('Action items'),ul(['[Action] — owner: [name] — due: [date]','[Action] — owner: [name] — due: [date]']),
        p('Next meeting: [date and time].','margin-top:12pt')].join(''),
      hf:{header:{l:'',c:'',r:'{data}'},footer:{l:'',c:'',r:''},num:{pos:'f-r',fmt:'di'},skipFirst:false,size:9,color:'#6b7280',hLine:false,fLine:false}},
    notice:{name:'Notice / Circular',desc:'Official communication with subject and signature',
      html:()=>[p('[Organisation name]','text-align:center;font-size:16pt;font-weight:700;margin:0'),p('[Address · Phone · Email]','text-align:center;color:#5b6470;border-bottom:2px solid #1d4ed8;padding-bottom:8pt'),sp(),
        p('Ref. no. [number] of [date]','text-align:right'),sp(),p('<b>NOTICE NO. [number]</b>','text-align:center;font-size:14pt'),sp(),p('<b>Subject: [subject of the communication]</b>'),sp(),
        p('To [recipients]'),sp(),p('[Text of the communication: what, when, where, who is involved, what the recipient must do.]',J),p('[Deadlines or operating instructions.]',J),sp(),
        p('[Place], [date]'),sp(),p('The [role]<br>[Full name]','text-align:right')].join('')}
  }
};
const ORDER=['letter','report','cv','minutes','notice'];
const lang=()=>(BB.uiLang&&BB.uiLang())||'it';
const dict=()=>T[lang()]||T.it;

function hasContent(){
  return State.pages.some(p=>p.content.querySelector('img,table') || p.content.textContent.replace(/\s+/g,'').length>30);
}
async function use(id){
  const t=dict()[id]; if(!t) return;
  if(hasContent()){
    const ok=await BB.Confirm.ask('Il documento attuale viene sostituito dal modello. Ne resta una copia nella cronologia versioni.',{title:'Usare il modello «'+t.name+'»?',yesLabel:'Sì, usa il modello'});
    if(!ok) return;
  }
  BB.emit('beforeReplace','Prima del modello «'+t.name+'»');
  const margins=Object.assign({top:25,bottom:25,left:25,right:25},t.margins||{});
  const data={meta:{pageSize:'A4',orient:'portrait',margins,title:t.name,ext:{hf:t.hf||undefined}},pages:[t.html()]};
  BB.History.suspended=true;
  try{ Pages.deserialize(data); } finally { BB.History.suspended=false; }
  if(BB.Toc) BB.Toc.update(true);
  Pages.reflow(); if(BB.Toc){ BB.Toc.update(true); Pages.reflow(); }
  BB.History.stack=[]; BB.History.idx=-1; BB.History.snapshot(); BB.Stats.update(); BB.Autosave.mark();
  document.getElementById('bb-doc-title').value=t.name;
  toast('Modello «'+t.name+'» applicato: sostituisci i testi tra [parentesi quadre]','ok');
}
function openGallery(){
  const d=dict();
  const body='<div class="bb-tpl-grid">'+ORDER.map(id=>'<button type="button" class="bb-tpl" data-id="'+id+'"><b>'+escapeHtml(d[id].name)+'</b><small>'+escapeHtml(d[id].desc)+'</small></button>').join('')+'</div>'+
    '<div class="bb-hint">I testi tra [parentesi quadre] sono da sostituire con i tuoi.</div>';
  Modal.open('Nuovo da modello',body,null,'Chiudi',{wide:true,hideCancel:true});
  document.getElementById('bb-modal-body').addEventListener('click',e=>{ const b=e.target.closest('.bb-tpl'); if(!b) return; Modal.close(false); use(b.dataset.id); });
}
BB.on('init',()=>{
  BBUI.icon('ico-template','<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>');
  const nuovo=document.getElementById('bb-new'); if(!nuovo) return;
  const btn=document.createElement('button'); btn.className='bb-menu-btn'; btn.id='bb-templates'; btn.type='button'; btn.title='Nuovo documento da un modello';
  btn.innerHTML='<svg class="bb-ico"><use href="#ico-template"></use></svg> Modelli';
  nuovo.after(btn); btn.addEventListener('click',openGallery);
});
BB.Templates={list:()=>ORDER.slice(),use,openGallery,data:T};
})();
