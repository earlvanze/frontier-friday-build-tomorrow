// Frontier Friday compositions. A neural spark becomes a signal on a wire, the signal becomes a plan, the plan a street,
// a house, a ledger, a chain — and the same city grows every chorus. The finale returns to the opening spark.
// Rules: pure functions of s.t; words land on w.start; only signal/ember/acid go on the glow layer; lyric type is kept
// >= 96 px inside the frame (shots that move the camera through a world reset to screen space before setting type).
// "Earl Co" is always set in ordinary letterforms.
import { W, H } from '../engine/gl';
import { F, layout, measure } from '../engine/type';
import type { Line, Word } from '../engine/lyrics';
import { clamp, ease, hash, lerp, mulberry32, noise1, prog, pulse, springStep, TAU, polylineLengths, pointAtLength, type V2 } from '../engine/util';
import { A, CAP, col, heat, appear, mix, note, rule, setFont, sizeFor, snapCam, clean, up, drawLetters, widthFam, applyCam } from '../scenes/kit';
import { cam, fitRow, rows, slam, txt, word, type S } from '../scenes/shots';
import { BRAND } from './brand';

const last = <T,>(a: T[]) => a[a.length - 1]!;
const SCREEN = { x: W / 2, y: H / 2, z: 1, r: 0 };
const screen = (s: S) => cam(s, SCREEN);
/** 1 until the next line starts, then fades out quickly. */
const until = (t: number, l?: Line) => (l ? 1 - prog(t, l.start - 0.12, l.start + 0.14) : 1);
/** Scalar version of snapCam: holds, then snaps to vals[i] at times[i]. */
function snapVal(t: number, times: number[], vals: number[], dur = 0.4, fn = ease.outExpo) {
  let v = vals[0]!;
  for (let i = 1; i < vals.length; i++) { if (t < times[i]!) break; v = lerp(v, vals[i]!, prog(t, times[i]!, times[i]! + dur, fn)); }
  return v;
}
/** Fit a row of words and slam each in on its onset. */
/** Swiss-grid typesetting for a lyric row (replaces centred subtitle rows): content words big and heavy, small words
 *  narrow/light on the same baseline; centred calls (x = W/2) are set FLUSH LEFT or FLUSH RIGHT on the grid (alternating by
 *  shot); the row ghosts in ~0.4 s before it is sung; big rows get a hairline rule and a mono figure annotation. */
const SMALLW = /^(a|an|the|to|and|of|in|on|it|is|my|we|our|for|with|from|at|by|but|so|that|this|then|now|too|till|into|i|are|was|be|let|own|just|no|not|could|would|what|how|who|every|more|than|one)$/i;
function row(s: S, ws: Word[], fam: string, width: number, max: number, x: number, y: number, o: { from?: number; alpha?: number; hot?: any; base?: any; glow?: number; rot?: number; align?: 'l' | 'r' | 'c'; anno?: boolean } = {}) {
  if (!ws.length) return null;
  const { t } = s;
  const famS = A(62, 300), ratio = 0.5, gapEm = 0.24;
  const isBig = ws.map((w) => !SMALLW.test(clean(w.w)) || ws.every((v) => SMALLW.test(clean(v.w))));
  const m = ws.map((w, i) => (isBig[i] ? measure(txt(w), fam, 100) : measure(txt(w), famS, 100) * ratio));
  const tot = m.reduce((a, b) => a + b, 0) + gapEm * 100 * (ws.length - 1);
  const size = Math.min(max, (100 * width) / tot), k = size / 100, totalW = tot * k;
  const align = o.rot ? 'c' : (o.align ?? 'c'); // flush left/right is chosen per shot where the layout has room
  const x0 = align === 'l' ? 170 : align === 'r' ? W - 170 - totalW : x - totalW / 2;
  const ghostA = 0.3 * prog(t, ws[0]!.start - 0.45, ws[0]!.start - 0.15);
  const xs: number[] = [];
  let cx = x0;
  ws.forEach((w, i) => {
    const wd = m[i]! * k, big = isBig[i]!, sz = big ? size : size * ratio;
    const px = cx + wd / 2, py = y + (big ? 0 : ((CAP * size) - (CAP * sz)) / 2);
    xs.push(px - x);
    const dx = o.rot ? (px - x) * Math.cos(o.rot) - (px - x) : 0, dy = o.rot ? (px - x) * Math.sin(o.rot) : 0;
    word(s, w, txt(w), big ? fam : famS, sz, px + dx, py + dy, { sc: t < w.start - 0.06 ? 1 : slam(w, t, big ? (o.from ?? 1.7) : 1.2), alpha: o.alpha, hot: o.hot, base: o.base, glow: big ? o.glow : 0, rot: o.rot, ghost: ghostA });
    cx += wd + gapEm * size;
  });
  if ((o.anno ?? size >= 110) && !o.rot) {
    const a = prog(t, ws[0]!.start - 0.2, ws[0]!.start + 0.2) * (o.alpha ?? 1);
    const ry = y + (CAP * size) / 2 + 26;
    rule(s.c, x0, ry, x0 + totalW * prog(t, ws[0]!.start - 0.1, last(ws).end, ease.outCubic), ry, 1, col('graphite', 0.9 * a), 2);
    const mm = Math.floor(ws[0]!.start / 60), ss = (ws[0]!.start % 60).toFixed(1).padStart(4, '0');
    note(s.c, `${String(s.sh.idx).padStart(2, '0')} · ${mm}:${ss}`, align === 'r' ? x0 + totalW : x0, y - (CAP * size) / 2 - 22, a * 0.8, 18, 'ash', align === 'r' ? 'right' : 'left');
  }
  return { size, xs, width: totalW };
}
/** Two balanced rows for one line. */
const WEAK = /^(and|the|a|to|of|in|it|by|for|with|then|into|through|across|before)$/i;
function split2(l: Line, _maxChars = 14): [Word[], Word[]] {
  const ws = l.words;
  if (ws.length < 3) return [ws, []];
  const len = (a: Word[]) => a.reduce((n, w) => n + clean(w.w).length + 1, 0);
  let best = 1, score = 1e9;
  for (let i = 1; i < ws.length; i++) {
    // balanced rows; never end row 1 on a weak word (it belongs with what follows)
    const sc = Math.abs(len(ws.slice(0, i)) - len(ws.slice(i))) + (WEAK.test(clean(ws[i - 1]!.w)) ? 100 : 0);
    if (sc < score) { score = sc; best = i; }
  }
  return [ws.slice(0, best), ws.slice(best)];
}
const findW = (l: Line, re: RegExp) => l.words.find((w) => re.test(clean(w.w))) ?? last(l.words);
/** Dark band that keeps type readable over busy art. */
let PAPER = false; // set per shot (paper plates invert the readability bands)
function band(c: CanvasRenderingContext2D, y: number, h: number, a = 0.7) {
  const gr = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  gr.addColorStop(0, col(PAPER ? 'bone' : 'ink', 0)); gr.addColorStop(0.25, col(PAPER ? 'bone' : 'ink', PAPER ? a * 0.6 : a)); gr.addColorStop(0.75, col(PAPER ? 'bone' : 'ink', PAPER ? a * 0.6 : a)); gr.addColorStop(1, col(PAPER ? 'bone' : 'ink', 0));
  c.fillStyle = gr; c.fillRect(-W, y - h / 2, 3 * W, h);
}

// ------------------------------------------------------------------ circuit traces (cached, deterministic)
type Tr = { pts: V2[]; L: Float32Array; len: number; d: number };
const TR = new Map<string, Tr[]>();
function traces(key: string, seed: number, n: number, cx: number, cy: number, rx: number, ry: number): Tr[] {
  const hit = TR.get(key); if (hit) return hit;
  const r = mulberry32(seed); const out: Tr[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * TAU + r() * 0.35;
    let x = cx + Math.cos(ang) * 40, y = cy + Math.sin(ang) * 40;
    const pts: V2[] = [{ x, y }];
    let horiz = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang));
    const segs = 3 + Math.floor(r() * 3);
    for (let j = 0; j < segs; j++) {
      const span = horiz ? rx : ry;
      const L = (0.35 + r() * 0.65) * span / segs * 1.6;
      if (horiz) x += Math.sign(Math.cos(ang) || 1) * L; else y += Math.sign(Math.sin(ang) || 1) * L;
      pts.push({ x, y }); horiz = !horiz;
    }
    const Ls = polylineLengths(pts); out.push({ pts, L: Ls, len: Ls[Ls.length - 1]!, d: r() });
  }
  TR.set(key, out); return out;
}
function drawTr(c: CanvasRenderingContext2D, tr: Tr, k: number, stroke: string, w = 2.5, pad = true) {
  if (k <= 0) return;
  const sl = clamp(k) * tr.len;
  c.strokeStyle = stroke; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); c.moveTo(tr.pts[0]!.x, tr.pts[0]!.y);
  for (let i = 1; i < tr.pts.length; i++) {
    if (tr.L[i]! <= sl) c.lineTo(tr.pts[i]!.x, tr.pts[i]!.y);
    else { const p = pointAtLength(tr.pts, tr.L, sl); c.lineTo(p.x, p.y); break; }
  }
  c.stroke();
  if (pad && k >= 1) { const e = last(tr.pts); c.beginPath(); c.arc(e.x, e.y, w * 2.6, 0, TAU); c.stroke(); }
}
function head(g: CanvasRenderingContext2D, pts: V2[], L: Float32Array, at: number, color: string, r = 7) {
  const p = pointAtLength(pts, L, at);
  g.fillStyle = color; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
  return p;
}

// ------------------------------------------------------------------ the progressive city (same plan every chorus, grows with n)
interface Bldg { x: number; w: number; h: number; st: number; seed: number }
let CITY: Bldg[] | null = null;
function cityPlan(): Bldg[] {
  if (CITY) return CITY;
  const r = mulberry32(7); const out: Bldg[] = [];
  let x = -1600;
  while (x < 5600) {
    const w = 90 + r() * 150;
    // stage 1 = the first sparse blocks; every chorus adds a stage
    const q = r(); const st = q < 0.5 ? 1 : q < 0.7 ? 2 : q < 0.85 ? 3 : 4;
    out.push({ x, w, h: 170 + r() * 400, st, seed: out.length });
    x += w + 12 + r() * 34;
  }
  return (CITY = out);
}
function drawCity(s: S, n: number, gy: number, o: { lit?: number; a?: number; rise?: number; xs?: [number, number]; scale?: number } = {}) {
  const { c, g, t } = s;
  const lit = o.lit ?? 0.5, a = o.a ?? 1, sc = o.scale ?? 1;
  const xs = o.xs ?? [-1e9, 1e9];
  for (const b of cityPlan()) {
    if (b.st > n || b.x + b.w < xs[0] || b.x > xs[1]) continue;
    const grow = b.st === n ? (o.rise ?? 1) : 1;
    const h = b.h * (0.55 + 0.15 * Math.min(4, n)) * grow * sc;
    if (h < 2) continue;
    const y0 = gy - h;
    c.fillStyle = mix('ink2', 'graphite', 0.35 + 0.25 * hash(b.seed, 5), a); c.fillRect(b.x, y0, b.w, h);
    c.strokeStyle = col('ash', 0.55 * a); c.lineWidth = 2; c.strokeRect(b.x, y0, b.w, h);
    const cols = Math.max(2, Math.floor(b.w / 34)), rws = Math.floor((h - 20) / 40);
    const cw = (b.w - 16) / cols;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rws; j++) {
      const hv = hash(b.seed, i, j);
      if (hv > lit * (0.5 + 0.1 * n)) continue;
      const fl = 0.7 + 0.3 * Math.sin(t * (1 + hash(b.seed, j) * 3) + hv * 50);
      const wx = b.x + 8 + i * cw + cw * 0.22, wy = y0 + 14 + j * 40;
      c.fillStyle = col('acid', 0.85 * a * fl); c.fillRect(wx, wy, cw * 0.56, 16);
      if (hv < lit * 0.18) { g.fillStyle = col('acid', 0.22 * a); g.fillRect(wx - 3, wy - 3, cw * 0.56 + 6, 22); }
    }
    if (hash(b.seed, 99) < 0.3 && h > 300) {
      c.strokeStyle = col('graphite', a); c.lineWidth = 3;
      c.beginPath(); c.moveTo(b.x + b.w / 2, y0); c.lineTo(b.x + b.w / 2, y0 - 60); c.stroke();
      const blink = (Math.floor(t * 1.6 + b.seed) % 2) === 0 ? 1 : 0.15;
      g.fillStyle = col('signal', 0.9 * blink * a); g.beginPath(); g.arc(b.x + b.w / 2, y0 - 62, 7, 0, TAU); g.fill();
    }
  }
  // stage 4: rooftop network links between the tallest towers
  if (n >= 4) {
    const tops = cityPlan().filter((b) => hash(b.seed, 99) < 0.3 && b.x > xs[0] && b.x < xs[1]);
    for (let i = 0; i + 1 < tops.length; i++) {
      const a1 = tops[i]!, b1 = tops[i + 1]!;
      const ya = gy - a1.h * 1.15 - 62, yb = gy - b1.h * 1.15 - 62;
      const k = 0.5 + 0.5 * Math.sin(t * 2 + i);
      g.strokeStyle = col('signal', 0.25 * k * a); g.lineWidth = 2;
      g.beginPath(); g.moveTo(a1.x + a1.w / 2, ya); g.quadraticCurveTo((a1.x + b1.x) / 2 + 60, Math.min(ya, yb) - 120, b1.x + b1.w / 2, yb); g.stroke();
    }
  }
  c.strokeStyle = col('bone', 0.5 * a); c.lineWidth = 3;
  c.beginPath(); c.moveTo(xs[0] === -1e9 ? -2000 : xs[0], gy); c.lineTo(xs[1] === 1e9 ? 6000 : xs[1], gy); c.stroke();
}

// ------------------------------------------------------------------ icons
function brickIcon(c: CanvasRenderingContext2D, x: number, y: number, sz: number, a: number) {
  const bw = sz / 2.2, bh = sz / 5;
  for (let r = 0; r < 4; r++) for (let i = -1; i < 3; i++) {
    const bx = x - sz / 2 + i * bw + (r % 2) * bw / 2, by = y - sz / 2 + r * (bh + 4);
    const x0 = Math.max(bx, x - sz / 2), x1 = Math.min(bx + bw - 4, x + sz / 2);
    if (x1 <= x0) continue;
    c.fillStyle = col('acid', 0.9 * a); c.fillRect(x0, by, x1 - x0, bh);
  }
}
function blockIcon(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, x: number, y: number, sz: number, a: number, label = '#') {
  const h = sz / 2;
  const P = (dx: number, dy: number) => [x + dx, y + dy] as const;
  const top = [P(0, -h), P(h * 0.95, -h / 2), P(0, 0), P(-h * 0.95, -h / 2)];
  const left = [P(-h * 0.95, -h / 2), P(0, 0), P(0, h), P(-h * 0.95, h / 2)];
  const right = [P(h * 0.95, -h / 2), P(0, 0), P(0, h), P(h * 0.95, h / 2)];
  const face = (pts: (readonly [number, number])[], f: string) => {
    c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath(); c.fillStyle = f; c.fill();
    c.strokeStyle = col('signal', 0.9 * a); c.lineWidth = 3; c.stroke();
  };
  face(top, col('ink2', a)); face(left, col('ink', a)); face(right, col('ink2', a * 0.8));
  g.strokeStyle = col('signal', 0.35 * a); g.lineWidth = 6; g.beginPath(); top.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.stroke();
  note(c, label, x, y - h / 2 + 8, a, Math.round(sz * 0.16), 'signal', 'center');
}
function codeIcon(c: CanvasRenderingContext2D, x: number, y: number, sz: number, a: number) {
  setFont(c, F.mono(700), sz * 0.62); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = col('signal', a); c.fillText('</>', x, y);
  c.textBaseline = 'alphabetic';
}
function keyIcon(c: CanvasRenderingContext2D, x: number, y: number, sz: number, a: number, rot = 0, color = 'acid') {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.strokeStyle = col(color, a); c.fillStyle = col(color, a); c.lineWidth = sz * 0.09;
  const r = sz * 0.22;
  c.beginPath(); c.arc(-sz * 0.3, 0, r, 0, TAU); c.stroke();
  c.fillRect(-sz * 0.3 + r, -sz * 0.045, sz * 0.75, sz * 0.09);
  c.fillRect(sz * 0.28, 0, sz * 0.07, sz * 0.16); c.fillRect(sz * 0.38, 0, sz * 0.06, sz * 0.12);
  c.restore();
}
function gearIcon(c: CanvasRenderingContext2D, x: number, y: number, sz: number, a: number, rot = 0) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.fillStyle = col('bone', a);
  for (let i = 0; i < 8; i++) { c.save(); c.rotate((i / 8) * TAU); c.fillRect(-sz * 0.07, -sz * 0.5, sz * 0.14, sz * 0.2); c.restore(); }
  c.beginPath(); c.arc(0, 0, sz * 0.36, 0, TAU); c.fill();
  c.fillStyle = col('ink', a); c.beginPath(); c.arc(0, 0, sz * 0.14, 0, TAU); c.fill();
  c.restore();
}
function chipIcon(c: CanvasRenderingContext2D, x: number, y: number, sz: number, a: number) {
  c.strokeStyle = col('signal', a); c.lineWidth = 3;
  c.strokeRect(x - sz * 0.3, y - sz * 0.3, sz * 0.6, sz * 0.6);
  for (let i = 0; i < 4; i++) {
    const o = -sz * 0.21 + i * sz * 0.14;
    rule(c, x + o, y - sz * 0.3, x + o, y - sz * 0.45, 1, col('signal', a), 3); rule(c, x + o, y + sz * 0.3, x + o, y + sz * 0.45, 1, col('signal', a), 3);
    rule(c, x - sz * 0.3, y + o, x - sz * 0.45, y + o, 1, col('signal', a), 3); rule(c, x + sz * 0.3, y + o, x + sz * 0.45, y + o, 1, col('signal', a), 3);
  }
  note(c, 'AI', x, y + sz * 0.08, a, Math.round(sz * 0.22), 'bone', 'center');
}
function wrenchIcon(c: CanvasRenderingContext2D, x: number, y: number, sz: number, a: number, rot = -0.7) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.fillStyle = col('bone', a); c.fillRect(-sz * 0.06, -sz * 0.3, sz * 0.12, sz * 0.7);
  c.beginPath(); c.arc(0, -sz * 0.36, sz * 0.17, 0, TAU); c.fill();
  c.fillStyle = col('ink', a); c.fillRect(-sz * 0.06, -sz * 0.58, sz * 0.12, sz * 0.22);
  c.restore();
}

// ================================================================== BOOT: instrumental intro — spark, traces, title
function boot(s: S) {
  const { t, sh, c, g, au } = s;
  const end = sh.end;
  const bt = (x: number) => Math.max(0, au.timeOfBeat(Math.round(au.beatAt(x))));
  const times = [0, bt(1.6), bt(3.0), bt(4.4)];
  s.bg.glow = 0.2 + 0.35 * prog(t, 2, 8); s.bg.gy = 0.5; s.bg.grid = 0.35 * prog(t, 3, 9); s.bg.stars = 0.5 * prog(t, 1, 6);
  const k = snapCam(t, times, [{ x: W / 2, y: H / 2, z: 3.2, r: 0.05 }, { x: W / 2, y: H / 2, z: 2.1, r: -0.03 }, { x: W / 2, y: H / 2, z: 1.4, r: 0.015 }, { x: W / 2, y: H / 2, z: 1.0, r: 0 }], 0.7);
  cam(s, { ...k, z: k.z * (1 + 0.03 * prog(t, 5, end)) });
  // traces grow out of the spark; signal heads race along them
  const trs = traces('boot', 11, 30, W / 2, H / 2, 1100, 640);
  trs.forEach((tr, i) => {
    const t0 = 0.9 + i * 0.13 + tr.d * 0.4;
    const kk = prog(t, t0, t0 + 1.8, ease.outCubic);
    const fadeB = 1 - prog(t, end - 0.55, end - 0.05, ease.inOutCubic);
    drawTr(c, tr, kk, col('graphite', 0.85 * fadeB), 2.5);
    const per = 2.2 + tr.d * 1.6, ph = (t - t0) / per;
    if (kk > 0.3 && t > t0) {
      const u = ph - Math.floor(ph);
      head(g, tr.pts, tr.L, u * tr.len * kk, col('signal', 0.9 * (1 - u) * fadeB), 6);
      head(c, tr.pts, tr.L, u * tr.len * kk, col('ember', 0.9 * (1 - u) * fadeB), 3);
    }
  });
  // the spark
  const kick = au.env('low', t);
  const sr = (8 + 10 * kick + 6 * prog(t, 0, 2)) * (1 - 0.85 * prog(t, 4.4, 5.0) * (1 - prog(t, end - 0.8, end - 0.1)));
  c.fillStyle = col('ember', 1); c.beginPath(); c.arc(W / 2, H / 2, sr * 0.6, 0, TAU); c.fill();
  g.fillStyle = col('signal', 0.8); g.beginPath(); g.arc(W / 2, H / 2, sr * 3, 0, TAU); g.fill();
  { const em = prog(t, end - 0.5, end, ease.inCubic); if (em > 0) { const { nodes } = neurons(3, W / 2, H / 2); nodes.forEach((n) => { const x = lerp(W / 2, n.x, 0.06 * em), y = lerp(H / 2, n.y, 0.06 * em); g.strokeStyle = col('signal', 0.5 * em); g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(x, y); g.stroke(); }); } }
  // title: drops in after the pull-back, leaves before the first line
  const out = prog(t, end - 1.0, end - 0.1, ease.inCubic);
  if (t > 4.6 && out < 1) {
    const a = 1 - out;
    const fa = A(125, 900), fb = A(125, 300);
    const sa = sizeFor(BRAND.titleA, fa, 1500), sb = sizeFor(BRAND.titleB, fb, 1000);
    const y0 = H / 2 - 70 - out * 120;
    band(c, H / 2 + 20, 560, 0.75 * a);
    drawLetters(c, BRAND.titleA, fa, sa, W / 2 - measure(BRAND.titleA, fa, sa) / 2, y0, bt(5.2), t, (_i, kk) => col('bone', kk * a), { stagger: 0.05, dy: -140, dur: 0.5 });
    drawLetters(c, BRAND.titleB, fb, sb, W / 2 - measure(BRAND.titleB, fb, sb) / 2, y0 + sb * CAP + 30, bt(6.6), t, (_i, kk) => col('signal', kk * a), { stagger: 0.06, dy: 120, dur: 0.5 });
    drawLetters(g, BRAND.titleB, fb, sb, W / 2 - measure(BRAND.titleB, fb, sb) / 2, y0 + sb * CAP + 30, bt(6.6), t, (_i, kk) => col('signal', 0.35 * kk * a), { stagger: 0.06, dy: 120, dur: 0.5 });
    note(c, BRAND.host, W / 2, y0 + sb * CAP + 120, prog(t, bt(8.2), bt(8.2) + 0.5) * a, 40, 'bone', 'center');
    note(c, BRAND.tagline, W / 2, y0 + sb * CAP + 170, prog(t, bt(9.3), bt(9.3) + 0.5) * a * 0.9, 22, 'ash', 'center');
  }
}

// ================================================================== NEURAL: neurons fire on the words, then become circuits
interface Nd { x: number; y: number; r: number }
const NEU = new Map<number, { nodes: Nd[]; edges: [number, number][] }>();
function neurons(seed: number, cx: number, cy: number) {
  const hit = NEU.get(seed); if (hit) return hit;
  const r = mulberry32(seed); const nodes: Nd[] = [];
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = Math.sqrt(r());
    nodes.push({ x: cx + Math.cos(a) * d * 940, y: cy + Math.sin(a) * d * 520, r: 5 + r() * 7 });
  }
  const edges: [number, number][] = [];
  nodes.forEach((n, i) => {
    const near = nodes.map((m, j) => [Math.hypot(m.x - n.x, m.y - n.y), j] as const).filter(([, j]) => j !== i).sort((p, q) => p[0] - q[0]);
    for (let k = 0; k < 2; k++) { const j = near[k]![1]; if (!edges.some(([a, b]) => (a === j && b === i))) edges.push([i, j]); }
  });
  const v = { nodes, edges }; NEU.set(seed, v); return v;
}
function edgePts(a: Nd, b: Nd, ortho: number): V2[] {
  const pts: V2[] = [];
  const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.25, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.25;
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const qx = (1 - u) * (1 - u) * a.x + 2 * u * (1 - u) * mx + u * u * b.x, qy = (1 - u) * (1 - u) * a.y + 2 * u * (1 - u) * my + u * u * b.y;
    const ox = u < 0.5 ? lerp(a.x, b.x, u * 2) : b.x, oy = u < 0.5 ? a.y : lerp(a.y, b.y, (u - 0.5) * 2);
    pts.push({ x: lerp(qx, ox, ortho), y: lerp(qy, oy, ortho) });
  }
  return pts;
}
function network(s: S, seed: number, cx: number, cy: number, fires: number[], ortho: number, a = 1, grow = 1) {
  // grow < 1: a wave spreads from the centre (the spark) — edges draw outward from their nearer node, nodes appear as the
  // wave reaches them, and fine luminous trails run from the spark to each node ahead of the wave
  const { c, g, t } = s;
  const { nodes, edges } = neurons(seed, cx, cy);
  const dn = (n: Nd) => Math.hypot((n.x - cx) / 940, (n.y - cy) / 520);
  const wave = grow >= 1 ? 9 : grow * 1.15;
  if (grow < 1) nodes.forEach((n) => { const k = clamp(wave / Math.max(0.05, dn(n))); const x = lerp(cx, n.x, k), y = lerp(cy, n.y, k); g.strokeStyle = col('signal', 0.55 * (1 - grow) * a); g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); c.strokeStyle = col('ember', 0.7 * (1 - grow) * a); c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke(); });
  edges.forEach(([i, j], e) => {
    let A0 = nodes[i]!, B0 = nodes[j]!;
    if (dn(B0) < dn(A0)) { const tmp = A0; A0 = B0; B0 = tmp; }
    const frac = clamp((wave - dn(A0)) / Math.max(0.001, dn(B0) - dn(A0)));
    if (frac <= 0) return;
    const pts = edgePts(A0, B0, ortho);
    const L = polylineLengths(pts);
    const len = last(Array.from(L));
    c.strokeStyle = col(ortho > 0.5 ? 'graphite' : 'ash', 0.45 * a); c.lineWidth = ortho > 0.5 ? 3 : 1.6;
    if (frac < 1) { drawTr(c, { pts, L, len, d: 0 }, frac, col(ortho > 0.5 ? 'graphite' : 'ash', 0.45 * a), ortho > 0.5 ? 3 : 1.6, false); return; }
    c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
    fires.forEach((f, fi) => {
      if (hash(e, fi, seed) > 0.4) return;
      const u = prog(t, f, f + 0.55, ease.outCubic);
      if (u <= 0 || u >= 1) return;
      head(g, pts, L, u * len, col('signal', 0.95 * a), 7);
      head(c, pts, L, u * len, col('ember', a), 3);
    });
  });
  nodes.forEach((n, i) => {
    const pop = clamp((wave - dn(n)) * 6);
    if (pop <= 0) return;
    let hot = grow < 1 ? 0.6 * (1 - pop) : 0;
    fires.forEach((f, fi) => { if (hash(i, fi, seed + 1) < 0.35) hot = Math.max(hot, pulse(t, f + 0.3, 0.25)); });
    c.fillStyle = mix('ash', 'signal', hot, (0.45 * a + 0.4 * hot) * pop); c.beginPath(); c.arc(n.x, n.y, n.r * (0.8 + 0.4 * hot) * pop, 0, TAU); c.fill();
    if (hot > 0.05) { g.fillStyle = col('signal', 0.35 * hot * a); g.beginPath(); g.arc(n.x, n.y, n.r * 2.4, 0, TAU); g.fill(); }
  });
}
function neural(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.stars = 0.8; s.bg.glow = 0.35; s.bg.grid = 0.2;
  const C2 = { x: W / 2 + 1700, y: H / 2 + 380 };
  const k = snapCam(t, [sh.start, l2 ? l2.start - 0.15 : 1e9], [{ x: W / 2, y: H / 2, z: 1.0, r: -0.01 }, { x: C2.x, y: C2.y, z: 1.0, r: 0.012 }], 0.7, ease.inOutCubic);
  { const kk = { ...k, z: k.z * (1 + 0.025 * prog(t, sh.start, sh.end)) }; applyCam(c, kk); applyCam(g, kk); }
  const ortho = l2 ? prog(t, l2.start - 0.3, l2.start + 1.0, ease.inOutCubic) : 0;
  const grow = prog(t, sh.start - 0.05, sh.start + 1.1, ease.outCubic);
  network(s, 3, W / 2, H / 2, l1.words.map((w) => w.start), ortho * 0.6, 1, grow);
  if (grow < 1) { const kick = s.au.env('low', t), r = (14 + 10 * kick) * (1 - grow * 0.8); c.fillStyle = col('ember', 1 - grow * 0.6); c.beginPath(); c.arc(W / 2, H / 2, r * 0.6, 0, TAU); c.fill(); g.fillStyle = col('signal', 0.8 * (1 - grow)); g.beginPath(); g.arc(W / 2, H / 2, r * 3, 0, TAU); g.fill(); }
  if (l2) network(s, 5, C2.x, C2.y, l2.words.map((w) => w.start), Math.max(0.5, ortho));
  // line 1
  const [r1, r2] = split2(l1, 13);
  band(c, H / 2, 560, 0.75);
  row(s, r1, A(100, 900), 1400, 240, W / 2, H / 2 - 110);
  row(s, r2, A(125, 500), 1150, 150, W / 2, H / 2 + 120);
  if (!l2) return;
  // line 2: CIRCUITS WAKE / AND LETTERS LIGHT — LIGHT flickers on like a tube
  const [q1, q2] = split2(l2, 13);
  band(c, C2.y, 560, 0.75);
  row(s, q1, A(125, 900), 1400, 230, C2.x, C2.y - 110);
  const fam = A(100, 700);
  const fr = fitRow(q2.map(txt), fam, 1250, 170);
  q2.forEach((w, i) => {
    if (/light/i.test(w.w)) {
      const L = layout(txt(w), fam, fr.size);
      const x0 = C2.x + fr.xs[i]! - L.width / 2;
      setFont(c, fam, fr.size); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      for (const gl of L.glyphs) {
        const on = t - (w.start + gl.i * 0.05);
        if (on < -0.06) continue;
        const flick = on < 0.25 ? (hash(gl.i, Math.floor(t * 40)) < 0.55 ? 1 : 0.2) : 1;
        c.fillStyle = col('signal', flick); c.fillText(gl.ch, x0 + gl.x, C2.y + 120 + (CAP * fr.size) / 2);
        setFont(g, fam, fr.size); g.textAlign = 'left'; g.fillStyle = col('signal', 0.45 * flick); g.fillText(gl.ch, x0 + gl.x, C2.y + 120 + (CAP * fr.size) / 2);
      }
    } else word(s, w, txt(w), fam, fr.size, C2.x + fr.xs[i]!, C2.y + 120, { sc: slam(w, t, 1.6) });
  });
}

// ================================================================== WIRE: the camera rides the signal along a wire
function wire(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.glow = 0.2; s.bg.grid = 0.5; s.bg.stars = 0.3;
  const fam = A(100, 900), size = 190, gap = 150;
  // wire: along y0, then down a step, then along y1 for line 2
  const y0 = H / 2 + 60, y1 = y0 + 640;
  const place = (ws: Word[], x: number) => {
    const xs: number[] = []; let cx = x;
    ws.forEach((w, i) => { const m = measure(txt(w), fam, size); if (i) cx += gap; xs.push(cx + m / 2); cx += m; });
    return { xs, end: cx };
  };
  const p1 = place(l1.words, W / 2 - 200);
  const bendX = p1.end + 260;
  const p2 = l2 ? place(l2.words, bendX + 360) : { xs: [], end: bendX };
  const pts: V2[] = [{ x: -600, y: y0 }, { x: bendX, y: y0 }, { x: bendX + 200, y: y1 }, { x: p2.end + 1600, y: y1 }];
  const L = polylineLengths(pts);
  const along = (x: number, onLow: boolean) => (onLow ? L[2]! + (x - (bendX + 200)) : x + 600);
  // camera + signal head targets: every word onset
  const ws = [...l1.words, ...(l2?.words ?? [])];
  const tx = [...p1.xs, ...p2.xs];
  const times = [sh.start, ...ws.map((w) => w.start - 0.05)];
  const camX = [p1.xs[0]!, ...tx];
  const camY = [y0, ...l1.words.map(() => y0), ...(l2?.words.map(() => y1) ?? [])];
  const rr = [0, ...ws.map((_, i) => (i % 2 ? 0.012 : -0.012))];
  const k = { x: snapVal(t, times, camX, 0.32), y: snapVal(t, times, camY, 0.5, ease.inOutCubic) - 40, z: 1, r: snapVal(t, times, rr, 0.4) };
  cam(s, k);
  const hs = [0, ...l1.words.map((_, i) => along(p1.xs[i]!, false)), ...(l2?.words.map((_, i) => along(p2.xs[i]!, true)) ?? [])];
  hs[0] = along(p1.xs[0]! - 400, false);
  const hl = snapVal(t, times, hs, 0.3);
  // wire
  c.strokeStyle = col('graphite', 1); c.lineWidth = 5; c.lineJoin = 'round';
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
  const lit = { pts, L, len: last(Array.from(L)), d: 0 };
  drawTr(c, lit, hl / lit.len, col('signal', 0.9), 5, false);
  drawTr(g, lit, hl / lit.len, col('signal', 0.35), 12, false);
  // insulator ticks every 160 px
  for (let x = -600; x < p2.end + 1600; x += 160) {
    const onLow = x > bendX + 200, yy = onLow ? y1 : y0;
    if (x > bendX && x < bendX + 200) continue;
    c.fillStyle = col('graphite', 1); c.fillRect(x - 3, yy - 12, 6, 24);
  }
  const hp = head(g, pts, L, hl, col('ember', 0.9), 22);
  head(c, pts, L, hl, col('ember', 1), 8);
  // words sit on the wire
  l1.words.forEach((w, i) => word(s, w, txt(w), fam, size, p1.xs[i]!, y0 - 150, { sc: slam(w, t, 1.2) }));
  l2?.words.forEach((w, i) => {
    const fire = /fire/i.test(w.w);
    word(s, w, txt(w), fire ? A(125, 900) : fam, size, p2.xs[i]!, y1 - 150, { sc: slam(w, t, fire ? 1.5 : 1.2) });
    if (fire && t > w.start) {
      // sparks off the burning word
      for (let p = 0; p < 40; p++) {
        const life = 0.9 + hash(p, 3) * 0.8, tt = (t - w.start - hash(p, 7) * 0.5);
        const u = ((tt % life) + life) % life;
        if (tt < 0) continue;
        const vx = (hash(p, 1) - 0.5) * 700, vy = -300 - hash(p, 2) * 500;
        const x = p2.xs[i]! + (hash(p, 4) - 0.5) * measure('FIRE', A(125, 900), size) + vx * u;
        const y = y1 - 150 + vy * u + 600 * u * u;
        g.fillStyle = col(hash(p, 5) < 0.5 ? 'signal' : 'ember', (1 - u / life) * 0.9); g.fillRect(x - 3, y - 3, 6, 6);
      }
    }
  });
  void hp;
}

// ================================================================== LEARN: patterns turn on a Truchet grid, a loss curve learns
function learn(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.grid = 0.6; s.bg.glow = 0.25;
  const k = snapCam(t, [sh.start, l2 ? l2.start - 0.15 : 1e9], [{ x: W / 2, y: H / 2, z: 1, r: -0.008 }, { x: W / 2, y: H / 2 + 1080, z: 1, r: 0.008 }], 0.65, ease.inOutCubic);
  cam(s, k);
  // panel 1: grid on the right
  const turnW = findW(l1, /turn/i);
  const spin = springStep(t - turnW.start, 2.4, 0.55) * (t > turnW.start ? 1 : 0);
  const gx = 1460, gy = H / 2, N = 6, cs = 92;
  c.save(); c.translate(gx, gy); c.rotate((Math.PI / 2) * clamp(spin, 0, 1.15));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const id = i * N + j;
    let rot = Math.floor(hash(id, 1) * 4);
    let hot = 0;
    l1.words.forEach((w, wi) => {
      if (hash(id, wi + 3) < 0.4) { rot += prog(t, w.start - 0.05, w.start + 0.22, ease.outExpo); hot = Math.max(hot, pulse(t, w.start, 0.3)); }
    });
    const x = (i - N / 2 + 0.5) * cs, y = (j - N / 2 + 0.5) * cs;
    c.save(); c.translate(x, y); c.rotate((rot * Math.PI) / 2);
    c.strokeStyle = mix('graphite', 'signal', hot, 1); c.lineWidth = 6;
    c.beginPath(); c.arc(-cs / 2, -cs / 2, cs / 2, 0, Math.PI / 2); c.stroke();
    c.beginPath(); c.arc(cs / 2, cs / 2, cs / 2, Math.PI, Math.PI * 1.5); c.stroke();
    if (hot > 0.1) { g.strokeStyle = col('signal', 0.5 * hot); g.lineWidth = 10; g.save(); g.setTransform(c.getTransform()); g.beginPath(); g.arc(-cs / 2, -cs / 2, cs / 2, 0, Math.PI / 2); g.stroke(); g.restore(); }
    c.restore();
  }
  c.restore();
  const [r1, r2] = split2(l1, 12);
  row(s, r1, A(100, 900), 900, 210, 620, H / 2 - 100);
  row(s, r2, A(125, 700), 900, 170, 620, H / 2 + 110);
  if (!l2) return;
  // panel 2: FIG. 2 — the pdoom "training loss" sheet, inverted into exponential growth: a hairline log-grid chart, a flat
  // plateau, then the curve takes off on LEARN; the lyric rides the curve and the spark is its pen
  const Y = H / 2 + 1080;
  const x0 = 220, x1 = W - 220, yb = Y + 330, yt = Y - 300;
  const ck = prog(t, l2.start - 0.25, l2.start + 0.35, ease.outExpo);
  for (let i = 0; i <= 12; i++) rule(c, lerp(x0, x1, i / 12), yb, lerp(x0, x1, i / 12), yt, ck, col('graphite', i % 4 ? 0.35 : 0.7), i % 4 ? 1 : 1.6);
  for (let d = 0; d < 4; d++) for (let m = 1; m <= 9; m++) {
    const yy = yb - ((d + Math.log10(m)) / 4) * (yb - yt);
    rule(c, x0, yy, x1, yy, ck, col('graphite', m === 1 ? 0.75 : 0.28), m === 1 ? 1.6 : 1);
    if (m === 1) note(c, `10^${d}`, x0 - 14, yy + 6, ck, 16, 'ash', 'right');
  }
  note(c, 'FIG. 2 — GROWTH, SUDDENLY', x0, yt - 26, ck, 20, 'bone');
  note(c, 'CAPABILITY (LOG)', x0, yt - 2, ck * 0.8, 15, 'ash');
  note(c, 'ITERATIONS →', x1, yb + 34, ck, 16, 'ash', 'right');
  const ws = l2.words, learnW = last(ws);
  // curve: noisy plateau, knee at LEARN, then exponential
  const knee = 0.62;
  const curve = (u: number) => { const base = 0.18 + 0.05 * u + noise1(u * 22, 7) * 0.02 * (1 - u); const up = u > knee ? Math.pow((u - knee) / (1 - knee), 2.2) * 0.78 : 0; return yb - (base + up) * (yb - yt); };
  // the words ride above the plateau as one row; the pen moves under each word as it is sung; LEARN sits on the take-off
  const lead = ws.slice(0, -1);
  const frL = fitRow(lead.map(txt), A(100, 900), (x1 - x0) * (knee - 0.02), 100);
  const rowCx = x0 + ((x1 - x0) * (knee - 0.02)) / 2, rowY = curve(0.3) - 150;
  const at = (i: number) => (i < lead.length ? (rowCx + frL.xs[i]! - x0) / (x1 - x0) : 0.97);
  const times = [l2.start - 0.2, ...ws.map((w) => w.start - 0.05)];
  const pu = snapVal(t, times, [0, ...ws.map((_, i) => at(i))], 0.35, ease.inOutCubic);
  c.strokeStyle = col('signal', 1); c.lineWidth = 4; c.beginPath();
  for (let i = 0; i <= 160 * pu; i++) { const u = i / 160, x = lerp(x0, x1, u), y = curve(u); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();
  g.strokeStyle = col('signal', 0.35); g.lineWidth = 12; g.beginPath();
  for (let i = 0; i <= 160 * pu; i++) { const u = i / 160, x = lerp(x0, x1, u), y = curve(u); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  const px = lerp(x0, x1, pu), py = curve(pu);
  c.fillStyle = col('ember', 1); c.beginPath(); c.arc(px, py, 8, 0, TAU); c.fill();
  g.fillStyle = col('signal', 0.7); g.beginPath(); g.arc(px, py, 26, 0, TAU); g.fill();
  lead.forEach((w, i) => {
    word(s, w, txt(w), A(100, 900), frL.size, rowCx + frL.xs[i]!, rowY, { sc: slam(w, t, 1.4) });
    if (t > w.start) rule(c, rowCx + frL.xs[i]!, rowY + frL.size * CAP * 0.6, rowCx + frL.xs[i]!, curve(at(i)) - 10, prog(t, w.start, w.start + 0.2), col('graphite', 0.8), 1.5);
  });
  const sz = 200, lx = x1 - measure(txt(learnW), A(125, 900), sz) / 2 - 20;
  word(s, learnW, txt(learnW), A(125, 900), sz, lx, curve(0.97) + 170, { sc: slam(learnW, t, 1.6) });
}

const isSmallW = (w: Word) => /^(the|and|it|a|to|of)$/i.test(clean(w.w));

// ================================================================== PROMPT: a terminal types, the line draws a plan; an arm builds
function prompt(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.grid = 0.4; s.bg.glow = 0.3;
  const OX = 1920 + 200;
  const k = snapCam(t, [sh.start, l2 ? l2.start - 0.15 : 1e9], [{ x: W / 2, y: H / 2, z: 1, r: 0 }, { x: W / 2 + OX, y: H / 2, z: 1, r: -0.015 }], 0.6, ease.inOutCubic);
  cam(s, k);
  // terminal
  const tx0 = 300, tx1 = W - 300, ty0 = 120, ty1 = 280;
  c.fillStyle = col('ink2', 0.95); c.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
  c.strokeStyle = col('graphite', 1); c.lineWidth = 2; c.strokeRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
  ['ash', 'ash', 'signal'].forEach((k2, i) => { c.fillStyle = col(k2, 0.8); c.beginPath(); c.arc(tx0 + 28 + i * 26, ty0 + 24, 7, 0, TAU); c.fill(); });
  let typed = '';
  for (const w of l1.words) {
    const n = clean(w.w).length;
    const kk = clamp((t - w.start) / Math.max(0.12, w.end - w.start));
    if (kk <= 0) break;
    typed += clean(w.w).toLowerCase().slice(0, Math.ceil(n * kk)) + ' ';
  }
  note(c, '> ' + typed + (Math.floor(t * 3) % 2 ? '▍' : ''), tx0 + 30, ty0 + 110, 1, 44, 'bone');
  // the plan drawn from the prompt
  const plan = findW(l1, /plan/i);
  const pk = prog(t, plan.start - 0.05, plan.start + 1.2, ease.outCubic);
  if (pk > 0) {
    const px = W / 2 - 560, py = 560, pw = 1120, ph = 440;
    rule(c, W / 2, ty1, W / 2, py, prog(pk, 0, 0.2), col('signal', 0.7), 3);
    c.strokeStyle = col('signal', 0.45); c.lineWidth = 3;
    const seg = (x0: number, y0: number, x1: number, y1: number, a: number, b: number) => rule(c, x0, y0, x1, y1, prog(pk, a, b), col('signal', 0.45), 3);
    seg(px, py, px + pw, py, 0.15, 0.4); seg(px + pw, py, px + pw, py + ph, 0.3, 0.5); seg(px + pw, py + ph, px, py + ph, 0.4, 0.65); seg(px, py + ph, px, py, 0.55, 0.75);
    seg(px + pw * 0.42, py, px + pw * 0.42, py + ph, 0.6, 0.85); seg(px + pw * 0.42, py + ph * 0.55, px + pw, py + ph * 0.55, 0.7, 0.95);
    note(c, 'PLAN · A-101', px + pw - 10, py + ph + 34, prog(pk, 0.8, 1), 18, 'signal', 'right');
  }
  const [r1, r2] = split2(l1, 15);
  row(s, r1, A(100, 900), 1300, 200, W / 2, 470);
  row(s, r2, A(125, 900), 1300, 200, W / 2, 720, { hot: 'signal' });
  if (!l2) return;
  // line 2: an arm draws the underline as the line is sung; TOOL hands it a wrench
  const cx = W / 2 + OX;
  const [q1, q2] = split2(l2, 14);
  row(s, q1, A(100, 900), 1300, 200, cx, 260);
  const fr = row(s, q2, A(125, 700), 1300, 170, cx, 500)!;
  const xsT = l2.words.map((w) => { const i2 = q2.indexOf(w); return i2 >= 0 ? cx + fr.xs[i2]! : cx - fr.width / 2; });
  const times = [l2.start - 0.15, ...l2.words.map((w) => w.start)];
  const ex = snapVal(t, times, [cx - fr.width / 2 - 60, ...xsT], 0.35, ease.inOutCubic);
  const ey = 640 + 18 * Math.sin(t * 9) * prog(t, l2.start, l2.end);
  const B = { x: cx + 700, y: 1020 };
  const l1n = 520, l2n = 470;
  const dx = ex - B.x, dy = ey - B.y, d = Math.min(l1n + l2n - 1, Math.hypot(dx, dy));
  const a2 = Math.acos(clamp((d * d - l1n * l1n - l2n * l2n) / (2 * l1n * l2n), -1, 1));
  const a1 = Math.atan2(dy, dx) - Math.atan2(l2n * Math.sin(a2), l1n + l2n * Math.cos(a2));
  const J = { x: B.x + Math.cos(a1) * l1n, y: B.y + Math.sin(a1) * l1n };
  const E = { x: J.x + Math.cos(a1 + a2) * l2n, y: J.y + Math.sin(a1 + a2) * l2n };
  rule(c, cx - fr.width / 2 - 60, 640, Math.max(cx - fr.width / 2 - 60, E.x), 640, 1, col('signal', 0.95), 6);
  rule(g, cx - fr.width / 2 - 60, 640, Math.max(cx - fr.width / 2 - 60, E.x), 640, 1, col('signal', 0.4), 12);
  c.strokeStyle = col('bone', 0.9); c.lineCap = 'round';
  c.lineWidth = 38; c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(J.x, J.y); c.stroke();
  c.lineWidth = 26; c.beginPath(); c.moveTo(J.x, J.y); c.lineTo(E.x, E.y); c.stroke();
  c.strokeStyle = col('ink', 1); c.lineWidth = 4;
  [B, J].forEach((p) => { c.fillStyle = col('ink2', 1); c.beginPath(); c.arc(p.x, p.y, 26, 0, TAU); c.fill(); c.stroke(); });
  c.fillStyle = col('graphite', 1); c.fillRect(B.x - 90, B.y, 180, 60);
  const tool = findW(l2, /tool/i);
  if (t > tool.start - 0.05) wrenchIcon(c, E.x + 10, E.y - 40, 110 * clamp(springStep(t - tool.start, 3, 0.5), 0, 1.1), 1, -0.4 + 0.3 * Math.sin(t * 6));
  g.fillStyle = col('signal', 0.8); g.beginPath(); g.arc(E.x, E.y, 18, 0, TAU); g.fill();
}

// ================================================================== ZOOM: into the O of ZOOM, then widen out; trace through the doubt
function zoom(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  const n = sh.o.n ?? 1, flip = n % 2 ? 1 : -1;
  s.bg.grid = 0.3; s.bg.stars = 0.4; s.bg.glow = 0.3;
  const zw = l1.words[0]!;
  const rightW = l1.words[1] ?? zw, thenW = l1.words.find((w) => /then/i.test(w.w)) ?? last(l1.words);
  const widen = findW(l1, /widen/i), outW = last(l1.words);
  const famZ = A(125, 900), sz = sizeFor('ZOOM', famZ, 1450);
  const L = layout('ZOOM', famZ, sz);
  const zx0 = W / 2 - L.width / 2;
  const og = L.glyphs[2]!;
  const O = { x: zx0 + og.x + og.w / 2, y: H / 2 - 20 };
  const R2 = { x: W / 2, y: H / 2 + 2600 };
  // the push into the O starts on the ZOOM onset (a 0.08 s lead) and lands as RIGHT IN is sung; z is interpolated in log
  // space so the zoom reads as a steady commit, not a late snap
  const zin = prog(t, zw.start - 0.08, Math.max(zw.start + 0.45, (l1.words[2] ?? rightW).start + 0.1), ease.inOutCubic);
  const inCam = { x: lerp(W / 2, O.x, Math.min(1, zin * 1.4)), y: lerp(H / 2, O.y, Math.min(1, zin * 1.4)), z: Math.exp(lerp(0, Math.log(7.5), zin)), r: 0.04 * flip * zin };
  const times = [sh.start, thenW.start - 0.1, outW.start, l2 ? l2.start - 0.2 : 1e9];
  const k = t < thenW.start - 0.1 ? inCam : snapCam(t, times, [inCam, { x: W / 2, y: H / 2 + 260, z: 0.44, r: -0.02 * flip }, { x: W / 2, y: H / 2 + 260, z: 0.4, r: 0 }, { x: R2.x, y: R2.y, z: 1, r: 0 }], 0.55, ease.inOutExpo);
  cam(s, k);
  // the circuit board around ZOOM (revealed when widening out)
  const trs = traces('zoom' + n, 20 + n, 36, W / 2, H / 2, 2400, 1500);
  const wk = prog(t, thenW.start - 0.1, thenW.start + 1.2, ease.outCubic);
  trs.forEach((tr, i) => {
    drawTr(c, tr, wk * (0.6 + 0.4 * tr.d), col('graphite', 0.9), 8);
    if (wk > 0.5) { const u = ((t * 0.4 + tr.d) % 1); head(g, tr.pts, tr.L, u * tr.len, col('signal', 0.7), 16); }
    void i;
  });
  // ZOOM
  word(s, zw, 'ZOOM', famZ, sz, W / 2, H / 2 - 20, { sc: slam(zw, t, 1.5) });
  // inside the O: a chip with RIGHT IN on it
  if (t > rightW.start - 0.3) {
    const a = prog(t, rightW.start - 0.3, rightW.start);
    c.strokeStyle = col('signal', 0.8 * a); c.lineWidth = 0.6;
    c.strokeRect(O.x - 46, O.y - 34, 92, 68);
    for (let i = 0; i < 6; i++) { const yy = O.y - 28 + i * 11; rule(c, O.x - 46, yy, O.x - 56, yy, a, col('signal', 0.8), 0.6); rule(c, O.x + 46, yy, O.x + 56, yy, a, col('signal', 0.8), 0.6); }
    const inner = l1.words.slice(1, l1.words.indexOf(thenW));
    const fr = fitRow(inner.map(txt), A(100, 900), 76, 22);
    inner.forEach((w, i) => word(s, w, txt(w), A(100, 900), fr.size, O.x + fr.xs[i]!, O.y, { sc: slam(w, t, 1.5) }));
  }
  // THEN WIDEN OUT, huge on the board
  const tail = l1.words.slice(l1.words.indexOf(thenW));
  if (t > thenW.start - 0.2) {
    const fam = A(100, 900);
    // lay the row out with WIDEN at its widest so it never grows into its neighbours or past the frame
    const wfam = A(125, 900), widths = tail.map((w) => measure(txt(w), w === widen ? wfam : fam, 100));
    const gapEm = 0.3, tot = widths.reduce((x, y) => x + y, 0) + gapEm * 100 * (tail.length - 1);
    const size = Math.min(380, (100 * 3300) / tot), kk2 = size / 100;
    const fr = { size, xs: [] as number[] }; let xx = (-tot * kk2) / 2;
    widths.forEach((m) => { fr.xs.push(xx + (m * kk2) / 2); xx += m * kk2 + gapEm * size; });
    tail.forEach((w, i) => {
      const f = w === widen ? widthFam(prog(t, w.start, w.start + 0.6, ease.outCubic)) : fam;
      word(s, w, txt(w), f, fr.size, W / 2 + fr.xs[i]!, H / 2 + 720, { sc: slam(w, t, 1.4) });
    });
  }
  if (!l2) return;
  // line 2: two rows of type; a trace snakes between them and lights each word as it is sung; DOUBT glitches until reached
  const [q1, q2] = split2(l2);
  const famT = A(100, 900);
  const f1 = fitRow(q1.map(txt), famT, 1450, 190), f2 = fitRow(q2.map(txt), A(125, 900), 1450, 190);
  const yT = R2.y - 330, yB = R2.y + 330;
  const anc: V2[] = [...q1.map((_, i) => ({ x: R2.x + f1.xs[i]!, y: R2.y - 150 })), ...q2.map((_, i) => ({ x: R2.x + f2.xs[i]!, y: R2.y + 150 }))];
  const P: V2[] = [{ x: anc[0]!.x - 300, y: anc[0]!.y }];
  anc.forEach((p, i) => { const q = P[P.length - 1]!; if (i && q.y !== p.y) P.push({ x: q.x, y: p.y }); P.push(p); });
  const PL = polylineLengths(P);
  const tot = last(Array.from(PL));
  const aL = anc.map((p) => PL[P.indexOf(p)]!);
  const ws = l2.words;
  const hl = snapVal(t, [l2.start - 0.2, ...ws.map((w) => w.start - 0.05)], [0, ...aL], 0.32);
  c.strokeStyle = col('graphite', 1); c.lineWidth = 6; c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
  drawTr(c, { pts: P, L: PL, len: tot, d: 0 }, hl / tot, col('signal', 1), 6, false);
  drawTr(g, { pts: P, L: PL, len: tot, d: 0 }, hl / tot, col('signal', 0.4), 14, false);
  anc.forEach((p, i) => { const on = t >= ws[i]!.start; c.fillStyle = col(on ? 'signal' : 'graphite', 1); c.beginPath(); c.arc(p.x, p.y, on ? 12 : 8, 0, TAU); c.fill(); rule(c, p.x, p.y, p.x, i < q1.length ? yT + 100 : yB - 100, 1, col('graphite', 0.8), 2); });
  head(g, P, PL, hl, col('ember', 0.9), 18); head(c, P, PL, hl, col('ember', 1), 7);
  ws.forEach((w, i) => {
    const top = i < q1.length;
    const x = R2.x + (top ? f1.xs[i]! : f2.xs[i - q1.length]!);
    const doubt = /doubt/i.test(w.w), reached = t >= w.start;
    const jit = doubt && !reached ? noise1(t * 30, 2) * 12 : 0;
    word(s, w, txt(w), top ? famT : A(125, 900), top ? f1.size : f2.size, x + jit, top ? yT : yB, { sc: slam(w, t, 1.4), ghost: doubt ? 0.3 : 0, base: doubt && !reached ? 'ash' : 'bone' });
    if (doubt && !reached) note(c, '? ? ?', x, yB + 110, 0.5 + 0.3 * noise1(t * 9, 1), 30, 'ash', 'center');
  });
}

// ================================================================== EDGE: a corridor of doors; the map ends at the frontier
function edge(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  const n = sh.o.n ?? 1;
  s.bg.glow = 0.4; s.bg.gy = 0.45;
  screen(s);
  const a1 = until(t, l2);
  if (a1 > 0) {
    // doors: depth advances on every word onset
    const steps = l1.words.map((w) => w.start - 0.05);
    const cd = snapVal(t, [sh.start, ...steps], [0, ...steps.map((_, i) => (i + 1) * 0.55)], 0.35, ease.outCubic);
    for (let i = 9; i >= 0; i--) {
      const z = 1.0 + i * 0.75 - cd;
      if (z < 0.18) continue;
      const sc = 1 / z, al = clamp((z - 0.18) * 3) * clamp(2.6 - z * 0.45) * a1;
      const dw = 520 * sc, dh = 900 * sc, x = W / 2 - dw / 2, y = H / 2 - dh / 2 + 60 * sc;
      c.strokeStyle = col(i % 2 ? 'ash' : 'bone', 0.7 * al); c.lineWidth = Math.max(1.5, 8 * sc);
      c.strokeRect(x, y, dw, dh);
      const open = 0.15 + 0.1 * Math.sin(i * 1.7 + n);
      g.fillStyle = col('signal', 0.25 * al); g.fillRect(x + dw * (1 - open), y, dw * open, dh);
      c.fillStyle = col('signal', 0.6 * al); c.fillRect(x + dw * (1 - open), y, Math.max(1, 3 * sc), dh);
      note(c, '?', x + dw * 0.45, y + dh * 0.55, al * 0.8, Math.max(8, Math.round(150 * sc)), 'ash', 'center');
    }
    band(c, 190, 300, 0.8 * a1); band(c, 890, 300, 0.8 * a1);
    const [r1, r2] = split2(l1, 16);
    row(s, r1, A(100, 900), 1500, 170, W / 2, 190, { alpha: a1 });
    row(s, r2, A(125, 900), 1300, 190, W / 2, 890, { alpha: a1 });
  }
  if (!l2) return;
  // line 2 is the transformer stack (pdoom FIG. 11, upward) from its first word: FIND THE EDGE is block 01 (the edge of
  // the known map runs across it), AND ASK FOR is block 02, then one block per MORE, then one per beat while it's held
  const edgeW = findW(l2, /edge/i), ei = l2.words.indexOf(edgeW);
  const head1 = l2.words.slice(0, ei + 1), tail = l2.words.slice(ei + 1);
  const more = last(tail.length ? tail : l2.words);
  const askW = tail.find((w) => /ask/i.test(w.w)) ?? tail[0] ?? more;
  const stackK = prog(t, l2.start - 0.3, l2.start + 0.02, ease.inOutCubic);
  if (stackK <= 0) return;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = col('ink', stackK); c.fillRect(0, 0, W, H); c.restore();
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = stackK; g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 0, W, H); g.restore();
  const groups: { words: Word[]; t: number; echo: boolean }[] = [{ words: head1, t: l2.start, echo: false }];
  const ai = tail.indexOf(askW);
  if (tail.length > 1) groups.push({ words: tail.slice(0, ai + 1), t: tail[0]!.start, echo: false });
  tail.slice(ai + 1).forEach((w) => groups.push({ words: [w], t: w.start, echo: false }));
  const b0 = s.au.beatAt(more.start);
  for (let e = 1; e < 12; e++) { const te = s.au.timeOfBeat(Math.floor(b0) + e); if (te > sh.end - 0.1) break; groups.push({ words: [more], t: te, echo: true }); }
  const Pp = 470; // pitch between blocks
  const steps = groups.map((gr, i) => i);
  const pos = snapVal(t, [sh.start, ...groups.map((gr) => gr.t - 0.08)], [-1.2, ...steps], 0.32, ease.outExpo);
  const sway = 0.03 * Math.sin(t * 1.3);
  cam(s, { x: W / 2 + 40 * Math.sin(t * 0.9), y: H / 2 - pos * Pp, z: 0.9, r: sway });
  const cur = Math.round(pos);
  for (let i = cur - 2; i <= cur + 3; i++) {
    const yc = H / 2 - i * Pp, x0 = W / 2 - 520, x1 = W / 2 + 520, y0 = yc - 175, y1 = yc + 175;
    const act = i === cur ? 1 : 0, A_ = 0.5 + 0.5 * act;
    const dx = 46, dy = -34;
    // back face + depth edges (line-drawing 3D)
    c.strokeStyle = col('graphite', 0.55); c.lineWidth = 1.5; c.strokeRect(x0 + dx, y0 + dy, x1 - x0, y1 - y0);
    for (const [px, py] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as const) rule(c, px, py, px + dx, py + dy, 1, col('graphite', 0.55), 1.5);
    c.fillStyle = col('ink2', 0.9); c.fillRect(x0, y0, x1 - x0, y1 - y0);
    c.strokeStyle = mix('graphite', 'signal', act * 0.8, 1); c.lineWidth = 2.5 + act; c.strokeRect(x0, y0, x1 - x0, y1 - y0);
    // sublayers: attention, add&norm, feed-forward, add&norm; residual bypass on the left; data path up the middle
    const box = (bx0: number, by0: number, bw: number, bh: number, label: string) => { c.strokeStyle = col('ash', 0.6 * A_); c.lineWidth = 1.5; c.strokeRect(bx0, by0, bw, bh); note(c, label, bx0 + 10, by0 + 22, 0.75 * A_, 15, 'ash'); };
    box(x0 + 140, y1 - 120, 360, 70, 'MULTI-HEAD ATTENTION');
    box(x0 + 140, y1 - 160, 360, 24, 'ADD & NORM');
    box(x0 + 560, y0 + 70, 360, 70, 'FEED FORWARD');
    box(x0 + 560, y0 + 40, 360, 24, 'ADD & NORM');
    rule(c, x0 + 70, y1 - 10, x0 + 70, y0 + 10, 1, col('graphite', 0.8), 2); note(c, '+', x0 + 64, y0 + 60, 0.8 * A_, 22, 'ash');
    note(c, `BLOCK ${String(i + 1).padStart(2, '0')} · d_model 4096`, x1 - 14, y1 - 14, 0.6 * A_, 14, 'ash', 'right');
    // data path into the block above (signal pulse rides it on the beat)
    rule(c, W / 2, y0, W / 2, y0 - (Pp - 350), 1, col('graphite', 0.9), 3);
    const ph = (s.au.beatAt(t) % 1);
    g.fillStyle = col('signal', 0.7); g.beginPath(); g.arc(W / 2, lerp(y1, y0 - (Pp - 350), ph), 8, 0, TAU); g.fill();
    // the word group carried by this block
    const gr = groups[i];
    if (gr && t > gr.t - 0.08) {
      const isMore = gr.words.length === 1 && gr.words[0] === more;
      const fam = A(125, 900), size = isMore ? 210 : 150;
      const fr = fitRow(gr.words.map(txt), fam, 880, size);
      gr.words.forEach((w, j) => word(s, gr.echo ? null : w, txt(w), fam, fr.size, W / 2 + fr.xs[j]!, yc, gr.echo
        ? { color: mix('bone', 'signal', pulse(t, gr.t, 0.35), i === cur ? 1 : 0.55), sc: lerp(1.35, 1, prog(t, gr.t - 0.06, gr.t + 0.2, ease.outExpo)) }
        : { sc: slam(w, t, 1.5), hot: 'signal', glow: 1.4 }));
      if (gr.echo && i === cur) { setFont(g, fam, fr.size); g.textAlign = 'center'; g.fillStyle = col('signal', 0.3 * pulse(t, gr.t, 0.4)); g.fillText('MORE', W / 2, yc + (CAP * fr.size) / 2); }
    }
  }
  // the edge of the known map across block 01
  const ek = prog(t, edgeW.start - 0.05, edgeW.start + 0.4, ease.outExpo), ey = H / 2 + 120;
  rule(c, W / 2 - 1400 * ek, ey, W / 2 + 1400 * ek, ey, 1, col('signal', 1), 4);
  rule(g, W / 2 - 1400 * ek, ey, W / 2 + 1400 * ek, ey, 1, col('signal', 0.6), 14);
  note(c, '← THE KNOWN', W / 2 - 560, ey + 34, ek, 20, 'ash', 'right');
  note(c, 'THE FRONTIER →', W / 2 + 560, ey - 16, ek, 20, 'signal');
  screen(s);
  note(c, up(l2.text), 120, H - 90, stackK * 0.9, 24, 'ash');
  note(c, 'FIG. 11 — ARCHITECTURE (RECURSIVE), UPWARD', W - 120, 90, stackK * 0.8, 18, 'ash', 'right');

}

// ================================================================== CHORUS: hook (FRONTIER FRIDAY over the growing city)
function hook(s: S) {
  const { t, sh, c, g } = s;
  const l = sh.lines[0]!;
  const n = Math.min(4, sh.o.n ?? 1), v = sh.o.v ?? 0;
  const [fw, fr, ...rest] = l.words as [Word, Word, ...Word[]];
  s.bg.glow = 0.55 + 0.1 * n; s.bg.gy = 0.82; s.bg.grid = 0.5; s.bg.stars = 0.6;
  // world: the city along the bottom (the camera rides along it)
  const k = v === 0
    ? { x: W / 2 + 120 * prog(t, sh.start, sh.end), y: H / 2, z: 1, r: 0 }
    : snapCam(t, [sh.start, fw.start - 0.05], [{ x: W / 2 + 800, y: H / 2 + 200, z: 1.35, r: -0.1 }, { x: W / 2 + 300, y: H / 2, z: 1, r: 0 }], 0.8, ease.inOutCubic);
  cam(s, k);
  drawCity(s, n, H - 30, { lit: 0.3 + 0.12 * n, rise: prog(t, sh.start, sh.start + 1.4, ease.outCubic), xs: [k.x - 1700, k.x + 1700] });
  screen(s);
  band(c, H / 2 - 80, 700, 0.6);
  const fa = A(125, 900), fb = A(125, 300);
  const sa = sizeFor('FRONTIER', fa, 1560), sb = sizeFor('FRIDAY', fb, 1100);
  const yA = H / 2 - 190, yB = yA + sa * CAP / 2 + 30 + sb * CAP / 2;
  const slideA = v === 1 ? lerp(-900, 0, prog(t, fw.start - 0.1, fw.start + 0.35, ease.outExpo)) : 0;
  const slideB = v === 1 ? lerp(900, 0, prog(t, fr.start - 0.1, fr.start + 0.35, ease.outExpo)) : 0;
  if (v === 0) {
    drawLetters(c, 'FRONTIER', fa, sa, W / 2 - measure('FRONTIER', fa, sa) / 2, yA + (CAP * sa) / 2, fw.start - 0.06, t, (_i, kk) => mix('bone', 'signal', heat(fw, t), kk), { stagger: 0.025, dy: -120, dur: 0.3 });
  } else word(s, fw, 'FRONTIER', fa, sa, W / 2 + slideA, yA, { sc: slam(fw, t, 1.2) });
  word(s, fr, 'FRIDAY', fb, sb, W / 2 + slideB, yB, { sc: v === 0 ? slam(fr, t, 1.6) : 1, base: 'signal', hot: 'ember' });
  if (t > fr.start) { setFont(g, fb, sb); g.textAlign = 'center'; g.fillStyle = col('signal', 0.25 * appear(fr, t)); g.fillText('FRIDAY', W / 2 + slideB, yB + (CAP * sb) / 2); }
  if (rest.length) {
    const yC = yB + sb * CAP / 2 + 110;
    row(s, rest, A(62, 900), 760, 120, W / 2, yC, { from: 1.4 });
    const gk = prog(t, last(rest).start, last(rest).start + 0.4, ease.outExpo);
    rule(c, W / 2 - 520, yC + 80, W / 2 - 520 + 1040 * gk, yC + 80, 1, col('signal', 0.9), 4);
  }
  note(c, `CHORUS 0${Math.min(n, 3)} · CITY STAGE ${n}`, W - 120, H - 60, 0.6 * prog(t, sh.start, sh.start + 0.4), 18, 'ash', 'right');
}

// ================================================================== EARL: with Earl Co (plain letterforms) · watch ideas GROW
function earl(s: S) {
  const { t, sh, c, g } = s;
  const l = sh.lines[0]!;
  const ws = l.words;
  const wi = ws.findIndex((w) => /^watch$/i.test(clean(w.w)));
  const name = ws.slice(0, wi > 0 ? wi : 3), rest = ws.slice(name.length);
  const grow = last(rest.length ? rest : ws);
  const mid = rest.slice(0, -1);
  s.bg.glow = 0.55; s.bg.gy = 0.75; s.bg.stars = 0.5;
  const k = snapCam(t, [sh.start, (rest[0] ?? grow).start - 0.1], [{ x: W / 2, y: H / 2 - 30, z: 1, r: 0.01 }, { x: W / 2, y: H / 2 + 30, z: 1, r: -0.006 }], 0.6, ease.inOutCubic);
  cam(s, k);
  // "with" small, EARL CO big — ordinary letterforms, no glyph tricks
  const withW = name.filter((w) => /^with$/i.test(clean(w.w))), nm = name.filter((w) => !/^with$/i.test(clean(w.w)));
  withW.forEach((w) => word(s, w, 'WITH', A(100, 500), 70, W / 2, 150, { sc: slam(w, t, 1.4) }));
  row(s, nm, A(100, 900), 1100, 250, W / 2, 330);
  row(s, mid, A(125, 500), 1000, 120, W / 2, 560);
  // GROW grows up out of its baseline, with vines
  if (grow && t > grow.start - 0.06) {
    const fam = A(125, 900), sz = 240, base = 900;
    const sy = clamp(lerp(0.15, 1, springStep(t - grow.start, 2.2, 0.5)), 0.1, 1.12);
    const h = heat(grow, t);
    const draw = (ctx: CanvasRenderingContext2D, f: string) => { ctx.save(); ctx.translate(W / 2, base); ctx.scale(1, sy); setFont(ctx, fam, sz); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = f; ctx.fillText('GROW', 0, 0); ctx.restore(); };
    draw(c, mix('bone', 'signal', Math.max(h, 0.35)));
    draw(g, col('signal', 0.3 * Math.max(h, 0.4)));
    const wv = prog(t, grow.start, grow.start + 1.6, ease.outCubic);
    const gwid = measure('GROW', fam, sz);
    [-1, 1].forEach((side) => {
      c.strokeStyle = col('acid', 0.9); c.lineWidth = 5; c.beginPath();
      const x0 = W / 2 + side * (gwid / 2 + 30);
      for (let i = 0; i <= 40 * wv; i++) {
        const u = i / 40, x = x0 + side * Math.sin(u * 7) * 40 * u, y = base - u * 520;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        if (i % 8 === 4) { c.save(); c.fillStyle = col('acid', 0.9); c.translate(x, y); c.rotate(side * 0.8); c.beginPath(); c.ellipse(side * 18, 0, 20, 9, 0, 0, TAU); c.fill(); c.restore(); }
      }
      c.stroke();
    });
  }
}

// ================================================================== MORPH: bricks to blocks, and code to keys
function morph(s: S) {
  // one object, four states, each on its word: BRICKS (a bond of copper bricks) → BLOCKS (the bricks slide into the cells
  // of a cube face; the cube extrudes, hash on its face) → CODE (the face unfolds into a code panel that types itself) →
  // KEYS (every code character flies onto the outline of a key, which then solidifies and turns)
  const { t, sh, c, g } = s;
  const l = sh.lines[0]!, ws = l.words;
  const bW = findW(l, /brick/i), kW = findW(l, /block/i), cW = findW(l, /code/i), yW = findW(l, /key/i);
  s.bg.grid = 0.45; s.bg.glow = 0.35;
  const k1 = prog(t, kW.start - 0.1, kW.start + 0.18, ease.inOutCubic), k2 = prog(t, cW.start - 0.1, cW.start + 0.18, ease.inOutCubic), k3 = prog(t, yW.start - 0.14, yW.start + 0.18, ease.inOutCubic);
  cam(s, { x: W / 2, y: H / 2, z: 1 + 0.04 * prog(t, sh.start, sh.end), r: snapVal(t, [sh.start, kW.start, cW.start, yW.start], [-0.01, 0.01, -0.008, 0.012], 0.4) });
  // two graphics that both stay: LEFT bricks → blocks, RIGHT code → keys
  const CX = W / 2 - 440, CY = 560, KX = W / 2 + 430;
  c.save(); c.translate(CX, CY); c.scale(0.85, 0.85);
  // BRICKS → cube-face cells
  {
    for (let i = 0; i < 6; i++) {
      const r = Math.floor(i / 2), q = i % 2;
      const d = prog(t, bW.start - 0.12 + i * 0.03, bW.start + 0.1 + i * 0.03, ease.outCubic);
      if (d <= 0) continue;
      const bx = -230 + q * 230 + (r % 2 ? -60 : 0), by = -130 + r * 90 - (1 - d) * 500;
      const cx2 = -120 + q * 120, cy2 = -120 + r * 80;
      const x = lerp(bx, cx2, k1), y = lerp(by, cy2, k1), w = lerp(220, 120, k1), h = lerp(80, 80, k1);
      c.fillStyle = mix('acid', 'ink2', 0.75 * k1); c.fillRect(x, y, w - 4, h - 4);
      c.strokeStyle = col(k1 > 0.5 ? 'signal' : 'ink', 0.9); c.lineWidth = 2; c.strokeRect(x, y, w - 4, h - 4);
      c.globalAlpha = 1;
    }
    if (k1 > 0) {
      // extruded cube faces + the block hash
      const ex = 70 * k1, ey = -50 * k1;
      c.fillStyle = col('signal', 0.18); c.strokeStyle = col('signal', 0.8); c.lineWidth = 2;
      c.beginPath(); c.moveTo(-120, -120); c.lineTo(-120 + ex, -120 + ey); c.lineTo(120 + ex, -120 + ey); c.lineTo(120, -120); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(120, -120); c.lineTo(120 + ex, -120 + ey); c.lineTo(120 + ex, 120 + ey); c.lineTo(120, 120); c.closePath(); c.fill(); c.stroke();
      note(c, '#' + digest('bricks to blocks').slice(0, 8), 0, 150, k1, 20, 'signal', 'center');
    }
  }
  c.restore();
  c.save(); c.translate(KX, CY); c.scale(0.72, 0.72);
  // CODE: a panel unfolds; lines type themselves
  const CODE = ['block = hash(bricks)', 'chain.push(block)', 'sig = sign(block, key)', 'verify(sig) → true', 'key = derive(code)'];
  const fs = 30, cwid = fs * 0.6;
  const px = lerp(0, -360, k2), py = lerp(0, -200, k2), pw = lerp(0, 720, k2), ph = lerp(0, 400, k2);
  const typed = prog(t, cW.start - 0.05, yW.start - 0.15);
  const chars: { ch: string; x: number; y: number }[] = [];
  CODE.forEach((ln, li) => { for (let j = 0; j < ln.length; j++) if (ln[j] !== ' ') chars.push({ ch: ln[j]!, x: px + 40 + j * cwid, y: py + 70 + li * 66 }); });
  if (k2 > 0 && k3 < 1) {
    c.globalAlpha = 1 - k3;
    c.fillStyle = col('ink2', 0.95); c.fillRect(px, py, pw, ph); c.strokeStyle = col('bone', 0.85); c.lineWidth = 3; c.strokeRect(px, py, pw, ph);
    note(c, 'block.ts', px + 16, py + 28, k2 * 0.7, 16, 'ash');
    c.globalAlpha = 1;
  }
  // KEY outline (bow ring + shaft + teeth), sampled into as many points as there are characters
  const keyPts: [number, number][] = [];
  const N = chars.length, nb = Math.floor(N * 0.45);
  for (let i = 0; i < nb; i++) { const a = (i / nb) * TAU; keyPts.push([-210 + Math.cos(a) * 110, Math.sin(a) * 110]); }
  const rest = N - nb;
  for (let i = 0; i < rest; i++) {
    const u = i / Math.max(1, rest - 1);
    if (u < 0.6) { const v = u / 0.6; keyPts.push([-100 + v * 420, i % 2 ? -22 : 22]); }
    else { const v = (u - 0.6) / 0.4; const tx = 180 + v * 140; keyPts.push([tx, 22 + 40 * Math.abs(Math.sin(v * Math.PI * 3))]); }
  }
  const turn = 0.25 * Math.sin(prog(t, yW.start + 0.18, yW.start + 0.6, ease.inOutCubic) * Math.PI / 2);
  setFont(c, F.mono(700), fs); c.textAlign = 'center'; c.textBaseline = 'middle';
  if (k2 > 0) chars.forEach((q, j) => {
    const vis = j / N < typed * 1.02 || k3 > 0;
    if (!vis) return;
    const kp = keyPts[j]!, kk = prog(k3, (j / N) * 0.35, 0.65 + (j / N) * 0.35, ease.inOutCubic);
    const kx = kp[0] * Math.cos(turn) - kp[1] * Math.sin(turn), ky = kp[0] * Math.sin(turn) + kp[1] * Math.cos(turn);
    const x = lerp(q.x, kx, kk), y = lerp(q.y, ky, kk) - Math.sin(kk * Math.PI) * 60;
    c.fillStyle = kk > 0 ? mix('bone', 'acid', kk) : col('bone', 0.95 * (1 - 0.0 * k3));
    c.fillText(q.ch, x, y);
  });
  // the key solidifies
  const solid = prog(k3, 0.8, 1);
  if (solid > 0) {
    c.save(); c.rotate(turn);
    c.strokeStyle = col('acid', solid); c.lineWidth = 10; c.beginPath(); c.arc(-210, 0, 110, 0, TAU); c.stroke();
    c.beginPath(); c.arc(-210, 0, 40, 0, TAU); c.stroke();
    c.fillStyle = col('acid', solid); c.fillRect(-100, -16, 420, 32);
    for (const [dx, h] of [[200, 60], [240, 44], [280, 70]] as const) c.fillRect(dx, 16, 26, h);
    c.restore();
    g.save(); g.translate(KX, CY); g.scale(0.72, 0.72); g.rotate(turn); g.strokeStyle = col('acid', 0.35 * solid); g.lineWidth = 26; g.beginPath(); g.arc(-210, 0, 110, 0, TAU); g.stroke(); g.restore();
  }
  c.restore();
  // type: BRICKS to BLOCKS (top, flush left) · and CODE to KEYS (bottom, flush right)
  screen(s);
  const andI = ws.findIndex((w) => /^and$/i.test(clean(w.w)));
  const r1 = andI > 0 ? ws.slice(0, andI) : ws.slice(0, 3), r2 = andI > 0 ? ws.slice(andI) : ws.slice(3);
  band(c, 160, 240, 0.6); band(c, 940, 220, 0.6);
  row(s, r1, A(125, 900), 1200, 170, W / 2, 160, { align: 'l' });
  row(s, r2, A(125, 900), 1200, 170, W / 2, 945, { align: 'r', hot: 'signal' });
}

// ================================================================== TOMORROW: built tile by tile, piece by piece
function tomorrow(s: S) {
  const { t, sh, c, g } = s;
  const l = sh.lines[0]!;
  const ws = l.words;
  const tw = findW(l, /tomorrow/i);
  const ti = ws.indexOf(tw);
  const pre = ws.slice(0, ti), post = ws.slice(ti + 1);
  s.bg.grid = 0.8; s.bg.glow = 0.3;
  cam(s, { x: W / 2, y: H / 2, z: 1 + 0.03 * prog(t, sh.start, sh.end), r: -0.006 });
  row(s, pre, A(100, 900), 700, 160, W / 2, 190);
  const fam = A(125, 900), sz = sizeFor('TOMORROW', fam, 1500);
  const Lt = layout('TOMORROW', fam, sz);
  const x0 = W / 2 - Lt.width / 2, yb = H / 2 + (CAP * sz) / 2 + 10;
  const tEnd = Math.max(tw.start + 0.8, (last(post.length ? post : ws).start) + 0.15);
  setFont(c, fam, sz); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  Lt.glyphs.forEach((gl) => {
    const arr = lerp(tw.start - 0.05, tEnd, gl.i / (Lt.glyphs.length - 1));
    const k = prog(t, arr - 0.3, arr, ease.outCubic);
    const tx = x0 + gl.x, ty = yb;
    // ghost slot
    c.strokeStyle = col('graphite', 0.9); c.lineWidth = 2; c.setLineDash([8, 8]);
    c.strokeRect(tx - 4, ty - CAP * sz - 10, gl.w + 8, CAP * sz + 20); c.setLineDash([]);
    if (k <= 0) return;
    const sx = tx + (hash(gl.i, 2) - 0.5) * 1400 * (1 - k), sy = ty - (500 + hash(gl.i, 5) * 300) * (1 - k);
    c.save(); c.translate(sx + gl.w / 2, sy); c.rotate((hash(gl.i, 9) - 0.5) * 1.6 * (1 - k));
    const hot = pulse(t, arr, 0.25);
    c.fillStyle = mix(s.paper ? 'ink' : 'bone', s.paper ? 'blood' : 'signal', hot); setFont(c, fam, sz); c.fillText(gl.ch, -gl.w / 2, 0);
    c.strokeStyle = col('acid', 0.9 * (1 - k * 0.7)); c.lineWidth = 3; c.strokeRect(-gl.w / 2 - 4, -CAP * sz - 10, gl.w + 8, CAP * sz + 20);
    if (hot > 0.05) { g.fillStyle = col('signal', 0.35 * hot); g.fillRect(-gl.w / 2 - 4, -CAP * sz - 10, gl.w + 8, CAP * sz + 20); g.save(); g.restore(); }
    c.restore();
    if (hot > 0.05) { g.fillStyle = col('signal', 0.3 * hot); g.fillRect(tx - 4, ty - CAP * sz - 10, gl.w + 8, CAP * sz + 20); }
  });
  // PIECE BY PIECE with a build bar
  row(s, post, A(100, 700), 900, 110, W / 2, 860);
  const bk = prog(t, tw.start, tEnd, ease.linear);
  for (let i = 0; i < 8; i++) {
    const on = bk * 8 > i + 0.5;
    c.fillStyle = col(on ? (s.paper ? 'ink' : 'signal') : 'graphite', on ? 0.95 : 0.6); c.fillRect(W / 2 - 400 + i * 102, 960, 90, 16);
  }
  note(c, `BUILD ${Math.round(bk * 100)}%`, W / 2 + 430, 976, 0.8, 18, 'ash');
}

// ================================================================== CITY: AI · TECH on the rooftops, the city glows (pan)
function city(s: S) {
  const { t, sh, c, g } = s;
  const l = sh.lines[0]!;
  const n = Math.min(4, sh.o.n ?? 1);
  const ws = l.words;
  const theI = ws.findIndex((w) => /^the$/i.test(clean(w.w)));
  const signs = ws.slice(0, theI > 0 ? theI : 2), tail = ws.slice(signs.length);
  const glow = last(ws);
  s.bg.glow = 0.5 + 0.4 * appear(glow, t); s.bg.gy = 0.85; s.bg.stars = 0.8;
  const gy = 1000;
  // both rooftop signs are in frame from the cut; the camera only pushes and drifts a little (no long pan)
  const xs = [W / 2, ...signs.map((_, i) => W / 2 + (i - (signs.length - 1) / 2) * 640), W / 2];
  const pu = prog(t, sh.start, sh.end, ease.inOutCubic);
  const k = { x: W / 2 - 80 + 160 * pu, y: H / 2 + 30 - 50 * pu, z: lerp(0.98, 1.06, pu) * (1 - 0.06 * appear(glow, t)), r: lerp(-0.012, 0.012, pu) };
  cam(s, k);
  const lit = lerp(0.2, 0.9, prog(t, sh.start, glow.start + 0.3)) + 0.4 * appear(glow, t);
  drawCity(s, Math.max(n, 2), gy, { lit, xs: [k.x - 2600, k.x + 2600] });
  // rooftop neon signs
  signs.forEach((w, i) => {
    if (t < w.start - 0.1) return;
    const sx = xs[i + 1]!, sy = 520;
    const fam = A(125, 900), sz = 170;
    const m = measure(txt(w), fam, sz);
    c.strokeStyle = col('graphite', 1); c.lineWidth = 6;
    c.beginPath(); c.moveTo(sx - m / 3, sy + 90); c.lineTo(sx - m / 3, gy - 380); c.moveTo(sx + m / 3, sy + 90); c.lineTo(sx + m / 3, gy - 380); c.stroke();
    c.strokeStyle = col('signal', 0.9 * appear(w, t)); c.lineWidth = 4; c.strokeRect(sx - m / 2 - 40, sy - 110, m + 80, 210);
    word(s, w, txt(w), fam, sz, sx, sy, { sc: slam(w, t, 1.6), hot: 'signal', glow: 1.5 });
    g.strokeStyle = col('signal', 0.4 * appear(w, t)); g.lineWidth = 12; g.strokeRect(sx - m / 2 - 40, sy - 110, m + 80, 210);
  });
  // THE CITIES GLOW in screen space once the camera pulls back
  screen(s);
  band(c, 160, 280, 0.6 * appear(tail[0] ?? glow, t));
  row(s, tail, A(100, 900), 1500, 170, W / 2, 160, { from: 1.4 });
}

// ================================================================== FLOW: crypto moving, the letters ride the current
function flow(s: S) {
  const { t, sh, c, g } = s;
  const l = sh.lines[0]!;
  const ws = l.words;
  const letI = ws.findIndex((w) => /^let$/i.test(clean(w.w)));
  const head2 = letI > 0 ? ws.slice(0, letI) : ws.slice(0, 2), tail = ws.slice(head2.length);
  s.bg.glow = 0.35; s.bg.grid = 0.3;
  const rr = snapVal(t, [sh.start, ...ws.map((w) => w.start)], [0, ...ws.map((_, i) => (i % 2 ? 0.018 : -0.018))], 0.4);
  // continuity with CITY: its final camera was x W/2+80, y H/2−20, z 1.06·0.94, r 0.012, skyline xs ±2600 around x
  const hand0 = prog(t, sh.start, sh.start + 1.1, ease.inOutCubic);
  const CE = { x: W / 2 + 80, y: H / 2 - 20, z: 1.06 * 0.94, r: 0.012 };
  { const kk = { x: lerp(CE.x, W / 2, hand0), y: lerp(CE.y, H / 2, hand0), z: lerp(CE.z, 1, hand0), r: lerp(CE.r, rr, hand0) }; applyCam(c, kk); applyCam(g, kk); }
  const yC = 720;
  // hand-off from THE CITIES GLOW: the lit skyline is still standing at the cut; its windows lift off as tokens and
  // stream onto the strands (which draw on left to right) while the city dissolves
  const hand = prog(t, sh.start, sh.start + 1.1, ease.inOutCubic);
  if (hand < 1) drawCity(s, Math.max(sh.o.n ?? 1, 2), 1000, { lit: 1.3, a: 1 - hand, xs: [CE.x - 2600, CE.x + 2600] });
  const curve = (x: number, k: number) => yC + Math.sin(x * 0.0042 + t * 1.6 + k * 0.9) * (60 + 18 * k) + k * 26 - 52;
  for (let k = 0; k < 5; k++) {
    c.strokeStyle = col(k === 2 ? 'signal' : 'graphite', k === 2 ? 0.8 : 0.7); c.lineWidth = k === 2 ? 4 : 2;
    const xMax = lerp(-40, W + 40, prog(t, sh.start + k * 0.05, sh.start + 0.7 + k * 0.05, ease.outCubic));
    c.beginPath(); for (let x = -40; x <= xMax; x += 20) { const y = curve(x, k); if (x < -30) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
    if (k === 2) { g.strokeStyle = col('signal', 0.3); g.lineWidth = 12; g.beginPath(); for (let x = -40; x <= W + 40; x += 20) { const y = curve(x, k); if (x < -30) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
  }
  // tokens riding the strands
  for (let i = 0; i < 14; i++) {
    const k = i % 5, sp = 220 + hash(i, 1) * 200;
    const x = ((hash(i, 2) * (W + 200) + t * sp) % (W + 200)) - 100;
    const lift = prog(t, sh.start + i * 0.04, sh.start + 0.75 + i * 0.04, ease.inOutCubic);
    const wx = 120 + hash(i, 11) * (W - 240), wy = 760 + hash(i, 12) * 200; // a lit window in the skyline
    const y = lerp(wy, curve(x, k), lift);
    const r = 20 + hash(i, 3) * 10;
    c.strokeStyle = col('acid', 0.9); c.lineWidth = 3; c.beginPath();
    const xx = lerp(wx, x, lift);
    for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU + t; const px = xx + Math.cos(a) * r * lift, py = y + Math.sin(a) * r * lift; if (j) c.lineTo(px, py); else c.moveTo(px, py); }
    c.closePath(); c.fillStyle = col('ink', 1); c.fill(); c.stroke();
    note(c, '◆', xx, y + 6, 0.9, 16, 'acid', 'center');
    if (lift < 1) { g.fillStyle = col('acid', 0.5 * (1 - lift)); g.fillRect(xx - 12, y - 10, 24, 20); }
  }
  // CRYPTO big; MOVING with motion streaks
  const famA = A(125, 900);
  const fr = fitRow(head2.map(txt), famA, 1500, 230);
  head2.forEach((w, i) => {
    const moving = /moving/i.test(w.w);
    const x = W / 2 + fr.xs[i]!;
    if (moving && t > w.start) for (let j = 3; j >= 1; j--) word(s, null, txt(w), famA, fr.size, x - j * 46 * (1 - prog(t, w.start, w.start + 0.6)), 300, { color: col('signal', 0.12 * (4 - j)) });
    word(s, w, txt(w), famA, fr.size, x, 300, { sc: slam(w, t, 1.6) });
  });
  // LET IT FLOW: glyphs placed along the main strand
  const fam = A(100, 900), sz = 150;
  const text = tail.map(txt).join(' ');
  const Lt = layout(text, fam, sz);
  const xs0 = W / 2 - Lt.width / 2;
  let ci = 0;
  const starts: number[] = [];
  tail.forEach((w) => { for (let i = 0; i < txt(w).length; i++) starts.push(w.start); starts.push(w.start); });
  setFont(c, fam, sz); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  for (const gl of Lt.glyphs) {
    const st = starts[ci++] ?? last(ws).start;
    const a = prog(t, st - 0.06, st + 0.2, ease.outExpo);
    if (a <= 0 || gl.ch === ' ') continue;
    const x = xs0 + gl.x + gl.w / 2;
    const y = curve(x, 2) - 30;
    const ang = Math.atan2(curve(x + 4, 2) - curve(x - 4, 2), 8);
    const h = pulse(t, st, 0.3);
    c.save(); c.translate(x, y + (1 - a) * 80); c.rotate(ang); setFont(c, fam, sz); c.fillStyle = mix('bone', 'signal', h, a); c.fillText(gl.ch, 0, 0); c.restore();
    if (h > 0.05) { g.save(); g.translate(x, y); g.rotate(ang); setFont(g, fam, sz); g.textAlign = 'center'; g.fillStyle = col('signal', 0.4 * h); g.fillText(gl.ch, 0, 0); g.restore(); }
  }
}

// ================================================================== FUTURE: a road to the horizon, FUTURE widens (holds through gaps)
function future(s: S) {
  const { t, sh, c, g } = s;
  const l = sh.lines[0]!;
  const n = Math.min(4, sh.o.n ?? 1);
  const ws = l.words;
  const fw = findW(l, /future/i);
  const fi = ws.indexOf(fw);
  const pre = ws.slice(0, fi), post = ws.slice(fi + 1);
  const seeW = ws[0]!, earlW = ws.find((w) => /earl/i.test(w.w)) ?? last(ws);
  const hold = prog(t, last(ws).end + 0.6, sh.end, ease.linear);
  s.bg.glow = 0.6 + 0.2 * (n === 4 ? 1 : 0); s.bg.gx = 0.5; s.bg.gy = 0.75; s.bg.stars = 0.8; s.bg.grid = 0;
  const gy = 880;
  const dev = prog(t, fw.start - 0.1, fw.start + 1.4, ease.inOutCubic) + 0.0;
  cam(s, { x: W / 2 + 60 * hold, y: H / 2 + 40 - 40 * hold, z: 1 + 0.12 * hold, r: 0 });
  // the city develops on FUTURE (stage n, rising), lit as the line holds
  drawCity(s, n, gy, { lit: 0.35 + 0.5 * dev + 0.2 * hold, rise: lerp(0.35, 1, dev), xs: [-300, W + 300], scale: 0.95 });
  // civic frontage in front: a long low building whose sign reads WITH EARL CO
  const fx0 = W / 2 - 520, fx1 = W / 2 + 520, fy = gy - 230;
  c.fillStyle = mix('ink2', 'graphite', 0.4); c.fillRect(fx0, fy, fx1 - fx0, gy - fy);
  c.strokeStyle = col('bone', 0.6); c.lineWidth = 3; c.strokeRect(fx0, fy, fx1 - fx0, gy - fy);
  for (let i = 0; i < 9; i++) { const wx = fx0 + 40 + i * 112; c.fillStyle = col('acid', 0.25 + 0.6 * dev * (0.5 + 0.5 * Math.sin(t * 1.3 + i))); c.fillRect(wx, fy + 120, 70, 80); }
  rule(c, fx0 - 30, fy, fx1 + 30, fy, 1, col('bone', 0.8), 8); // cornice
  // foreground shutters: horizontal slats roll up on SEE
  const sk = prog(t, seeW.start - 0.08, seeW.start + 0.7, ease.inOutCubic);
  const slats = 14, top = -40, bot = H + 40;
  for (let i = 0; i < slats; i++) {
    const h = (bot - top) / slats, y = lerp(top + i * h, top - (slats - i) * h * 0.25 - 200, sk);
    if (y > H + 20 || y + h < -20) continue;
    c.fillStyle = mix('ink2', 'graphite', 0.3 + 0.1 * (i % 2)); c.fillRect(-200, y, W + 400, h - 3);
    rule(c, -200, y + h - 3, W + 200, y + h - 3, 1, col('graphite', 1), 3);
  }
  // type (screen space)
  screen(s);
  band(c, 330, 560, 0.5);
  row(s, pre, A(100, 500), 700, 90, W / 2, 140);
  if (t > fw.start - 0.06) {
    const kk = prog(t, fw.start - 0.05, fw.start + 0.8, ease.outCubic);
    word(s, fw, 'FUTURE', widthFam(kk, 900), sizeFor('FUTURE', A(125, 900), 1500), W / 2, 360, { sc: slam(fw, t, 1.3) });
  }
  // the sign on the frontage (ordinary letterforms), lit on EARL
  if (post.length && sh.o.signFlip && t > post[0]!.start - 0.1) {
    // OUTRO: the sign flips open on WITH (top hinge, slight overshoot) with its lights OFF (dark neon tubes); at sh.o.lightsAt
    // (on the beat) the tubes flicker on and stay lit
    const fl = clamp(springStep(t - post[0]!.start + 0.08, 2.4, 0.45), 0, 1.15);
    const tOn = s.au.timeOfBeat(Math.ceil(s.au.beatAt(sh.o.lightsAt ?? earlW.start) - 0.05)); // first beat at/after 2:47
    const on = t < tOn ? 0 : t < tOn + 0.3 ? (hash(Math.floor(t * 24), 7) < 0.5 + (t - tOn) * 1.6 ? 1 : 0.15) : 1;
    const sy = fy + 62, fam = A(100, 800), fr2 = fitRow(post.map(txt), fam, 820, 96);
    c.save(); c.translate(W / 2, sy - 56); c.scale(1, Math.max(0.02, fl)); c.translate(-W / 2, -(sy - 56));
    c.fillStyle = col('ink', 0.95); c.fillRect(W / 2 - 470, sy - 56, 940, 112);
    c.strokeStyle = col(on ? 'signal' : 'graphite', on ? 1 : 0.9); c.lineWidth = 3; c.strokeRect(W / 2 - 470, sy - 56, 940, 112);
    for (const hx of [W / 2 - 400, W / 2 + 400]) { c.fillStyle = col('graphite', 1); c.fillRect(hx - 6, sy - 70, 12, 18); }
    setFont(c, fam, fr2.size); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    post.forEach((w, i) => {
      const x = W / 2 + fr2.xs[i]!, y = sy + (CAP * fr2.size) / 2;
      if (on) { c.fillStyle = mix('bone', 'signal', 0.6, on); c.fillText(txt(w), x, y); }
      else { c.fillStyle = col('ink2', 1); c.fillText(txt(w), x, y); c.strokeStyle = col('graphite', 1); c.lineWidth = 2; c.strokeText(txt(w), x, y); }
    });
    c.restore();
    if (on) { setFont(g, fam, fr2.size); g.textAlign = 'center'; g.textBaseline = 'alphabetic'; post.forEach((w, i) => { g.fillStyle = col('signal', 0.55 * on); g.fillText(txt(w), W / 2 + fr2.xs[i]!, sy + (CAP * fr2.size) / 2); }); g.fillStyle = col('signal', 0.18 * on); g.fillRect(W / 2 - 480, sy - 66, 960, 132); }
  } else if (post.length && t > post[0]!.start - 0.08) {
    const lk = prog(t, earlW.start - 0.05, earlW.start + 0.3, ease.outExpo);
    const sy = fy + 62, fam = A(100, 800);
    const fr2 = fitRow(post.map(txt), fam, 820, 96);
    c.fillStyle = col('ink', 0.9); c.fillRect(W / 2 - 470, sy - 56, 940, 112);
    c.strokeStyle = col('signal', 0.6 + 0.4 * lk); c.lineWidth = 3; c.strokeRect(W / 2 - 470, sy - 56, 940, 112);
    post.forEach((w, i) => word(s, w, txt(w), fam, fr2.size, W / 2 + fr2.xs[i]!, sy, { sc: t < w.start - 0.06 ? 1 : slam(w, t, 1.3), hot: 'signal', ghost: 0.35 }));
    g.fillStyle = col('signal', 0.15 * lk); g.fillRect(W / 2 - 480, sy - 66, 960, 132);
  }
  note(c, `${BRAND.titleA} ${BRAND.titleB}`, W / 2, 1010, prog(t, last(ws).end + 1.5, last(ws).end + 2.2) * (1 - prog(t, sh.end - 0.4, sh.end)), 22, 'ash', 'center');
}

// ================================================================== PLAN (paper): blueprint lines become a street; walls rise on the beat
function plan(s: S) {
  const { t, sh, c, au } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  const ink = (a: number) => col('blood', a);
  const k2 = l2 ? prog(t, l2.start - 0.2, l2.start + 0.6, ease.inOutCubic) : 0;
  cam(s, { x: W / 2 + 60 * k2, y: H / 2 - 40 * k2, z: 1 + 0.05 * k2, r: -0.035 * k2 });
  const w1 = l1.words;
  const at = (i: number) => w1[Math.min(i, w1.length - 1)]!.start;
  // lots, road, dimensions — drawn as the line is sung
  const roadY0 = 560, roadY1 = 760;
  rule(c, 160, roadY0, W - 160, roadY0, prog(t, at(0) - 0.1, at(1) + 0.3, ease.outCubic), ink(0.9), 4);
  rule(c, 160, roadY1, W - 160, roadY1, prog(t, at(1) - 0.1, at(2) + 0.3, ease.outCubic), ink(0.9), 4);
  const st = findW(l1, /street/i);
  const dk = prog(t, st.start - 0.1, st.start + 0.6, ease.outCubic);
  for (let x = 200; x < W - 200; x += 120) rule(c, x, (roadY0 + roadY1) / 2, x + 60, (roadY0 + roadY1) / 2, dk, col('acid', 0.9), 6);
  const lots = 5, lw = (W - 400) / lots;
  for (let i = 0; i < lots; i++) {
    const x = 200 + i * lw + 14, y = 320, w = lw - 28, h = 210;
    const lk = prog(t, at(1) + i * 0.08, at(1) + i * 0.08 + 0.4, ease.outCubic);
    c.strokeStyle = ink(0.8); c.lineWidth = 2.5; c.setLineDash([]);
    if (lk > 0) { c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + h - h * lk); c.lineTo(x + w * lk, y + h - h * lk); c.stroke(); rule(c, x, y + h, x + w, y + h, lk, ink(0.8), 2.5); rule(c, x + w, y + h, x + w, y + h - h * lk, lk, ink(0.8), 2.5); }
    note(c, `LOT ${i + 1}`, x + 8, y + 26, lk, 16, 'blood');
    // walls rise on line 2, one course of bricks per beat
    if (l2 && t > l2.start - 0.1) {
      const rk = prog(t, findW(l2, /raise/i).start + i * 0.06, findW(l2, /walls/i).start + 0.4 + i * 0.06, ease.outExpo);
      const wh = 200 * rk;
      c.fillStyle = col('bone', 0.9); c.fillRect(x, y + h - wh, w, wh);
      c.strokeStyle = ink(1); c.lineWidth = 3; c.strokeRect(x, y + h - wh, w, wh);
      // shading for depth
      c.fillStyle = ink(0.15); c.beginPath(); c.moveTo(x + w, y + h - wh); c.lineTo(x + w + 30, y + h - wh - 22); c.lineTo(x + w + 30, y + h - 22); c.lineTo(x + w, y + h); c.fill();
      const beatW = findW(l2, /beat/i);
      const b0 = au.beatAt(findW(l2, /lay/i).start - 0.05);
      const courses = clamp(Math.floor(au.beatAt(t) - b0) + 1, 0, 6) * (t > findW(l2, /lay/i).start - 0.05 ? 1 : 0);
      for (let r = 0; r < courses; r++) for (let b = 0; b < 4; b++) {
        const bx = x + 6 + b * (w - 12) / 4 + ((r % 2) * (w - 12)) / 8, by = y + h - 18 - r * 22;
        if (bx + (w - 12) / 4 - 6 > x + w) continue;
        c.fillStyle = col('acid', 0.85 + 0.15 * pulse(t, beatW.start, 0.3)); c.fillRect(bx, by, (w - 12) / 4 - 6, 16);
      }
    }
  }
  note(c, 'SHEET A-101 · STREET PLAN · SCALE 1:200', 200, 820, prog(t, at(0), at(0) + 0.5), 18, 'blood');
  rule(c, 200, 850, W - 200, 850, prog(t, at(2), at(2) + 0.5), ink(0.6), 1.5);
  note(c, `${Math.round((W - 400) / 8)}'-0"`, W / 2, 878, prog(t, at(2), at(2) + 0.5), 16, 'blood', 'center');
  // type: screen space
  screen(s);
  const a1 = until(t, l2);
  const ia = l1.words.indexOf(findW(l1, /become/i));
  const top = ia > 0 ? l1.words.slice(0, ia) : l1.words.slice(0, 2), bot = l1.words.slice(top.length);
  row(s, top, A(100, 900), 1300, 170, W / 2, 170, { alpha: a1 });
  row(s, bot, A(125, 900), 1000, 120, W / 2, (roadY0 + roadY1) / 2 - 4, { alpha: a1 });
  if (!l2) return;
  const andI = l2.words.findIndex((w) => /^and$/i.test(clean(w.w)));
  const q1 = andI > 0 ? l2.words.slice(0, andI) : l2.words.slice(0, 3), q2 = l2.words.slice(q1.length);
  row(s, q1, A(100, 900), 1300, 170, W / 2, 170);
  row(s, q2, A(125, 900), 1200, 150, W / 2, 940);
}

// ================================================================== UNLOCK: the key turns, the lift climbs a floor, people fill it
function unlock(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.glow = 0.4; s.bg.grid = 0.3; s.bg.stars = 0.4;
  const floorW = findW(l1, /floor/i), unW = findW(l1, /unlock/i), keyW = l1.words[0]!;
  const FH = 420, bx0 = 520, bx1 = 1400;
  const fy = (f: number) => 900 - f * FH; // floor line of storey f
  const camY = snapVal(t, [sh.start, floorW.start - 0.35], [fy(0) - FH / 2, fy(1) - FH / 2], 0.8, ease.inOutCubic);
  cam(s, { x: W / 2, y: camY, z: 1, r: 0 });
  // building section
  for (let f = -1; f < 3; f++) {
    c.strokeStyle = col('bone', 0.8); c.lineWidth = 6;
    c.beginPath(); c.moveTo(bx0, fy(f)); c.lineTo(bx1, fy(f)); c.stroke();
    c.lineWidth = 4; c.beginPath(); c.moveTo(bx0, fy(f)); c.lineTo(bx0, fy(f + 1)); c.moveTo(bx1, fy(f)); c.lineTo(bx1, fy(f + 1)); c.stroke();
    note(c, `FLOOR ${String(f + 1).padStart(2, '0')}`, bx0 + 20, fy(f) - 20, 0.7, 18, 'ash');
  }
  // lift shaft + car
  const sx = bx1 - 150;
  c.strokeStyle = col('graphite', 1); c.lineWidth = 3; c.strokeRect(sx, fy(2), 130, fy(-1) - fy(2));
  const carY = snapVal(t, [sh.start, floorW.start - 0.35], [fy(0), fy(1)], 0.8, ease.inOutCubic);
  c.fillStyle = col('ink2', 1); c.fillRect(sx + 10, carY - FH + 40, 110, FH - 50);
  c.strokeStyle = col('signal', 0.9); c.strokeRect(sx + 10, carY - FH + 40, 110, FH - 50);
  g.fillStyle = col('signal', 0.2); g.fillRect(sx + 10, carY - FH + 40, 110, FH - 50);
  const fl = t > floorW.start - 0.35 ? '02' : '01';
  note(c, `▲ ${fl}`, sx + 65, carY - FH + 90, 1, 26, 'signal', 'center');
  // the key in the lock on the ground floor
  const lockX = bx0 + 300, lockY = fy(0) - FH / 2;
  const ins = prog(t, keyW.start - 0.1, keyW.start + 0.4, ease.outExpo);
  const turn = prog(t, unW.start, unW.start + 0.35, ease.outBack);
  c.fillStyle = col('ink2', 1); c.strokeStyle = col('bone', 0.9); c.lineWidth = 4;
  c.beginPath(); c.arc(lockX, lockY, 70, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = col('ink', 1); c.beginPath(); c.arc(lockX, lockY - 12, 14, 0, TAU); c.fill(); c.fillRect(lockX - 6, lockY - 12, 12, 40);
  c.save(); c.translate(lockX - 160 * (1 - ins) - 70, lockY); c.scale(1, lerp(1, 0.25, Math.sin(turn * Math.PI / 2)));
  keyIcon(c, -60, 0, 340, ins, 0, 'acid'); c.restore();
  if (turn > 0.5) { g.fillStyle = col('signal', 0.5 * pulse(t, unW.start + 0.2, 0.4)); g.beginPath(); g.arc(lockX, lockY, 120, 0, TAU); g.fill(); }
  // people fill the upper floor on line 2
  if (l2) {
    const ppl = 7;
    for (let i = 0; i < ppl; i++) {
      const w = l2.words[Math.min(l2.words.length - 1, Math.floor((i / ppl) * l2.words.length))]!;
      const a = prog(t, w.start - 0.05, w.start + 0.25, ease.outExpo);
      if (a <= 0) continue;
      const px = bx0 + 90 + i * 100, py = fy(1);
      c.fillStyle = col(i % 3 === 0 ? 'acid' : 'bone', 0.9 * a);
      c.beginPath(); c.arc(px, py - 170 - (1 - a) * 40, 24, 0, TAU); c.fill();
      c.beginPath(); c.roundRect(px - 30, py - 140 - (1 - a) * 40, 60, 140, 24); c.fill();
    }
    const warm = prog(t, l2.start, l2.end, ease.outCubic);
    g.fillStyle = col('acid', 0.12 * warm); g.fillRect(bx0, fy(2), bx1 - bx0 - 160, FH);
  }
  // type: screen space
  screen(s);
  const a1 = until(t, l2);
  const ui = l1.words.indexOf(unW);
  band(c, 160, 280, 0.75); band(c, 920, 260, 0.75);
  row(s, l1.words.slice(0, ui + 1), A(125, 900), 1300, 200, W / 2, 160, { alpha: a1 });
  row(s, l1.words.slice(ui + 1), A(100, 900), 1200, 150, W / 2, 920, { alpha: a1 });
  if (!l2) return;
  const hi = l2.words.findIndex((w) => /house/i.test(w.w));
  const q1 = l2.words.slice(0, hi + 1), q2 = l2.words.slice(hi + 1);
  row(s, q1, A(100, 900), 1400, 170, W / 2, 160);
  const mr = last(q2);
  const fr = fitRow(q2.map(txt), A(125, 900), 1100, 190);
  q2.forEach((w, i) => word(s, w, txt(w), A(125, 900), fr.size, W / 2 + fr.xs[i]!, 920, { sc: slam(w, t, w === mr ? 2.2 : 1.6) }));
}

// ================================================================== SKYLINE (instrumental): fly down the avenue of the grown city
function skyline(s: S) {
  // instrumental (~1:37–1:55): 40 units morph, in a wave across the screen, on the bar: NODES (a graph: nodes + edges, signals
  // on the beat) -> BLOCKS (a blockchain, linked in a serpentine chain, mined one by one) -> BRICKS (a staggered wall) ->
  // the bricks restack into lit TOWERS (the city). Layouts are spaced grids, so nothing ever overlaps. One continuous camera move.
  const { t, sh, c, g, au } = s;
  const dur = sh.end - sh.start;
  s.bg.glow = 0.45; s.bg.gy = 0.6; s.bg.stars = 0.6; s.bg.grid = 0.2;
  const N = 40, COLS = 8, ROWS = 5;
  const bt = (x: number) => au.timeOfBeat(Math.round(au.beatAt(x) / 4) * 4);
  const T = [sh.start, bt(sh.start + dur * 0.25), bt(sh.start + dur * 0.5), bt(sh.start + dur * 0.75)];
  type Box = { x: number; y: number; w: number; h: number; r: number };
  const graphL = (i: number): Box => { const cI = i % COLS, rI = Math.floor(i / COLS); return { x: 300 + cI * 189 + (hash(i, 1) - 0.5) * 70, y: 250 + rI * 140 + (hash(i, 2) - 0.5) * 50, w: 34, h: 34, r: 17 }; };
  const chainL = (i: number): Box => { const rI = Math.floor(i / COLS), cI = rI % 2 ? COLS - 1 - (i % COLS) : i % COLS; return { x: 290 + cI * 192, y: 250 + rI * 140, w: 150, h: 92, r: 12 }; };
  const brickL = (i: number): Box => { const rI = Math.floor(i / COLS), cI = i % COLS; return { x: 260 + cI * 206 + (rI % 2 ? 103 : 0), y: 880 - (ROWS - rI) * 78, w: 198, h: 70, r: 4 }; };
  const counts = [3, 6, 4, 8, 5, 7, 3, 4];
  const towerOf: { k: number; j: number }[] = []; counts.forEach((n, k) => { for (let j = 0; j < n; j++) towerOf.push({ k, j }); });
  const cityL = (i: number): Box => { const { k, j } = towerOf[i]!; return { x: 300 + k * 189, y: 880 - (j + 0.5) * 66, w: 150, h: 64, r: 0 }; };
  const L = [graphL, chainL, brickL, cityL];
  // each unit morphs on its own slight delay (a wave from left to right) for a continuous, flowing change
  const ph = (i: number, k: number) => { const d = (i % COLS) * 0.09 + Math.floor(i / COLS) * 0.02 - 0.4; return prog(t, T[k]! + d, T[k]! + d + 0.45, ease.inOutCubic); }; // short per-unit moves in a left-to-right wave: brief crossings only
  // bricks are laid ONE BY ONE, bottom course first, left to right: each block lifts above its slot, turns into a brick and drops in
  const order = (i: number) => { const rI = Math.floor(i / COLS), cI = i % COLS; return (ROWS - 1 - rI) * COLS + cI; };
  const layDt = Math.max(0.08, (T[3]! - T[2]! - 1.0) / N);
  const lay = (i: number) => prog(t, T[2]! - 0.3 + order(i) * layDt, T[2]! - 0.3 + order(i) * layDt + 0.42, ease.linear);
  // hand-off from SEE THE FUTURE: the city's lit windows lift off and rise into the graph's nodes (staggered), city dissolves
  const riseOf = (i: number) => prog(t, sh.start + 0.15 + hash(i, 9) * 0.6, sh.start + 0.85 + hash(i, 9) * 0.6, ease.inOutCubic);
  const box = (i: number): Box & { m: number[] } => {
    const g0 = L[0]!(i), ri = riseOf(i);
    let bx: Box = { x: g0.x, y: lerp(990 - hash(i, 8) * 380, g0.y, ri), w: lerp(16, g0.w, ri), h: lerp(14, g0.h, ri), r: lerp(2, g0.r, ri) }; const m = [ph(i, 1), lay(i), ph(i, 3)];
    for (let k = 1; k < 4; k++) {
      const nb = L[k]!(i), u = m[k - 1]!;
      if (k === 2) { // lift (60%) then drop with a small bounce (40%)
        const up2 = ease.inOutCubic(clamp(u / 0.6)), drop = clamp((u - 0.6) / 0.4), hover = { x: nb.x, y: nb.y - 260 };
        const bounce = drop < 1 ? 1 - Math.abs(Math.cos(drop * Math.PI * 1.5)) * (1 - drop) : 1;
        const px = lerp(bx.x, hover.x, up2), py = u < 0.6 ? lerp(bx.y, hover.y, up2) : lerp(hover.y, nb.y, drop < 0.5 ? ease.inQuad(drop * 2) : 1) - (drop >= 0.5 ? (1 - bounce) * 30 : 0);
        const sh = ease.inOutCubic(clamp(u / 0.6));
        bx = { x: px, y: py, w: lerp(bx.w, nb.w, sh), h: lerp(bx.h, nb.h, sh), r: lerp(bx.r, nb.r, sh) };
      } else bx = { x: lerp(bx.x, nb.x, u), y: lerp(bx.y, nb.y, u), w: lerp(bx.w, nb.w, u), h: lerp(bx.h, nb.h, u), r: lerp(bx.r, nb.r, u) };
    }
    return { ...bx, m };
  };
  // ONE continuous camera move over the whole break: slow push in, gentle roll from left to right, a breath on each beat
  const u = prog(t, sh.start, sh.end, ease.inOutCubic);
  const breath = 0.012 * Math.sin(au.beatAt(t) * Math.PI);
  cam(s, { x: W / 2 + lerp(-60, 60, u), y: H / 2 + lerp(-20, 30, u), z: lerp(0.94, 1.06, u) + breath, r: lerp(-0.025, 0.025, u) });
  const cityK = prog(t, sh.start, sh.start + 1.5, ease.inOutCubic);
  if (cityK < 1) drawCity(s, 4, 1000, { lit: 0.9, a: 1 - cityK, xs: [-300, W + 300] });
  const B = Array.from({ length: N }, (_, i) => box(i));
  const gA = (i: number) => 1 - B[i]!.m[0]!, cA = (i: number) => B[i]!.m[0]! * (1 - B[i]!.m[1]!), kA = (i: number) => B[i]!.m[1]! * (1 - B[i]!.m[2]!), tA = (i: number) => B[i]!.m[2]!;
  // edges of the graph: right + down neighbours (+ a few diagonals); signals ride them on the beat
  const beatI = Math.floor(au.beatAt(t)), beatF = au.beatAt(t) % 1;
  for (let i = 0; i < N; i++) for (const j of [i + 1, i + COLS, i + COLS + 1]) {
    if (j >= N || (j === i + 1 && i % COLS === COLS - 1) || (j === i + COLS + 1 && (i % COLS === COLS - 1 || hash(i, 7) > 0.35))) continue;
    const a = Math.min(gA(i), gA(j)) * prog(Math.min(riseOf(i), riseOf(j)), 0.8, 1); if (a <= 0.01) continue;
    c.strokeStyle = col('graphite', 0.7 * a); c.lineWidth = 2; c.beginPath(); c.moveTo(B[i]!.x, B[i]!.y); c.lineTo(B[j]!.x, B[j]!.y); c.stroke();
    if (hash(i, j, beatI) < 0.22) { g.fillStyle = col('signal', 0.85 * a); g.beginPath(); g.arc(lerp(B[i]!.x, B[j]!.x, beatF), lerp(B[i]!.y, B[j]!.y, beatF), 6, 0, TAU); g.fill(); }
  }
  // chain links between consecutive blocks; each block is "mined" in order (lights up), one every eighth of a beat
  const mined = Math.floor((au.beatAt(t) - au.beatAt(T[1]!)) * 4);
  for (let i = 0; i + 1 < N; i++) { const a = Math.min(cA(i), cA(i + 1)); if (a <= 0.01) continue; const lit = i < mined; c.strokeStyle = col(lit ? 'signal' : 'graphite', a); c.lineWidth = lit ? 4 : 2; c.beginPath(); c.moveTo(B[i]!.x, B[i]!.y); c.lineTo(B[i + 1]!.x, B[i + 1]!.y); c.stroke(); }
  // the units
  for (let i = 0; i < N; i++) {
    const b = B[i]!;
    const fire = gA(i) * pulse(t, au.timeOfBeat(beatI), 0.25) * (hash(i, beatI) < 0.3 ? 1 : 0);
    const fill = gA(i) > 0.5 ? mix('ash', 'signal', fire, 1) : cA(i) > 0.5 ? (i < mined ? mix('ink2', 'signal', 0.18, 1) : col('ink2', 1)) : tA(i) > 0.5 ? mix('ink2', 'graphite', 0.45, 1) : mix('acid', 'blood', 0.25 + 0.15 * hash(i, 3), 1);
    c.fillStyle = fill; c.beginPath(); c.roundRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, b.r); c.fill();
    const edge = cA(i) > 0.5 ? (i < mined ? 'signal' : 'graphite') : kA(i) > 0.5 ? 'blood' : tA(i) > 0.5 ? 'ash' : 'bone';
    c.strokeStyle = col(edge, 0.9); c.lineWidth = cA(i) > 0.5 ? 3 : 2; c.stroke();
    if (cA(i) > 0.4) { note(c, `#${String(1000 + i)}`, b.x, b.y - 10, cA(i), 18, i < mined ? 'signal' : 'ash', 'center'); note(c, '0x' + Math.floor(hash(i, 9) * 0xffff).toString(16).padStart(4, '0'), b.x, b.y + 20, cA(i) * 0.8, 15, 'ash', 'center'); }
    if (fire > 0.05) { g.fillStyle = col('signal', 0.5 * fire); g.beginPath(); g.arc(b.x, b.y, 34, 0, TAU); g.fill(); }
    if (tA(i) > 0.3) for (let q = 0; q < 3; q++) { if (hash(i, q, Math.floor(t * 0.7)) > 0.3 + 0.6 * prog(t, T[3]!, sh.end)) continue; c.fillStyle = col('acid', 0.9 * tA(i)); c.fillRect(b.x - b.w / 2 + 14 + q * 44, b.y - 12, 30, 22); }
  }
  // mortar gleam across the wall while it is bricks
  const wallA = Math.max(...Array.from({ length: N }, (_, i) => kA(i)));
  if (wallA > 0.05) { const gx = lerp(150, 1800, ((t - T[2]!) * 0.45) % 1); g.fillStyle = col('acid', 0.22 * wallA); g.fillRect(gx - 40, 450, 80, 450); }
  // tower tops: beacons once it is a city
  counts.forEach((n, k) => { const top = B[towerOf.findIndex((o) => o.k === k && o.j === n - 1)]!; const a = tA(towerOf.findIndex((o) => o.k === k && o.j === n - 1)); if (a < 0.5) return; c.strokeStyle = col('graphite', a); c.lineWidth = 3; c.beginPath(); c.moveTo(top.x, top.y - top.h / 2); c.lineTo(top.x, top.y - top.h / 2 - 40); c.stroke(); g.fillStyle = col('signal', 0.8 * a * (Math.floor(t * 1.6 + k) % 2)); g.beginPath(); g.arc(top.x, top.y - top.h / 2 - 42, 8, 0, TAU); g.fill(); });
  rule(c, 160, 882, W - 160, 882, prog(t, T[2]! - 0.5, T[2]! + 0.5), col('bone', 0.5), 3);
  // caption + end lockup
  cam(s, { x: W / 2, y: H / 2, z: 1, r: 0 });
  const phase = t < T[1]! ? 0 : t < T[2]! ? 1 : t < T[3]! ? 2 : 3;
  const caps = ['NODES · THE NETWORK', 'BLOCKS · THE CHAIN', 'BRICKS · THE FOUNDATION', 'CITY · BUILT ON IT'];
  note(c, caps[phase]!, 120, 110, prog(t, T[phase]! + 0.2, T[phase]! + 0.6), 26, phase === 2 ? 'acid' : 'signal');
  const la = prog(t, T[3]! + 1.2, T[3]! + 1.8) * (1 - prog(t, sh.end - 1.2, sh.end - 0.4));
  if (la > 0) {
    const fa = A(125, 900), sa = sizeFor('FRONTIER FRIDAY', fa, 1300);
    band(c, 170, 240, 0.6 * la);
    word(s, null, 'FRONTIER FRIDAY', fa, sa, W / 2, 160, { color: col('bone', la) });
    note(c, BRAND.host, W / 2, 250, la, 32, 'signal', 'center');
  }
}

// ================================================================== CHAIN: hash by hash the blocks align; nodes connect across the line
/** Deterministic 128-bit FNV-style digest of a string (hex), for showing real hashes of the sung words. */
function digest(str: string) {
  let out = '';
  for (let k = 0; k < 4; k++) { let h = (2166136261 ^ Math.imul(k + 1, 16777619)) >>> 0; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } out += (h >>> 0).toString(16).padStart(8, '0'); }
  return out;
}
function chain(s: S) {
  // FIG. 8 — HASH BY HASH: each sung word goes into H(x) as a string; its digest flies out into a block; on ALIGN the loose
  // blocks snap into a chain (prev-hash pointers). FIG. 9 — the chain is copied into peers on both sides of a dashed line,
  // and on each word of line 2 a connection crosses the line (packets ride it on the beat).
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.grid = 0.35; s.bg.glow = 0.3;
  const alignW = findW(l1, /align/i);
  const toNet = l2 ? prog(t, l2.start - 0.3, l2.start + 0.6, ease.inOutCubic) : 0;
  const a1 = 1 - toNet;
  cam(s, { x: W / 2, y: H / 2, z: 1 + 0.02 * prog(t, sh.start, sh.end), r: 0 });
  const al = t > alignW.start - 0.05 ? clamp(springStep(t - alignW.start + 0.05, 2.8, 0.55), 0, 1.1) : 0;
  const HX = W / 2, HY = 360, HW = 340, HH = 140;
  const ws = l1.words;
  // blocks: 3, two words each
  const NB = 3, BW = 400, BH = 230, BY = 690;
  const slotOf = (i: number) => Math.min(NB - 1, Math.floor(i / 2));
  const bpos = (b: number) => ({ x: HX + (b - 1) * 470 + (hash(b, 1) - 0.5) * 120 * (1 - al), y: BY + (hash(b, 2) - 0.5) * 140 * (1 - al), r: (hash(b, 3) - 0.5) * 0.3 * (1 - al) });
  if (a1 > 0) {
    c.save(); g.save(); c.globalAlpha = a1; g.globalAlpha = a1;
    // the hash function box
    c.fillStyle = col('ink2', 1); c.strokeStyle = col('bone', 0.85); c.lineWidth = 3;
    c.fillRect(HX - HW / 2, HY - HH / 2, HW, HH); c.strokeRect(HX - HW / 2, HY - HH / 2, HW, HH);
    note(c, 'H(x)', HX, HY + 16, 0.95, 46, 'bone', 'center');
    note(c, 'HASH · 128-BIT', HX, HY + HH / 2 - 14, 0.6, 14, 'ash', 'center');
    rule(c, 140, HY, HX - HW / 2, HY, 1, col('graphite', 0.9), 2); rule(c, HX + HW / 2, HY, W - 140, HY, 1, col('graphite', 0.9), 2);
    note(c, 'INPUT', 150, HY - 14, 0.6, 14, 'ash'); note(c, 'DIGEST', W - 150, HY - 14, 0.6, 14, 'ash', 'right');
    note(c, 'FIG. 8 — HASH BY HASH', 140, H - 60, 0.7, 16, 'ash');
    // blocks (appear when their first digest lands)
    for (let b = 0; b < NB; b++) {
      const w0 = ws[b * 2]; if (!w0) continue;
      const bk = prog(t, w0.start + 0.35, w0.start + 0.6, ease.outBack);
      if (bk <= 0) continue;
      const p = bpos(b);
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.scale(clamp(bk, 0, 1.1), clamp(bk, 0, 1.1));
      c.fillStyle = col('ink2', 0.95); c.strokeStyle = col(al > 0.5 ? 'signal' : 'ash', 0.9); c.lineWidth = 3;
      c.fillRect(-BW / 2, -BH / 2, BW, BH); c.strokeRect(-BW / 2, -BH / 2, BW, BH);
      note(c, `BLOCK #${String(418 + b).padStart(4, '0')}`, -BW / 2 + 16, -BH / 2 + 28, 0.8, 16, 'ash');
      const prev = b ? digest(ws.slice((b - 1) * 2, b * 2).map((w) => clean(w.w)).join(' ')).slice(0, 12) : '000000000000';
      note(c, `prev ${al > 0.3 ? prev : '············'}`, -BW / 2 + 16, BH / 2 - 18, al > 0.3 ? 0.9 : 0.5, 16, al > 0.3 ? 'acid' : 'graphite');
      c.restore();
    }
    // each word: the string goes in, its digest comes out and drops into its block
    ws.forEach((w, i) => {
      const T = '"' + clean(w.w).toLowerCase() + '"', D = digest(clean(w.w).toLowerCase());
      const kin = prog(t, w.start - 0.3, w.start + 0.02, ease.inCubic);
      if (kin > 0 && kin < 1) note(c, T, lerp(170, HX - HW / 2 - 10, kin), HY - 18 - (i % 2) * 0, 1 - prog(kin, 0.8, 1), 30, 'bone', kin < 0.5 ? 'left' : 'right');
      const kout = prog(t, w.start + 0.02, w.start + 0.5, ease.inOutCubic);
      if (kout <= 0) return;
      const b = slotOf(i), p = bpos(b), line = i % 2;
      const tx = p.x - BW / 2 + 16, ty = p.y - BH / 2 + 74 + line * 46;
      const sx = HX + HW / 2 + 10, sy = HY + 6;
      const x = lerp(sx, tx, kout), y = lerp(sy, ty, kout) - Math.sin(kout * Math.PI) * 80;
      const hot = pulse(t, w.start + 0.5, 0.4);
      c.save(); c.translate(x, y); if (kout >= 1) c.rotate(p.r);
      note(c, (kout < 1 ? D : D.slice(0, 24) + '…'), 0, 0, 0.95, kout < 1 ? 22 : 18, hot > 0.3 ? 'signal' : 'bone');
      c.restore();
      if (kout < 1) { g.fillStyle = col('signal', 0.6); g.beginPath(); g.arc(x, y - 6, 8, 0, TAU); g.fill(); }
      // the box flashes as it hashes
      g.fillStyle = col('signal', 0.25 * pulse(t, w.start, 0.25)); g.fillRect(HX - HW / 2, HY - HH / 2, HW, HH);
    });
    // chain pointers once aligned
    if (al > 0.3) for (let b = 1; b < NB; b++) {
      const p0 = bpos(b - 1), p1 = bpos(b), lk = prog(t, alignW.start + b * 0.1, alignW.start + 0.35 + b * 0.1, ease.outExpo);
      const x0 = p0.x + BW / 2, x1 = p1.x - BW / 2, y = p1.y + BH / 2 - 24;
      rule(c, x1, y, lerp(x1, x0, lk), y, 1, col('acid', 0.95), 4);
      if (lk > 0.9) { c.fillStyle = col('acid', 1); c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + 16, y - 9); c.lineTo(x0 + 16, y + 9); c.fill(); }
    }
    c.restore(); g.restore();
  }
  // line 2 — FIG. 9: peers on both sides of the line, each holding a copy of the chain; connections cross on the words
  if (l2 && toNet > 0) {
    c.save(); g.save(); c.globalAlpha = toNet; g.globalAlpha = toNet;
    const NP: V2[] = [{ x: W / 2 - 600, y: 360 }, { x: W / 2 - 420, y: 580 }, { x: W / 2 - 640, y: 780 }, { x: W / 2 + 600, y: 380 }, { x: W / 2 + 430, y: 600 }, { x: W / 2 + 620, y: 790 }];
    const lk = prog(t, l2.start - 0.1, l2.start + 0.4, ease.outExpo);
    c.setLineDash([14, 12]); rule(c, W / 2, 270, W / 2, 860, lk, col('bone', 0.75), 3); c.setLineDash([]);
    note(c, 'THE LINE', W / 2 + 12, 290, lk * 0.7, 14, 'ash');
    const pairs: [number, number][] = [[0, 3], [1, 4], [2, 5], [0, 4], [1, 5], [2, 3], [0, 5], [1, 3]];
    const lw = l2.words;
    pairs.forEach(([a, b2], i) => {
      const w = lw[Math.min(lw.length - 1, Math.floor(i * lw.length / pairs.length))]!;
      const k = prog(t, w.start - 0.05 + (i % 2) * 0.12, w.start + 0.35 + (i % 2) * 0.12, ease.outExpo);
      if (k <= 0) return;
      const A0 = NP[a]!, B0 = NP[b2]!;
      rule(c, A0.x, A0.y, lerp(A0.x, B0.x, k), lerp(A0.y, B0.y, k), 1, col('signal', 0.85), 3);
      rule(g, A0.x, A0.y, lerp(A0.x, B0.x, k), lerp(A0.y, B0.y, k), 1, col('signal', 0.3), 10);
      if (k >= 1) { const u = ((s.au.beatAt(t) + i * 0.37) % 1); const px = lerp(A0.x, B0.x, u), py = lerp(A0.y, B0.y, u); g.fillStyle = col('ember', 0.9); g.fillRect(px - 6, py - 6, 12, 12); }
    });
    NP.forEach((p, i) => {
      const k = prog(t, l2.start - 0.2 + i * 0.06, l2.start + 0.3 + i * 0.06, ease.outBack);
      if (k <= 0) return;
      c.save(); c.translate(p.x, p.y); c.scale(clamp(k, 0, 1.1), clamp(k, 0, 1.1));
      c.fillStyle = col('ink2', 1); c.strokeStyle = col(i < 3 ? 'bone' : 'signal', 0.9); c.lineWidth = 3; c.fillRect(-90, -54, 180, 108); c.strokeRect(-90, -54, 180, 108);
      for (let b = 0; b < 3; b++) { c.strokeStyle = col('acid', 0.9); c.strokeRect(-72 + b * 50, -26, 40, 34); if (b) rule(c, -72 + b * 50, -9, -82 + b * 50, -9, 1, col('acid', 0.9), 2); }
      note(c, `PEER ${digest('peer' + i).slice(0, 6)}`, 0, 40, 0.75, 14, 'ash', 'center');
      c.restore();
    });
    note(c, 'FIG. 9 — PEERS ACROSS THE LINE (EACH HOLDS THE CHAIN)', 140, H - 60, 0.7 * toNet, 16, 'ash');
    c.restore(); g.restore();
  }
  // type (screen space)
  screen(s);
  const ti = l1.words.findIndex((w) => /^the$/i.test(clean(w.w)));
  band(c, 170, 240, 0.6); band(c, 930, 220, 0.6 * a1);
  row(s, l1.words.slice(0, ti > 0 ? ti : 3), A(100, 900), 1100, 160, W / 2, 170, { alpha: a1, align: 'l' });
  row(s, l1.words.slice(ti > 0 ? ti : 3), A(125, 900), 1100, 150, W / 2, 940, { alpha: a1, align: 'r' });
  if (!l2) return;
  const ai = l2.words.findIndex((w) => /across/i.test(w.w));
  band(c, 930, 220, 0.6 * toNet);
  row(s, l2.words.slice(0, ai > 0 ? ai : 2), A(100, 900), 1100, 160, W / 2, 170, { alpha: toNet, align: 'l' });
  row(s, l2.words.slice(ai > 0 ? ai : 2), A(125, 700), 1100, 150, W / 2, 940, { alpha: toNet, align: 'r' });
}

// ================================================================== VOTE: ballots weigh on a scale; choose the path, the day rises
function vote(s: S) {
  // FIG. 10 — VOTES ASSEMBLE / VOICES WEIGH: a parliament seat chart (hemicycle) fills seat by seat; on VOICES the seats
  // split into two blocs, on WEIGH a tally needle swings to the heavier side. FIG. 11 — CHOOSE THE PATH / SHAPE THE DAY:
  // a decision tree; the chosen path draws in, its end node is shaped into a sun that rises on DAY. Ink on paper.
  const { t, sh, c } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.grid = 0.2;
  const INK = s.paper ? 'ink' : 'bone', B2 = s.paper ? 'blood' : 'signal', CH = 'acid';
  const a1 = until(t, l2);
  const vW = l1.words[0]!, asW = findW(l1, /assemble/i), voW = findW(l1, /voices/i), wW = findW(l1, /weigh/i);
  cam(s, { x: W / 2, y: H / 2, z: 1 + 0.02 * prog(t, sh.start, sh.end), r: 0 });
  if (a1 > 0) {
    const CX = W / 2, CY = 800;
    type Seat = { x: number; y: number; a: number };
    const seats: Seat[] = [];
    for (let r = 0; r < 7; r++) { const R = 200 + r * 52, n = Math.round((Math.PI * R) / 50); for (let i = 0; i < n; i++) { const a = Math.PI + (i + 0.5) * (Math.PI / n); seats.push({ x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R, a }); } }
    seats.sort((p, q) => p.a - q.a);
    const N = seats.length, split = Math.round(N * 0.46);
    const fill0 = vW.start - 0.05, fill1 = Math.max(asW.end, asW.start + 0.6);
    const bloc = prog(t, voW.start - 0.05, voW.start + 0.35, ease.outCubic);
    seats.forEach((p, i) => {
      const ti = lerp(fill0, fill1, hash(i, 4) * 0.35 + (i / N) * 0.65), k = prog(t, ti, ti + 0.18, ease.outBack);
      if (k <= 0) return;
      const left = i < split;
      c.fillStyle = bloc > 0 ? mix(INK, left ? INK : B2, bloc, a1) : col(INK, 0.85 * a1);
      c.beginPath(); c.arc(p.x, p.y - (1 - Math.min(1, k)) * 60, 15 * clamp(k, 0, 1.15), 0, TAU); c.fill();
      if (left && bloc > 0) { c.fillStyle = col(s.paper ? 'bone' : 'ink', bloc * a1); c.beginPath(); c.arc(p.x, p.y, 7, 0, TAU); c.fill(); }
    });
    // the tally needle (weigh): swings to the heavier bloc
    const wk = t > wW.start - 0.05 ? clamp(springStep(t - wW.start + 0.05, 2.2, 0.35), 0, 1.3) : 0;
    const ang = -Math.PI / 2 + lerp(0, 0.38, wk);
    c.strokeStyle = col(INK, 0.9 * a1); c.lineWidth = 5; c.beginPath(); c.moveTo(CX, CY); c.lineTo(CX + Math.cos(ang) * 150, CY + Math.sin(ang) * 150); c.stroke();
    c.fillStyle = col(INK, a1); c.beginPath(); c.arc(CX, CY, 14, 0, TAU); c.fill();
    const cnt = Math.round(N * prog(t, fill0, fill1));
    note(c, `SEATS ${String(cnt).padStart(3, '0')} / ${N}`, CX, CY + 50, 0.85 * a1, 20, INK as any, 'center');
    if (bloc > 0) { note(c, `AYE ${N - split}`, CX + 420, CY + 50, bloc * a1, 22, B2 as any, 'center'); note(c, `NAY ${split}`, CX - 420, CY + 50, bloc * a1, 22, INK as any, 'center'); }
    note(c, 'FIG. 10 — THE ASSEMBLY', 140, H - 60, 0.7 * a1, 16, INK as any);
  }
  if (l2) {
    const k2 = prog(t, l2.start - 0.25, l2.start + 0.2, ease.outCubic);
    if (k2 > 0) {
      const chW = l2.words[0]!, pW = findW(l2, /path/i), shW = findW(l2, /shape/i), dW = last(l2.words);
      // decision tree from the bottom: 3 → 6 branches; the chosen route lights
      const root: V2 = { x: W / 2, y: 880 };
      const L1: V2[] = [{ x: W / 2 - 520, y: 620 }, { x: W / 2, y: 600 }, { x: W / 2 + 520, y: 620 }];
      const L2: V2[] = L1.flatMap((p) => [{ x: p.x - 200, y: 380 }, { x: p.x + 200, y: 380 }]);
      const grow = prog(t, l2.start - 0.2, chW.start + 0.4, ease.outCubic);
      c.strokeStyle = col(INK, 0.45 * k2); c.lineWidth = 3;
      L1.forEach((p, i) => { rule(c, root.x, root.y, p.x, p.y, grow, col(INK, 0.45 * k2), 3); for (const q of [L2[i * 2]!, L2[i * 2 + 1]!]) rule(c, p.x, p.y, q.x, q.y, prog(grow, 0.5, 1), col(INK, 0.45 * k2), 3); });
      [...L1, ...L2].forEach((p) => { c.fillStyle = col(INK, 0.6 * k2 * grow); c.beginPath(); c.arc(p.x, p.y, 9, 0, TAU); c.fill(); });
      note(c, 'OPTION A', L2[0]!.x, L2[0]!.y - 26, 0.7 * grow, 16, INK as any, 'center');
      note(c, 'OPTION B', L2[2]!.x, L2[2]!.y - 26, 0.7 * grow, 16, INK as any, 'center');
      // the chosen path: root → right-centre → its right branch
      const P = [root, L1[2]!, L2[5]!];
      const pk = prog(t, pW.start - 0.1, pW.start + 0.5, ease.inOutCubic);
      for (let i = 1; i < P.length; i++) { const u = clamp(pk * 2 - (i - 1)); rule(c, P[i - 1]!.x, P[i - 1]!.y, P[i]!.x, P[i]!.y, u, col(CH, 1), 9); }
      // SHAPE: the end node's contour is drawn as a sun; DAY: it fills and rises, rays
      const end = L2[5]!, sk = prog(t, shW.start - 0.05, shW.start + 0.45, ease.inOutCubic), dk = prog(t, dW.start - 0.05, dW.start + 0.6, ease.outCubic);
      if (sk > 0) {
        const sy = end.y - 20 - 50 * dk;
        c.save(); c.beginPath(); c.rect(end.x - 200, sy - 200, 400, 200 + 20 + 50 * dk); c.clip();
        c.strokeStyle = col(CH, 1); c.lineWidth = 5; c.beginPath(); c.arc(end.x, end.y - 20 + 0, 90, Math.PI, Math.PI + Math.PI * sk); c.stroke();
        if (dk > 0) { c.fillStyle = col(CH, 0.9 * dk); c.beginPath(); c.arc(end.x, sy + 50 * dk, 90, Math.PI, TAU); c.fill(); }
        c.restore();
        rule(c, end.x - 160, end.y - 20, end.x + 160, end.y - 20, sk, col(INK, 0.9), 3);
        for (let i = 0; i < 9; i++) { const a = Math.PI + (i + 0.5) * (Math.PI / 9); rule(c, end.x + Math.cos(a) * 115, end.y - 20 + Math.sin(a) * 115, end.x + Math.cos(a) * (115 + 80 * dk), end.y - 20 + Math.sin(a) * (115 + 80 * dk), dk, col(CH, 0.95), 4); }
      }
      note(c, 'FIG. 11 — DECISION TREE', 140, H - 60, 0.7 * k2, 16, INK as any);
    }
  }
  // type
  screen(s);
  const vi = l1.words.indexOf(voW);
  band(c, 150, 240, 0.6 * a1); band(c, 950, 200, 0.6 * a1);
  row(s, l1.words.slice(0, vi > 0 ? vi : 2), A(125, 900), 1100, 160, W / 2, 150, { alpha: a1, align: 'l' });
  row(s, l1.words.slice(vi > 0 ? vi : 2), A(125, 900), 1000, 150, W / 2, 955, { alpha: a1, align: 'r' });
  if (!l2) return;
  const ti = l2.words.findIndex((w) => /^and$/i.test(clean(w.w)));
  band(c, 150, 240, 0.6 * (1 - a1)); band(c, 950, 200, 0.6 * (1 - a1));
  row(s, l2.words.slice(0, ti > 0 ? ti : 3), A(125, 900), 1100, 160, W / 2, 150, { alpha: 1 - a1, align: 'l' });
  row(s, l2.words.slice(ti > 0 ? ti : 3), A(125, 900), 1000, 150, W / 2, 955, { alpha: 1 - a1, align: 'r' });
}

// ================================================================== FRAME: break the loop, change the frame; risk before gain
function splitWord(s: S, w: Word, text: string, fam: string, size: number, x: number, y: number, k: number) {
  const { c } = s;
  const m = measure(text, fam, size);
  if (k <= 0) { word(s, w, text, fam, size, x, y, { sc: slam(w, s.t, 1.6) }); return; }
  const off = 6 * k;
  c.save(); c.beginPath(); c.rect(x - m, y - size, m, size * 2); c.clip();
  word(s, w, text, fam, size, x, y - off, { color: col('bone', 1), glow: 0 }); c.restore();
  c.save(); c.beginPath(); c.rect(x, y - size, m, size * 2); c.clip();
  word(s, w, text, fam, size, x, y + off, { color: col('signal', 1), glow: 0 }); c.restore();
}
function frame(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.glow = 0.35; s.bg.grid = 0.4;
  const a1 = until(t, l2);
  const breakW = findW(l1, /break/i), loopW = findW(l1, /loop/i), chW = findW(l1, /change/i), frW = findW(l1, /frame/i);
  const rot = snapVal(t, [sh.start, chW.start - 0.05], [0, -0.035], 0.5, ease.outBack);
  cam(s, { x: W / 2, y: H / 2, z: 1, r: rot * a1 });
  if (a1 > 0) {
    const R = 330, cx = W / 2, cy = H / 2 - 40;
    // the frame: corner brackets that rotate and change aspect on CHANGE
    const fk = clamp(springStep(t - chW.start, 2.2, 0.5), 0, 1.1) * (t > chW.start - 0.05 ? 1 : 0);
    const fw = lerp(1600, 1000, fk), fh = lerp(860, 900, fk), fr = lerp(0, -0.12, fk);
    c.save(); c.translate(W / 2, H / 2); c.rotate(fr);
    c.strokeStyle = col('bone', 0.85 * a1); c.lineWidth = 6;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      c.beginPath(); c.moveTo(sx * fw / 2, sy * fh / 2 - sy * 70); c.lineTo(sx * fw / 2, sy * fh / 2); c.lineTo(sx * fw / 2 - sx * 70, sy * fh / 2); c.stroke();
    }
    note(c, fk > 0.5 ? '1:1' : '16:9', fw / 2 - 10, -fh / 2 + 34, 0.7 * a1, 18, 'ash', 'right');
    c.restore();
    // type: BREAK / CHANGE / FRAME split two-tone once sung
    const ti = l1.words.indexOf(chW) > 0 ? l1.words.findIndex((w) => /^and$/i.test(clean(w.w))) : -1;
    const r1 = ti > 0 ? l1.words.slice(0, ti) : l1.words.slice(0, 3), r2 = l1.words.slice(r1.length);
    const lay = (rw: Word[], fam: string, width: number, max: number, y: number) => {
      const fr2 = fitRow(rw.map(txt), fam, width, max);
      rw.forEach((w, i) => {
        if (/^(break|change|frame)$/i.test(clean(w.w)) && a1 > 0) splitWord(s, w, txt(w), fam, fr2.size, W / 2 + fr2.xs[i]!, y, prog(t, w.start + 0.12, w.start + 0.3, ease.outExpo));
        else word(s, w, txt(w), fam, fr2.size, W / 2 + fr2.xs[i]!, y, { sc: slam(w, t, 1.6), alpha: a1 });
      });
    };
    // BREAK THE LOOP *is* the loop: the words run round a spinning ring (with an arrowhead closing it); on BREAK the ring
    // tears at the top and the letters unroll, word by word, into a straight row
    const fam1 = A(125, 900), fr1 = fitRow(r1.map(txt), fam1, 1400, 220), RS = 104;
    const gl1: { ch: string; w: Word; tx: number; tw: number; j: number }[] = [];
    r1.forEach((w, i) => { const L = layout(txt(w), fam1, fr1.size); const x0 = W / 2 + fr1.xs[i]! - L.width / 2; L.glyphs.forEach((q) => gl1.push({ ch: q.ch, w, tx: x0 + q.x + q.w / 2, tw: q.w, j: q.i })); });
    const slots = gl1.length + (r1.length - 1) + 3, dA = TAU / slots;
    const spin = 1.4 * Math.min(t, breakW.start) - Math.PI / 2;
    const tear = prog(t, breakW.start - 0.05, breakW.start + 0.25, ease.outExpo);
    let slot = 0, prevW: Word | null = null;
    c.save(); c.globalAlpha = a1; g.save(); g.globalAlpha = a1;
    // the closing arrowhead in the gap (gone once the loop is broken)
    const ga = spin + (slots - 1.5) * dA;
    if (tear < 1) { const ax = cx + Math.cos(ga) * R, ay = cy + Math.sin(ga) * R; c.save(); c.translate(ax, ay); c.rotate(ga + Math.PI / 2); c.strokeStyle = col('signal', 1 - tear); c.lineWidth = 6; c.beginPath(); c.moveTo(-26, -20); c.lineTo(0, 0); c.lineTo(-26, 20); c.stroke(); c.restore(); }
    c.strokeStyle = col('graphite', 0.8 * (1 - tear)); c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R - 70, 0, TAU); c.stroke();
    for (const q of gl1) {
      if (prevW && q.w !== prevW) slot++;
      prevW = q.w;
      const th = spin + slot * dA; slot++;
      const u = prog(t, q.w.start - 0.06 + q.j * 0.018, q.w.start + 0.32 + q.j * 0.018, ease.inOutCubic);
      const x = lerp(cx + Math.cos(th) * R, q.tx, u), y = lerp(cy + Math.sin(th) * R, cy, u);
      const rotq = lerp(th + Math.PI / 2, 0, u), sz = lerp(RS, fr1.size, u);
      const h = heat(q.w, t);
      c.save(); c.translate(x, y); c.rotate(rotq); setFont(c, fam1, sz); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = u > 0 ? mix('bone', 'signal', h) : col('bone', 0.55); c.fillText(q.ch, 0, (CAP * sz) / 2); c.restore();
      if (h > 0.05) { g.save(); g.translate(x, y); g.rotate(rotq); setFont(g, fam1, sz); g.textAlign = 'center'; g.fillStyle = col('ember', 0.4 * h); g.fillText(q.ch, 0, (CAP * sz) / 2); g.restore(); }
    }
    // tear sparks at the break point
    if (tear > 0 && tear < 1) for (let i = 0; i < 24; i++) { const a = ga + (hash(i, 1) - 0.5) * 1.6, L = 40 + 220 * tear * hash(i, 2); const bx = cx + Math.cos(ga) * R, by = cy + Math.sin(ga) * R; rule(g, bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L, 1, col('signal', 0.8 * (1 - tear)), 3); }
    c.restore(); g.restore();
    c.save(); c.globalAlpha = a1; lay(r2, A(100, 900), 1300, 170, H / 2 + 260); c.restore();
  }
  if (!l2) return;
  // TEST THE RISK BEFORE THE GAIN — a tensile test (FIG. 13): RISK is clamped between two grips and pulled; the word
  // stretches along Archivo's width axis while a stress–strain curve climbs; on GAIN the curve peaks and GAIN slams
  screen(s);
  const ws = l2.words;
  const testW = ws[0]!, riskW = findW(l2, /risk/i), gainW = findW(l2, /gain/i);
  const inK = prog(t, l2.start - 0.25, l2.start + 0.2, ease.outExpo) * (1 - a1 * 0.999);
  const strain = prog(t, riskW.start + 0.15, gainW.start, ease.inOutQuad);
  const peak = prog(t, gainW.start - 0.05, gainW.start + 0.3, ease.outExpo);
  const MY = 470, sz = 230;
  const fam = widthFam(lerp(0.15, 1, strain)), TW = lerp(560, 1240, strain) + 30 * peak;
  const jit = strain > 0 && strain < 1 ? noise1(t * 40, 3) * 5 * strain : 0;
  // grips (crossheads) + load frame
  const gx = TW / 2 + 95;
  c.save(); c.globalAlpha = inK;
  rule(c, 120, MY - 220, W - 120, MY - 220, 1, col('graphite', 0.9), 3); rule(c, 120, MY + 220, W - 120, MY + 220, 1, col('graphite', 0.9), 3);
  for (const sd of [-1, 1]) {
    const x = W / 2 + sd * gx + jit * sd;
    c.fillStyle = col('ink2', 1); c.strokeStyle = col('bone', 0.85); c.lineWidth = 4;
    c.fillRect(x - 55, MY - 190, 110, 380); c.strokeRect(x - 55, MY - 190, 110, 380);
    for (const yy of [MY - 140, MY + 140]) { c.beginPath(); c.arc(x, yy, 12, 0, TAU); c.stroke(); }
    // screw rods to the frame ends
    rule(c, x + sd * 55, MY, x + sd * 55 + sd * 400, MY, 1, col('ash', 0.8), 8);
    for (let k = 0; k < 10; k++) rule(c, x + sd * (70 + k * 36), MY - 10, x + sd * (82 + k * 36), MY + 10, 1, col('graphite', 1), 2);
    note(c, sd < 0 ? 'GRIP A' : 'GRIP B', x, MY - 205, 0.7, 14, 'ash', 'center');
  }
  // dimension line: gauge length grows with the pull
  rule(c, W / 2 - gx, MY + 260, W / 2 + gx, MY + 260, 1, col('ash', 0.7), 1.5);
  note(c, `L₀ ${(560 / 10).toFixed(1)} → ${(TW / 10).toFixed(1)} mm   ε ${(strain * 1.21).toFixed(2)}`, W / 2, MY + 290, 0.85 * prog(t, riskW.start, riskW.start + 0.3), 18, 'ash', 'center');
  c.restore();
  // RISK in the grips: clamps in on its onset, then stretches (width axis + exact gauge width)
  if (t > riskW.start - 0.3) {
    const ak = Math.max(0.25 * prog(t, riskW.start - 0.4, riskW.start - 0.1), appear(riskW, t));
    const nat = measure('RISK', fam, sz), sx = TW / nat;
    const h = Math.max(heat(riskW, t), 0.6 * strain, peak);
    c.save(); c.globalAlpha = ak; c.translate(W / 2, MY + jit * 0.3); c.scale(sx, 1 + 0.06 * (1 - slam(riskW, t, 1) )); setFont(c, fam, sz); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = mix('bone', peak > 0 ? 'signal' : 'ember', h); c.fillText('RISK', 0, (CAP * sz) / 2); c.restore();
    if (h > 0.05) { g.save(); g.translate(W / 2, MY); g.scale(sx, 1); setFont(g, fam, sz); g.textAlign = 'center'; g.fillStyle = col('signal', 0.35 * h); g.fillText('RISK', 0, (CAP * sz) / 2); g.restore(); }
  }
  // stress–strain plot (lower left): elastic line, yield, hardening to the peak = GAIN
  const PX = 180, PY = 900, PW = 520, PH = 210;
  const curve = (e: number) => (e < 0.25 ? e / 0.25 * 0.55 : e < 0.45 ? 0.55 + 0.04 * Math.sin((e - 0.25) * 30) : 0.59 + 0.41 * Math.pow((e - 0.45) / 0.55, 0.7));
  c.save(); c.globalAlpha = inK;
  rule(c, PX, PY, PX + PW, PY, 1, col('ash', 0.8), 2); rule(c, PX, PY, PX, PY - PH, 1, col('ash', 0.8), 2);
  note(c, 'σ', PX - 22, PY - PH + 10, 0.8, 18, 'ash'); note(c, 'ε', PX + PW + 10, PY + 6, 0.8, 18, 'ash');
  const eNow = strain;
  c.strokeStyle = col('signal', 0.95); c.lineWidth = 4; c.beginPath();
  for (let i = 0; i <= 60; i++) { const e = (i / 60) * eNow; const x = PX + e * PW, y = PY - curve(e) * PH; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();
  if (eNow > 0) { const x = PX + eNow * PW, y = PY - curve(eNow) * PH; g.fillStyle = col('signal', 0.8); g.beginPath(); g.arc(x, y, 10 + 8 * peak, 0, TAU); g.fill(); if (peak > 0) note(c, 'PEAK · GAIN', x - 10, y - 22, peak, 16, 'signal', 'right'); }
  note(c, 'FIG. 13 — TENSILE TEST, RISK SPECIMEN', PX, PY + 34, 0.75, 15, 'ash');
  c.restore();
  // type: TEST the (top, flush left) · before the GAIN (bottom, flush right)
  const gi = ws.findIndex((w) => /^before$/i.test(clean(w.w)));
  band(c, 160, 260, 0.6 * (1 - a1));
  row(s, ws.slice(0, ws.indexOf(riskW)), A(100, 900), 900, 180, W / 2, 160, { align: 'l' });
  row(s, ws.slice(gi > 0 ? gi : ws.indexOf(riskW) + 1), A(125, 900), 900, 170, W / 2, 930, { align: 'r', hot: 'signal' });
  void testW;
}

// ================================================================== SPARK: human questions, tools that grow; keep the spark, let it show
// ================================================================== FUSE (ported from pdoom FIG. 10 `fuse`, Canvas2D)
// A braided, engraved cord on a long lazy S; the lyric rides along it; the burning front reaches each word's first letter
// exactly at its onset (the held last word burns letter by letter); letters go white-hot → ember → signal while sung, then
// char and crumble (erosion bites, droop); the cord behind the front is ash with dying embers; embers rise, ash flakes fall.
let FUSEP: { pts: V2[]; L: Float32Array } | null = null;
function fusePath() {
  if (FUSEP) return FUSEP;
  const pts: V2[] = [];
  for (let x = -3200; x <= 3400; x += 10) pts.push({ x, y: H / 2 + 20 + 60 * Math.sin(x * 0.0021 + 0.9) + 22 * Math.sin(x * 0.0057 + 2.0) });
  FUSEP = { pts, L: polylineLengths(pts) };
  return FUSEP;
}
const fuseAt = (sv: number) => { const P = fusePath(); return pointAtLength(P.pts, P.L, sv); };
const fuseSAtX = (x: number) => { const P = fusePath(); for (let i = 1; i < P.pts.length; i++) if (P.pts[i]!.x >= x) return P.L[i]!; return 0; };
type FuseGl = { ch: string; s0: number; s1: number; w: Word; seed: number };
function fuseLayout(l: Line, endX: number, fam: string, size: number) {
  const T = l.words.map(txt).join(' ');
  const L = layout(T, fam, size, 1);
  const lastW = txt(last(l.words));
  const lastStart = T.length - lastW.length;
  const lg = L.glyphs.filter((q) => q.i >= lastStart);
  const lastMid = lg.length ? (lg[0]!.x + last(lg).x + last(lg).w) / 2 : L.width;
  const s0 = fuseSAtX(endX) - lastMid;
  const wordAt: Word[] = []; let ci = 0;
  l.words.forEach((w) => { for (let k = 0; k < txt(w).length; k++) wordAt[ci + k] = w; ci += txt(w).length + 1; });
  const gl: FuseGl[] = L.glyphs.filter((q) => q.ch !== ' ').map((q) => ({ ch: q.ch, s0: s0 + q.x, s1: s0 + q.x + q.w, w: wordAt[q.i] ?? l.words[0]!, seed: q.i }));
  return { gl, sText0: s0, width: L.width };
}
function fuseKnots(l: Line, gl: FuseGl[], sText0: number, tail: number): [number, number][] {
  const kn: [number, number][] = [[l.start - 0.45, sText0 - 220]];
  l.words.forEach((w) => { const f = gl.find((q) => q.w === w); if (f) kn.push([w.start, f.s0 - 2]); });
  const lw = last(l.words), lg = gl.filter((q) => q.w === lw);
  kn.push([lw.start + tail, last(lg).s1 + 6]);
  kn.push([lw.start + tail + 4, last(lg).s1 + 120]);
  return kn;
}
function knotS(kn: [number, number][], t: number) {
  if (t <= kn[0]![0]) return kn[0]![1];
  for (let i = 1; i < kn.length; i++) { const a = kn[i - 1]!, b = kn[i]!; if (t <= b[0]) return lerp(a[1], b[1], (t - a[0]) / Math.max(1e-4, b[0] - a[0])); }
  return last(kn)[1];
}
function knotT(kn: [number, number][], sv: number) {
  for (let i = 1; i < kn.length; i++) { const a = kn[i - 1]!, b = kn[i]!; if (sv <= b[1]) return lerp(a[0], b[0], clamp((sv - a[1]) / Math.max(1e-4, b[1] - a[1]))); }
  return last(kn)[0];
}
/** The cord (engraved braid ahead of the front, ash with embers behind), the front's glow, spark head + particles, ash/embers. */
function drawFuseCord(s: S, bs: number, sMin: number, sMax: number, a: number, zoom: number) {
  const { c, g, t } = s;
  const R = 13, pitch = R * 1.55, lw = 1 / Math.max(0.4, zoom);
  // body
  const P = fusePath();
  c.lineCap = 'round';
  for (let sv = sMin; sv < sMax; sv += 12) {
    const p = fuseAt(sv), q = fuseAt(sv + 12), ds = sv - bs;
    const burnt = clamp((-ds + 3) / 29);
    const er = 0.58 + 0.2 * noise1(sv * 0.09, 3);
    const Rr = R * lerp(1, er, burnt);
    c.strokeStyle = mix('ink2', 'graphite', burnt * 0.6, a); c.lineWidth = Rr * 2; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke();
  }
  // braid: two families of diagonal strands, lit from above, warmed by the spark ahead
  for (let sv = sMin; sv < sMax; sv += pitch / 2) {
    const ds = sv - bs; if (ds < -3) continue;
    const p = fuseAt(sv), nx = -Math.sin(p.angle), ny = Math.cos(p.angle), tx = Math.cos(p.angle), ty = Math.sin(p.angle);
    const k = Math.floor(sv / (pitch / 2)) % 2 ? 1 : -1;
    const warm = Math.exp(-Math.max(ds, 0) / (R * 7));
    for (let j = 0; j < 3; j++) {
      const u = (j / 3) * 2 - 1 + 1 / 3, x0 = p.x + nx * R * u * 0.95, y0 = p.y + ny * R * u * 0.95;
      const lit = 0.25 + 0.75 * (1 - (u + 1) / 2);
      c.strokeStyle = mix('bone', 'ember', warm * 0.8, (0.18 + 0.6 * lit) * a); c.lineWidth = 1.6 * lw;
      c.beginPath(); c.moveTo(x0 - tx * pitch * 0.32 * k - nx * R * 0.3, y0 - ty * pitch * 0.32 * k - ny * R * 0.3); c.lineTo(x0 + tx * pitch * 0.32 * k + nx * R * 0.3, y0 + ty * pitch * 0.32 * k + ny * R * 0.3); c.stroke();
    }
  }
  // rim line of the intact cord (top edge)
  c.strokeStyle = col('bone', 0.35 * a); c.lineWidth = 1.2 * lw; c.beginPath();
  for (let sv = Math.max(bs, sMin), i = 0; sv < sMax; sv += 10, i++) { const p = fuseAt(sv); const x = p.x + Math.sin(p.angle) * R * 0.95, y = p.y - Math.cos(p.angle) * R * 0.95; i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.stroke();
  // burnt: dying embers in the ash
  for (let sv = Math.max(sMin, bs - 420); sv < bs; sv += 6) {
    const ds = sv - bs, emb = Math.exp(ds / 70), fl = 0.55 + 0.45 * noise1(sv * 0.12 + t * 2.5, 4);
    if (hash(Math.floor(sv), 5) > 0.55) continue;
    const p = fuseAt(sv), off = (hash(Math.floor(sv), 6) - 0.5) * R;
    g.fillStyle = col('signal', 0.8 * emb * fl * a); g.fillRect(p.x - 2, p.y + off - 2, 4, 4);
    c.fillStyle = mix('graphite', 'ember', emb * fl, 0.9 * a); c.fillRect(p.x - 1.5, p.y + off - 1.5, 3, 3);
  }
  // the burning front: halo + white-hot head with four flickering rays
  const h = fuseAt(bs);
  const hg = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, 60); hg.addColorStop(0, col('ember', 0.95 * a)); hg.addColorStop(0.3, col('signal', 0.6 * a)); hg.addColorStop(1, col('signal', 0));
  g.fillStyle = hg; g.beginPath(); g.arc(h.x, h.y, 60, 0, TAU); g.fill();
  const cg = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, 22); cg.addColorStop(0, `rgba(255,250,240,${a})`); cg.addColorStop(0.2, col('ember', 0.95 * a)); cg.addColorStop(0.5, col('signal', 0.45 * a)); cg.addColorStop(1, col('signal', 0));
  c.fillStyle = cg; c.beginPath(); c.arc(h.x, h.y, 22, 0, TAU); c.fill();
  for (let i = 0; i < 4; i++) { const an = i * (TAU / 4) + t * 3 + 0.4, r = 9 + 5 * hash(Math.floor(t * 30), i); rule(g, h.x, h.y, h.x + Math.cos(an) * r * 2, h.y + Math.sin(an) * r * 2, 1, col('ember', 0.9 * a), 2); }
  // spark particles thrown from the head (emitted along its recent path, gravity)
  const rate = 90, life = 0.45;
  for (let n = Math.floor((t - life) * rate); n <= Math.floor(t * rate); n++) {
    const tb = n / rate; if (tb > t) continue;
    const age = t - tb, lf = life * (0.35 + 0.65 * hash(n, 3)); if (age > lf) continue;
    const hp = fuseAt(knotS(KN_CUR, tb)), an = hash(n, 1) * TAU, sp = 260 * (0.25 + hash(n, 2) ** 2 * 1.2);
    const vx = Math.cos(an) * sp, vy = Math.sin(an) * sp - 78, x = hp.x + vx * age, y = hp.y + vy * age + 260 * age * age;
    const x0 = hp.x + vx * Math.max(0, age - 0.018), y0 = hp.y + vy * Math.max(0, age - 0.018) + 260 * Math.max(0, age - 0.018) ** 2, k = 1 - age / lf;
    rule(g, x0, y0, x, y, 1, col(k > 0.6 ? 'ember' : 'signal', Math.min(1, k * 1.4) * a), 2.2 * lw);
  }
  // ash flakes falling / embers rising from behind the front
  for (let n = Math.floor((t - 1.6) * 46); n <= Math.floor(t * 46); n++) {
    const tb = n / 46; if (tb > t) continue;
    const age = t - tb, lf = 1.6 * (0.5 + 0.5 * hash(n, 5)); if (age > lf) continue;
    const sb = knotS(KN_CUR, tb) - 20 - hash(n, 1) * 260; if (sb < sMin) continue;
    const p = fuseAt(sb), k = 1 - age / lf;
    if (hash(n, 2) < 0.35) { const vx = (hash(n, 6) - 0.5) * 40, vy = -40 - 60 * hash(n, 7); rule(g, p.x + vx * age - vx * 0.03, p.y + vy * age - vy * 0.03, p.x + vx * age, p.y + vy * age, 1, col('signal', k * k * a), 2 * lw); }
    else { const vx = 14 * noise1(tb * 3 + n, 6) + 10 * Math.sin(age * 5 + n), vy = 30 + 50 * hash(n, 8); const x = p.x + vx * age, y = p.y + vy * age + 30 * age * age, an = age * (3 + hash(n, 10) * 4) + n; rule(c, x - Math.cos(an) * 2.5, y - Math.sin(an) * 2.5, x + Math.cos(an) * 2.5, y + Math.sin(an) * 2.5, 1, col('ash', 0.5 * Math.min(1, k * 2) * a), 2.2 * lw); }
  }
  void P;
}
let KN_CUR: [number, number][] = [[0, 0], [1, 0]];
/** The lyric along the cord: outlined before ignition; white-hot → ember → signal while sung; then chars to ash and crumbles. */
function drawFuseText(s: S, gl: FuseGl[], kn: [number, number][], fam: string, size: number, a: number, zoom: number) {
  const { c, g, t } = s;
  const R = 13, lift = R + 16;
  setFont(c, fam, size); setFont(g, fam, size);
  c.textBaseline = 'alphabetic'; g.textBaseline = 'alphabetic'; c.textAlign = 'left'; g.textAlign = 'left';
  for (const q of gl) {
    const p = fuseAt((q.s0 + q.s1) / 2), upx = Math.sin(p.angle), upy = -Math.cos(p.angle);
    const tIgn = knotT(kn, q.s0 + (q.s1 - q.s0) * 0.15), tDone = knotT(kn, q.s1);
    const w = q.w, ign = t >= tIgn, since = t - tIgn;
    const wEnd = Math.max(w.end, tDone + 0.05);
    const charK = prog(t, wEnd, wEnd + 0.8, ease.inOutQuad), crumble = prog(t, wEnd + 0.35, wEnd + 2.6, ease.inQuad);
    const droop = 26 * crumble * crumble * (0.6 + 0.8 * hash(q.seed, 3));
    const x = p.x + upx * lift, y = p.y + upy * lift + droop, rot = p.angle + (hash(q.seed, 4) - 0.5) * 0.25 * crumble, gw = q.s1 - q.s0;
    c.save(); c.translate(x, y); c.rotate(rot);
    if (!ign) { c.fillStyle = col('bone', 0.1 * a); c.fillText(q.ch, -gw / 2, 0); c.strokeStyle = col('bone', 0.5 * a); c.lineWidth = 1.3 / zoom; c.strokeText(q.ch, -gw / 2, 0); }
    else {
      const hot = prog(since, 0, 0.45, ease.outCubic);
      const fill = charK <= 0 ? (hot < 0.5 ? mix('bone', 'ember', hot * 2, a) : mix('ember', 'signal', (hot - 0.5) * 2, a)) : charK < 0.45 ? mix('signal', 'graphite', charK / 0.45, a) : mix('graphite', 'ash', (charK - 0.45) / 0.55, (1 - 0.25 * charK) * a);
      c.fillStyle = fill; c.fillText(q.ch, -gw / 2, 0);
      if (charK > 0 && charK < 1) { c.strokeStyle = col('ember', 0.8 * (1 - charK) * a); c.lineWidth = 2.2 / zoom; c.strokeText(q.ch, -gw / 2, 0); }
      if (crumble > 0) {
        c.globalCompositeOperation = 'destination-out'; c.beginPath();
        for (let i = 0; i < 40; i++) {
          const side = Math.floor(hash(q.seed, i, 11) * 4), u = hash(q.seed, i, 7), top = -size * 0.76;
          let hx = -gw / 2 + u * gw, hy = lerp(top, 0, hash(q.seed, i, 8));
          if (side === 0) hy = top + 4; else if (side === 1) hy = -2; else if (side === 2) hx = -gw / 2 + 2; else hx = gw / 2 - 2;
          const gr = clamp(crumble * 2.4 - hash(q.seed, i, 9) * 1.4), r = size * 0.12 * gr * (0.35 + hash(q.seed, i, 10));
          if (r > 0.3) { for (let k = 0; k < 7; k++) { const an = (k / 7) * TAU, rr = r * (0.6 + 0.7 * hash(q.seed, i, k, 12)); if (k === 0) c.moveTo(hx + Math.cos(an) * rr, hy + Math.sin(an) * rr); else c.lineTo(hx + Math.cos(an) * rr, hy + Math.sin(an) * rr); } c.closePath(); }
        }
        c.fill(); c.globalCompositeOperation = 'source-over';
      }
      const heatK = charK <= 0 ? lerp(1, 0.55, hot) : (1 - charK) * 0.55;
      if (heatK > 0.02) { g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = hot < 0.4 && charK <= 0 ? mix('bone', 'ember', hot / 0.4, heatK * a) : col('signal', heatK * a); g.fillText(q.ch, -gw / 2, 0); g.restore(); }
    }
    c.restore();
  }
}

let HATCH: CanvasPattern | null = null;
function spark(s: S) {
  const { t, sh, c, g, au } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.glow = 0.4; s.bg.stars = 0.7;
  const conv = l2 ? prog(t, l2.start - 0.25, l2.start + 0.5, ease.inOutCubic) : 0;
  const showW = l2 ? last(l2.words) : null;
  const burst = showW ? prog(t, showW.start - 0.04, showW.start + 1.2, ease.outCubic) : 0;
  // the held SHOW: the burst keeps spreading super wide while the camera pulls far back (to ~1/5 scale)
  // the held SHOW: a fast pull-back on the downbeat, then the field keeps expanding to the end of the shot
  const dbS = showW ? showW.start : 1e9; // the pull-back snaps on SHOW itself, where the fuse explodes (a rounded downbeat landed before it)
  const snapK = prog(t, dbS - 0.02, dbS + 0.35, ease.outExpo), drift = prog(t, dbS + 0.35, sh.end - 0.05, ease.linear);
  const wide = Math.min(1, 0.45 * snapK + 0.55 * drift);
  const zoomZ = (1 + 0.06 * burst) * lerp(1, 0.5, snapK) * lerp(1, 0.38, drift);
  // line 2 = the pdoom fuse: the lyric rides a braided cord, the camera rides the burning front, the front ends at the
  // frame centre on SHOW, which is where the explosion comes from
  const FF = A(100, 900), FS = 84;
  const FL = l2 ? fuseLayout(l2, W / 2, FF, FS) : null;
  const FK = l2 && FL ? fuseKnots(l2, FL.gl, FL.sText0, 0.3) : null;
  if (FK) KN_CUR = FK;
  const bsNow = FK ? knotS(FK, t) + 2.5 * noise1(t * 9, 3) : 0;
  const fuseIn = l2 ? prog(t, l2.start - 0.3, l2.start + 0.05, ease.inOutCubic) : 0;
  const toC = showW ? prog(t, showW.start - 0.7, showW.start, ease.inOutCubic) : 0;
  const hd = FK ? fuseAt(bsNow) : { x: W / 2, y: H / 2, angle: 0 };
  const follow = { x: lerp(hd.x + 240, W / 2, toC), y: lerp(hd.y - 60, H / 2, toC), z: lerp(1.12, 1, toC) };
  cam(s, { x: lerp(W / 2, follow.x, fuseIn), y: lerp(H / 2, follow.y, fuseIn), z: zoomZ * lerp(1, follow.z, fuseIn), r: 0.05 * wide - 0.012 * fuseIn * (1 - toC) });
  if (showW) s.post.shake = [noise1(t * 50, 1) * 12 * pulse(t, showW.start, 0.1), noise1(t * 50, 2) * 8 * pulse(t, showW.start, 0.1)];
  const a1 = 1 - conv;
  const C = { x: W / 2, y: H / 2 + 20 };
  if (a1 > 0) {
    // FIG. 12 — HUMAN QUESTIONS → TOOLS THAT GROW (pdoom plate idiom): an engraved "?" draws itself on HUMAN, hatches
    // and throws indexed Q-marks on QUESTIONS; out of its dot a tool tree branches on TOOLS and keeps doubling on GROW
    const hw = l1.words[0]!, qw = l1.words[Math.min(1, l1.words.length - 1)]!;
    const tw = findW(l1, /tools/i), gw = findW(l1, /grow/i);
    c.save(); g.save(); c.globalAlpha = a1; g.globalAlpha = a1;
    const QX = 520, QS = 600, QB = H / 2 + 230; // "?" centre x, size, baseline
    const draw = prog(t, sh.start, Math.max(sh.start + 0.3, hw.start + 0.5), ease.inOutCubic), hatch = prog(t, qw.start - 0.05, qw.start + 0.4, ease.outCubic);
    const fam = F.serif(600, true);
    setFont(c, fam, QS); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    if (hatch > 0) {
      if (!HATCH) { const hc = document.createElement('canvas'); hc.width = hc.height = 16; const hx = hc.getContext('2d')!; hx.strokeStyle = col('bone', 0.55); hx.lineWidth = 2; hx.beginPath(); hx.moveTo(0, 16); hx.lineTo(16, 0); hx.stroke(); HATCH = c.createPattern(hc, 'repeat'); }
      c.save(); c.globalAlpha = a1 * hatch; c.fillStyle = HATCH!; c.fillText('?', QX, QB); c.restore();
    }
    if (draw > 0) { c.setLineDash([2600 * draw, 4000]); c.strokeStyle = col('bone', 0.95); c.lineWidth = 4; c.strokeText('?', QX, QB); c.setLineDash([]); }
    // dimension line + figure caption
    rule(c, QX - 230, QB + 40, QX + 230, QB + 40, draw, col('ash', 0.7), 1.5);
    for (const x of [QX - 230, QX + 230]) rule(c, x, QB + 30, x, QB + 50, draw, col('ash', 0.7), 1.5);
    note(c, 'FIG. 12 — A QUESTION, GROWING TOOLS', QX - 230, QB + 74, draw * 0.8, 16, 'ash');
    // the plural: indexed question marks pop around the figure
    for (let i = 0; i < 7; i++) {
      const k = prog(t, qw.start + i * 0.06, qw.start + i * 0.06 + 0.25, ease.outBack);
      if (k <= 0) continue;
      const ang = -2.5 + i * 0.62, R = 330 + hash(i, 4) * 60;
      const x = QX + Math.cos(ang) * R, y = H / 2 - 20 + Math.sin(ang) * R * 0.8;
      if (x > QX + 180 && t > tw.start) continue; // the tree's side clears for the tools
      c.strokeStyle = col('graphite', 0.9 * k); c.lineWidth = 1.5; c.strokeRect(x - 26, y - 34, 52, 60);
      note(c, '?', x, y + 12, k, 40, i % 3 ? 'bone' : 'signal', 'center');
      note(c, `Q.${String(i + 1).padStart(2, '0')}`, x, y + 46, 0.7 * k, 13, 'ash', 'center');
    }
    // the tool tree: branches out of the question's dot; depth 2 grows on TOOLS, then doubling on GROW
    const root = { x: QX + 6, y: QB - 40 };
    const gdepth = 2.2 * prog(t, tw.start - 0.05, tw.start + 0.45, ease.outCubic) + 3.8 * prog(t, gw.start - 0.05, gw.start + 1.1, ease.outCubic);
    const icons = [wrenchIcon, chipIcon, gearIcon, gearIcon];
    let leaves = 0;
    const branch = (x: number, y: number, ang: number, len: number, d: number, id: number) => {
      const f = clamp(gdepth - d);
      if (f <= 0) return;
      const x2 = x + Math.cos(ang) * len * f, y2 = y + Math.sin(ang) * len * f;
      c.strokeStyle = col(d < 2 ? 'bone' : 'signal', d < 2 ? 0.9 : 0.75); c.lineWidth = Math.max(1.5, 7 - d * 1.2);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
      if (d >= 2) { g.strokeStyle = col('signal', 0.3); g.lineWidth = 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); }
      if (f < 1) return;
      if (d === 1) { const ic = icons[(id - 3) % 4]!; const k = prog(t, tw.start + (id % 4) * 0.08, tw.start + 0.4 + (id % 4) * 0.08, ease.outBack); ic(c, x2, y2, 90 * clamp(k, 0, 1.2), 1, t * 0.8); note(c, ['WRENCH', 'CHIP', 'GEAR', 'GEAR'][(id - 3) % 4]!, x2 + 60, y2 + 6, 0.8 * clamp(k), 14, 'ash'); }
      else { c.fillStyle = col('signal', 0.9); c.beginPath(); c.arc(x2, y2, 5, 0, TAU); c.fill(); }
      if (d + 1 > 6) { leaves++; return; }
      const sp = 0.42 + 0.1 * hash(id, 3);
      branch(x2, y2, ang - sp, len * 0.74, d + 1, id * 2 + 1);
      branch(x2, y2, ang + sp, len * 0.74, d + 1, id * 2 + 2);
    };
    branch(root.x, root.y, -0.42, 340, 0, 1);
    if (t > tw.start) note(c, `TOOLS  n = 2^${Math.floor(gdepth)} = ${2 ** Math.floor(gdepth)}`, W - 120, 300, 0.85, 20, 'signal', 'right');
    void leaves;
    c.restore(); g.restore();
    band(c, 150, 250, 0.7 * a1); band(c, 940, 230, 0.7 * a1);
    const qi = l1.words.indexOf(tw);
    const aT = until(t, l2);
    row(s, l1.words.slice(0, qi > 0 ? qi : 2), A(100, 900), 1100, 170, W / 2, 150, { alpha: aT, align: 'l' });
    row(s, l1.words.slice(qi > 0 ? qi : 2), A(125, 900), 1100, 160, W / 2, 940, { alpha: aT, align: 'r' });
  }
  if (!l2) return;
  // KEEP THE SPARK AND LET IT SHOW — the fuse (pdoom FIG. 10)
  const blown = prog(t, showW!.start + 0.25, showW!.start + 0.9);
  if (FL && FK && fuseIn > 0) {
    const aF = fuseIn * (1 - blown);
    drawFuseCord(s, bsNow, FL.sText0 - 1400, FL.sText0 + FL.width + 900, aF, zoomZ);
    drawFuseText(s, FL.gl, FK, FF, FS, aF, zoomZ);
  }
  const BC = FK ? fuseAt(knotS(FK, showW!.start)) : C;
  if (burst > 0) {
    const lw = 1 / Math.sqrt(zoomZ); // keep strokes visible (but fine) as the camera pulls back
    const trs = traces('spark', 77, 34, BC.x, BC.y, 1100, 700);
    trs.forEach((tr) => { drawTr(c, tr, burst * (0.7 + 0.3 * tr.d), col('signal', 0.8), 3 * lw); drawTr(g, tr, burst * (0.7 + 0.3 * tr.d), col('signal', 0.3), 8 * lw); });
    // the wide field: a second and third ring of circuitry far beyond the frame, revealed as the camera pulls out
    const far = traces('spark-far', 78, 90, BC.x, BC.y, 5200, 3000), far2 = traces('spark-far2', 79, 70, BC.x, BC.y, 3000, 1800);
    far2.forEach((tr) => { const k = prog(wide, tr.d * 0.3, 0.45 + tr.d * 0.3); drawTr(c, tr, k, col('signal', 0.7), 3 * lw); drawTr(g, tr, k, col('signal', 0.25), 9 * lw); });
    far.forEach((tr) => { const k = prog(wide, 0.25 + tr.d * 0.3, 0.8 + tr.d * 0.2); drawTr(c, tr, k, col('signal', 0.6), 3 * lw); drawTr(g, tr, k, col('signal', 0.22), 10 * lw); });
    // shock rings expanding on every beat of the held note
    for (let k = 0; k < 4; k++) { const ph = (s.au.beatAt(t) + k / 4) % 1, R = (200 + ph * 4800) * (0.3 + wide); g.strokeStyle = col('signal', 0.35 * (1 - ph) * burst); g.lineWidth = 6 * lw; g.beginPath(); g.arc(BC.x, BC.y, R, 0, TAU); g.stroke(); }
    for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU, L = 60 + (900 + 5000 * wide) * burst; rule(g, BC.x + Math.cos(a) * 60, BC.y + Math.sin(a) * 60, BC.x + Math.cos(a) * L, BC.y + Math.sin(a) * L, 1, col('signal', 0.25 * (1 - 0.5 * wide)), 4 * lw); }
    // the spark itself stays a bright star at the centre, growing with the pull-back
    g.fillStyle = col('signal', 0.8); g.beginPath(); g.arc(BC.x, BC.y, 60 * lw * (0.5 + wide), 0, TAU); g.fill();
  }
  screen(s);
  const ai = l2.words.findIndex((w) => /^and$/i.test(clean(w.w)));
  const rk = prog(t, showW!.start + 0.15, showW!.start + 0.6);
  band(c, 160, 260, 0.6 * rk); band(c, 930, 240, 0.6 * rk);
  row(s, l2.words.slice(0, ai > 0 ? ai : 3), A(100, 900), 1300, 190, W / 2, 160, { alpha: rk });
  row(s, l2.words.slice(ai > 0 ? ai : 3), A(125, 900), 1300, 170, W / 2, 930, { alpha: rk });
}

// ================================================================== FINALE: the city from above is a circuit board; neural sparks
function finale(s: S) {
  const { t, sh, c, g } = s;
  const l = sh.lines[0]!;
  const ws = l.words;
  const glow = last(ws);
  s.bg.glow = 0.5; s.bg.stars = 0.3; s.bg.grid = 0;
  const times = [sh.start, ...ws.map((w) => w.start - 0.05)];
  const k = { x: W / 2, y: H / 2, z: snapVal(t, times, [1.35, ...ws.map((_, i) => 1.3 - i * 0.08)], 0.5), r: snapVal(t, times, [0.12, ...ws.map((_, i) => 0.12 - i * 0.03)], 0.6) };
  cam(s, k);
  // city blocks (top view) between street traces
  const N = 11, cs = 260;
  const lit = prog(t, glow.start - 0.05, glow.start + 0.5, ease.outCubic);
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const x = W / 2 + i * cs, y = H / 2 + j * cs;
    const h = hash(i + 50, j + 50);
    c.fillStyle = col('ink2', 0.95); c.fillRect(x + 30, y + 30, cs - 60, cs - 60);
    c.strokeStyle = col('graphite', 1); c.lineWidth = 2; c.strokeRect(x + 30, y + 30, cs - 60, cs - 60);
    if (h < 0.5) { c.fillStyle = col('acid', 0.5 + 0.4 * lit); c.fillRect(x + 60 + h * 60, y + 60, 40, 40); }
    if (h > 0.8) { c.strokeStyle = col('signal', 0.5 + 0.5 * lit); c.strokeRect(x + 80, y + 80, cs - 160, cs - 160); }
  }
  // signals along the streets
  for (let i = 0; i < 40; i++) {
    const horiz = i % 2 === 0;
    const lane = Math.floor(hash(i, 1) * 2 * N) - N;
    const sp = 500 + hash(i, 2) * 600;
    const p = ((hash(i, 3) * 6000 + t * sp) % 6000) - 3000;
    const x = horiz ? W / 2 + p : W / 2 + lane * cs, y = horiz ? H / 2 + lane * cs : H / 2 + p;
    g.fillStyle = col('signal', 0.9); g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
    c.fillStyle = col('ember', 1); c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill();
    const tail = horiz ? [-120, 0] : [0, -120];
    rule(g, x, y, x + tail[0]!, y + tail[1]!, 1, col('signal', 0.3), 6);
  }
  if (lit > 0) { g.fillStyle = col('signal', 0.12 * lit); g.fillRect(-W, -H, 3 * W, 3 * H); }
  screen(s);
  band(c, H / 2 - 20, 620, 0.7);
  const ti = ws.findIndex((w) => /^the$/i.test(clean(w.w)));
  row(s, ws.slice(0, ti > 0 ? ti : 2), A(125, 900), 1500, 230, W / 2, H / 2 - 130);
  row(s, ws.slice(ti > 0 ? ti : 2), A(100, 900), 1300, 170, W / 2, H / 2 + 130);
}

// ================================================================== ENDCARD: FRONTIER FRIDAY with Earl Co, over the full city
function endcard(s: S) {
  // loops: over the last ~2 s everything clears and the spark glides back to frame 0's exact place/size (boot camera z 3.2 x punch 1.07)
  const { t, sh, c, g, au } = s;
  const l = sh.lines[0]!;
  const ws = l.words;
  const [fw, fr] = ws as [Word, Word];
  const rest = ws.slice(2);
  const lp = prog(t, sh.end - 2.2, sh.end - 1 / 30, ease.inOutCubic), keep = 1 - lp;
  s.bg.glow = lerp(0.7, 0.2, lp); s.bg.gy = lerp(0.8, 0.5, lp); s.bg.stars = lerp(1, 0, lp); s.bg.grid = lerp(0.4, 0, lp);
  if (keep > 0.002) {
    cam(s, { x: W / 2 + 80 * prog(t, sh.start, sh.end), y: H / 2, z: 1, r: 0 });
    c.save(); c.globalAlpha = keep; g.save(); g.globalAlpha = keep;
    drawCity(s, 4, H - 20, { lit: 0.8, scale: 0.7, xs: [-600, W + 800], a: 0.8 });
    screen(s);
    band(c, H / 2 - 60, 720, 0.65);
    const fa = A(125, 900), fb = A(125, 300);
    const sa = sizeFor('FRONTIER', fa, 1500), sb = sizeFor('FRIDAY', fb, 1050);
    const yA = H / 2 - 200;
    drawLetters(c, 'FRONTIER', fa, sa, W / 2 - measure('FRONTIER', fa, sa) / 2, yA + (CAP * sa) / 2, fw.start - 0.06, t, (_i, k) => mix('bone', 'signal', heat(fw, t), k), { stagger: 0.03, dy: -120, dur: 0.35 });
    const yB = yA + sa * CAP / 2 + 40 + sb * CAP / 2;
    word(s, fr, 'FRIDAY', fb, sb, W / 2, yB, { sc: slam(fr, t, 1.5), base: 'signal', hot: 'ember' });
    row(s, rest, A(100, 700), 760, 90, W / 2, yB + sb * CAP / 2 + 100);
    note(c, BRAND.tagline, W / 2, yB + sb * CAP / 2 + 190, prog(t, last(ws).end + 0.4, last(ws).end + 1), 24, 'ash', 'center');
    c.restore(); g.restore();
  }
  // the spark: from the top of the title card back to the centre, scaling to its frame-0 size
  screen(s);
  const kick = au.env('low', t);
  const Z0 = 3.2 * 1.07;
  const sr = (10 + 10 * kick) * lerp(1, 0, lp) + (8 + 10 * kick) * Z0 * lp;
  const x = W / 2, y = lerp(110, H / 2, lp);
  c.fillStyle = col('ember', 1); c.beginPath(); c.arc(x, y, sr * 0.6, 0, TAU); c.fill();
  g.fillStyle = col('signal', 0.8); g.beginPath(); g.arc(x, y, sr * 3, 0, TAU); g.fill();
}


// ================================================================== WINDOWS: a facade's windows swing open; pan down to the foundations
function windows(s: S) {
  const { t, sh, c, g } = s;
  const [l1, l2] = sh.lines as [Line, Line?];
  s.bg.glow = 0.45; s.bg.stars = 0.7; s.bg.grid = 0;
  const down = l2 ? prog(t, l2.start - 0.3, l2.start + 0.6, ease.inOutCubic) : 0;
  const GY = 880; // ground line (world)
  cam(s, { x: W / 2, y: lerp(H / 2 - 40, H / 2 + 520, down), z: 1, r: lerp(-0.008, 0.006, down) });
  // facade: 3 storeys x 5 bays
  const fx0 = 360, fx1 = W - 360, top = 140;
  c.fillStyle = col('ink2', 1); c.fillRect(fx0, top, fx1 - fx0, GY - top);
  c.strokeStyle = col('bone', 0.8); c.lineWidth = 5; c.strokeRect(fx0, top, fx1 - fx0, GY - top);
  const bays = 5, sto = 3, bw = (fx1 - fx0) / bays, shh = (GY - top) / sto;
  const ws1 = l1.words;
  for (let i = 0; i < bays; i++) for (let j = 0; j < sto; j++) {
    const id = i + j * bays;
    const w = ws1[Math.min(ws1.length - 1, Math.floor(hash(id, 4) * ws1.length))]!;
    const ok = prog(t, w.start - 0.05 + hash(id, 2) * 0.25, w.start + 0.4 + hash(id, 2) * 0.25, ease.outBack);
    const x = fx0 + i * bw + bw * 0.22, y = top + j * shh + shh * 0.2, ww = bw * 0.56, wh = shh * 0.6;
    c.fillStyle = col('acid', 0.15 + 0.75 * clamp(ok)); c.fillRect(x, y, ww, wh);
    if (ok > 0.05) { g.fillStyle = col('acid', 0.25 * clamp(ok)); g.fillRect(x - 6, y - 6, ww + 12, wh + 12); }
    // shutters swing out (perspective squeeze)
    const sw = (ww / 2) * Math.cos(clamp(ok, 0, 1.1) * Math.PI * 0.45);
    c.fillStyle = col('graphite', 1); c.strokeStyle = col('bone', 0.7); c.lineWidth = 2;
    c.fillRect(x - (ww / 2 - sw) * 0.3, y, sw, wh); c.strokeRect(x - (ww / 2 - sw) * 0.3, y, sw, wh);
    c.fillRect(x + ww - sw + (ww / 2 - sw) * 0.3, y, sw, wh); c.strokeRect(x + ww - sw + (ww / 2 - sw) * 0.3, y, sw, wh);
    // breathing air: curls out of open windows on "breathe"
    const br = findW(l1, /breathe/i);
    const bk = prog(t, br.start, br.start + 1.4, ease.outCubic);
    if (bk > 0 && hash(id, 8) < 0.6) {
      c.strokeStyle = col('signal', 0.6 * (1 - bk * 0.6)); c.lineWidth = 3; c.beginPath();
      for (let k = 0; k <= 20; k++) { const u = k / 20 * bk; const px = x + ww / 2 + u * 160 * (i < 2 ? -1 : 1), py = y + wh / 2 - u * 90 + Math.sin(u * 12 + t * 3) * 14; k ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.stroke();
    }
  }
  // ground and foundations below
  c.fillStyle = col('ink', 0.95); c.fillRect(-200, GY, W + 400, 1200);
  rule(c, -200, GY, W + 200, GY, 1, col('bone', 0.7), 4);
  if (l2) {
    const fnd = findW(l2, /foundation/i), und = last(l2.words);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) {
      const k = prog(t, fnd.start - 0.1 + (r * 9 + i) * 0.018, fnd.start + 0.25 + (r * 9 + i) * 0.018, ease.outExpo);
      if (k <= 0) continue;
      const bx = fx0 - 60 + i * ((fx1 - fx0 + 120) / 9) + (r % 2) * 40, by = GY + 20 + r * 92 + (1 - k) * 160;
      c.fillStyle = col('acid', 0.75 * k); c.fillRect(bx, by, (fx1 - fx0 + 120) / 9 - 10, 82);
    }
    const uk = prog(t, und.start - 0.05, und.start + 0.5, ease.outExpo);
    for (let i = 0; i < 12; i++) rule(c, fx0 + i * 110, GY + 400, fx0 + i * 110 + (i % 2 ? 40 : -40), GY + 400 + 160 * uk, 1, col('graphite', 1), 6);
  }
  // type in screen space
  screen(s);
  const a1 = until(t, l2);
  const [r1, r2] = split2(l1);
  band(c, 180, 280, 0.75 * a1); band(c, 920, 260, 0.75 * a1);
  row(s, r1, A(100, 900), 1400, 200, W / 2, 180, { alpha: a1 });
  row(s, r2, A(125, 900), 1300, 180, W / 2, 920, { alpha: a1 });
  if (!l2) return;
  const [q1, q2] = split2(l2);
  band(c, 180, 280, 0.75 * (1 - a1));
  row(s, q1, A(125, 900), 1500, 200, W / 2, 180);
  row(s, q2, A(100, 900), 1100, 170, W / 2, 400, { hot: 'signal' });
}

const RAW: Record<string, (s: S) => void> = {
  boot, windows, neural, wire, learn, prompt, zoom, edge, hook, earl, morph, tomorrow, city, flow, future, plan, unlock, skyline, chain, vote, frame, spark, finale, endcard,
};
export const EXTRA: Record<string, (s: S) => void> = Object.fromEntries(Object.entries(RAW).map(([k2, f]) => [k2, (s: S) => { PAPER = s.paper; f(s); }]));
