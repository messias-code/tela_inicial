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

/* ================= Draco Conhecendo o Alvo ================= */

const MODES = {
  'furtivo-rapido': '-sS -Pn -T3',
  'furtivo-lento': '-sS -Pn -T1',
  'agressivo-rapido': '-A -T4',
  'agressivo-lento': '-A -T2',
};

const MODE_HINTS = {
  'furtivo-rapido':
    'SYN scan discreto, sem descoberta prévia de host, em ritmo -T3. Equilíbrio entre discrição e tempo. Requer privilégios de root.',
  'furtivo-lento':
    'SYN scan em ritmo -T1: sondas espaçadas para escapar de limites de taxa e IDS por rajada. Bem lento. Requer root.',
  'agressivo-rapido':
    'Versão, SO, scripts padrão e traceroute (-A) em ritmo -T4. Completo, porém ruidoso e fácil de detectar.',
  'agressivo-lento':
    'A profundidade do -A em ritmo -T2 — resultados mais confiáveis em redes filtradas ou instáveis.',
};

const el = {
  form: document.getElementById('scan-form'),
  target: document.getElementById('scan-target'),
  modes: [...document.querySelectorAll('input[name="scan-mode"]')],
  modeHint: document.getElementById('scan-mode-hint'),
  command: document.getElementById('scan-command'),
  copy: document.getElementById('scan-copy'),
  output: document.getElementById('scan-output'),
};

function currentMode() {
  return el.modes.find((r) => r.checked)?.value || 'furtivo-rapido';
}

function buildCommand() {
  const target = (el.target.value || '').trim().split(/\s+/)[0] || '<alvo>';
  const line = `nmap ${MODES[currentMode()]} ${target}`.replace(/\s+/g, ' ').trim();
  el.command.textContent = line;
  el.modeHint.textContent = MODE_HINTS[currentMode()] || '';
  return line;
}

el.modes.forEach((r) => r.addEventListener('change', buildCommand));
el.target.addEventListener('input', buildCommand);
buildCommand();

el.copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(el.command.textContent);
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

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const line = buildCommand();
  const now = new Date().toLocaleTimeString('pt-BR');
  el.output.textContent =
    `[${now}] Comando preparado\n` +
    `  ${line}\n\n` +
    `O motor de execução (draco-engine) não está conectado nesta versão.\n` +
    `Conecte o serviço backend para executar a varredura e receber os\n` +
    `resultados em tempo real neste painel.`;
});
