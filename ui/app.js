"use strict";

// Dentro do Tauri, conversa com o Rust. Aberto direto no navegador (pra mexer no
// visual), usa uma imitação em memória com os mesmos comandos.
const tauri = window.__TAURI__;
const invoke = tauri?.core.invoke ?? imitacaoDoBackend();

const CORES = ["#ff8c32", "#5fae4c", "#4f8fdc", "#c060b0", "#e6463c", "#20a8a8"];
const FRASES = [
  "Bora, bora! Tô de olho no relógio.",
  "Ciscando produtividade...",
  "Foco no milho!",
  "Tá indo bem, hein!",
  "Uma bicadinha de cada vez.",
];
const ESQUECIDO_MS = 3 * 3600 * 1000; // mesmo limite do aviso no Rust
const SEM_PROJETO = "Sem projeto";

let estado = { registros: [], projetos: [] };
let comemorandoAte = 0;
let confirmarApagar = null;
let criandoProjeto = false;
let editando = null; // índice do registro aberto pra edição
let editandoInicio = false; // ajustando o "desde" da tarefa rodando
let periodo = "hoje";
let ausencia = null; // { desde, minutos } enquanto o diálogo de "você voltou" está aberto
let conquistasFeitas = null; // ids já desbloqueados, pra comemorar só as novas
let acessorio = lerPreferencia("acessorio");

const ACESSORIOS = { chapeu: "chapéu de festa", oculos: "óculos escuros", laco: "laço", coroa: "coroa" };

const $ = (id) => document.getElementById(id);

// ---------- Estado e ações ----------

/// Recebe um estado novo (de um comando ou do evento vindo da bandeja/atalho).
function aplicar(novo) {
  const rodavaAntes = !!emAndamento();
  estado = novo;
  if (rodavaAntes && !emAndamento()) {
    comemorandoAte = Date.now() + 3000;
    setTimeout(renderMascote, 3000);
  }
  anunciarConquistasNovas();
  render();
}

function anunciarConquistasNovas() {
  const feitas = conquistas().filter((c) => c.ok);
  const novas = conquistasFeitas ? feitas.filter((c) => !conquistasFeitas.has(c.id)) : [];
  conquistasFeitas = new Set(feitas.map((c) => c.id));
  if (!novas.length) return;
  const c = novas[0];
  avisar(`🏆 Conquista: ${c.nome}!` + (c.acessorio ? ` 🎁 Liberou: ${ACESSORIOS[c.acessorio]}.` : ""));
  comemorandoAte = Date.now() + 3000;
  setTimeout(renderMascote, 3000);
}

async function chamar(comando, args) {
  try {
    aplicar(await invoke(comando, args));
    return true;
  } catch (erro) {
    avisar(String(erro));
    return false;
  }
}

async function comecar(projeto = null) {
  const tarefa = $("campo-tarefa").value;
  if (await chamar("comecar", { tarefa, projeto }) && emAndamento()) {
    $("campo-tarefa").value = "";
  }
}

$("form-nova").addEventListener("submit", (e) => {
  e.preventDefault();
  comecar();
});

$("botao-terminar").addEventListener("click", () => chamar("terminar"));

$("botao-csv").addEventListener("click", async () => {
  try {
    avisar(`Exportado em ${await invoke("exportar_csv")}`);
  } catch (erro) {
    avisar(String(erro));
  }
});

$("mascote").addEventListener("click", () => {
  const m = $("mascote");
  m.classList.remove("cutucado");
  void m.offsetWidth; // reinicia a animação
  m.classList.add("cutucado");
  $("fala").textContent = "Có!";
  setTimeout(atualizarFala, 1200);
});

$("rodando-desde").addEventListener("click", () => {
  editandoInicio = true;
  renderTarefa();
});

$("abas-resumo").addEventListener("click", (e) => {
  const aba = e.target.closest("[data-periodo]");
  if (!aba) return;
  periodo = aba.dataset.periodo;
  renderResumo();
});

$("ausencia-continuar").addEventListener("click", () => resolverAusencia(true));
$("ausencia-terminar").addEventListener("click", () => resolverAusencia(false));
$("ausencia-manter").addEventListener("click", () => resolverAusencia(null));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && ausencia) resolverAusencia(null);
});

if (tauri) {
  tauri.event.listen("estado", (e) => aplicar(e.payload));
  tauri.event.listen("ausencia", (e) => mostrarAusencia(e.payload));
  tauri.event.listen("aviso", (e) => avisar(String(e.payload)));
  tauri.event.listen("focar-campo", () => $("campo-tarefa").focus());
}

// ---------- Desenho ----------

function render() {
  renderMascote();
  renderNinho();
  renderTarefa();
  renderProjetos();
  renderResumo();
  renderConquistas();
  renderHistorico();
}

function emAndamento() {
  return estado.registros.find((r) => !r.fim);
}

function esquecido() {
  const r = emAndamento();
  return !!r && duracao(r) >= ESQUECIDO_MS;
}

function humor() {
  if (Date.now() < comemorandoAte) return "comemorando";
  return emAndamento() ? "trabalhando" : "dormindo";
}

function renderMascote() {
  const m = $("mascote");
  m.classList.remove("dormindo", "trabalhando", "comemorando");
  m.classList.add(humor());
  // Só veste o que ainda está liberado (registros apagados podem tirar a conquista).
  const liberados = new Set(conquistas().filter((c) => c.ok).map((c) => c.acessorio));
  m.dataset.acessorio = liberados.has(acessorio) ? acessorio : "";
  atualizarFala();
}

function atualizarFala() {
  if (ausencia) return; // o diálogo de ausência manda na fala
  const h = humor();
  let fala = "Zzz... me dá uma tarefa pra ciscar?";
  if (h === "comemorando") fala = "Có-có-có! Ovo botado, tarefa feita!";
  if (h === "trabalhando") {
    const ms = duracao(emAndamento());
    fala = esquecido()
      ? `Ei, esqueceu ligado? Já faz ${Math.floor(ms / 3600000)}h!`
      : FRASES[Math.floor(ms / 300000) % FRASES.length];
  }
  $("fala").textContent = fala;
  $("cartao-tarefa").classList.toggle("alerta", esquecido());
}

function renderTarefa() {
  const r = emAndamento();
  $("form-nova").hidden = !!r;
  $("rodando").hidden = !r;
  $("dica-projetos").hidden = !!r; // sem o campo à vista, a dica não faz sentido
  if (!r) {
    editandoInicio = false;
    return;
  }

  const etiqueta = $("rodando-projeto");
  etiqueta.textContent = r.projeto ?? "Fazendo agora";
  etiqueta.style.setProperty("--cor", r.projeto ? corDoProjeto(r.projeto) : "");
  $("rodando-tarefa").textContent = r.tarefa;
  $("relogio").textContent = relogio(duracao(r));

  $("rodando-desde").hidden = editandoInicio;
  $("rodando-desde").textContent = `desde ${hora(r.inicio)} ✏️`;
  const caixa = $("editar-inicio");
  caixa.hidden = !editandoInicio;
  caixa.replaceChildren();
  if (!editandoInicio) return;

  const campo = el("input", { type: "time", value: horaCampo(r.inicio) });
  const salvar = async () => {
    const inicio = comHora(r.inicio, campo.value);
    if (inicio > new Date()) {
      // Ex.: agora é 00:10 e você pôs 23:50 → foi ontem.
      inicio.setDate(inicio.getDate() - 1);
    }
    editandoInicio = false;
    await chamar("editar_registro", {
      indice: estado.registros.indexOf(r),
      tarefa: r.tarefa,
      projeto: r.projeto,
      inicio: inicio.toISOString(),
      fim: null,
    });
    renderTarefa();
  };
  const cancelar = () => { editandoInicio = false; renderTarefa(); };
  campo.addEventListener("keydown", (e) => {
    if (e.key === "Enter") salvar();
    if (e.key === "Escape") cancelar();
  });
  caixa.append(
    el("span", {}, "começou às"),
    campo,
    botaoPequeno("ok", salvar, "primario"),
    botaoPequeno("cancelar", cancelar));
  campo.focus();
}

function renderProjetos() {
  const ativo = emAndamento()?.projeto;
  const lista = $("projetos");
  lista.replaceChildren();

  estado.projetos.forEach((nome, i) => {
    const chip = el("button", { className: "chip", type: "button", title: `Começar ${nome}` }, nome);
    chip.style.setProperty("--cor", CORES[i % CORES.length]);
    if (nome === ativo) chip.classList.add("ativo");
    chip.addEventListener("click", () => comecar(nome));

    const remover = el("span", { className: "remover", title: "Remover projeto" }, "×");
    remover.addEventListener("click", (e) => {
      e.stopPropagation();
      chamar("remover_projeto", { nome });
    });
    chip.append(remover);
    lista.append(chip);
  });

  if (criandoProjeto) {
    const campo = el("input", { type: "text", placeholder: "nome do projeto", maxLength: 40 });
    const fechar = () => { criandoProjeto = false; renderProjetos(); };
    campo.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fechar();
      if (e.key === "Enter" && campo.value.trim()) {
        criandoProjeto = false;
        chamar("adicionar_projeto", { nome: campo.value });
      }
    });
    campo.addEventListener("blur", () => criandoProjeto && fechar());
    lista.append(campo);
    campo.focus();
  } else {
    const novo = el("button", { className: "chip novo", type: "button" }, "+ projeto");
    novo.addEventListener("click", () => { criandoProjeto = true; renderProjetos(); });
    lista.append(novo);
  }
}

function renderResumo() {
  for (const aba of $("abas-resumo").children) {
    aba.classList.toggle("ativa", aba.dataset.periodo === periodo);
  }

  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  if (periodo === "semana") {
    desde.setDate(desde.getDate() - ((desde.getDay() + 6) % 7)); // volta pra segunda
  }

  const porProjeto = new Map();
  for (const r of estado.registros) {
    if (new Date(r.inicio) < desde) continue;
    const nome = r.projeto ?? SEM_PROJETO;
    porProjeto.set(nome, (porProjeto.get(nome) ?? 0) + duracao(r));
  }
  const linhas = [...porProjeto].sort((a, b) => b[1] - a[1]);
  const total = linhas.reduce((soma, [, ms]) => soma + ms, 0);

  const caixa = $("resumo");
  caixa.replaceChildren();
  if (!linhas.length) {
    caixa.append(el("p", { className: "vazio" },
      periodo === "hoje" ? "Nada ciscado hoje ainda." : "Nada ciscado nesta semana ainda."));
    return;
  }

  const maior = linhas[0][1] || 1;
  caixa.append(el("div", { className: "resumo-total" },
    el("span", {}, "Total"), el("strong", {}, curto(total))));
  for (const [nome, ms] of linhas) {
    const barra = el("div", { className: "barra" });
    barra.style.setProperty("--cor", nome === SEM_PROJETO ? "var(--tinta-suave)" : corDoProjeto(nome));
    barra.style.setProperty("--tamanho", `${Math.max(4, (ms / maior) * 100)}%`);
    caixa.append(el("div", { className: "resumo-linha" },
      el("span", { className: "resumo-nome", title: nome }, nome),
      el("div", { className: "trilho" }, barra),
      el("span", { className: "resumo-tempo" }, curto(ms))));
  }
}

function renderHistorico() {
  const caixa = $("historico");
  caixa.replaceChildren();

  const feitos = estado.registros
    .map((r, indice) => ({ ...r, indice }))
    .filter((r) => r.fim)
    .reverse();

  if (!feitos.length) {
    caixa.append(el("p", { className: "vazio" }, "Nenhum ovo ainda. Comece uma tarefa! 🥚"));
    return;
  }

  let diaAtual = null;
  for (const r of feitos) {
    const dia = new Date(r.inicio).toDateString();
    if (dia !== diaAtual) {
      diaAtual = dia;
      const total = feitos
        .filter((o) => new Date(o.inicio).toDateString() === dia)
        .reduce((soma, o) => soma + duracao(o), 0);
      caixa.append(el("div", { className: "dia" },
        el("span", {}, nomeDoDia(r.inicio)), el("span", {}, curto(total))));
    }
    caixa.append(editando === r.indice ? itemEditando(r) : item(r));
  }
}

function item(r) {
  const bolinha = el("span", { className: "bolinha" });
  if (r.projeto) bolinha.style.setProperty("--cor", corDoProjeto(r.projeto));

  const meta = `${hora(r.inicio)} → ${hora(r.fim)}` +
    (r.projeto && r.projeto !== r.tarefa ? ` · ${r.projeto}` : "");

  const textos = el("button", { className: "textos", type: "button", title: "Clique para editar" },
    el("div", { className: "nome" }, r.tarefa),
    el("div", { className: "meta" }, meta));
  textos.addEventListener("click", () => {
    editando = r.indice;
    confirmarApagar = null;
    renderHistorico();
  });

  const apagar = el("button", { className: "apagar", type: "button", title: "Apagar registro" },
    confirmarApagar === r.indice ? "apagar?" : "🗑");
  if (confirmarApagar === r.indice) apagar.classList.add("confirmar");
  apagar.addEventListener("click", () => {
    if (confirmarApagar === r.indice) {
      confirmarApagar = null;
      chamar("apagar_registro", { indice: r.indice });
    } else {
      confirmarApagar = r.indice;
      renderHistorico();
      setTimeout(() => {
        if (confirmarApagar === r.indice) { confirmarApagar = null; renderHistorico(); }
      }, 3000);
    }
  });

  return el("div", { className: "item" },
    bolinha, textos, el("span", { className: "duracao" }, curto(duracao(r))), apagar);
}

function itemEditando(r) {
  const nome = el("input", { type: "text", value: r.tarefa, placeholder: "tarefa" });
  const projeto = el("select", {},
    el("option", { value: "" }, SEM_PROJETO),
    ...estado.projetos.map((p) => el("option", { value: p, selected: p === r.projeto }, p)));
  if (r.projeto && !estado.projetos.includes(r.projeto)) {
    projeto.append(el("option", { value: r.projeto, selected: true }, r.projeto));
  }
  const inicio = el("input", { type: "time", value: horaCampo(r.inicio) });
  const fim = el("input", { type: "time", value: horaCampo(r.fim) });

  const salvar = async () => {
    const novoInicio = comHora(r.inicio, inicio.value);
    const novoFim = comHora(novoInicio, fim.value);
    if (novoFim <= novoInicio) novoFim.setDate(novoFim.getDate() + 1); // passou da meia-noite
    const ok = await chamar("editar_registro", {
      indice: r.indice,
      tarefa: nome.value,
      projeto: projeto.value || null,
      inicio: novoInicio.toISOString(),
      fim: novoFim.toISOString(),
    });
    if (ok) { editando = null; renderHistorico(); }
  };
  const cancelar = () => { editando = null; renderHistorico(); };

  const caixa = el("div", { className: "item editando" },
    nome,
    projeto,
    el("div", { className: "horarios" }, inicio, el("span", {}, "→"), fim),
    el("div", { className: "acoes" },
      botaoPequeno("cancelar", cancelar),
      botaoPequeno("salvar", salvar, "primario")));
  caixa.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") salvar();
    if (e.key === "Escape") cancelar();
  });
  setTimeout(() => nome.focus());
  return caixa;
}

// ---------- Ausência ----------

function mostrarAusencia(dados) {
  ausencia = dados;
  const r = emAndamento();
  $("ausencia-texto").replaceChildren(
    "Você ficou fora ", el("strong", {}, curto(dados.minutos * 60000)),
    ` (desde ${hora(dados.desde)})` + (r ? " com " : "."),
    ...(r ? [el("strong", {}, r.tarefa), " rodando. O que eu faço com esse tempo?"] : []));
  $("ausencia-terminar").textContent = `Terminar às ${hora(dados.desde)}`;
  $("modal-ausencia").hidden = false;
  $("fala").textContent = "Opa, você voltou!";
  $("ausencia-continuar").focus();
}

async function resolverAusencia(continuar) {
  const dados = ausencia;
  ausencia = null;
  $("modal-ausencia").hidden = true;
  if (continuar === null) {
    atualizarFala();
    return;
  }
  await chamar("descontar_ausencia", { desde: dados.desde, continuar });
  if (continuar) avisar(`Descontei ${curto(dados.minutos * 60000)}. Bora continuar! 🐔`);
}

// ---------- Ovos e conquistas ----------

/// Tudo calculado a partir dos registros: nada extra pra salvar.
function conquistas() {
  const feitos = estado.registros.filter((r) => r.fim);
  const dias = new Map(); // dia → { ms, projetos }
  for (const r of feitos) {
    const dia = new Date(r.inicio).toDateString();
    const d = dias.get(dia) ?? { ms: 0, projetos: new Set() };
    d.ms += duracao(r);
    if (r.projeto) d.projetos.add(r.projeto);
    dias.set(dia, d);
  }
  const horaDe = (iso) => new Date(iso).getHours();
  const horas = Math.floor(feitos.reduce((s, r) => s + duracao(r), 0) / 3600000);
  const melhor = sequencias().melhor;

  return [
    { id: "primeiro", emoji: "🥚", nome: "Primeiro ovo", desc: "Termine sua primeira tarefa.",
      prog: [feitos.length, 1] },
    { id: "duzia", emoji: "🎉", nome: "Uma dúzia", desc: "Termine 12 tarefas.",
      prog: [feitos.length, 12], acessorio: "chapeu" },
    { id: "foco", emoji: "🎯", nome: "Foco de ferro", desc: "Fique 90 minutos seguidos numa tarefa.",
      ok: feitos.some((r) => duracao(r) >= 90 * 60000), acessorio: "oculos" },
    { id: "versatil", emoji: "🌈", nome: "Ciscador versátil", desc: "Trabalhe em 3 projetos no mesmo dia.",
      ok: [...dias.values()].some((d) => d.projetos.size >= 3), acessorio: "laco" },
    { id: "madrugador", emoji: "🌅", nome: "Madrugador", desc: "Comece uma tarefa antes das 7h.",
      ok: feitos.some((r) => horaDe(r.inicio) < 7 && horaDe(r.inicio) >= 4) },
    { id: "coruja", emoji: "🦉", nome: "Coruja", desc: "Termine uma tarefa depois das 22h.",
      ok: feitos.some((r) => horaDe(r.fim) >= 22 || horaDe(r.fim) < 4) },
    { id: "maratona", emoji: "🏃", nome: "Maratona", desc: "Some 6 horas num dia.",
      ok: [...dias.values()].some((d) => d.ms >= 6 * 3600000) },
    { id: "sequencia", emoji: "🔥", nome: "Pegando fogo", desc: "Use o Franguinho 5 dias seguidos.",
      prog: [melhor, 5] },
    { id: "cem-horas", emoji: "⏳", nome: "Cem horas", desc: "Acumule 100 horas registradas.",
      prog: [horas, 100] },
    { id: "ouro", emoji: "👑", nome: "Ovos de ouro", desc: "Termine 100 tarefas.",
      prog: [feitos.length, 100], acessorio: "coroa" },
  ].map((c) => ({ ...c, ok: c.ok ?? c.prog[0] >= c.prog[1] }));
}

/// Dias seguidos com pelo menos uma tarefa terminada: a sequência atual
/// (vale até ontem, pra não "zerar" de manhã) e a melhor de todas.
function sequencias() {
  const dias = new Set(estado.registros.filter((r) => r.fim).map((r) => diaLocal(r.inicio)));
  const ordenados = [...dias].sort();
  let melhor = 0;
  let corrida = 0;
  let anterior = null;
  for (const d of ordenados) {
    corrida = anterior && diasEntre(anterior, d) === 1 ? corrida + 1 : 1;
    melhor = Math.max(melhor, corrida);
    anterior = d;
  }
  let atual = 0;
  const cursor = new Date();
  if (!dias.has(diaLocal(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dias.has(diaLocal(cursor))) {
    atual++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { atual, melhor };
}

function renderNinho() {
  const hoje = new Date().toDateString();
  const ovos = estado.registros.filter((r) => r.fim && new Date(r.inicio).toDateString() === hoje).length;
  const { atual } = sequencias();
  const caixa = $("ninho-hoje");
  caixa.replaceChildren();
  if (ovos) caixa.append(el("span", { title: "Tarefas terminadas hoje" }, `🥚 ${ovos} hoje`));
  if (atual >= 2) caixa.append(el("span", { title: "Dias seguidos com tarefas" }, `🔥 ${atual} dias seguidos`));
}

function renderConquistas() {
  const lista = conquistas();
  const caixa = $("conquistas");
  caixa.replaceChildren();
  $("contador-conquistas").textContent = `${lista.filter((c) => c.ok).length}/${lista.length}`;

  for (const c of lista) {
    const vestindo = c.ok && c.acessorio && c.acessorio === acessorio;
    const card = el("button", { type: "button", className: "conquista", title: c.desc },
      el("span", { className: "emoji" }, c.emoji),
      el("span", { className: "nome" }, c.nome),
      el("span", { className: "desc" }, c.ok && c.acessorio
        ? (vestindo ? `Vestindo: ${ACESSORIOS[c.acessorio]}` : `Vestir ${ACESSORIOS[c.acessorio]}`)
        : c.ok ? "Feito!" : c.desc));
    card.classList.add(c.ok ? "feita" : "bloqueada");
    if (c.acessorio) card.append(el("span", { className: "presente", title: `Libera: ${ACESSORIOS[c.acessorio]}` }, "🎁"));
    if (!c.ok && c.prog && c.prog[1] > 1) {
      const barra = el("div");
      barra.style.setProperty("--p", `${Math.min(100, (c.prog[0] / c.prog[1]) * 100)}%`);
      card.append(el("span", { className: "progresso", title: `${c.prog[0]}/${c.prog[1]}` }, barra));
    }
    if (c.ok && c.acessorio) {
      card.classList.add("vestivel");
      if (vestindo) card.classList.add("vestindo");
      card.addEventListener("click", () => {
        acessorio = vestindo ? "" : c.acessorio;
        gravarPreferencia("acessorio", acessorio);
        renderMascote();
        renderConquistas();
      });
    }
    caixa.append(card);
  }
}

// ---------- Utilidades ----------

/// Preferência só de visual: guardada no navegador do app, sem drama se sumir.
function lerPreferencia(chave) {
  try { return localStorage.getItem(`franguinho.${chave}`) ?? ""; } catch { return ""; }
}

function gravarPreferencia(chave, valor) {
  try { localStorage.setItem(`franguinho.${chave}`, valor); } catch { /* sem armazenamento */ }
}

/// "AAAA-MM-DD" no fuso local (ordenável).
function diaLocal(data) {
  const d = new Date(data);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diasEntre(a, b) {
  return Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 86400000);
}

function el(tag, props, ...filhos) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...filhos);
  return n;
}

function botaoPequeno(texto, acao, tipo = "") {
  const b = el("button", { className: `pequeno ${tipo}`, type: "button" }, texto);
  b.addEventListener("click", acao);
  return b;
}

function corDoProjeto(nome) {
  const i = estado.projetos.indexOf(nome);
  return i < 0 ? "var(--tinta-suave)" : CORES[i % CORES.length];
}

function duracao(r) {
  const fim = r.fim ? new Date(r.fim) : new Date();
  return Math.max(0, fim - new Date(r.inicio));
}

function relogio(ms) {
  const s = Math.floor(ms / 1000);
  const dois = (n) => String(n).padStart(2, "0");
  return `${dois(Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`;
}

function curto(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h === 0 && m === 0) return `${Math.floor(ms / 1000)}s`;
  if (h === 0) return `${m}min`;
  return m % 60 ? `${h}h ${String(m % 60).padStart(2, "0")}min` : `${h}h`;
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/// "HH:MM" no fuso local, pro valor de um <input type="time">.
function horaCampo(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/// Mesma data de `iso`, com a hora trocada pelo "HH:MM" do campo.
function comHora(iso, hhmm) {
  const d = new Date(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function nomeDoDia(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

let timerAviso;
function avisar(texto) {
  const a = $("aviso");
  a.textContent = texto;
  a.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => (a.hidden = true), 4000);
}

function imitacaoDoBackend() {
  const e = { registros: [], projetos: ["Trabalho", "Estudos", "Casa"] };
  const limpo = (t) => (t ?? "").trim() || null;
  const copia = () => structuredClone(e);
  const comandos = {
    carregar: copia,
    comecar({ tarefa, projeto }) {
      projeto = limpo(projeto);
      tarefa = limpo(tarefa) ?? projeto;
      if (!tarefa) throw "Me conta o que você vai fazer!";
      const atual = e.registros.find((r) => !r.fim);
      if (atual) atual.fim = new Date().toISOString();
      e.registros.push({ tarefa, projeto, inicio: new Date().toISOString(), fim: null });
      return copia();
    },
    terminar() {
      const atual = e.registros.find((r) => !r.fim);
      if (atual) atual.fim = new Date().toISOString();
      return copia();
    },
    editar_registro({ indice, tarefa, projeto, inicio, fim }) {
      if (fim && fim <= inicio) throw "O fim precisa ser depois do início.";
      Object.assign(e.registros[indice], { tarefa, projeto, inicio, fim });
      e.registros.sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      return copia();
    },
    descontar_ausencia({ desde, continuar }) {
      const i = e.registros.findIndex((r) => !r.fim);
      if (i < 0) throw "Não tem tarefa rodando.";
      const atual = { ...e.registros[i] };
      if (desde <= atual.inicio) e.registros.splice(i, 1);
      else e.registros[i].fim = desde;
      if (continuar) e.registros.push({ ...atual, inicio: new Date().toISOString(), fim: null });
      return copia();
    },
    apagar_registro({ indice }) { e.registros.splice(indice, 1); return copia(); },
    adicionar_projeto({ nome }) {
      if (!e.projetos.includes(nome.trim())) e.projetos.push(nome.trim());
      return copia();
    },
    remover_projeto({ nome }) { e.projetos = e.projetos.filter((p) => p !== nome); return copia(); },
    exportar_csv: () => "(modo navegador: nada foi exportado)",
    atalho: () => "Ctrl+Alt+F",
  };
  // No navegador, dá pra testar o diálogo com simularAusencia(25) no console.
  window.simularAusencia = (minutos) =>
    mostrarAusencia({ desde: new Date(Date.now() - minutos * 60000).toISOString(), minutos });
  return async (comando, args) => comandos[comando](args ?? {});
}

// ---------- Início ----------

chamar("carregar");
invoke("atalho").then((a) => ($("atalho").textContent = a));
setInterval(() => {
  const r = emAndamento();
  if (r) $("relogio").textContent = relogio(duracao(r));
}, 1000);
setInterval(() => {
  atualizarFala();
  renderResumo();
}, 30000);
