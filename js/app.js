// app.js — roteamento por hash + construtor de comando do Draco Scanner.

import { initParticles } from './particles.js';

initParticles(document.getElementById('bg'));

/* ============================ roteamento ============================ */

const VIEWS = ['home', 'scanner', 'docs'];
const VIEW_BY_HASH = {
  '': 'home',
  '#/': 'home',
  '#/ferramentas': 'home',
  '#/scanner': 'scanner',
  '#/docs': 'docs',
};
const NAV_BY_HASH = {
  '': 'home',
  '#/': 'home',
  '#/ferramentas': 'ferramentas',
  '#/scanner': 'ferramentas',
  '#/docs': 'docs',
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function render() {
  const hash = location.hash;
  const view = VIEW_BY_HASH[hash] || 'home';
  const nav = NAV_BY_HASH[hash] || 'home';

  for (const v of VIEWS) {
    document.querySelector(`[data-view="${v}"]`).hidden = v !== view;
  }
  document.body.classList.toggle('view-scanner', view === 'scanner');
  document.querySelectorAll('.site-nav a').forEach((a) => {
    if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title =
    view === 'home'
      ? 'Draco Workstation'
      : `${view === 'scanner' ? 'Draco Conhecendo o Alvo' : 'Documentação'} — Draco Workstation`;

  if (hash === '#/ferramentas') {
    scrollToTools();
    // o layout ainda pode mudar (fontes, imagens); reposiciona algumas vezes
    requestAnimationFrame(scrollToTools);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scrollToTools);
    setTimeout(scrollToTools, 250);
    setTimeout(scrollToTools, 700);
  } else {
    window.scrollTo(0, 0);
  }
}

function scrollToTools() {
  document.getElementById('ferramentas')?.scrollIntoView({
    block: 'start',
    behavior: reduceMotion ? 'auto' : 'smooth',
  });
}

window.addEventListener('hashchange', render);

// clicar "Ferramentas" já estando na seção: rola de novo (hashchange não dispara)
document.querySelector('[data-nav="ferramentas"]')?.addEventListener('click', () => {
  if (location.hash === '#/ferramentas') scrollToTools();
});

render();

/* ======================= Draco Scanner ======================= */

const PROFILE_HINTS = {
  furtivo:
    'Furtivo: SYN scan, sem descoberta de host, versão leve e só scripts NSE seguros. Sem SO, sem UDP, sem nikto/gobuster — menor pegada.',
  agressivo:
    'Agressivo: varredura completa (-p-), SO, UDP, NSE discovery+vuln e a cadeia externa (nikto, gobuster, sslscan, nxc, vulners). Ruidoso e completo.',
};
const PACE_HINTS = {
  rapido: 'Ritmo rápido: -T3/-T4, wordlist curta, limites de tempo menores.',
  lento: 'Ritmo lento: -T1/-T2, fragmentação no furtivo, wordlist grande, mais confiável em redes filtradas.',
};

const el = {
  form: document.getElementById('scan-form'),
  target: document.getElementById('scan-target'),
  profile: [...document.querySelectorAll('input[name="scan-profile"]')],
  pace: [...document.querySelectorAll('input[name="scan-pace"]')],
  modeHint: document.getElementById('scan-mode-hint'),
  plan: document.getElementById('scan-plan'),
  copy: document.getElementById('scan-copy'),
  output: document.getElementById('scan-output'),
};

const currentProfile = () => el.profile.find((r) => r.checked)?.value || 'furtivo';
const currentPace = () => el.pace.find((r) => r.checked)?.value || 'rapido';
const currentTarget = () => (el.target.value || '').trim().split(/\s+/)[0] || 'scanme.nmap.org';

let planSteps = [];

async function renderPlan() {
  const profile = currentProfile();
  const pace = currentPace();
  el.modeHint.textContent = `${PROFILE_HINTS[profile]} ${PACE_HINTS[pace]}`;

  const q = new URLSearchParams({ profile, pace, target: currentTarget() });
  try {
    const r = await fetch(`/api/plan?${q}`, { cache: 'no-store' });
    if (!r.ok) throw new Error();
    planSteps = (await r.json()).steps || [];
  } catch {
    el.plan.innerHTML = '<li>motor fora do ar — inicie <code>python3 draco-engine.py</code></li>';
    planSteps = [];
    return;
  }
  el.plan.innerHTML = planSteps
    .map((s) => `<li><b>${escapeHtml(s.title)}</b><br><span>${escapeHtml(s.detail)}</span></li>`)
    .join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

let planTimer;
[...el.profile, ...el.pace].forEach((r) => r.addEventListener('change', renderPlan));
el.target.addEventListener('input', () => {
  clearTimeout(planTimer);
  planTimer = setTimeout(renderPlan, 350);
});
renderPlan();

el.copy.addEventListener('click', async () => {
  const text =
    `Draco Scanner — ${currentProfile()} · ${currentPace()} — alvo ${currentTarget()}\n\n` +
    planSteps.map((s) => `${s.n}. ${s.title}\n   ${s.detail}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    const label = el.copy.textContent;
    el.copy.textContent = 'Copiado';
    el.copy.disabled = true;
    setTimeout(() => {
      el.copy.textContent = label;
      el.copy.disabled = false;
    }, 1400);
  } catch {
    /* clipboard indisponível — ignora */
  }
});

/* -------- motor de execução (draco-engine) -------- */

const notice = document.querySelector('.scan-top .notice');
const runBtn = el.form.querySelector('button[type="submit"]');
const runLabel = runBtn.textContent;
let engineOnline = false;
let scanning = false;
let abort = null;

async function checkEngine() {
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    const info = await r.json();
    engineOnline = info.ok === true;
    if (!engineOnline) return;

    if (!info.nmap) {
      notice.innerHTML =
        '<strong>nmap não encontrado</strong> — o motor está no ar, mas falta o binário: <code>apt install nmap</code>.';
      return;
    }
    const missing = Object.entries(info.tools || {})
      .filter(([, ok]) => !ok)
      .map(([t]) => t);
    let msg =
      '<strong>Motor conectado</strong> — pipeline no <code>draco-engine</code>' +
      (info.root ? ' (root).' : ', <em>sem root</em>: SYN scan cai para <code>-sT</code> e sem <code>-O</code>.');
    if (missing.length) msg += ` Ferramentas ausentes: <code>${missing.join(', ')}</code>.`;
    notice.innerHTML = msg;
  } catch {
    engineOnline = false;
  }
}
checkEngine();

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const now = new Date().toLocaleTimeString('pt-BR');

  if (scanning) {
    abort?.abort();
    return;
  }
  if (!engineOnline) {
    el.output.textContent =
      `O motor de execução (draco-engine) não está no ar.\n\n` +
      `Inicie com:  python3 draco-engine.py   (pede a senha do sudo)\n` +
      `Sem elevar:  python3 draco-engine.py --no-root`;
    return;
  }

  scanning = true;
  abort = new AbortController();
  runBtn.textContent = 'Interromper';
  el.output.textContent = `[${now}] Iniciando pipeline…\n\n`;

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: currentTarget(),
        profile: currentProfile(),
        pace: currentPace(),
      }),
      signal: abort.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      el.output.textContent += `\n[erro ${res.status}] ${err.error || 'falha na varredura'}\n`;
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      el.output.textContent += dec.decode(value, { stream: true });
      el.output.scrollTop = el.output.scrollHeight;
    }
  } catch (err) {
    if (err.name === 'AbortError') el.output.textContent += '\n[varredura interrompida]\n';
    else el.output.textContent += `\n[erro] ${err.message}\n`;
  } finally {
    scanning = false;
    abort = null;
    runBtn.textContent = runLabel;
    el.output.scrollTop = el.output.scrollHeight;
  }
});
