// app.js — tela-título <-> telas internas, menu de jogo (teclado + mouse),
// roteamento por hash e o construtor de comando do Draco Scanner.

import { createScene } from './scene.js';

const scene = createScene(document.getElementById('scene'));
scene.start();

const title = document.getElementById('title');
const app = document.getElementById('app');
const menu = document.getElementById('menu');
const prompt = document.getElementById('prompt');
const logo = document.querySelector('.logo');
const items = [...menu.querySelectorAll('.menu-item')];

const ROUTES = { '#scan': 'scan', '#ajuda': 'ajuda' };
let sel = 0;
let awake = false;
let state = 'intro';

function setSel(i) {
  sel = (i + items.length) % items.length;
  items.forEach((el, n) => el.classList.toggle('is-sel', n === sel));
}

function glitchLogo() {
  logo.classList.remove('glitch');
  void logo.offsetWidth;
  logo.classList.add('glitch');
}

function awaken() {
  if (awake) return;
  awake = true;
  state = 'menu';
  prompt.hidden = true;
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.add('show'));
  scene.setPhase('menu');
  scene.awaken();
  glitchLogo();
  setSel(0);
}

function showTitle() {
  state = 'menu';
  awake = true;
  app.hidden = true;
  app.classList.remove('show');
  title.hidden = false;
  prompt.hidden = true;
  menu.hidden = false;
  menu.classList.add('show');
  scene.setPhase('menu');
  setSel(sel);
}

function showView(name) {
  state = name;
  title.hidden = true;
  app.hidden = false;
  requestAnimationFrame(() => app.classList.add('show'));
  for (const v of ['scan', 'ajuda']) {
    document.getElementById('view-' + v).hidden = v !== name;
  }
  document.querySelectorAll('[data-nav]').forEach((el) =>
    el.classList.toggle('is-active', el.dataset.nav === name),
  );
  scene.setPhase('sub');
  window.scrollTo(0, 0);
}

function route() {
  const r = ROUTES[location.hash];
  if (r) {
    awake = true;
    scene.flare();
    showView(r);
  } else {
    showTitle();
  }
}

function activate(n) {
  setSel(n);
  scene.flare();
  glitchLogo();
  const act = items[sel].dataset.act;
  setTimeout(() => {
    location.hash = act === 'scan' ? '#scan' : '#ajuda';
  }, 170);
}

// ---- interações da tela-título ----
title.addEventListener('click', (e) => {
  if (!awake) {
    awaken();
    return;
  }
  const it = e.target.closest('.menu-item');
  if (it) activate(items.indexOf(it));
});

window.addEventListener('keydown', (e) => {
  if (!awake) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      awaken();
    }
    return;
  }
  if (state !== 'menu') return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSel(sel + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSel(sel - 1);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    activate(sel);
  }
});

items.forEach((el, n) => {
  el.addEventListener('mouseenter', () => {
    if (state === 'menu') setSel(n);
  });
});

// ---- links internos ----
document.querySelectorAll('[data-link]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    const h = el.dataset.link;
    location.hash = h === '#/' ? '' : h;
  });
});

window.addEventListener('hashchange', route);

// ---- glitch periódico do logo enquanto a tela-título está visível ----
setInterval(() => {
  if (!title.hidden && Math.random() < 0.6) glitchLogo();
}, 5200);

// ---- boot ----
if (location.hash && ROUTES[location.hash]) {
  awake = true;
  scene.skipIntro();
  title.hidden = true;
  app.hidden = false;
  app.classList.add('show');
  showView(ROUTES[location.hash]);
}

/* ================= Draco Scanner ================= */

const PROFILES = {
  rapida: '-T4 -F',
  padrao: '-sV -T4',
  completa: '-p- -sV -O -T4',
  ping: '-sn',
  custom: '',
};

const Sc = {
  target: document.getElementById('scan-target'),
  profile: document.getElementById('scan-profile'),
  custom: document.getElementById('scan-custom'),
  customWrap: document.getElementById('scan-custom-wrap'),
  opts: [...document.querySelectorAll('.scan-opt')],
  cmd: document.getElementById('scan-cmd'),
  form: document.getElementById('scan-form'),
  out: document.getElementById('scan-out'),
};

function buildCmd() {
  const target = (Sc.target.value || 'alvo').trim().split(/\s+/)[0] || 'alvo';
  const parts = [];
  if (Sc.profile.value === 'custom') parts.push(Sc.custom.value.trim());
  else parts.push(PROFILES[Sc.profile.value] || '');
  for (const o of Sc.opts) if (o.checked) parts.push(o.value);
  const line = `nmap ${parts.filter(Boolean).join(' ')} ${target}`
    .replace(/\s+/g, ' ')
    .trim();
  Sc.cmd.textContent = line;
  return line;
}

Sc.customWrap.hidden = true;
Sc.profile.addEventListener('change', () => {
  Sc.customWrap.hidden = Sc.profile.value !== 'custom';
  buildCmd();
});
[Sc.target, Sc.custom, ...Sc.opts].forEach((el) =>
  el.addEventListener('input', buildCmd),
);
buildCmd();

Sc.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const line = buildCmd();
  const now = new Date().toLocaleTimeString('pt-BR');
  scene.flare();
  Sc.out.hidden = false;
  Sc.out.textContent =
    `[${now}] invocacao preparada\n` +
    `$ ${line}\n\n` +
    `[sistema] o dragao ainda dorme entre as estrelas.\n` +
    `          o motor de varredura (draco-engine) nao esta conectado.\n` +
    `          suba o servico em http://localhost:8787 para cacar de verdade\n` +
    `          e transmitir a saida aqui em tempo real.\n`;
  Sc.out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
