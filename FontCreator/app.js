/* =========================================================================
   FontForge Studio — Custom TTF Creator
   Motore completo: disegno su canvas -> stroke vettoriali -> outline poligonali
   -> curve Bézier -> path opentype.js -> generazione file .otf reale offline
   ========================================================================= */

(() => {
'use strict';

/* ---------------------------------------------------------------------
   1. DEFINIZIONE SET DI GLIFI (A-Z, a-z, accentate, 0-9, punteggiatura, simboli)
   --------------------------------------------------------------------- */
const GLYPH_GROUPS = [
  {
    title: 'Maiuscole A–Z',
    chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => ({ char: c, name: `LATIN CAPITAL LETTER ${c}`, unicode: c.codePointAt(0) }))
  },
  {
    title: 'Minuscole a–z',
    chars: 'abcdefghijklmnopqrstuvwxyz'.split('').map(c => ({ char: c, name: `LATIN SMALL LETTER ${c.toUpperCase()}`, unicode: c.codePointAt(0) }))
  },
  {
    title: 'Maiuscole accentate',
    chars: [
      ['À', 'LATIN CAPITAL LETTER A WITH GRAVE'], ['Á', 'LATIN CAPITAL LETTER A WITH ACUTE'],
      ['Â', 'LATIN CAPITAL LETTER A WITH CIRCUMFLEX'], ['Ã', 'LATIN CAPITAL LETTER A WITH TILDE'],
      ['Ä', 'LATIN CAPITAL LETTER A WITH DIAERESIS'], ['Å', 'LATIN CAPITAL LETTER A WITH RING ABOVE'],
      ['Æ', 'LATIN CAPITAL LETTER AE'], ['Ç', 'LATIN CAPITAL LETTER C WITH CEDILLA'],
      ['È', 'LATIN CAPITAL LETTER E WITH GRAVE'], ['É', 'LATIN CAPITAL LETTER E WITH ACUTE'],
      ['Ê', 'LATIN CAPITAL LETTER E WITH CIRCUMFLEX'], ['Ë', 'LATIN CAPITAL LETTER E WITH DIAERESIS'],
      ['Ì', 'LATIN CAPITAL LETTER I WITH GRAVE'], ['Í', 'LATIN CAPITAL LETTER I WITH ACUTE'],
      ['Î', 'LATIN CAPITAL LETTER I WITH CIRCUMFLEX'], ['Ï', 'LATIN CAPITAL LETTER I WITH DIAERESIS'],
      ['Ñ', 'LATIN CAPITAL LETTER N WITH TILDE'],
      ['Ò', 'LATIN CAPITAL LETTER O WITH GRAVE'], ['Ó', 'LATIN CAPITAL LETTER O WITH ACUTE'],
      ['Ô', 'LATIN CAPITAL LETTER O WITH CIRCUMFLEX'], ['Õ', 'LATIN CAPITAL LETTER O WITH TILDE'],
      ['Ö', 'LATIN CAPITAL LETTER O WITH DIAERESIS'], ['Ø', 'LATIN CAPITAL LETTER O WITH STROKE'],
      ['Œ', 'LATIN CAPITAL LIGATURE OE'],
      ['Ù', 'LATIN CAPITAL LETTER U WITH GRAVE'], ['Ú', 'LATIN CAPITAL LETTER U WITH ACUTE'],
      ['Û', 'LATIN CAPITAL LETTER U WITH CIRCUMFLEX'], ['Ü', 'LATIN CAPITAL LETTER U WITH DIAERESIS'],
      ['Ý', 'LATIN CAPITAL LETTER Y WITH ACUTE']
    ].map(([c, n]) => ({ char: c, name: n, unicode: c.codePointAt(0) }))
  },
  {
    title: 'Minuscole accentate',
    chars: [
      ['à', 'LATIN SMALL LETTER A WITH GRAVE'], ['á', 'LATIN SMALL LETTER A WITH ACUTE'],
      ['â', 'LATIN SMALL LETTER A WITH CIRCUMFLEX'], ['ã', 'LATIN SMALL LETTER A WITH TILDE'],
      ['ä', 'LATIN SMALL LETTER A WITH DIAERESIS'], ['å', 'LATIN SMALL LETTER A WITH RING ABOVE'],
      ['æ', 'LATIN SMALL LETTER AE'], ['ç', 'LATIN SMALL LETTER C WITH CEDILLA'],
      ['è', 'LATIN SMALL LETTER E WITH GRAVE'], ['é', 'LATIN SMALL LETTER E WITH ACUTE'],
      ['ê', 'LATIN SMALL LETTER E WITH CIRCUMFLEX'], ['ë', 'LATIN SMALL LETTER E WITH DIAERESIS'],
      ['ì', 'LATIN SMALL LETTER I WITH GRAVE'], ['í', 'LATIN SMALL LETTER I WITH ACUTE'],
      ['î', 'LATIN SMALL LETTER I WITH CIRCUMFLEX'], ['ï', 'LATIN SMALL LETTER I WITH DIAERESIS'],
      ['ñ', 'LATIN SMALL LETTER N WITH TILDE'],
      ['ò', 'LATIN SMALL LETTER O WITH GRAVE'], ['ó', 'LATIN SMALL LETTER O WITH ACUTE'],
      ['ô', 'LATIN SMALL LETTER O WITH CIRCUMFLEX'], ['õ', 'LATIN SMALL LETTER O WITH TILDE'],
      ['ö', 'LATIN SMALL LETTER O WITH DIAERESIS'], ['ø', 'LATIN SMALL LETTER O WITH STROKE'],
      ['œ', 'LATIN SMALL LIGATURE OE'], ['ß', 'LATIN SMALL LETTER SHARP S'],
      ['ù', 'LATIN SMALL LETTER U WITH GRAVE'], ['ú', 'LATIN SMALL LETTER U WITH ACUTE'],
      ['û', 'LATIN SMALL LETTER U WITH CIRCUMFLEX'], ['ü', 'LATIN SMALL LETTER U WITH DIAERESIS'],
      ['ý', 'LATIN SMALL LETTER Y WITH ACUTE'], ['ÿ', 'LATIN SMALL LETTER Y WITH DIAERESIS']
    ].map(([c, n]) => ({ char: c, name: n, unicode: c.codePointAt(0) }))
  },
  {
    title: 'Numeri 0–9',
    chars: '0123456789'.split('').map(c => ({ char: c, name: `DIGIT ${c}`, unicode: c.codePointAt(0) }))
  },
  {
    title: 'Punteggiatura',
    chars: [
      ['.', 'FULL STOP'], [',', 'COMMA'], [':', 'COLON'], [';', 'SEMICOLON'],
      ['!', 'EXCLAMATION MARK'], ['?', 'QUESTION MARK'], ["'", 'APOSTROPHE'],
      ['"', 'QUOTATION MARK'], ['-', 'HYPHEN-MINUS'], ['_', 'LOW LINE'],
      ['(', 'LEFT PARENTHESIS'], [')', 'RIGHT PARENTHESIS'],
      ['[', 'LEFT SQUARE BRACKET'], [']', 'RIGHT SQUARE BRACKET'],
      ['{', 'LEFT CURLY BRACKET'], ['}', 'RIGHT CURLY BRACKET'],
      ['/', 'SOLIDUS'], ['\\', 'REVERSE SOLIDUS'], ['|', 'VERTICAL LINE'],
      ['–', 'EN DASH'], ['—', 'EM DASH'], ['…', 'HORIZONTAL ELLIPSIS'],
      ['«', 'LEFT-POINTING DOUBLE ANGLE QUOTATION MARK'], ['»', 'RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK'],
      ['¡', 'INVERTED EXCLAMATION MARK'], ['¿', 'INVERTED QUESTION MARK']
    ].map(([c, n]) => ({ char: c, name: n, unicode: c.codePointAt(0) }))
  },
  {
    title: 'Simboli',
    chars: [
      ['@', 'COMMERCIAL AT'], ['#', 'NUMBER SIGN'], ['$', 'DOLLAR SIGN'],
      ['%', 'PERCENT SIGN'], ['&', 'AMPERSAND'], ['*', 'ASTERISK'],
      ['+', 'PLUS SIGN'], ['=', 'EQUALS SIGN'], ['<', 'LESS-THAN SIGN'],
      ['>', 'GREATER-THAN SIGN'], ['~', 'TILDE'], ['^', 'CIRCUMFLEX ACCENT'],
      ['€', 'EURO SIGN'], ['°', 'DEGREE SIGN'],
      ['£', 'POUND SIGN'], ['¥', 'YEN SIGN'], ['¢', 'CENT SIGN'],
      ['§', 'SECTION SIGN'], ['¶', 'PILCROW SIGN'],
      ['©', 'COPYRIGHT SIGN'], ['®', 'REGISTERED SIGN'], ['™', 'TRADE MARK SIGN'],
      ['×', 'MULTIPLICATION SIGN'], ['÷', 'DIVISION SIGN'], ['±', 'PLUS-MINUS SIGN'],
      ['•', 'BULLET']
    ].map(([c, n]) => ({ char: c, name: n, unicode: c.codePointAt(0) }))
  },
  {
    title: 'Spazio',
    chars: [{ char: ' ', name: 'SPACE', unicode: 32 }]
  }
];

// Lista piatta ordinata di tutti i glifi
const ALL_GLYPHS = GLYPH_GROUPS.flatMap(g => g.chars);

/* ---------------------------------------------------------------------
   2. STATO GLOBALE
   --------------------------------------------------------------------- */
const DEFAULT_BRUSH = { size: 8, noise: 0, noiseFreq: 4, pressure: 30, color: '#000000' };
const DEFAULT_METRICS = { unitsPerEm: 1000, ascender: 800, descender: -200, advanceWidth: 650, marginLeft: 40 };
const DEFAULT_VECTOR = { traceDetail: 6, smoothing: 50, simplify: 2 };

const state = {
  currentIndex: 0,
  // ogni glifo memorizza: strokes = array di stroke, ognuno è array di punti {x,y,p}
  glyphData: {}, // char -> { strokes: [...], done: bool }
  tool: 'draw',
  brush: { ...DEFAULT_BRUSH },
  metrics: { ...DEFAULT_METRICS },
  vector: { ...DEFAULT_VECTOR },
  showGrid: false,
  showGhost: false,
  exportFormat: 'otf', // 'otf' = etichetta corretta per i contorni CFF che opentype.js genera sempre; 'ttf' disponibile su richiesta ma non affidabile nell'anteprima font di Windows
  undoStack: [],
  redoStack: []
};

ALL_GLYPHS.forEach(g => { state.glyphData[g.char] = { strokes: [], done: false }; });

/* ---------------------------------------------------------------------
   3. CANVAS SETUP
   --------------------------------------------------------------------- */
const canvas = document.getElementById('drawCanvas');
const ctx = canvas.getContext('2d');
const CANVAS_SIZE = 600;
canvas.width = CANVAS_SIZE;
canvas.height = CANVAS_SIZE;

let drawing = false;
let currentStrokeRaw = []; // punti grezzi {x,y,t}
let lastPoint = null;
let lineStartPoint = null;

function clearCanvasBg() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawGridGuides() {
  const upm = state.metrics.unitsPerEm;
  const scale = (CANVAS_SIZE - 80) / upm;
  const baselineY = CANVAS_SIZE - 90;
  const ascY = baselineY - state.metrics.ascender * scale;
  const descY = baselineY - state.metrics.descender * scale;

  ctx.save();
  ctx.strokeStyle = 'rgba(0,150,120,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // baseline
  ctx.beginPath();
  ctx.moveTo(0, baselineY); ctx.lineTo(CANVAS_SIZE, baselineY);
  ctx.strokeStyle = 'rgba(0,120,255,0.55)';
  ctx.stroke();

  // ascender
  ctx.beginPath();
  ctx.moveTo(0, ascY); ctx.lineTo(CANVAS_SIZE, ascY);
  ctx.strokeStyle = 'rgba(0,180,140,0.45)';
  ctx.stroke();

  // descender
  ctx.beginPath();
  ctx.moveTo(0, descY); ctx.lineTo(CANVAS_SIZE, descY);
  ctx.strokeStyle = 'rgba(220,60,60,0.4)';
  ctx.stroke();

  // x-height stimata (50% ascender)
  const xH = baselineY - (state.metrics.ascender * 0.52) * scale;
  ctx.beginPath();
  ctx.moveTo(0, xH); ctx.lineTo(CANVAS_SIZE, xH);
  ctx.strokeStyle = 'rgba(255,180,60,0.35)';
  ctx.stroke();

  // origine glifo (x=0) e bordo advance width: disegnare fuori da queste due
  // linee verticali causa sovrapposizione con il carattere precedente/successivo
  // nel testo composto — fondamentale per ottenere un font leggibile e usabile.
  const { marginLeft, advanceWidth } = state.metrics;
  const originX = 40 - marginLeft * scale;
  const advanceX = 40 + (advanceWidth - marginLeft) * scale;

  ctx.setLineDash([2, 5]);
  ctx.lineWidth = 1.5;
  if (originX >= 0 && originX <= CANVAS_SIZE) {
    ctx.beginPath();
    ctx.moveTo(originX, 0); ctx.lineTo(originX, CANVAS_SIZE);
    ctx.strokeStyle = 'rgba(140,90,255,0.5)';
    ctx.stroke();
  }
  if (advanceX >= 0 && advanceX <= CANVAS_SIZE) {
    ctx.beginPath();
    ctx.moveTo(advanceX, 0); ctx.lineTo(advanceX, CANVAS_SIZE);
    ctx.strokeStyle = 'rgba(255,90,90,0.6)';
    ctx.stroke();
  }

  if (state.showGrid) {
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    for (let x = 0; x <= CANVAS_SIZE; x += 30) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_SIZE); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_SIZE; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_SIZE, y); ctx.stroke();
    }
  }

  ctx.setLineDash([]);
  ctx.restore();
}

function drawGhost() {
  if (!state.showGhost) return;
  const idx = state.currentIndex - 1;
  if (idx < 0) return;
  const prevChar = ALL_GLYPHS[idx].char;
  const data = state.glyphData[prevChar];
  if (!data || !data.strokes.length) return;
  ctx.save();
  ctx.globalAlpha = 0.12;
  data.strokes.forEach(stroke => renderStroke(stroke));
  ctx.restore();
}

/* ---------------------------------------------------------------------
   4. RUMORE PROCEDURALE (Perlin-like semplificato, seedless smooth noise)
   --------------------------------------------------------------------- */
function smoothNoise1D(x, seed) {
  // rumore pseudo-casuale coerente basato su seno multipli + hashing
  const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1; // range -1..1
}

function noiseAt(t, freq, seed) {
  // combina 2 ottave per rumore più organico
  const n1 = smoothNoise1D(t * freq, seed);
  const n2 = smoothNoise1D(t * freq * 2.3, seed + 91.7) * 0.5;
  return (n1 + n2) / 1.5;
}

/* ---------------------------------------------------------------------
   5. RENDERING DI UNO STROKE (con rumore + pressione) sul canvas anteprima
   --------------------------------------------------------------------- */
function applyNoiseToPoints(rawPoints) {
  const { noise, noiseFreq } = state.brush;
  if (noise <= 0) return rawPoints.map(p => ({ ...p }));
  const seed = rawPoints.length * 0.137 + 1;
  const amp = (noise / 100) * (state.brush.size * 0.9 + 2);
  return rawPoints.map((p, i) => {
    const t = i / Math.max(1, rawPoints.length - 1);
    // normale approssimata dal punto precedente/successivo
    const prev = rawPoints[Math.max(0, i - 1)];
    const next = rawPoints[Math.min(rawPoints.length - 1, i + 1)];
    let dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const n = noiseAt(t * 10, noiseFreq, seed) * amp;
    const jitterLong = noiseAt(t * 17 + 5, noiseFreq * 0.6, seed + 3) * amp * 0.4;
    return {
      x: p.x + nx * n + (dx / len) * jitterLong,
      y: p.y + ny * n + (dy / len) * jitterLong,
      p: p.p
    };
  });
}

function computeStrokeWidths(points) {
  const { size, pressure } = state.brush;
  const pAmt = pressure / 100;
  // velocità tra punti consecutivi -> più veloce = più sottile (se pressure>0)
  const widths = [];
  for (let i = 0; i < points.length; i++) {
    if (pAmt <= 0.001) { widths.push(size); continue; }
    const prev = points[Math.max(0, i - 1)];
    const cur = points[i];
    const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const speedFactor = Math.min(1, dist / 18); // 0 lento .. 1 veloce
    const w = size * (1 - speedFactor * pAmt * 0.65);
    widths.push(Math.max(size * 0.25, w));
  }
  return widths;
}

function renderStroke(stroke) {
  if (!stroke || stroke.points.length < 1) return;
  const pts = applyNoiseToPoints(stroke.points);
  const widths = computeStrokeWidths(stroke.points).map(w => w * (stroke.sizeMul || 1));

  ctx.save();
  ctx.fillStyle = stroke.color || '#000';
  ctx.strokeStyle = stroke.color || '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
  }

  if (pts.length === 1) {
    const r = widths[0] / 2;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // disegna segmenti come "stamp" circolari a bordo netto: identico a come
  // strokeToPolygon() genera l'outline esportato, così l'anteprima sul
  // canvas corrisponde esattamente al risultato nel file .ttf finale.
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const wa = widths[i], wb = widths[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const w = (wa + (wb - wa) * t) / 2;
      ctx.beginPath();
      ctx.arc(x, y, w, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function redrawAll() {
  clearCanvasBg();
  drawGhost();
  drawGridGuides();
  const data = state.glyphData[currentChar()];
  data.strokes.forEach(s => renderStroke(s));
  if (currentStrokeRaw.length) {
    renderStroke(buildStrokeObject(currentStrokeRaw));
  }
}

function buildStrokeObject(rawPoints) {
  return {
    points: rawPoints,
    tool: state.tool,
    color: state.brush.color,
    sizeMul: 1
  };
}

/* ---------------------------------------------------------------------
   6. INPUT: mouse / touch / pen (pointer events unificati)
   --------------------------------------------------------------------- */
function getCanvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (evt.clientX - rect.left) * scaleX,
    y: (evt.clientY - rect.top) * scaleY
  };
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  const pos = getCanvasPos(e);
  drawing = true;

  if (state.tool === 'line') {
    lineStartPoint = pos;
    currentStrokeRaw = [pos, pos];
  } else {
    currentStrokeRaw = [pos];
  }
  lastPoint = pos;
  redrawAll();
});

canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const pos = getCanvasPos(e);

  if (state.tool === 'line') {
    currentStrokeRaw = [lineStartPoint, pos];
  } else {
    const dist = lastPoint ? Math.hypot(pos.x - lastPoint.x, pos.y - lastPoint.y) : 999;
    const minSpacing = 4.5; // distanza minima fissa tra punti campionati del tratto
    if (dist >= minSpacing) {
      currentStrokeRaw.push(pos);
      lastPoint = pos;
    }
  }
  redrawAll();
});

function endStroke() {
  if (!drawing) return;
  drawing = false;
  if (currentStrokeRaw.length >= 1) {
    pushUndo();
    const strokeObj = buildStrokeObject(simplifyRawPoints(currentStrokeRaw));
    state.glyphData[currentChar()].strokes.push(strokeObj);
    invalidateGlyphCache(currentChar());
  }
  currentStrokeRaw = [];
  lineStartPoint = null;
  updateStatus();
  refreshGlyphGridDots();
  redrawAll();
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointerleave', endStroke);
canvas.addEventListener('pointercancel', endStroke);

function simplifyRawPoints(points) {
  if (points.length < 3) return points;
  const tolerance = 1.2;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const d = Math.hypot(points[i].x - prev.x, points[i].y - prev.y);
    if (d >= tolerance) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/* ---------------------------------------------------------------------
   7. UNDO / REDO
   --------------------------------------------------------------------- */
function snapshotGlyph() {
  return JSON.stringify(state.glyphData[currentChar()].strokes);
}
function pushUndo() {
  state.undoStack.push(snapshotGlyph());
  if (state.undoStack.length > 60) state.undoStack.shift();
  state.redoStack = [];
}
function undo() {
  const cur = currentChar();
  if (!state.undoStack.length) return;
  state.redoStack.push(snapshotGlyph());
  const prev = state.undoStack.pop();
  state.glyphData[cur].strokes = JSON.parse(prev);
  invalidateGlyphCache(cur);
  redrawAll(); updateStatus(); refreshGlyphGridDots();
}
function redo() {
  const cur = currentChar();
  if (!state.redoStack.length) return;
  state.undoStack.push(snapshotGlyph());
  const next = state.redoStack.pop();
  state.glyphData[cur].strokes = JSON.parse(next);
  invalidateGlyphCache(cur);
  redrawAll(); updateStatus(); refreshGlyphGridDots();
}

/* ---------------------------------------------------------------------
   8. VETTORIALIZZAZIONE: da stroke con larghezza -> poligono contorno
   --------------------------------------------------------------------- */

// Genera contorno poligonale (outline) di uno stroke "a nastro" (ribbon)
// espandendo perpendicolarmente lungo il percorso in base alla larghezza.
function strokeToPolygon(stroke) {
  const ptsNoisy = applyNoiseToPoints(stroke.points);
  const widths = computeStrokeWidths(stroke.points).map(w => w * (stroke.sizeMul || 1));

  if (ptsNoisy.length === 1) {
    // cerchio pieno
    const r = widths[0] / 2;
    const cx = ptsNoisy[0].x, cy = ptsNoisy[0].y;
    const poly = [];
    const N = 16;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      poly.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return [poly];
  }

  const left = [];
  const right = [];

  for (let i = 0; i < ptsNoisy.length; i++) {
    const cur = ptsNoisy[i];
    const prev = ptsNoisy[Math.max(0, i - 1)];
    const next = ptsNoisy[Math.min(ptsNoisy.length - 1, i + 1)];
    let dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w = widths[i] / 2;
    left.push({ x: cur.x + nx * w, y: cur.y + ny * w });
    right.push({ x: cur.x - nx * w, y: cur.y - ny * w });
  }

  // cappucci arrotondati alle estremità (semicerchio) per un tratto "a pennello" naturale
  const startCap = arcCap(ptsNoisy[0], ptsNoisy[1], widths[0] / 2, true);
  const endCap = arcCap(ptsNoisy[ptsNoisy.length - 1], ptsNoisy[ptsNoisy.length - 2], widths[widths.length - 1] / 2, false);

  const polygon = [...left, ...endCap, ...right.reverse(), ...startCap];
  return [polygon];
}

function arcCap(tip, ref, r, isStart) {
  const dx = tip.x - ref.x, dy = tip.y - ref.y;
  const len = Math.hypot(dx, dy) || 1;
  const baseAngle = Math.atan2(dy, dx);
  const pts = [];
  const N = 8;
  const start = isStart ? baseAngle + Math.PI / 2 : baseAngle - Math.PI / 2;
  const sweep = Math.PI;
  const dir = isStart ? 1 : 1;
  for (let i = 0; i <= N; i++) {
    const a = start + dir * sweep * (i / N);
    pts.push({ x: tip.x + Math.cos(a) * r, y: tip.y + Math.sin(a) * r });
  }
  return pts;
}

// Semplificazione Douglas-Peucker per ridurre punti ridondanti
function douglasPeucker(points, epsilon) {
  if (points.length < 3 || epsilon <= 0) return points;
  let maxDist = 0, index = 0;
  const [first, last] = [points[0], points[points.length - 1]];
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDist(points[i], first, last);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}
function pointLineDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
  const projX = a.x + t * dx, projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/* ---------------------------------------------------------------------
   9. UNIONE POLIGONI (boolean union approssimata via raster scan)
   Per combinare più stroke sovrapposti in un unico outline pulito
   usiamo un approccio a raster: rasterizziamo su una griglia ad alta
   risoluzione, poi eseguiamo marching-squares per ricavare i contorni
   vettoriali finali. Robusto per forme arbitrarie e self-intersection.
   --------------------------------------------------------------------- */
// Margine (in spazio canvas, px) aggiunto SOLO nella rasterizzazione interna,
// mai visibile mentre si disegna: senza di esso un tratto spesso disegnato
// vicino al bordo del canvas (es. sulla riga guida del discendente, che con
// le impostazioni di default cade già a y=614, oltre il bordo dei 600px del
// canvas) veniva tagliato dal bordo del canvas offscreen, facendo sparire
// parte o tutto il carattere — più probabile quanto più è spesso il pennello.
const RASTER_PAD = 40;

function rasterizeGlyph(strokes, gridSize) {
  // canvas offscreen ad alta risoluzione bianco/nero, con margine RASTER_PAD
  // oltre l'area disegnabile visibile (vedi commento sopra)
  const off = document.createElement('canvas');
  off.width = gridSize; off.height = gridSize;
  const octx = off.getContext('2d');
  octx.fillStyle = '#000';
  octx.fillRect(0, 0, gridSize, gridSize);

  const virtualSize = CANVAS_SIZE + RASTER_PAD * 2;
  const scale = gridSize / virtualSize;
  octx.save();
  octx.scale(scale, scale);
  octx.translate(RASTER_PAD, RASTER_PAD);
  octx.fillStyle = '#fff';
  octx.strokeStyle = '#fff';
  octx.lineCap = 'round';
  octx.lineJoin = 'round';

  strokes.forEach(stroke => {
    if (stroke.tool === 'erase') return; // gestita separatamente sotto
  });

  // primo passo: disegna tutti gli stroke "draw"/"line" in bianco
  strokes.forEach(stroke => {
    if (stroke.tool === 'erase') return;
    const polys = strokeToPolygon(stroke);
    polys.forEach(poly => {
      octx.beginPath();
      poly.forEach((p, i) => i === 0 ? octx.moveTo(p.x, p.y) : octx.lineTo(p.x, p.y));
      octx.closePath();
      octx.fill();
    });
  });

  // secondo passo: applica le gomme in nero (sottrazione)
  octx.fillStyle = '#000';
  strokes.forEach(stroke => {
    if (stroke.tool !== 'erase') return;
    const polys = strokeToPolygon(stroke);
    polys.forEach(poly => {
      octx.beginPath();
      poly.forEach((p, i) => i === 0 ? octx.moveTo(p.x, p.y) : octx.lineTo(p.x, p.y));
      octx.closePath();
      octx.fill();
    });
  });

  octx.restore();

  const imgData = octx.getImageData(0, 0, gridSize, gridSize);
  // binary mask: 1 = inchiostro (bianco), 0 = vuoto (nero)
  const mask = new Uint8Array(gridSize * gridSize);
  for (let i = 0; i < gridSize * gridSize; i++) {
    mask[i] = imgData.data[i * 4] > 127 ? 1 : 0;
  }
  return mask;
}

/* Marching Squares: estrae contorni poligonali da una maschera binaria */
function marchingSquaresContours(mask, size) {
  // Costruiamo i contorni seguendo i bordi delle celle "piene" (approccio a bordo blocco)
  // Metodo: per ogni pixel pieno, verifica i 4 vicini; se un vicino è vuoto, quel lato è un edge di bordo.
  // Poi uniamo gli edge in loop chiusi (contour tracing tipo "square tracing").
  const edges = new Map(); // key "x1,y1|x2,y2" -> true, usiamo per unire in loop

  function idx(x, y) { return y * size + x; }
  function filled(x, y) {
    if (x < 0 || y < 0 || x >= size || y >= size) return 0;
    return mask[idx(x, y)];
  }

  // Raccogli segmenti di bordo (ogni segmento è un lato di 1 unità tra due vertici griglia)
  const segments = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!filled(x, y)) continue;
      // top
      if (!filled(x, y - 1)) segments.push([[x, y], [x + 1, y]]);
      // right
      if (!filled(x + 1, y)) segments.push([[x + 1, y], [x + 1, y + 1]]);
      // bottom
      if (!filled(x, y + 1)) segments.push([[x + 1, y + 1], [x, y + 1]]);
      // left
      if (!filled(x - 1, y)) segments.push([[x, y + 1], [x, y]]);
    }
  }

  // costruisci mappa punto->lista segmenti uscenti per unire in loop (Eulerian-ish trace)
  const key = (p) => `${p[0]},${p[1]}`;
  const outMap = new Map();
  segments.forEach(seg => {
    const k = key(seg[0]);
    if (!outMap.has(k)) outMap.set(k, []);
    outMap.get(k).push(seg[1]);
  });

  const usedSeg = new Set();
  const segId = (a, b) => `${key(a)}>${key(b)}`;

  const contours = [];
  segments.forEach(seg => {
    const id = segId(seg[0], seg[1]);
    if (usedSeg.has(id)) return;
    // traccia un loop partendo da questo segmento
    const loop = [seg[0]];
    let cur = seg[0];
    let next = seg[1];
    let guard = 0;
    while (guard++ < size * size * 4) {
      const sid = segId(cur, next);
      if (usedSeg.has(sid)) break;
      usedSeg.add(sid);
      loop.push(next);
      cur = next;
      const options = outMap.get(key(cur)) || [];
      // scegli la prossima non ancora usata
      let found = null;
      for (const opt of options) {
        const oid = segId(cur, opt);
        if (!usedSeg.has(oid)) { found = opt; break; }
      }
      if (!found) break;
      next = found;
      if (next[0] === loop[0][0] && next[1] === loop[0][1]) { loop.push(next); break; }
    }
    if (loop.length > 3) contours.push(loop);
  });

  return contours;
}

// Calcola area con segno (shoelace formula): positiva = winding orario (CW),
// negativa = antiorario (CCW). Usata per distinguere contorni "pieni" (solid)
// da "buchi" (hole), es. l'interno della O, della A, della B, della D...
function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
    a += (p1[0] * p2[1] - p2[0] * p1[1]);
  }
  return a / 2;
}

// Determina se un punto è contenuto in un poligono (ray casting), usato per
// stabilire la gerarchia hole-in-solid quando più contorni sono annidati.
function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/* ---------------------------------------------------------------------
   9b. CLASSIFICAZIONE CONTORNI: solid vs hole + winding TrueType corretto
   TrueType richiede winding: contorni esterni orari (CW) in coordinate
   y-up, contorni interni (buchi) antiorari (CCW). Il nostro raster ha
   origine y-down (canvas), quindi il segno dell'area va interpretato di
   conseguenza. Determiniamo la gerarchia per containment reale (un
   contorno è "hole" se il suo punto interno cade dentro un contorno più
   grande), non solo per segno dell'area, così gestiamo correttamente
   lettere con più occhielli annidati o più forme separate (es. "i", ":").
   --------------------------------------------------------------------- */
function classifyContours(contours) {
  // pre-calcola area assoluta e bounding box per ordinare dal più grande al più piccolo
  const items = contours.map(c => ({
    points: c,
    area: Math.abs(polygonArea(c)),
    testPoint: findInteriorTestPoint(c)
  })).filter(it => it.area > 4); // scarta rumore di quantizzazione (contorni microscopici)

  items.sort((a, b) => b.area - a.area);

  items.forEach(it => { it.parent = null; });

  // Per ogni contorno, trova il genitore diretto: fra tutti i contorni più
  // grandi che lo contengono, sceglie quello con area minima (il "più vicino"
  // nella gerarchia di annidamento), fondamentale per glifi con occhielli
  // multipli o forme annidate su più livelli.
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      if (i === j) continue;
      if (items[j].area > items[i].area && pointInPolygon(items[i].testPoint, items[j].points)) {
        if (!items[i].parent || items[i].parent.area > items[j].area) {
          items[i].parent = items[j];
        }
      }
    }
  }

  items.forEach(it => {
    // profondità di annidamento pari = solid, dispari = hole
    let depth = 0, p = it.parent;
    while (p) { depth++; p = p.parent; }
    it.isHole = (depth % 2) === 1;
  });

  return items;
}

// Trova un punto sicuramente interno al poligono (non solo il centroide,
// che per forme concave potrebbe cadere fuori): usa il punto medio di un
// segmento interno lungo una scanline orizzontale passante per il centroide.
function findInteriorTestPoint(poly) {
  let cx = 0, cy = 0;
  poly.forEach(p => { cx += p[0]; cy += p[1]; });
  cx /= poly.length; cy /= poly.length;

  // scanline a cy: trova intersezioni con i lati del poligono
  const xs = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x1, y1] = poly[j], [x2, y2] = poly[i];
    if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) {
      const t = (cy - y1) / (y2 - y1);
      xs.push(x1 + t * (x2 - x1));
    }
  }
  xs.sort((a, b) => a - b);
  // trova la coppia di intersezioni che racchiude cx, altrimenti usa la prima coppia disponibile
  for (let i = 0; i < xs.length - 1; i += 2) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    if (xs[i] <= cx && cx <= xs[i + 1]) return [mid, cy];
  }
  if (xs.length >= 2) return [(xs[0] + xs[1]) / 2, cy];
  return [cx, cy]; // fallback
}

/* ---------------------------------------------------------------------
   10. SMOOTHING: converte poligono a punti in path con curve quadratiche
   Resample a spaziatura uniforme lungo il perimetro (non a step fisso
   sugli indici) cosi il livello di dettaglio è coerente indipendentemente
   dalla lunghezza del contorno, poi genera curve quadratiche Bézier
   interpolando fra i punti medi consecutivi (tecnica "midpoint smoothing"),
   che produce contorni sempre C1-continui e privi di cuspidi indesiderate.
   --------------------------------------------------------------------- */
function resamplePolygonUniform(poly, targetCount) {
  if (poly.length < 3) return poly;
  // lunghezza totale del perimetro
  let perim = 0;
  const segLens = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segLens.push(d);
    perim += d;
  }
  if (perim < 1e-6) return poly;

  const step = perim / targetCount;
  const out = [];
  let acc = 0, segIdx = 0, segPos = 0;
  out.push(poly[0]);
  for (let k = 1; k < targetCount; k++) {
    const targetDist = k * step;
    while (acc + segLens[segIdx] < targetDist && segIdx < segLens.length - 1) {
      acc += segLens[segIdx];
      segIdx++;
    }
    const a = poly[segIdx], b = poly[(segIdx + 1) % poly.length];
    const segLen = segLens[segIdx] || 1e-6;
    const t = Math.max(0, Math.min(1, (targetDist - acc) / segLen));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function smoothPolygonToPath(polyPoints, smoothingAmt, detail) {
  // polyPoints: array [x,y] in coordinate griglia raster
  if (polyPoints.length < 3) return null;

  // "detail" (1-15) determina quanti punti di ricampionamento uniforme usare
  // lungo il perimetro: più alto = più fedele alla forma originale disegnata.
  const targetCount = Math.max(8, Math.round(detail * 6));
  const pts = resamplePolygonUniform(polyPoints, targetCount);

  const t = Math.max(0, Math.min(1, smoothingAmt / 100));
  return { pts, t };
}

/* ---------------------------------------------------------------------
   11. COSTRUZIONE GLYPH OPENTYPE.JS da uno o più contorni
   --------------------------------------------------------------------- */
function buildOpentypePath(contoursGridSpace, gridSize, upm) {
  const path = new opentype.Path();

  function toFontXY(gx, gy) {
    // Inverso esatto della trasformazione scale+translate(RASTER_PAD) usata
    // in rasterizeGlyph: senza sottrarre RASTER_PAD qui, ogni punto finirebbe
    // spostato in basso a destra rispetto alla sua vera posizione disegnata.
    const virtualSize = CANVAS_SIZE + RASTER_PAD * 2;
    const canvasScale = virtualSize / gridSize;
    const cx = gx * canvasScale - RASTER_PAD;
    const cy = gy * canvasScale - RASTER_PAD;
    return canvasToFont(cx, cy);
  }

  // Classifica i contorni: solid (forma piena, disegnata in senso orario nello
  // spazio font) vs hole (buco interno, es. l'occhiello di "a", "o", "b", "d",
  // "e", "g", "p", "q", "A", "B", "D", "O", "P", "Q", "R"). TrueType usa il
  // winding direction per distinguere riempimento da sottrazione: i contorni
  // esterni devono avere verso opposto rispetto ai buchi interni.
  const classified = classifyContours(contoursGridSpace);

  classified.forEach(item => {
    const smooth = smoothPolygonToPath(item.points, state.vector.smoothing, state.vector.traceDetail);
    if (!smooth) return;
    let pts = smooth.pts.map(p => toFontXY(p[0], p[1]));
    if (pts.length < 3) return;

    // In coordinate font (y-up) il winding orario (CW) = solid esterno.
    // Il nostro poligono è tracciato in coordinate raster (y-down): dopo la
    // conversione a font-space l'asse Y si inverte, quindi il segno del
    // winding si inverte anch'esso. Normalizziamo esplicitamente qui:
    // solid -> CW in font space, hole -> CCW in font space.
    const area = polygonArea(pts.map(p => [p.x, p.y]));
    const isCW = area < 0; // shoelace: negativa = orario in sistema y-up standard matematico
    const wantCW = !item.isHole;
    if (isCW !== wantCW) pts = pts.reverse();

    const t = smooth.t;
    const n = pts.length;

    if (t < 0.03) {
      // Nessuno smoothing: poligono a spigoli vivi, segue esattamente i punti campionati.
      path.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < n; i++) path.lineTo(pts[i].x, pts[i].y);
      path.close();
    } else {
      // Curve quadratiche "corner cutting" (tecnica Chaikin-style): per ogni
      // vertice si calcolano due punti ancorati sui lati adiacenti, a distanza
      // proporzionale a t dal vertice. Il segmento viaggia da ancora-in a
      // ancora-out passando per una curva quadratica il cui punto di controllo
      // è il vertice originale stesso: risultato C1-continuo, senza cuspidi,
      // con arrotondamento crescente al crescere di t (0=spigolo vivo, 1=molto arrotondato).
      const cut = t * 0.5; // 0..0.5: quanto ci si allontana dal vertice verso i lati
      const anchorIn = [], anchorOut = [];
      for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n];
        const cur = pts[i];
        const next = pts[(i + 1) % n];
        anchorIn.push({ x: cur.x + (prev.x - cur.x) * cut, y: cur.y + (prev.y - cur.y) * cut });
        anchorOut.push({ x: cur.x + (next.x - cur.x) * cut, y: cur.y + (next.y - cur.y) * cut });
      }
      path.moveTo(anchorOut[0].x, anchorOut[0].y);
      for (let i = 1; i <= n; i++) {
        const idx = i % n;
        path.lineTo(anchorIn[idx].x, anchorIn[idx].y);
        path.quadraticCurveTo(pts[idx].x, pts[idx].y, anchorOut[idx].x, anchorOut[idx].y);
      }
      path.close();
    }
  });

  return path;
}

function canvasToFont(cx, cy) {
  // canvas: 0,0 top-left, CANVAS_SIZE,CANVAS_SIZE bottom-right
  // font: origine baseline, y positivo verso l'alto
  const { unitsPerEm, marginLeft } = state.metrics;
  const drawAreaPx = CANVAS_SIZE - 80; // margine grafico fisso ai bordi del canvas (40px per lato)
  const scale = drawAreaPx / unitsPerEm;
  const baselineY = CANVAS_SIZE - 90;
  const x = (cx - 40) / scale + marginLeft;
  const y = (baselineY - cy) / scale;
  return { x, y };
}

/* ---------------------------------------------------------------------
   12. GENERA GLYPH PATH COMPLETO PER UN CARATTERE
   --------------------------------------------------------------------- */
// Cache dei path già vettorializzati, per carattere: rigenerare un font
// (esportazione, ma soprattutto l'anteprima dal vivo digitando nel campo di
// prova) ricalcolava OGNI VOLTA la rasterizzazione+contorni di TUTTI i ~175
// glifi, anche quelli invariati dall'ultima chiamata — da cui la lentezza e
// lo scatto ad ogni carattere digitato nell'anteprima. Invalidata in modo
// mirato (solo il carattere toccato) da endStroke/undo/redo/
// deleteCurrentGlyph, e per intero quando cambiano impostazioni globali che
// influenzano TUTTI i glifi (pennello, vettorializzazione, metriche).
const glyphPathCache = new Map(); // char -> opentype.Path
function invalidateGlyphCache(char) {
  if (char === undefined) glyphPathCache.clear();
  else glyphPathCache.delete(char);
}

function generateGlyphPathForChar(char) {
  const data = state.glyphData[char];
  if (!data || !data.strokes.length) return new opentype.Path();
  if (glyphPathCache.has(char)) return glyphPathCache.get(char);

  // Risoluzione raster per vettorializzazione (alta = contorni più lisci):
  // aumentata rispetto all'area visibile nella stessa proporzione di
  // RASTER_PAD, così la densità di dettaglio sull'area disegnabile resta
  // quella originale nonostante il margine extra anti-taglio.
  const GRID = Math.round(384 * (CANVAS_SIZE + RASTER_PAD * 2) / CANVAS_SIZE);
  const mask = rasterizeGlyph(data.strokes, GRID);
  let contours = marchingSquaresContours(mask, GRID);

  // applica semplificazione Douglas-Peucker su ogni contorno
  const eps = state.vector.simplify;
  contours = contours.map(c => {
    const objPts = c.map(([x, y]) => ({ x, y }));
    const simplified = eps > 0 ? douglasPeucker(objPts, eps) : objPts;
    return simplified.map(p => [p.x, p.y]);
  }).filter(c => c.length >= 3);

  const path = buildOpentypePath(contours, GRID, state.metrics.unitsPerEm);
  glyphPathCache.set(char, path);
  return path;
}

/* ---------------------------------------------------------------------
   13. UI: popolamento pannello glifi
   --------------------------------------------------------------------- */
const groupsContainer = document.getElementById('glyph-groups');

function buildGlyphPanel(filter = '') {
  groupsContainer.innerHTML = '';
  GLYPH_GROUPS.forEach(group => {
    const filtered = group.chars.filter(g =>
      !filter || g.char.toLowerCase().includes(filter.toLowerCase()) || g.name.toLowerCase().includes(filter.toLowerCase())
    );
    if (!filtered.length) return;

    const title = document.createElement('div');
    title.className = 'glyph-group-title';
    title.textContent = group.title;
    groupsContainer.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'glyph-grid';
    filtered.forEach(g => {
      const cell = document.createElement('div');
      cell.className = 'glyph-cell';
      cell.textContent = g.char === ' ' ? '␣' : g.char;
      cell.dataset.char = g.char;
      cell.title = g.name;
      cell.addEventListener('click', () => selectGlyphByChar(g.char));
      grid.appendChild(cell);
    });
    groupsContainer.appendChild(grid);
  });
  refreshGlyphGridDots();
}

function refreshGlyphGridDots() {
  document.querySelectorAll('.glyph-cell').forEach(cell => {
    const ch = cell.dataset.char;
    const data = state.glyphData[ch];
    cell.classList.toggle('done', !!(data && (data.done || data.strokes.length)));
    cell.classList.toggle('active', ch === currentChar());
  });
  updateProgressBadge();
}

function updateProgressBadge() {
  const total = ALL_GLYPHS.length;
  const done = ALL_GLYPHS.filter(g => {
    const d = state.glyphData[g.char];
    return d.done || d.strokes.length > 0;
  }).length;
  document.getElementById('progressBadge').textContent = `${done} / ${total}`;
}

/* ---------------------------------------------------------------------
   14. NAVIGAZIONE GLIFI
   --------------------------------------------------------------------- */
function currentChar() { return ALL_GLYPHS[state.currentIndex].char; }

function selectGlyphByChar(char) {
  const idx = ALL_GLYPHS.findIndex(g => g.char === char);
  if (idx === -1) return;
  selectGlyphByIndex(idx);
}

function selectGlyphByIndex(idx) {
  state.currentIndex = Math.max(0, Math.min(ALL_GLYPHS.length - 1, idx));
  state.undoStack = [];
  state.redoStack = [];
  const g = ALL_GLYPHS[state.currentIndex];
  document.getElementById('current-glyph-big').textContent = g.char === ' ' ? '␣ (spazio)' : g.char;
  document.getElementById('current-glyph-name').textContent = g.name + ` · U+${g.unicode.toString(16).toUpperCase().padStart(4, '0')}`;
  redrawAll();
  updateStatus();
  refreshGlyphGridDots();
}

document.getElementById('btnPrevGlyph').addEventListener('click', () => selectGlyphByIndex(state.currentIndex - 1));
document.getElementById('btnNextGlyph').addEventListener('click', () => selectGlyphByIndex(state.currentIndex + 1));

/* ---------------------------------------------------------------------
   15. TOOLBAR: strumenti disegno
   --------------------------------------------------------------------- */
function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  const map = { draw: 'toolDraw', erase: 'toolErase', line: 'toolLine' };
  document.getElementById(map[tool])?.classList.add('active');
}
document.getElementById('toolDraw').addEventListener('click', () => setTool('draw'));
document.getElementById('toolErase').addEventListener('click', () => setTool('erase'));
document.getElementById('toolLine').addEventListener('click', () => setTool('line'));

document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);

// Cancella completamente il carattere attualmente aperto: rimuove tutti i
// tratti disegnati, resetta il flag "completato" e salva uno stato di undo
// così l'azione è reversibile con Ctrl+Z. Usata sia dal bottone in toolbar
// (icona cestino) sia dal bottone dedicato "Cancella lettera corrente" nel
// footer del canvas, sia dalla scorciatoia da tastiera Ctrl+Canc.
function deleteCurrentGlyph({ askConfirm = true } = {}) {
  const g = ALL_GLYPHS[state.currentIndex];
  const data = state.glyphData[g.char];
  if (!data.strokes.length) {
    showToast('Il carattere è già vuoto');
    return;
  }
  if (askConfirm) {
    const label = g.char === ' ' ? 'spazio' : `"${g.char}"`;
    if (!confirm(`Cancellare tutto il contenuto del carattere ${label}? L'azione è annullabile con Ctrl+Z.`)) return;
  }
  pushUndo();
  data.strokes = [];
  data.done = false;
  invalidateGlyphCache(g.char);
  currentStrokeRaw = [];
  drawing = false;
  redrawAll();
  updateStatus();
  refreshGlyphGridDots();
  showToast(`Carattere "${g.char === ' ' ? 'spazio' : g.char}" cancellato`);
}

document.getElementById('btnClear').addEventListener('click', () => deleteCurrentGlyph({ askConfirm: true }));
document.getElementById('btnDeleteCurrentGlyph').addEventListener('click', () => deleteCurrentGlyph({ askConfirm: true }));

document.getElementById('btnGrid').addEventListener('click', (e) => {
  state.showGrid = !state.showGrid;
  e.target.classList.toggle('active', state.showGrid);
  redrawAll();
});
document.getElementById('btnMirror').addEventListener('click', (e) => {
  state.showGhost = !state.showGhost;
  e.target.classList.toggle('active', state.showGhost);
  redrawAll();
});
document.getElementById('btnMarkDone').addEventListener('click', () => {
  state.glyphData[currentChar()].done = true;
  refreshGlyphGridDots();
  showToast('Carattere segnato come completato ✔');
});

/* ---------------------------------------------------------------------
   16. SCORCIATOIE TASTIERA
   --------------------------------------------------------------------- */
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.ctrlKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (e.ctrlKey && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteCurrentGlyph({ askConfirm: true }); return; }
  if (e.key === 'Tab') { e.preventDefault(); selectGlyphByIndex(state.currentIndex + 1); return; }
  switch (e.key.toLowerCase()) {
    case 'p': setTool('draw'); break;
    case 'e': setTool('erase'); break;
    case 'l': setTool('line'); break;
  }
});

/* ---------------------------------------------------------------------
   17. SLIDER BINDINGS (Brush + Metrics + Vector)
   --------------------------------------------------------------------- */
function bindSlider(id, valId, target, key, parse = Number, onChange = () => {}) {
  const el = document.getElementById(id);
  const valEl = document.getElementById(valId);
  el.addEventListener('input', () => {
    target[key] = parse(el.value);
    valEl.textContent = el.value;
    // Ogni slider qui è pennello/vettorializzazione/metriche: tutti
    // influenzano il contorno vettoriale di OGNI glifo, quindi invalidano
    // l'intera cache (vedi generateGlyphPathForChar) invece del solo
    // carattere corrente.
    invalidateGlyphCache();
    onChange();
    redrawAll();
  });
  valEl.textContent = el.value;
}

bindSlider('brushSize', 'valBrushSize', state.brush, 'size');
bindSlider('brushNoise', 'valNoise', state.brush, 'noise');
bindSlider('brushNoiseFreq', 'valNoiseFreq', state.brush, 'noiseFreq');
bindSlider('brushPressure', 'valPressure', state.brush, 'pressure');

document.getElementById('brushColor').addEventListener('input', (e) => {
  state.brush.color = e.target.value;
});

function updateExportFormatUI() {
  const ext = state.exportFormat.toUpperCase();
  document.getElementById('btnExportTTF').textContent = `💾 Salva in BlaBla (.${ext})`;
}
document.getElementById('exportFormat').addEventListener('change', (e) => {
  state.exportFormat = e.target.value;
  updateExportFormatUI();
  if (state.exportFormat === 'ttf') {
    showToast('Attenzione: il contenuto resta OpenType/CFF anche con estensione .ttf — l\'anteprima font di Windows potrebbe non mostrarlo. Usa .OTF per la massima compatibilità.', true);
  }
});

bindSlider('unitsPerEm', 'valUPM', state.metrics, 'unitsPerEm', Number, () => {
  document.getElementById('statusUPM').textContent = `UPM: ${state.metrics.unitsPerEm}`;
});
bindSlider('ascender', 'valAscender', state.metrics, 'ascender');
bindSlider('descender', 'valDescender', state.metrics, 'descender');
bindSlider('advanceWidth', 'valAdvance', state.metrics, 'advanceWidth');
bindSlider('marginLeft', 'valMarginL', state.metrics, 'marginLeft');

bindSlider('traceDetail', 'valTraceDetail', state.vector, 'traceDetail');
bindSlider('smoothing', 'valSmoothing', state.vector, 'smoothing');
bindSlider('simplify', 'valSimplify', state.vector, 'simplify', parseFloat);

/* ---------------------------------------------------------------------
   18. PRESET PENNELLO
   --------------------------------------------------------------------- */
const BRUSH_PRESETS = {
  pen:         { size: 6,  noise: 5,  noiseFreq: 3,  pressure: 15 },
  brush:       { size: 20, noise: 25, noiseFreq: 5,  pressure: 55 },
  marker:      { size: 26, noise: 3,  noiseFreq: 2,  pressure: 5  },
  pencil:      { size: 4,  noise: 40, noiseFreq: 9,  pressure: 20 },
  calligraphy: { size: 14, noise: 8,  noiseFreq: 3,  pressure: 65 },
  sketchy:     { size: 5,  noise: 70, noiseFreq: 14, pressure: 30 }
};

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const preset = BRUSH_PRESETS[btn.dataset.preset];
    Object.entries(preset).forEach(([k, v]) => {
      state.brush[k] = v;
      const idMap = {
        size: 'brushSize', noise: 'brushNoise', noiseFreq: 'brushNoiseFreq',
        pressure: 'brushPressure'
      };
      const el = document.getElementById(idMap[k]);
      el.value = v;
      document.getElementById('val' + idMap[k].replace('brush', '')).textContent = v;
    });
    invalidateGlyphCache(); // cambia il pennello per tutti i glifi, come i relativi slider
    redrawAll();
    showToast(`Preset "${btn.textContent}" applicato`);
  });
});

/* ---------------------------------------------------------------------
   19. RICERCA GLIFI
   --------------------------------------------------------------------- */
document.getElementById('glyph-search').addEventListener('input', (e) => {
  buildGlyphPanel(e.target.value);
});

/* ---------------------------------------------------------------------
   20. STATUS BAR
   --------------------------------------------------------------------- */
function updateStatus() {
  document.getElementById('statusStrokes').textContent = `Tratti: ${state.glyphData[currentChar()].strokes.length}`;
  document.getElementById('statusGlyph').textContent = `Glifo: ${currentChar() === ' ' ? 'spazio' : currentChar()}`;
}

/* ---------------------------------------------------------------------
   21. TOAST NOTIFICHE
   --------------------------------------------------------------------- */
let toastTimer = null;
function showToast(msg, isErr = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('err', isErr);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------------------------------------------------------------------
   22. EXPORT TTF — costruzione font reale con opentype.js
   --------------------------------------------------------------------- */
function buildFont() {
  const upm = state.metrics.unitsPerEm;
  const glyphs = [];

  // .notdef obbligatorio
  const notdefPath = new opentype.Path();
  notdefPath.moveTo(state.metrics.marginLeft, 0);
  notdefPath.lineTo(state.metrics.marginLeft, state.metrics.ascender * 0.7);
  notdefPath.lineTo(state.metrics.advanceWidth - state.metrics.marginLeft, state.metrics.ascender * 0.7);
  notdefPath.lineTo(state.metrics.advanceWidth - state.metrics.marginLeft, 0);
  notdefPath.close();
  glyphs.push(new opentype.Glyph({
    name: '.notdef', unicode: 0, advanceWidth: state.metrics.advanceWidth, path: notdefPath
  }));

  let emptyCount = 0;
  ALL_GLYPHS.forEach(g => {
    const data = state.glyphData[g.char];
    let path;
    if (g.char === ' ' || !data.strokes.length) {
      path = new opentype.Path();
      if (g.char !== ' ') emptyCount++;
    } else {
      path = generateGlyphPathForChar(g.char);
    }
    glyphs.push(new opentype.Glyph({
      name: unicodeToGlyphName(g.char, g.unicode),
      unicode: g.unicode,
      advanceWidth: g.char === ' ' ? Math.round(state.metrics.advanceWidth * 0.5) : state.metrics.advanceWidth,
      path: path
    }));
  });

  const fontName = document.getElementById('fontName').value.trim() || 'MioFontCustom';
  const authorName = document.getElementById('fontAuthor').value.trim() || 'Font Maker';

  const font = new opentype.Font({
    familyName: fontName,
    styleName: 'Regular',
    unitsPerEm: upm,
    ascender: state.metrics.ascender,
    descender: state.metrics.descender,
    designer: authorName,
    designerURL: '',
    manufacturer: authorName,
    license: 'Font generato con FontForge Studio — uso libero',
    version: '1.000',
    glyphs: glyphs,
    tables: {
      os2: {
        usWeightClass: 400, // Regular: opentype.js userebbe di default 500 (Medium)
        usWidthClass: 5,    // Normal
        // Windows e molte app usano usWinAscent/Descent per calcolare l'altezza
        // di riga; opentype.js li calcolerebbe di default dal bounding box dei
        // soli glifi effettivamente disegnati, quindi cambiano a seconda di
        // quali lettere sono state disegnate e possono tagliare gli accenti o
        // produrre un'interlinea troppo stretta. Li fissiamo alle metriche
        // dichiarate (ascender/descender) per un'altezza di riga stabile e
        // coerente, indipendente dal contenuto disegnato.
        usWinAscent: Math.round(state.metrics.ascender),
        usWinDescent: Math.round(Math.abs(state.metrics.descender)),
        // fsSelection: REGULAR (0x40) + USE_TYPO_METRICS (0x80). Il secondo bit
        // dice alle app conformi (Windows, macOS, i browser moderni) di usare
        // sTypoAscender/Descender/LineGap per l'interlinea invece di ricavarla
        // da metriche eterogenee: stessa convenzione usata dai font professionali.
        fsSelection: 0xC0
      }
    }
  });

  return { font, emptyCount };
}

// Nomi Adobe Glyph List per le lettere accentate minuscole: le maiuscole
// riusano lo stesso nome con suffisso ".cap" (stessa convenzione già in uso
// per A-Z), così cmap/post restano coerenti col resto del font.
const ACCENTED_NAMES = {
  'à': 'agrave', 'á': 'aacute', 'â': 'acircumflex', 'ã': 'atilde', 'ä': 'adieresis', 'å': 'aring',
  'æ': 'ae', 'ç': 'ccedilla',
  'è': 'egrave', 'é': 'eacute', 'ê': 'ecircumflex', 'ë': 'edieresis',
  'ì': 'igrave', 'í': 'iacute', 'î': 'icircumflex', 'ï': 'idieresis',
  'ñ': 'ntilde',
  'ò': 'ograve', 'ó': 'oacute', 'ô': 'ocircumflex', 'õ': 'otilde', 'ö': 'odieresis', 'ø': 'oslash',
  'œ': 'oe', 'ß': 'germandbls',
  'ù': 'ugrave', 'ú': 'uacute', 'û': 'ucircumflex', 'ü': 'udieresis',
  'ý': 'yacute', 'ÿ': 'ydieresis'
};

function unicodeToGlyphName(char, unicode) {
  if (char === ' ') return 'space';
  if (/[A-Z]/.test(char)) return char.toLowerCase() + '.cap';
  if (/[a-z0-9]/.test(char)) return char;
  const lower = char.toLowerCase();
  if (ACCENTED_NAMES[lower]) {
    return char === lower ? ACCENTED_NAMES[lower] : ACCENTED_NAMES[lower] + '.cap';
  }
  const specialNames = {
    '.': 'period', ',': 'comma', ':': 'colon', ';': 'semicolon',
    '!': 'exclam', '?': 'question', "'": 'quotesingle', '"': 'quotedbl',
    '-': 'hyphen', '_': 'underscore', '(': 'parenleft', ')': 'parenright',
    '[': 'bracketleft', ']': 'bracketright', '{': 'braceleft', '}': 'braceright',
    '/': 'slash', '\\': 'backslash', '|': 'bar', '@': 'at', '#': 'numbersign',
    '$': 'dollar', '%': 'percent', '&': 'ampersand', '*': 'asterisk',
    '+': 'plus', '=': 'equal', '<': 'less', '>': 'greater', '~': 'asciitilde',
    '^': 'asciicircum', '€': 'euro', '°': 'degree',
    '–': 'endash', '—': 'emdash', '…': 'ellipsis',
    '«': 'guillemotleft', '»': 'guillemotright',
    '¡': 'exclamdown', '¿': 'questiondown',
    '£': 'sterling', '¥': 'yen', '¢': 'cent',
    '§': 'section', '¶': 'paragraph',
    '©': 'copyright', '®': 'registered', '™': 'trademark',
    '×': 'multiply', '÷': 'divide', '±': 'plusminus', '•': 'bullet'
  };
  return specialNames[char] || ('uni' + unicode.toString(16).toUpperCase().padStart(4, '0'));
}

/* ---------------------------------------------------------------------
   22b. CONSEGNA A BLABLA — invece di scaricare il file su disco (l'utente
   dovrebbe poi trovarlo e copiarlo a mano in fonts/), il font generato viene
   mandato direttamente alla finestra di BlaBla che ha aperto FontCreator,
   tramite BroadcastChannel: le due pagine condividono la stessa origine
   (stesso server locale), quindi ricevono/inviano sullo stesso canale senza
   bisogno di window.opener. BlaBla lo rende subito utilizzabile nel documento
   aperto e, se è la app desktop, lo scrive anche su disco in fonts/ così
   resta disponibile pure ai prossimi avvii — vedi FontCreatorBridge in
   blabla.html e Api.save_font in tools/launcher.py.
   --------------------------------------------------------------------- */
const blablaChannel = ('BroadcastChannel' in window) ? new BroadcastChannel('bb-fontcreator') : null;

document.getElementById('btnExportTTF').addEventListener('click', () => {
  const drawnCount = ALL_GLYPHS.filter(g => state.glyphData[g.char].strokes.length > 0).length;
  if (drawnCount === 0) {
    showToast('Disegna almeno un carattere prima di esportare!', true);
    return;
  }
  if (!blablaChannel) {
    showToast('Questa finestra non è collegata a BlaBla: riaprila dal bottone "Crea Font" nell\'editor.', true);
    return;
  }
  try {
    const { font } = buildFont();
    const familyName = document.getElementById('fontName').value.trim() || 'MioFontCustom';
    const fileBase = (document.getElementById('fileName').value.trim() || 'miofont').replace(/[^a-z0-9_\-]/gi, '_');
    const arrayBuffer = font.toArrayBuffer();
    // opentype.js genera sempre contorni CFF (formato OpenType/OTTO) per i font
    // creati da zero, mai contorni TrueType (glyf/loca): il contenuto del file
    // non cambia in base alla scelta qui sotto, cambiano solo estensione e MIME.
    // .otf è l'etichetta corretta e garantisce piena compatibilità ovunque
    // (Windows, Office, browser, macOS); .ttf resta disponibile per chi ne ha
    // bisogno per uno strumento specifico, ma l'anteprima font di Windows può
    // non mostrarlo correttamente perché si aspetta contorni TrueType veri.
    const ext = state.exportFormat;
    // il progetto (tratti/metriche/pennello) viaggia insieme al font compilato:
    // è quello che permette di riaprire in seguito questo stesso font da "I
    // miei font" in BlaBla e continuare a modificarlo — senza, BlaBla
    // avrebbe solo i byte del font finito, da cui non si può tornare ai
    // tratti originali (vedi CustomFonts.editInCreator in blabla.html).
    const project = {
      version: 1,
      fontName: familyName,
      fileName: document.getElementById('fileName').value,
      fontAuthor: document.getElementById('fontAuthor').value,
      exportFormat: state.exportFormat,
      metrics: state.metrics,
      brush: state.brush,
      vector: state.vector,
      glyphData: state.glyphData
    };
    blablaChannel.postMessage({
      type: 'font-created',
      familyName,
      fileName: fileBase + '.' + ext,
      ext,
      buffer: arrayBuffer,
      project
    });
    showToast(`"${familyName}" inviato a BlaBla! (${drawnCount}/${ALL_GLYPHS.length - 1} glifi disegnati)`);
  } catch (err) {
    console.error(err);
    showToast('Errore nella generazione del font: ' + err.message, true);
  }
});

/* ---------------------------------------------------------------------
   23. ANTEPRIMA LIVE (usa FontFace API per caricare il TTF appena generato)
   --------------------------------------------------------------------- */
let currentPreviewFontFace = null;
// Token di generazione: se parte una renderPreview() più recente mentre una
// precedente è ancora in corso (font.toArrayBuffer()/FontFace.load() non
// sono istantanei su un font vero con molti glifi), la chiamata vecchia può
// finire DOPO quella nuova e sovrascrivere l'anteprima con un fontFamily il
// cui FontFace è già stato cancellato — da cui il testo che sembra sparire
// da solo restando fermi. Ogni chiamata scarta il proprio risultato se nel
// frattempo ne è partita una più recente, così solo l'ultima vince sempre.
let previewRenderToken = 0;

async function renderPreview() {
  const token = ++previewRenderToken;
  try {
    const { font } = buildFont();
    const arrayBuffer = font.toArrayBuffer();
    const blob = new Blob([arrayBuffer], { type: 'font/otf' });
    const url = URL.createObjectURL(blob);

    const fontFamily = 'FFS_Preview_' + token;
    const face = new FontFace(fontFamily, `url(${url})`);
    await face.load();
    URL.revokeObjectURL(url);

    if (token !== previewRenderToken) return; // superata da una richiesta più recente: scarta

    document.fonts.add(face);
    if (currentPreviewFontFace) document.fonts.delete(currentPreviewFontFace);
    currentPreviewFontFace = face;

    const renderEl = document.getElementById('previewRender');
    renderEl.style.fontFamily = fontFamily;
    renderEl.style.fontSize = document.getElementById('previewSize').value + 'px';
    renderEl.textContent = document.getElementById('previewText').value || 'Scrivi qualcosa...';
  } catch (err) {
    if (token !== previewRenderToken) return;
    console.error(err);
    document.getElementById('previewRender').textContent = 'Errore anteprima: ' + err.message;
  }
}

document.getElementById('btnPreview').addEventListener('click', () => {
  document.getElementById('previewModal').classList.add('show');
  renderPreview();
});
document.getElementById('btnClosePreview').addEventListener('click', () => {
  document.getElementById('previewModal').classList.remove('show');
});
let _previewDebounceTimer = null;
document.getElementById('previewText').addEventListener('input', () => {
  clearTimeout(_previewDebounceTimer);
  _previewDebounceTimer = setTimeout(renderPreview, 150);
});
document.getElementById('previewSize').addEventListener('input', (e) => {
  document.getElementById('valPreviewSize').textContent = e.target.value;
  document.getElementById('previewRender').style.fontSize = e.target.value + 'px';
});

/* ---------------------------------------------------------------------
   24. SALVA / CARICA PROGETTO (JSON, per continuare a lavorare offline)
   --------------------------------------------------------------------- */
document.getElementById('btnExportProject').addEventListener('click', () => {
  const projectData = {
    version: 1,
    fontName: document.getElementById('fontName').value,
    fileName: document.getElementById('fileName').value,
    fontAuthor: document.getElementById('fontAuthor').value,
    exportFormat: state.exportFormat,
    metrics: state.metrics,
    brush: state.brush,
    vector: state.vector,
    glyphData: state.glyphData
  };
  const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (document.getElementById('fileName').value || 'progetto') + '.fontproj.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Progetto salvato come JSON');
});

const fileInputProj = document.createElement('input');
fileInputProj.type = 'file';
fileInputProj.accept = '.json';
fileInputProj.style.display = 'none';
document.body.appendChild(fileInputProj);

/** Applica un progetto (lo stesso oggetto salvato da "Salva progetto") allo
    stato corrente: estratta in una funzione a sé perché serve da DUE punti —
    il file-picker di "Carica progetto" qui sotto, e il messaggio che arriva
    da BlaBla quando si riapre per la modifica un font già salvato in
    "I miei font" (vedi il listener su blablaChannel più sotto). */
function loadProjectData(data) {
  document.getElementById('fontName').value = data.fontName || 'MioFontCustom';
  document.getElementById('fileName').value = data.fileName || 'miofont';
  document.getElementById('fontAuthor').value = data.fontAuthor || 'Font Maker';
  state.exportFormat = data.exportFormat === 'ttf' ? 'ttf' : 'otf';
  Object.assign(state.metrics, data.metrics || {});
  Object.assign(state.brush, data.brush || {});
  Object.assign(state.vector, data.vector || {});
  state.glyphData = data.glyphData || state.glyphData;
  // assicurati che tutti i glifi esistano
  ALL_GLYPHS.forEach(g => { if (!state.glyphData[g.char]) state.glyphData[g.char] = { strokes: [], done: false }; });
  invalidateGlyphCache();

  syncSlidersFromState();
  selectGlyphByIndex(0);
  buildGlyphPanel();
  redrawAll();
}

document.getElementById('btnImportProject').addEventListener('click', () => fileInputProj.click());
fileInputProj.addEventListener('change', () => {
  const file = fileInputProj.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadProjectData(JSON.parse(reader.result));
      showToast('Progetto caricato con successo');
    } catch (err) {
      showToast('Errore nel caricamento del progetto: ' + err.message, true);
    }
  };
  reader.readAsText(file);
  fileInputProj.value = '';
});

/** Riapertura di un font già salvato in "I miei font" di BlaBla: arriva qui
    come messaggio sullo stesso canale già usato per consegnare il font
    appena creato (vedi blablaChannel più sopra) e CustomFonts.editInCreator
    in blabla.html, che lo invia solo se per quel font è stato salvato anche
    il progetto editabile (non solo il font compilato .otf/.ttf — un font
    compilato non si può "decompilare" nei tratti originali). */
if (blablaChannel) {
  blablaChannel.onmessage = (e) => {
    const msg = e.data;
    if (!msg || msg.type !== 'load-project' || !msg.project) return;
    if (hasUnsavedWork() && !confirm('Aprire questo font sovrascriverà il lavoro non salvato nell\'editor. Continuare?')) return;
    try {
      loadProjectData(msg.project);
      showToast('Font "' + (msg.familyName || msg.project.fontName || '') + '" aperto per la modifica');
    } catch (err) {
      showToast('Errore nell\'aprire il font per la modifica: ' + err.message, true);
    }
  };
}

/* ---------------------------------------------------------------------
   24bis. NUOVO PROGETTO (riparte da zero, permette di creare più font)
   --------------------------------------------------------------------- */
function hasUnsavedWork() {
  return ALL_GLYPHS.some(g => (state.glyphData[g.char] || {}).strokes && state.glyphData[g.char].strokes.length);
}

function newProject() {
  if (hasUnsavedWork() && !confirm('Creare un nuovo progetto azzererà tutti i glifi disegnati finora (se non li hai esportati andranno persi). Continuare?')) {
    return;
  }

  state.glyphData = {};
  ALL_GLYPHS.forEach(g => { state.glyphData[g.char] = { strokes: [], done: false }; });
  Object.assign(state.brush, DEFAULT_BRUSH);
  Object.assign(state.metrics, DEFAULT_METRICS);
  Object.assign(state.vector, DEFAULT_VECTOR);
  state.exportFormat = 'otf';
  state.showGrid = false;
  state.showGhost = false;
  state.undoStack = [];
  state.redoStack = [];
  state.currentIndex = 0;

  document.getElementById('fontName').value = 'MioFontCustom';
  document.getElementById('fileName').value = 'miofont';
  document.getElementById('fontAuthor').value = 'Font Maker';

  invalidateGlyphCache();
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) { /* ignora */ }

  syncSlidersFromState();
  buildGlyphPanel();
  selectGlyphByIndex(0);
  redrawAll();
  showToast('Nuovo progetto creato');
}

document.getElementById('btnNewProject').addEventListener('click', newProject);

function syncSlidersFromState() {
  const pairs = [
    ['brushSize', state.brush.size], ['brushNoise', state.brush.noise],
    ['brushNoiseFreq', state.brush.noiseFreq], ['brushPressure', state.brush.pressure],
    ['unitsPerEm', state.metrics.unitsPerEm], ['ascender', state.metrics.ascender],
    ['descender', state.metrics.descender], ['advanceWidth', state.metrics.advanceWidth],
    ['marginLeft', state.metrics.marginLeft], ['traceDetail', state.vector.traceDetail],
    ['smoothing', state.vector.smoothing], ['simplify', state.vector.simplify]
  ];
  pairs.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = val;
    const valId = 'val' + id.charAt(0).toUpperCase() + id.slice(1);
    const alt = document.getElementById(valId);
    if (alt) alt.textContent = val;
  });
  document.getElementById('brushColor').value = state.brush.color;
  document.getElementById('statusUPM').textContent = `UPM: ${state.metrics.unitsPerEm}`;
  document.getElementById('exportFormat').value = state.exportFormat;
  updateExportFormatUI();
}

/* ---------------------------------------------------------------------
   25. AUTOSAVE su localStorage (persistenza tra sessioni, funziona offline)
   --------------------------------------------------------------------- */
const AUTOSAVE_KEY = 'fontforge_studio_autosave_v1';

function autosave() {
  try {
    const data = {
      fontName: document.getElementById('fontName').value,
      fileName: document.getElementById('fileName').value,
      fontAuthor: document.getElementById('fontAuthor').value,
      exportFormat: state.exportFormat,
      metrics: state.metrics,
      brush: state.brush,
      vector: state.vector,
      glyphData: state.glyphData
    };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
  } catch (e) { /* storage pieno o non disponibile: ignora silenziosamente */ }
}

function tryLoadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    document.getElementById('fontName').value = data.fontName || 'MioFontCustom';
    document.getElementById('fileName').value = data.fileName || 'miofont';
    document.getElementById('fontAuthor').value = data.fontAuthor || 'Font Maker';
    state.exportFormat = data.exportFormat === 'ttf' ? 'ttf' : 'otf';
    Object.assign(state.metrics, data.metrics || {});
    Object.assign(state.brush, data.brush || {});
    Object.assign(state.vector, data.vector || {});
    if (data.glyphData) {
      ALL_GLYPHS.forEach(g => {
        if (data.glyphData[g.char]) state.glyphData[g.char] = data.glyphData[g.char];
      });
    }
    invalidateGlyphCache();
    return true;
  } catch (e) { return false; }
}

setInterval(autosave, 8000);
window.addEventListener('beforeunload', autosave);

/* ---------------------------------------------------------------------
   26. INIZIALIZZAZIONE
   --------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   27. ESC PER TORNARE A BLABLA — il tasto Esc deve chiudere l'editor e
   tornare a BlaBla (come il bottone "Torna a BlaBla"), ma il listener per
   quel bottone vive nel documento DI BLABLA (fuori dall'iframe): un keydown
   che parte da dentro l'iframe (es. mentre si scrive nel nome del font o si
   disegna sul canvas) non risale mai al documento padre, quindi va
   intercettato QUI e inoltrato con lo stesso BroadcastChannel già usato per
   consegnare il font creato. Se invece è aperta l'anteprima, Esc chiude solo
   quella (comportamento atteso di un modale) senza uscire dall'editor.
   --------------------------------------------------------------------- */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const previewModal = document.getElementById('previewModal');
  if (previewModal && previewModal.classList.contains('show')) {
    previewModal.classList.remove('show');
    return;
  }
  if (blablaChannel) blablaChannel.postMessage({ type: 'close-request' });
});

function init() {
  buildGlyphPanel();
  const loaded = tryLoadAutosave();
  if (loaded) syncSlidersFromState();
  selectGlyphByIndex(0);
  redrawAll();
  if (loaded) showToast('Sessione precedente ripristinata automaticamente');
}

init();

})();
