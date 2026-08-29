// scene.js — cena em canvas: campo de estrelas + constelacao Draco (cabeca do
// dragao) montada por particulas, com linhas de constelacao e glitch.
//
// Fases: 'title' (constelacao grande, centro) -> 'menu' (sobe um pouco) ->
// 'sub' (emblema pequeno no topo, telas internas).

import { buildDraco } from './dragon.js';

// paleta da identidade (laranja/terracota Claude Code)
const C_LINE = 'rgba(217,120,70,0.9)';
const C_NODE = '#ff9d5c';     // estrelas-ancora: laranja claro
const C_EYE = '#ff7a2f';      // olho: laranja forte
const C_EYE_HOT = '#ffab5e';  // olho pulsando
const C_DUST = '#c9683e';
const C_STAR = '#efe6d6';
const C_STAR_WARM = '#e0894f';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createScene(canvas) {
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  // ?still congela a cena (montada, sem glitch) — usado para screenshots
  const STILL = new URLSearchParams(location.search).has('still');
  const reduce = STILL || matchMedia('(prefers-reduced-motion: reduce)').matches;

  const D = buildDraco();
  const NODEN = D.nodes.length;
  const src = D.nodes.concat(D.dust);
  const N = src.length;
  const DW = Math.max(D.w, D.h);

  const tx = new Float32Array(N);
  const ty = new Float32Array(N);
  const cx = new Float32Array(N);
  const cy = new Float32Array(N);
  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const mag = new Float32Array(N);
  const dl = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    tx[i] = src[i].x;
    ty[i] = src[i].y;
    mag[i] = src[i].mag;
    dl[i] = Math.random() * 1.5;
  }

  let W = 0;
  let H = 0;
  let dpr = 1;
  let seeded = false;

  // campo de estrelas de fundo + poeira cosmica a deriva
  let field = [];
  let motes = [];
  function makeSky() {
    field = [];
    const n = Math.round((W * H) / 7000);
    for (let i = 0; i < n; i++) {
      field.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: 0.2 + Math.random() * 0.8,
        s: Math.random() < 0.12 ? 2 : 1,
        p: Math.random() * 7,
        warm: Math.random() < 0.3,
      });
    }
    motes = [];
    const m = Math.round((W * H) / 26000);
    for (let i = 0; i < m; i++) {
      motes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -(0.05 + Math.random() * 0.22),
        s: Math.random() < 0.3 ? 2 : 1,
        a: 0.15 + Math.random() * 0.3,
      });
    }
  }

  const layout = { x: 0, y: 0, s: 1 };
  const goal = { x: 0, y: 0, s: 1 };
  let phase = 'title';
  const t0 = performance.now();
  let last = t0;

  // glitch
  let glUntil = 0;
  let glNext = t0 + 3600;
  let glBands = [0, 0, 0, 0, 0, 0];
  let glChroma = 0;
  let flash = 0;
  function fireGlitch(strength, dur) {
    const now = performance.now();
    glUntil = now + dur;
    glChroma = strength;
    for (let i = 0; i < glBands.length; i++) {
      glBands[i] = (Math.random() - 0.5) * 2 * strength * (Math.random() < 0.5 ? 1 : 0.2);
    }
  }

  const ptr = { x: -9999, y: -9999, on: false };

  function computeGoal() {
    const m = Math.min(W, H);
    if (phase === 'sub') {
      goal.x = W < 680 ? 54 : 70;
      goal.y = 44;
      goal.s = (W < 680 ? 84 : 104) / DW;
    } else {
      goal.x = W / 2;
      goal.y = phase === 'menu' ? H * 0.27 : H * 0.31;
      goal.s = (m * (W < 680 ? 0.58 : 0.4)) / DW;
    }
  }

  const hx = (i) => layout.x + (tx[i] - 500) * layout.s;
  const hy = (i) => layout.y + (ty[i] - 500) * layout.s;

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = (W * dpr) | 0;
    canvas.height = (H * dpr) | 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeSky();
    computeGoal();
    if (!seeded) {
      seeded = true;
      layout.x = goal.x;
      layout.y = goal.y;
      layout.s = goal.s;
      for (let i = 0; i < N; i++) {
        if (reduce) {
          cx[i] = hx(i);
          cy[i] = hy(i);
        } else {
          const a = Math.random() * 7;
          const r = Math.max(W, H) * (0.45 + Math.random() * 0.55);
          cx[i] = W / 2 + Math.cos(a) * r;
          cy[i] = H / 2 + Math.sin(a) * r;
          vx[i] = -Math.sin(a) * 1.6;
          vy[i] = Math.cos(a) * 1.6;
        }
      }
    }
  }

  function offAt(y, now) {
    if (now > glUntil) return 0;
    const b = ((y / H) * glBands.length) | 0;
    return glBands[clamp(b, 0, glBands.length - 1)];
  }

  function frame(now) {
    const dt = Math.min(2.5, (now - last) / 16.667) || 1;
    last = now;
    const T = (now - t0) / 1000;

    // tocha / nebula -> variavel CSS
    const fl =
      0.72 +
      0.13 * Math.sin(T * 7.3) +
      0.09 * Math.sin(T * 17.1) +
      0.05 * Math.sin(T * 2.7);
    root.style.setProperty('--flick', (reduce ? 0.8 : fl).toFixed(3));

    const k = reduce ? 1 : 1 - Math.pow(0.86, dt);
    layout.x += (goal.x - layout.x) * k;
    layout.y += (goal.y - layout.y) * k;
    layout.s += (goal.s - layout.s) * k;

    // agenda glitch
    if (!reduce && now > glNext) {
      glNext = now + 2600 + Math.random() * 4200;
      fireGlitch(6 + Math.random() * 14, 90 + Math.random() * 130);
    }
    const glitching = now < glUntil;

    const breath =
      phase === 'sub' || reduce ? 1 : 1 + 0.018 * Math.sin(T * 1.7);
    const sc = layout.s * breath;

    ctx.clearRect(0, 0, W, H);

    // ---- campo de estrelas ----
    const par = phase === 'title' || !ptr.on ? 0 : (ptr.x - W / 2) * 0.004;
    for (const st of field) {
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(T * (0.7 + st.z) + st.p));
      ctx.globalAlpha = tw * (0.3 + st.z * 0.6);
      ctx.fillStyle = st.warm ? C_STAR_WARM : C_STAR;
      ctx.fillRect((st.x + par * st.z) | 0, st.y | 0, st.s, st.s);
    }

    // ---- poeira a deriva ----
    for (const mo of motes) {
      mo.x += mo.vx * dt;
      mo.y += mo.vy * dt;
      if (mo.y < -6) {
        mo.y = H + 6;
        mo.x = Math.random() * W;
      }
      ctx.globalAlpha = mo.a;
      ctx.fillStyle = C_DUST;
      ctx.fillRect(mo.x | 0, mo.y | 0, mo.s, mo.s);
    }
    ctx.globalAlpha = 1;

    // ---- integra particulas da constelacao ----
    const assemble =
      phase === 'title' && !reduce ? clamp(T * 0.55 - 0.2, 0, 1) : 1;
    for (let i = 0; i < N; i++) {
      const ap =
        phase === 'title' && !reduce ? clamp(T * 0.9 - dl[i], 0, 1) : 1;
      const HX = layout.x + (tx[i] - 500) * sc;
      const HY = layout.y + (ty[i] - 500) * sc;
      let ax = (HX - cx[i]) * 0.02 * (0.15 + ap);
      let ay = (HY - cy[i]) * 0.02 * (0.15 + ap);
      if (ptr.on && phase !== 'sub') {
        const rx = cx[i] - ptr.x;
        const ry = cy[i] - ptr.y;
        const d2 = rx * rx + ry * ry;
        if (d2 < 11000) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / 105) * 3;
          ax += (rx / d) * f;
          ay += (ry / d) * f;
        }
      }
      ax += (Math.random() - 0.5) * 0.1;
      ay += (Math.random() - 0.5) * 0.1;
      vx[i] = (vx[i] + ax * dt) * 0.85;
      vy[i] = (vy[i] + ay * dt) * 0.85;
      cx[i] += vx[i] * dt;
      cy[i] += vy[i] * dt;
    }

    // ---- linhas da constelacao (contorno em destaque) ----
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1.4, sc * 2.3);
    ctx.lineCap = 'round';
    ctx.strokeStyle = C_LINE;
    for (let e = 0; e < D.edges.length; e++) {
      let [a, b] = D.edges[e];
      // glitch: as vezes religa numa estrela errada
      if (glitching && Math.random() < 0.12) b = (Math.random() * NODEN) | 0;
      const oa = glitching ? offAt(cy[a], now) : 0;
      const ob = glitching ? offAt(cy[b], now) : 0;
      ctx.globalAlpha =
        (0.2 + 0.1 * Math.sin(T * 3 + e)) * assemble * (glitching ? 1.7 : 1);
      ctx.beginPath();
      ctx.moveTo(cx[a] + oa, cy[a]);
      ctx.lineTo(cx[b] + ob, cy[b]);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // ---- estrelas da constelacao ----
    const eyeHot = Math.sin(T * 3.1) > 0.55 || Math.sin(T * 13) > 0.9;
    paintNodes(now, T, sc, 0, null, glitching, eyeHot);

    // aberracao cromatica durante o glitch
    if (glitching) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.55;
      paintNodes(now, T, sc, glChroma * 0.5, '#ff2d2d', glitching, eyeHot);
      paintNodes(now, T, sc, -glChroma * 0.5, '#22e6ff', glitching, eyeHot);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    // ---- flash de transicao ----
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.6;
      ctx.fillStyle = '#ffe6c4';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      flash = Math.max(0, flash - 0.03 * dt);
    }

    requestAnimationFrame(frame);
  }

  function paintNodes(now, T, sc, dx, tint, glitching, eyeHot) {
    for (let i = 0; i < N; i++) {
      const isNode = i < NODEN;
      const ox = glitching ? offAt(cy[i], now) + dx : dx;
      let size = (isNode ? 1.6 + mag[i] * 2.4 : 1 + mag[i] * 1.5) * clamp(sc * 2.4, 0.55, 2.4);
      if (i === D.eye) size = (3.4 + (eyeHot ? 1.6 : 0)) * clamp(sc * 2.4, 0.7, 2.6);
      let col;
      if (tint) {
        col = tint;
      } else if (i === D.eye) {
        col = eyeHot ? C_EYE_HOT : C_EYE;
      } else if (isNode) {
        col = C_NODE;
      } else {
        col = C_DUST;
      }
      const s = Math.max(1, Math.ceil(size));
      ctx.fillStyle = col;
      ctx.globalAlpha = tint ? 0.55 : isNode ? 0.95 : 0.6;
      ctx.fillRect(Math.round(cx[i] + ox - s / 2), Math.round(cy[i] - s / 2), s, s);
    }
    // brilho do olho (laranja)
    if (!tint) {
      ctx.globalAlpha = (eyeHot ? 0.32 : 0.16) * (glitching ? 1.4 : 1);
      ctx.fillStyle = C_EYE_HOT;
      const bs = Math.max(4, 13 * sc * 2.4);
      ctx.fillRect(cx[D.eye] - bs / 2 + dx, cy[D.eye] - bs / 2, bs, bs);
    }
    ctx.globalAlpha = 1;
  }

  window.addEventListener('pointermove', (e) => {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    ptr.on = true;
  });
  window.addEventListener('pointerleave', () => {
    ptr.on = false;
  });
  window.addEventListener('resize', resize);

  return {
    start() {
      resize();
      requestAnimationFrame(frame);
    },
    setPhase(p) {
      if (p === phase) return;
      phase = p;
      computeGoal();
      if (reduce) {
        layout.x = goal.x;
        layout.y = goal.y;
        layout.s = goal.s;
      }
    },
    // sopro ao "despertar": glitch forte + flash
    awaken() {
      if (reduce) return;
      fireGlitch(26, 320);
      flash = 0.5;
    },
    // glitch de transicao entre telas
    flare() {
      if (reduce) return;
      fireGlitch(34, 260);
      flash = 0.7;
    },
    // carrega direto numa sub-tela (sem intro)
    skipIntro() {
      phase = 'sub';
      computeGoal();
      layout.x = goal.x;
      layout.y = goal.y;
      layout.s = goal.s;
      for (let i = 0; i < N; i++) {
        cx[i] = hx(i);
        cy[i] = hy(i);
        dl[i] = 0;
      }
    },
  };
}
