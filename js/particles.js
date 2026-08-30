// particles.js — fundo ambiente: pontos que se movem o tempo todo (sem formar
// imagem) e reagem a movimento do mouse, cliques e digitacao. Discreto.

const WARM = '#d97757';
const COOL = '#7c7c86';

export function initParticles(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let pts = [];
  let energy = 0; // sobe brevemente ao digitar
  const pointer = { x: -999, y: -999, active: false };
  const ripples = []; // ondas de clique/tecla: { x, y, t }

  function makePoint() {
    const ang = Math.random() * Math.PI * 2;
    const sp = 0.06 + Math.random() * 0.16;
    const r = Math.random();
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      size: r < 0.12 ? 3 : r < 0.4 ? 2 : 1,
      alpha: 0.16 + Math.random() * 0.32,
      warm: Math.random() < 0.34,
    };
  }

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.max(40, Math.round((W * H) / 11000));
    pts = Array.from({ length: target }, makePoint);
  }

  function addRipple(x, y, t0) {
    ripples.push({ x, y, t: t0 || 0 });
    if (ripples.length > 12) ripples.shift();
  }

  function step() {
    ctx.clearRect(0, 0, W, H);

    energy *= 0.93;
    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].t += 0.02;
      if (ripples[i].t >= 1) ripples.splice(i, 1);
    }

    const cap = 0.8 + energy * 2.4;
    for (const p of pts) {
      const wob = 0.005 * (1 + energy * 4);
      p.vx += (Math.random() - 0.5) * wob;
      p.vy += (Math.random() - 0.5) * wob;

      // afasta do ponteiro
      if (pointer.active) {
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        const R = 120;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R) * 0.14;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }

      // empurrao das ondas (clique / tecla)
      for (const rp of ripples) {
        const radius = rp.t * 280;
        const dx = p.x - rp.x;
        const dy = p.y - rp.y;
        const d = Math.hypot(dx, dy) || 1;
        if (Math.abs(d - radius) < 46) {
          const f = (1 - rp.t) * 0.5;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }
      }

      p.vx *= 0.955;
      p.vy *= 0.955;
      p.vx = Math.max(-cap, Math.min(cap, p.vx));
      p.vy = Math.max(-cap, Math.min(cap, p.vy));
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -12) p.x = W + 12;
      else if (p.x > W + 12) p.x = -12;
      if (p.y < -12) p.y = H + 12;
      else if (p.y > H + 12) p.y = -12;

      ctx.globalAlpha = Math.min(0.7, p.alpha * (0.8 + energy * 0.9));
      ctx.fillStyle = p.warm ? WARM : COOL;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    for (const p of pts) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.warm ? WARM : COOL;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    step();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  });
  window.addEventListener('pointerleave', () => {
    pointer.active = false;
  });
  window.addEventListener('pointerdown', (e) => addRipple(e.clientX, e.clientY, 0));
  window.addEventListener('keydown', (e) => {
    if (
      e.key.length === 1 ||
      e.key === 'Backspace' ||
      e.key === 'Enter' ||
      e.key === ' '
    ) {
      energy = Math.min(1, energy + 0.2);
      const el = document.activeElement;
      const r = el && el.getBoundingClientRect && el.getBoundingClientRect();
      if (r && r.width) {
        addRipple(
          r.left + Math.min(r.width - 6, 24 + Math.random() * r.width * 0.5),
          r.top + r.height / 2,
          0.25,
        );
      }
    }
  });

  resize();
  if (reduce) drawStatic();
  else requestAnimationFrame(loop);
}
