// dragon.js — CABECA DE DRAGAO desenhada em estrelas.
//
// A silhueta vem do icone "spiked-dragon-head" do conjunto game-icons
// (Lorc, CC BY 3.0 — https://game-icons.net). Rasterizamos o path num canvas
// 1000x1000, amostramos MUITOS pontos no contorno (+ alguns internos) e as
// particulas montam esse dragao. Por cima, algumas estrelas-ancora nas pontas
// dos espinhos, ligadas por linhas de constelacao.

export const DRACO = 1000;

const VB = 512; // viewBox do icone
const PATH =
  'M188.8 20.38c-5.3 26.85 4.6 55.74 34.1 86.52c11.2-7.29 31.6-10.94 50-8.16c-46-22.31-66.5-47.13-84.1-78.36' +
  'M29.19 26.62C43.56 73.08 81.09 128.8 129.6 168.3C93.51 166 49.93 153.1 18.76 143c24.96 35.2 64.17 52.9 103.34 66.3C97.13 227 66.99 245 18.66 248c54.64 19.2 107.54 8.9 131.34.7c-17.9 34.9-100.72 66.2-122.31 77c53.26 4.2 121.71-11 167.01-32.9c10 24.6-1.6 53.2-10.1 77.8c-1.9 4.5-3.8 8.9-5.7 13.3c5.1-3.5 10.1-7 14.9-10.6c23.6-16.2 47.8-31.9 59.5-58.8c26.1 31.2 62.7 62.1 107 85.4c17.4 22.1 28.3 49 34.2 73.8c8.3-19.1 13.8-40.2 9.7-60.3c24.5-3.6 35.6-29.7 35.5-54.4c-12.6 6.2-15.1 6.3-31.2 8.2c0-10.1.6-12.5-3-28.7c-10.3 8.4-21 11.2-30.8 11.8c2.1-7.6 3-19.5 3.7-27.3c-13 7.1-19.2 9.7-30.1 10.8c-.4-10.9-.1-20-4.1-30.4c-29.6 19-48.6 1.5-68-21.3c19.8-17 96.4-21.8 95.1 7.1c14-7.3 18.8-11.2 23.6-15.9c9.1 8.5 13.4 20.9 15.1 31.4c9.3-9.4 10.3-10.5 17.1-23.8c5.7 10.1 8.8 17 10.7 30.6c8.5-6.2 15.4-13.1 19.8-21.4c7.5 15.5 8.3 16 12.4 33c17.8-13.1 21.8-31.2 22.8-47.6c2-33-.3-108.2-31-142.9c1.7 36.3-13.1 70-33.8 80.7c-12.6 4.9-96.5-74.6-137.6-93.3c-23.5-10.2-48.1 7.1-67.8 9.3C147 106.2 83.57 70.94 29.19 26.62' +
  'M296.1 152.8c13.3 20.9 32.2 36.9 60.1 55c-19.4 2.9-65.8-6.7-77.7-24c-5.5-7.9 7.1-21.3 17.6-31' +
  'M180.6 319.1c-14.4 6.2-29.2 10.9-43.8 14.3c-2.4 3.6-4.6 7.1-6.7 10.5c14.8 5.3 31.5 7 44.1 2.8c3.3-9.8 5.5-19.3 6.4-27.6' +
  'M112.6 338.2l-10.2 1.5c-31.81 36.6-61.9 103.2-48.24 151.9h36.13c-11.12-37.7-16.53-87.1 22.31-153.4' +
  'M121.1 359.7c-5.9 11.4-10.4 22.1-13.8 32.1c12.9 6.7 29.1 8.9 44.8 8.2c4.6-10.5 9.8-21.8 14.6-33.3c-15.4 1.8-31.4-1.4-45.6-7' +
  'M232.5 366.3c-12 10.5-25.2 20.3-38.9 29.6c7 34 33.4 63.4 73.9 95.7h83.3c-57.2-31.8-94.6-73.3-118.3-125.3' +
  'M102.5 409.5c-2.5 11.8-3.3 22.7-3 32.9c37.3 14.2 62.5 13.5 97.5 4.1c-7.2-10.3-13-21-16.9-32.3c-32.7 9.4-55.4 5.7-77.6-4.7' +
  'M209.1 461.9c-38.1 10.9-68.8 13.2-107.5.3c1.8 10.4 4.5 20.1 7.5 29.4h130.1c-11.3-9.8-21.4-19.6-30.1-29.7';

// estrelas-ancora, um pouco FORA das pontas (o snap marcha para dentro ate a silhueta).
// coords do viewBox 512, lidas na grade de depuracao.
const NODES_VB = {
  snoutSpike: [472, 133, 0.88],
  snoutTip: [466, 220, 0.74],
  jawTip: [416, 348, 0.8],
  crestTop: [192, 16, 0.92],
  hornTip: [246, 52, 0.66],
  backA: [30, 128, 0.68],
  backB: [18, 162, 0.6],
  backC: [22, 250, 0.7],
  neckMid: [30, 356, 0.56],
  neckEnd: [42, 484, 0.62],
};
// sem linhas retas ligando pontas distantes (ficava com cara de "corta caminho").
// as estrelas ficam soltas nas pontas; o contorno pontilhado ja e a "linha".
const EDGES_KEYS = [];
// olho do dragao (centro do vazio do olho no viewBox) — recebe a estrela forte
const EYE_VB = [307, 182];

function paintDragon(g) {
  g.save();
  g.scale(DRACO / VB, DRACO / VB);
  g.fillStyle = '#fff';
  g.fill(new Path2D(PATH));
  g.restore();
}

export function buildDraco(step = 8) {
  const cv = document.createElement('canvas');
  cv.width = DRACO;
  cv.height = DRACO;
  const g = cv.getContext('2d', { willReadFrequently: true });
  paintDragon(g);
  const px = g.getImageData(0, 0, DRACO, DRACO).data;
  const A = (x, y) =>
    x < 0 || y < 0 || x >= DRACO || y >= DRACO
      ? 0
      : px[((y | 0) * DRACO + (x | 0)) * 4 + 3];

  // contorno (denso) + interior (esparso)
  const raw = [];
  const d = 5;
  for (let y = 2; y < DRACO; y += 2) {
    for (let x = 2; x < DRACO; x += 2) {
      if (A(x, y) < 128) continue;
      const edge =
        A(x + d, y) < 128 || A(x - d, y) < 128 ||
        A(x, y + d) < 128 || A(x, y - d) < 128;
      if (edge) raw.push({ x, y, mag: 0.4 + Math.random() * 0.3, edge: 1 });
      else if (x % 24 === 0 && y % 24 === 0)
        raw.push({ x, y, mag: 0.14 + Math.random() * 0.12, edge: 0 });
    }
  }

  // desbasta o contorno para ~step de espacamento
  const seen = new Set();
  const dust = [];
  for (const p of raw) {
    if (p.edge) {
      const k = `${Math.round(p.x / step)},${Math.round(p.y / step)}`;
      if (seen.has(k)) continue;
      seen.add(k);
    }
    dust.push(p);
  }

  // centroide da silhueta
  let sx = 0;
  let sy = 0;
  let sn = 0;
  for (let y = 0; y < DRACO; y += 3) {
    for (let x = 0; x < DRACO; x += 3) {
      if (A(x, y) >= 128) {
        sx += x;
        sy += y;
        sn++;
      }
    }
  }
  const ctX = sx / sn || 500;
  const ctY = sy / sn || 500;

  // ---- estrelas-ancora (pontas + olho) ----
  const kk = DRACO / VB;
  // na vizinhanca da ancora, pega o pixel opaco MAIS DISTANTE do centro = ponta do espinho
  const snap = (vx, vy) => {
    const x0 = vx * kk;
    const y0 = vy * kk;
    let best = null;
    let bestD = -1;
    for (let dy = -46; dy <= 46; dy += 2) {
      for (let dx = -46; dx <= 46; dx += 2) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (A(x, y) < 128) continue;
        const d = (x - ctX) * (x - ctX) + (y - ctY) * (y - ctY);
        if (d > bestD) {
          bestD = d;
          best = [x, y];
        }
      }
    }
    return best || [x0, y0];
  };

  const keys = Object.keys(NODES_VB);
  const idx = {};
  keys.forEach((key, i) => (idx[key] = i));
  const nodes = keys.map((key) => {
    const [x, y] = snap(NODES_VB[key][0], NODES_VB[key][1]);
    return { x, y, mag: NODES_VB[key][2] };
  });
  const eyeIdx = nodes.length;
  nodes.push({ x: EYE_VB[0] * kk, y: EYE_VB[1] * kk, mag: 1 });
  const edges = EDGES_KEYS.map(([a, b]) => [idx[a], idx[b]]);

  // recentraliza pela caixa da poeira
  const all = dust.concat(nodes);
  let minX = 1e9;
  let minY = 1e9;
  let maxX = -1e9;
  let maxY = -1e9;
  for (const p of dust) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const ox = 500 - (minX + maxX) / 2;
  const oy = 500 - (minY + maxY) / 2;
  for (const p of all) {
    p.x += ox;
    p.y += oy;
  }

  for (let i = dust.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [dust[i], dust[j]] = [dust[j], dust[i]];
  }

  return {
    nodes,
    edges,
    dust,
    eye: eyeIdx,
    w: maxX - minX,
    h: maxY - minY,
  };
}
