// genius-design-system 3.0.0-alpha.3 · arquivo gerado por src/build.mjs a partir de js/genius.js, não editar à mão
// genius-design-system · realce opcional das peças
// Módulo ES sem dependência. Sem ele toda peça funciona e nada fica escondido; com ele, iniciar()
// liga o que achar por atributo:
// * [data-gx-abas]: abas com button.gx-aba[aria-selected]; cada aba aponta o painel pelo
//   aria-controls, e o painel leva [data-gx-painel]. Posiciona o pino (--gx-pino-x e --gx-pino-w no
//   grupo, mais o atributo data-gx-pino), troca o painel por hidden e move o foco com as setas,
//   Home e End;
// * [data-gx-toca]: põe .gx-tocando uma vez quando a peça entra na tela, e de novo quando um
//   [data-gx-repete] dentro dela é clicado;
// * [data-gx-conta]: conta de zero até o número do texto na duração --d-4, e garante o valor
//   final por temporizador mesmo se o quadro de animação não rodar; com nenhuma contagem rodando
//   o número final é relido do texto, durante uma contagem vale o guardado, e a contagem que
//   recomeça cancela a que estava rodando;
// * [data-gx-copia]: o valor é o seletor do alvo; copia o texto dele e diz o resultado no botão.
//   Sem alvo, com alvo vazio ou com seletor inválido, não escreve na área de transferência e diz
//   a falha.
// Com prefers-reduced-motion, nada dispara sozinho. Nada aqui toca no DOM na carga do módulo.

// A próxima aba dada a tecla, ou null quando a tecla não é das abas.
export function proximaAba(atual, total, tecla) {
  if (!(total > 0)) return null;
  if (tecla === 'ArrowRight') return (atual + 1) % total;
  if (tecla === 'ArrowLeft') return (atual - 1 + total) % total;
  if (tecla === 'Home') return 0;
  if (tecla === 'End') return total - 1;
  return null;
}

// O valor da contagem dado o progresso (0 a 1): sai rápido e assenta devagar.
export function valorDaContagem(alvo, progresso) {
  const p = Math.min(1, Math.max(0, Number(progresso) || 0));
  return Math.round(alvo * (1 - (1 - p) ** 3));
}

// Milissegundos de um valor de duração (o que getPropertyValue devolve de um token), ou 0.
export function lerDuracao(texto) {
  const m = /^\s*(\d*\.?\d+)(ms|s)\s*$/.exec(String(texto ?? ''));
  if (!m) return 0;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}

// O número que a contagem alcança: só inteiro escrito com algarismos, ou null.
export function numeroDoTexto(texto) {
  const t = String(texto ?? '').trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

const reduzido = () => typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

// A duração de um token lida no elemento, em ms; 0 quando os tokens não estão na página.
function duracao(el, token) {
  if (typeof globalThis.getComputedStyle !== 'function') return 0;
  return lerDuracao(globalThis.getComputedStyle(el).getPropertyValue(token));
}

function ligarAbas(grupo) {
  const abas = [...grupo.querySelectorAll('.gx-aba')];
  const painel = (aba) => {
    const id = aba.getAttribute('aria-controls');
    const alvo = id && grupo.ownerDocument ? grupo.ownerDocument.getElementById(id) : null;
    return alvo && alvo.hasAttribute('data-gx-painel') ? alvo : null;
  };
  const posicionar = (aba) => {
    if (!aba) return;
    grupo.style.setProperty('--gx-pino-x', `${aba.offsetLeft}px`);
    grupo.style.setProperty('--gx-pino-w', `${aba.offsetWidth}px`);
    grupo.setAttribute('data-gx-pino', '');
  };
  const selecionar = (i, focar) => {
    abas.forEach((aba, j) => {
      aba.setAttribute('aria-selected', String(j === i));
      aba.tabIndex = j === i ? 0 : -1;
      const p = painel(aba);
      if (p) p.hidden = j !== i;
    });
    posicionar(abas[i]);
    if (focar && typeof abas[i].focus === 'function') abas[i].focus();
  };
  const atual = () => Math.max(0, abas.findIndex((a) => a.getAttribute('aria-selected') === 'true'));
  abas.forEach((aba, i) => {
    aba.addEventListener('click', () => selecionar(i, false));
    aba.addEventListener('keydown', (evento) => {
      const proxima = proximaAba(i, abas.length, evento.key);
      if (proxima === null) return;
      evento.preventDefault();
      selecionar(proxima, true);
    });
  });
  if (abas.length) selecionar(atual(), false);
  if (typeof globalThis.addEventListener === 'function') globalThis.addEventListener('resize', () => posicionar(abas[atual()]));
}

// O texto final de cada contagem. Com nenhuma contagem rodando, a peça relê o texto, então a
// página que troca o número vê o número novo; durante uma contagem vale o guardado, porque o texto
// da tela é o número do meio e não o final.
const finais = new WeakMap();
// Como parar a contagem que está rodando em cada elemento.
const rodando = new WeakMap();

function contar(el) {
  if (!rodando.has(el)) finais.set(el, el.textContent);
  const final = finais.get(el);
  const alvo = numeroDoTexto(final);
  if (alvo === null || reduzido()) return;
  const total = duracao(el, '--d-4');
  if (!total) return;
  rodando.get(el)?.();
  let acabou = false;
  let quadro = null;
  const parar = () => {
    acabou = true;
    clearTimeout(temporizador);
    if (quadro !== null && typeof globalThis.cancelAnimationFrame === 'function') globalThis.cancelAnimationFrame(quadro);
    if (rodando.get(el) === parar) rodando.delete(el);
  };
  const temporizador = setTimeout(() => {
    parar();
    el.textContent = final;
  }, total);
  rodando.set(el, parar);
  if (typeof globalThis.requestAnimationFrame !== 'function' || typeof globalThis.performance === 'undefined') return;
  const inicio = globalThis.performance.now();
  const passo = (agora) => {
    if (acabou) return;
    el.textContent = String(valorDaContagem(alvo, (agora - inicio) / total));
    quadro = globalThis.requestAnimationFrame(passo);
  };
  quadro = globalThis.requestAnimationFrame(passo);
}

function tocar(el) {
  el.classList.remove('gx-tocando');
  void el.offsetWidth;
  el.classList.add('gx-tocando');
  for (const n of el.querySelectorAll('[data-gx-conta]')) contar(n);
}

function ligarCopia(botao, raiz) {
  const rotulo = botao.textContent;
  botao.addEventListener('click', async () => {
    const seletor = botao.getAttribute('data-gx-copia');
    // Seletor inválido estoura no querySelector; vale como alvo ausente.
    let alvo = null;
    try {
      alvo = seletor ? raiz.querySelector(seletor) : null;
    } catch {
      alvo = null;
    }
    const texto = alvo ? String(alvo.textContent ?? '').trim() : '';
    // Sem alvo ou sem texto, nada se escreve: o que a pessoa tinha copiado continua lá.
    let ok = false;
    if (texto) {
      try {
        await globalThis.navigator.clipboard.writeText(texto);
        ok = true;
      } catch {
        ok = false;
      }
    }
    botao.textContent = ok ? 'Copiado' : 'Não deu para copiar';
    const espera = duracao(botao, '--d-5') * 2;
    if (espera) setTimeout(() => { botao.textContent = rotulo; }, espera);
  });
}

// Liga o que achar sob a raiz. Devolve quantos de cada tipo foram ligados.
export function iniciar(raiz = globalThis.document) {
  const abas = [...raiz.querySelectorAll('[data-gx-abas]')];
  const tocas = [...raiz.querySelectorAll('[data-gx-toca]')];
  const contas = [...raiz.querySelectorAll('[data-gx-conta]')];
  const copias = [...raiz.querySelectorAll('[data-gx-copia]')];

  abas.forEach(ligarAbas);
  for (const el of tocas) {
    for (const b of el.querySelectorAll('[data-gx-repete]')) b.addEventListener('click', () => tocar(el));
  }
  copias.forEach((b) => ligarCopia(b, raiz));

  const soltas = contas.filter((n) => !n.closest('[data-gx-toca]'));
  if (!reduzido() && typeof globalThis.IntersectionObserver === 'function') {
    const observador = new globalThis.IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        observador.unobserve(e.target);
        if (e.target.hasAttribute('data-gx-toca')) tocar(e.target);
        else contar(e.target);
      }
    }, { threshold: 0.3 });
    for (const el of [...tocas, ...soltas]) observador.observe(el);
  }
  return { abas: abas.length, toca: tocas.length, conta: contas.length, copia: copias.length };
}
