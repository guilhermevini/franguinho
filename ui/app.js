import {
  acessorioVisivel, atalhoDoEvento, comHora, mapaDoAno, conquistas as calcularConquistas, curto, duracao,
  horaCampo, nomeDoDia, recentes, relatorioSemanal, relogio, resumo, sonsDaMudanca, sugestoes, sequencias as calcularSequencias, temporada,
} from "./logica.js";
import { svgMascote } from "./mascote.js";
import { tocar } from "./sons.js";

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

let estado = { registros: [], fixadas: [] };
let comemorandoAte = 0;
let confirmarApagar = null;
let editando = null; // id do registro aberto pra edição
let editandoInicio = false; // ajustando o "desde" da tarefa rodando
let periodo = "hoje";
let ausencia = null; // { id, desde, minutos } enquanto o diálogo de "você voltou" está aberto
let conquistasFeitas = null; // ids já desbloqueados, pra comemorar só as novas
let acessorio = lerPreferencia("acessorio");
let preferencias = { atalho: "Ctrl+Alt+F", esquecido_horas: 3, ausente_min: 10, sons: true };
let carregado = false; // o primeiro estado só serve de base pros sons
const MAC = /Mac/i.test(navigator.platform);
let pomodoro = { ligado: false, fase: "parado", fim: null, retomar: null, feitos_hoje: 0 };

const ACESSORIOS = { chapeu: "chapéu de festa", oculos: "óculos escuros", laco: "laço", coroa: "coroa" };

const $ = (id) => document.getElementById(id);

$("mascote").innerHTML = svgMascote;

// ---------- Estado e ações ----------

/// O suficiente pra saber que som tocar numa mudança (ver sonsDaMudanca).
function retrato() {
  return {
    rodando: emAndamento()?.id ?? null,
    fase: pomodoro.fase,
    conquistas: calcularConquistas(estado.registros).filter((c) => c.ok).length,
  };
}

function tocarMudanca(antes) {
  if (!carregado || !preferencias.sons) return;
  sonsDaMudanca(antes, retrato()).forEach((som, i) => setTimeout(() => tocar(som), i * 500));
}

/// Recebe um estado novo (de um comando ou do evento vindo da bandeja/atalho).
function aplicar(novo) {
  const rodavaAntes = !!emAndamento();
  const antes = retrato();
  estado = novo;
  tocarMudanca(antes);
  carregado = true;
  if (rodavaAntes && !emAndamento()) {
    comemorandoAte = Date.now() + 3000;
    setTimeout(renderMascote, 3000);
  }
  anunciarConquistasNovas();
  render();
}

function anunciarConquistasNovas() {
  const feitas = calcularConquistas(estado.registros).filter((c) => c.ok);
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

/// Começa a tarefa digitada, ou a de um atalho.
async function comecar(tarefa = $("campo-tarefa").value) {
  if (await chamar("comecar", { tarefa }) && emAndamento()) {
    $("campo-tarefa").value = "";
  }
}

$("form-nova").addEventListener("submit", (e) => {
  e.preventDefault();
  comecar();
});

$("botao-terminar").addEventListener("click", () => chamar("terminar"));
$("botao-retomar").addEventListener("click", () => comecar(pomodoro.retomar));
$("botao-voltar-pausa").addEventListener("click", () => comecar(pomodoro.retomar));

function aplicarPomodoro(p) {
  const antes = retrato();
  pomodoro = p;
  tocarMudanca(antes);
  renderTarefa();
  renderNinho();
  atualizarFala();
}

$("botao-fixar").addEventListener("click", () => {
  const r = emAndamento();
  if (r) chamar(estado.fixadas.includes(r.tarefa) ? "desafixar" : "fixar", { tarefa: r.tarefa });
});

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
  if (preferencias.sons) tocar("cutucar", 0.88 + Math.random() * 0.3);
  $("fala").textContent = "Piu!";
  setTimeout(atualizarFala, 1200);
});

$("botao-mini").addEventListener("click", () => {
  if (tauri) invoke("alternar_mini").catch((e) => avisar(String(e)));
  else window.open("mini.html", "mini", "width=280,height=96"); // no navegador, só uma prévia
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

// ---------- Configurações ----------

function aplicarPreferencias(p) {
  preferencias = p;
  $("atalho").textContent = p.atalho;
  atualizarFala();
}

$("botao-config").addEventListener("click", async () => {
  try {
    aplicarPreferencias(await invoke("preferencias"));
  } catch (erro) {
    avisar(String(erro));
    return;
  }
  $("cfg-autostart").checked = preferencias.iniciar_com_sistema;
  $("cfg-atalho").value = preferencias.atalho;
  $("cfg-esquecido").value = preferencias.esquecido_horas;
  $("cfg-ausente").value = preferencias.ausente_min;
  $("cfg-pomodoro").checked = preferencias.pomodoro;
  $("cfg-sons").checked = preferencias.sons;
  $("cfg-foco").value = preferencias.foco_min;
  $("cfg-pausa").value = preferencias.pausa_min;
  $("cfg-caminho").textContent = preferencias.pasta_dados;
  invoke("versao").then((v) => ($("cfg-versao").textContent = `v${v}`)).catch(() => {});
  $("modal-config").hidden = false;
});

function fecharConfig() {
  $("modal-config").hidden = true;
}

const campoAtalho = $("cfg-atalho");
campoAtalho.addEventListener("focus", () => {
  campoAtalho.classList.add("gravando");
  invoke("suspender_atalho", { suspenso: true }).catch(() => {});
});
campoAtalho.addEventListener("blur", () => {
  campoAtalho.classList.remove("gravando");
  invoke("suspender_atalho", { suspenso: false }).catch(() => {});
});
campoAtalho.addEventListener("keydown", (e) => {
  if (e.key === "Tab") return;
  e.preventDefault();
  if (e.key === "Escape") {
    campoAtalho.value = preferencias.atalho;
    campoAtalho.blur();
    return;
  }
  const atalho = atalhoDoEvento(e, MAC);
  if (atalho) {
    campoAtalho.value = atalho;
    campoAtalho.blur();
  }
});

$("cfg-testar-som").addEventListener("click", () => {
  ["comecar", "terminar", "conquista"].forEach((som, i) => setTimeout(() => tocar(som), i * 700));
});

$("cfg-pasta").addEventListener("click", () => {
  invoke("abrir_pasta_dados").catch((e) => avisar(String(e)));
});
$("cfg-cancelar").addEventListener("click", fecharConfig);
$("modal-config").addEventListener("click", (e) => {
  if (e.target === $("modal-config")) fecharConfig();
});
$("form-config").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && e.target !== campoAtalho) fecharConfig();
});
$("form-config").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    aplicarPreferencias(await invoke("salvar_preferencias", {
      config: {
        atalho: campoAtalho.value,
        esquecido_horas: Number($("cfg-esquecido").value),
        ausente_min: Number($("cfg-ausente").value),
        pomodoro: $("cfg-pomodoro").checked,
        foco_min: Number($("cfg-foco").value),
        pausa_min: Number($("cfg-pausa").value),
        sons: $("cfg-sons").checked,
      },
      iniciarComSistema: $("cfg-autostart").checked,
    }));
    fecharConfig();
    avisar("Configurações salvas! 🐔");
  } catch (erro) {
    avisar(String(erro));
  }
});

// ---------- Atualização ----------

function mostrarNovidade(novidade) {
  $("faixa-texto").textContent = `🐣 Versão ${novidade.versao} disponível!`;
  $("faixa-atualizacao").hidden = false;
}

$("botao-atualizar").addEventListener("click", async () => {
  const botao = $("botao-atualizar");
  botao.disabled = true;
  botao.textContent = "Baixando...";
  try {
    await invoke("instalar_atualizacao"); // se der certo, o app reinicia
  } catch (erro) {
    avisar(String(erro));
    botao.disabled = false;
    botao.textContent = "Atualizar";
  }
});

$("cfg-procurar").addEventListener("click", async () => {
  const botao = $("cfg-procurar");
  botao.disabled = true;
  try {
    const novidade = await invoke("procurar_atualizacao");
    if (novidade) {
      mostrarNovidade(novidade);
      fecharConfig();
    } else {
      avisar("Você já está na versão mais nova. 🐔");
    }
  } catch (erro) {
    avisar(String(erro));
  } finally {
    botao.disabled = false;
  }
});

if (tauri) {
  tauri.event.listen("atualizacao", (e) => mostrarNovidade(e.payload));
  tauri.event.listen("estado", (e) => aplicar(e.payload));
  tauri.event.listen("pomodoro", (e) => aplicarPomodoro(e.payload));
  tauri.event.listen("preferencias", (e) => aplicarPreferencias(e.payload));
  tauri.event.listen("ausencia", (e) => mostrarAusencia(e.payload));
  tauri.event.listen("aviso", (e) => avisar(String(e.payload)));
  tauri.event.listen("focar-campo", () => $("campo-tarefa").focus());
}

// ---------- Desenho ----------

function render() {
  renderMascote();
  renderNinho();
  renderTarefa();
  renderAtalhos();
  renderSugestoes();
  renderResumo();
  renderMapa();
  renderConquistas();
  renderHistorico();
}

function emAndamento() {
  return estado.registros.find((r) => !r.fim);
}

function esquecido() {
  const r = emAndamento();
  const limite = preferencias.esquecido_horas * 3600000;
  return !!r && limite > 0 && duracao(r) >= limite;
}

function humor() {
  if (Date.now() < comemorandoAte) return "comemorando";
  return emAndamento() ? "trabalhando" : "dormindo";
}

function renderMascote() {
  const m = $("mascote");
  m.classList.remove("dormindo", "trabalhando", "comemorando");
  m.classList.add(humor());
  m.dataset.acessorio = acessorioVisivel(estado.registros, acessorio);
  atualizarFala();
}

/// Contagem regressiva do foco (na tarefa rodando) ou da pausa.
function atualizarPomodoro() {
  const falta = pomodoro.fim ? Math.max(0, new Date(pomodoro.fim) - Date.now()) : 0;
  const mmss = relogio(falta).slice(3);
  const linha = $("pomodoro-linha");
  linha.hidden = !(emAndamento() && pomodoro.fase === "foco");
  if (!linha.hidden) linha.textContent = `🍅 foco · ${mmss} até a pausa`;
  if (pomodoro.fase === "pausa") $("pausa-relogio").textContent = mmss;
}

function atualizarFala() {
  if (ausencia) return; // o diálogo de ausência manda na fala
  if (!emAndamento() && pomodoro.fase === "pausa") {
    $("fala").textContent = "Hora de esticar as asas! ☕";
    return;
  }
  if (!emAndamento() && pomodoro.retomar && Date.now() >= comemorandoAte) {
    $("fala").textContent = "Pausa feita! Bora voltar? 🍅";
    return;
  }
  const h = humor();
  const t = temporada();
  let fala = t?.dormindo ?? "Zzz... me dá uma tarefa pra ciscar?";
  if (h === "comemorando") fala = "Có-có-có! Ovo botado, tarefa feita!";
  if (h === "trabalhando") {
    const ms = duracao(emAndamento());
    const frases = t ? [t.trabalhando, ...FRASES] : FRASES;
    fala = esquecido()
      ? `Ei, esqueceu ligado? Já faz ${Math.floor(ms / 3600000)}h!`
      : frases[Math.floor(ms / 300000) % frases.length];
  }
  $("fala").textContent = fala;
  $("cartao-tarefa").classList.toggle("alerta", esquecido());
}

function renderTarefa() {
  const r = emAndamento();
  const naPausa = !r && pomodoro.fase === "pausa";
  $("form-nova").hidden = !!r || naPausa;
  $("pausa").hidden = !naPausa;
  $("rodando").hidden = !r;
  const retomar = !r && pomodoro.fase === "parado" && pomodoro.retomar;
  $("botao-retomar").hidden = !retomar;
  if (retomar) $("botao-retomar").textContent = `▶ Voltar pra ${pomodoro.retomar}`;
  if (naPausa) $("pausa-tarefa").textContent = pomodoro.retomar ?? "";
  atualizarPomodoro();
  if (!r) {
    editandoInicio = false;
    return;
  }

  const fixada = estado.fixadas.includes(r.tarefa);
  $("rodando-etiqueta").style.setProperty("--cor", fixada ? corDaTarefa(r.tarefa) : "");
  $("rodando-tarefa").textContent = r.tarefa;
  $("botao-fixar").textContent = fixada ? "📌 fixada" : "📌 fixar";
  $("botao-fixar").title = fixada ? "Tirar dos atalhos" : "Fixar nos atalhos";
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
      id: r.id,
      tarefa: r.tarefa,
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

/// Atalhos: as tarefas fixadas (com cor) e as últimas usadas. Um clique começa.
function renderAtalhos() {
  const ativa = emAndamento()?.tarefa;
  const lista = $("atalhos");
  lista.replaceChildren();

  const chip = (nome, fixada) => {
    const c = el("button", { className: "chip", type: "button", title: `Começar ${nome}` }, nome);
    c.style.setProperty("--cor", corDaTarefa(nome));
    if (!fixada) c.classList.add("recente");
    if (nome === ativa) c.classList.add("ativo");
    c.addEventListener("click", () => comecar(nome));
    const acao = el("span", { className: "remover", title: fixada ? "Tirar dos atalhos" : "Fixar nos atalhos" },
      fixada ? "×" : "📌");
    acao.addEventListener("click", (e) => {
      e.stopPropagation();
      chamar(fixada ? "desafixar" : "fixar", { tarefa: nome });
    });
    c.append(acao);
    return c;
  };

  estado.fixadas.forEach((nome) => lista.append(chip(nome, true)));
  const ultimas = recentes(estado.registros, estado.fixadas);
  if (ultimas.length && estado.fixadas.length) lista.append(el("span", { className: "divisor" }));
  ultimas.forEach((nome) => lista.append(chip(nome, false)));
  $("atalhos-vazio").hidden = lista.children.length > 0;
}

/// Autocompletar do campo: as tarefas já usadas, das mais recentes.
function renderSugestoes() {
  $("sugestoes").replaceChildren(
    ...sugestoes(estado.registros).slice(0, 50).map((t) => el("option", { value: t })));
}

function renderResumo() {
  for (const aba of $("abas-resumo").children) {
    aba.classList.toggle("ativa", aba.dataset.periodo === periodo);
  }

  const { linhas, total } = resumo(estado.registros, periodo);

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
  for (const [nome, ms, extra] of linhas) {
    const barra = el("div", { className: "barra" });
    barra.style.setProperty("--cor", extra?.outras ? "var(--linha)" : corDaTarefa(nome));
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

  const feitos = estado.registros.filter((r) => r.fim).reverse();

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
    caixa.append(editando === r.id ? itemEditando(r) : item(r));
  }
}

function item(r) {
  const bolinha = el("span", { className: "bolinha" });
  bolinha.style.setProperty("--cor", corDaTarefa(r.tarefa));

  const meta = `${hora(r.inicio)} → ${hora(r.fim)}`;

  const textos = el("button", { className: "textos", type: "button", title: "Clique para editar" },
    el("div", { className: "nome" }, r.tarefa),
    el("div", { className: "meta" }, meta));
  textos.addEventListener("click", () => {
    editando = r.id;
    confirmarApagar = null;
    renderHistorico();
  });

  const apagar = el("button", { className: "apagar", type: "button", title: "Apagar registro" },
    confirmarApagar === r.id ? "apagar?" : "🗑");
  if (confirmarApagar === r.id) apagar.classList.add("confirmar");
  apagar.addEventListener("click", () => {
    if (confirmarApagar === r.id) {
      confirmarApagar = null;
      chamar("apagar_registro", { id: r.id });
    } else {
      confirmarApagar = r.id;
      renderHistorico();
      setTimeout(() => {
        if (confirmarApagar === r.id) { confirmarApagar = null; renderHistorico(); }
      }, 3000);
    }
  });

  return el("div", { className: "item" },
    bolinha, textos, el("span", { className: "duracao" }, curto(duracao(r))), apagar);
}

function itemEditando(r) {
  const nome = el("input", { type: "text", value: r.tarefa, placeholder: "tarefa" });
  nome.setAttribute("list", "sugestoes");
  const inicio = el("input", { type: "time", value: horaCampo(r.inicio) });
  const fim = el("input", { type: "time", value: horaCampo(r.fim) });

  const salvar = async () => {
    const novoInicio = comHora(r.inicio, inicio.value);
    const novoFim = comHora(novoInicio, fim.value);
    if (novoFim <= novoInicio) novoFim.setDate(novoFim.getDate() + 1); // passou da meia-noite
    const ok = await chamar("editar_registro", {
      id: r.id,
      tarefa: nome.value,
      inicio: novoInicio.toISOString(),
      fim: novoFim.toISOString(),
    });
    if (ok) { editando = null; renderHistorico(); }
  };
  const cancelar = () => { editando = null; renderHistorico(); };

  const caixa = el("div", { className: "item editando" },
    nome,
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

// ---------- Relatório semanal ----------

let semanaDoRelatorio = 0;

function renderRelatorio() {
  for (const aba of $("abas-relatorio").children) {
    aba.classList.toggle("ativa", Number(aba.dataset.semana) === semanaDoRelatorio);
  }
  $("relatorio-texto").value = relatorioSemanal(estado.registros, new Date(), semanaDoRelatorio);
}

$("botao-relatorio").addEventListener("click", () => {
  semanaDoRelatorio = 0;
  renderRelatorio();
  $("modal-relatorio").hidden = false;
  $("relatorio-copiar").focus();
});
$("abas-relatorio").addEventListener("click", (e) => {
  const aba = e.target.closest("[data-semana]");
  if (!aba) return;
  semanaDoRelatorio = Number(aba.dataset.semana);
  renderRelatorio();
});
const fecharRelatorio = () => ($("modal-relatorio").hidden = true);
$("relatorio-fechar").addEventListener("click", fecharRelatorio);
$("modal-relatorio").addEventListener("click", (e) => {
  if (e.target === $("modal-relatorio")) fecharRelatorio();
});
$("modal-relatorio").addEventListener("keydown", (e) => {
  if (e.key === "Escape") fecharRelatorio();
});
$("relatorio-copiar").addEventListener("click", async () => {
  const campo = $("relatorio-texto");
  try {
    // No app, copia pelo Rust (mais garantido que a API do navegador na webview).
    if (tauri) await invoke("copiar", { texto: campo.value });
    else await navigator.clipboard.writeText(campo.value);
  } catch {
    // Plano B pra webviews sem a API de clipboard: seleciona e copia.
    campo.select();
    if (!document.execCommand("copy")) {
      avisar("Não consegui copiar. Selecione o texto e use Ctrl+C / Cmd+C.");
      return;
    }
  }
  avisar("Copiado! Agora é só colar 🐔");
});

// ---------- Mapa de calor ----------

const PASSO = 12; // tamanho do quadradinho (10) + espaço (2), em unidades do SVG
const TOPO = 14; // espaço dos nomes dos meses

function renderMapa() {
  const mapa = mapaDoAno(estado.registros);
  const svg = $("mapa");
  const ns = "http://www.w3.org/2000/svg";
  const novo = (tag, attrs, texto) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (texto) n.textContent = texto;
    return n;
  };
  svg.setAttribute("viewBox", `0 0 ${mapa.semanas.length * PASSO} ${TOPO + 7 * PASSO}`);
  svg.replaceChildren();

  let ultimaColuna = -10;
  for (const m of mapa.meses) {
    if (m.coluna - ultimaColuna < 3) continue; // não encavala os nomes
    svg.append(novo("text", { x: m.coluna * PASSO, y: 10, class: "mes" }, m.nome));
    ultimaColuna = m.coluna;
  }

  const hoje = new Date().toDateString();
  mapa.semanas.forEach((semana, s) => semana.forEach((d, i) => {
    if (d.futuro) return;
    const texto = `${diaPorExtenso(d.dia)}: ${d.ms ? curto(d.ms) : "nada"}`;
    const quadrado = novo("rect", {
      x: s * PASSO, y: TOPO + i * PASSO, width: 10, height: 10, rx: 2.5,
      class: `n${d.nivel}` + (new Date(`${d.dia}T12:00`).toDateString() === hoje ? " hoje" : ""),
    });
    quadrado.append(novo("title", {}, texto));
    quadrado.addEventListener("click", () => ($("mapa-legenda").textContent = texto));
    svg.append(quadrado);
  }));

  $("mapa-total").textContent = mapa.total ? curto(mapa.total) : "";
  $("mapa-legenda").textContent = mapa.diasAtivos
    ? `🥚 ${mapa.diasAtivos} ${mapa.diasAtivos === 1 ? "dia" : "dias"} com tarefas · melhor dia ` +
      `${diaPorExtenso(mapa.melhor.dia)} (${curto(mapa.melhor.ms)})`
    : "Seu ano no ninho começa hoje 🐣";
}

function diaPorExtenso(dia) {
  return new Date(`${dia}T12:00`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
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
  await chamar("descontar_ausencia", { id: dados.id, desde: dados.desde, continuar });
  if (continuar) avisar(`Descontei ${curto(dados.minutos * 60000)}. Bora continuar! 🐔`);
}

// ---------- Ovos e conquistas ----------

function renderNinho() {
  const hoje = new Date().toDateString();
  const ovos = estado.registros.filter((r) => r.fim && new Date(r.inicio).toDateString() === hoje).length;
  const { atual } = calcularSequencias(estado.registros);
  const caixa = $("ninho-hoje");
  caixa.replaceChildren();
  if (ovos) caixa.append(el("span", { title: "Tarefas terminadas hoje" }, `🥚 ${ovos} hoje`));
  if (atual >= 2) caixa.append(el("span", { title: "Dias seguidos com tarefas" }, `🔥 ${atual} dias seguidos`));
  if (pomodoro.feitos_hoje) caixa.append(el("span", { title: "Pomodoros completos hoje" }, `🍅 ${pomodoro.feitos_hoje} hoje`));
  const t = temporada();
  if (t) caixa.append(el("span", { title: "O franguinho se veste pra ocasião" }, `${t.emoji} ${t.nome}`));
}

function renderConquistas() {
  const lista = calcularConquistas(estado.registros);
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

/// Tarefas fixadas têm a cor da sua posição; as outras, um tom neutro.
function corDaTarefa(nome) {
  const i = estado.fixadas.indexOf(nome);
  return i < 0 ? "var(--tinta-suave)" : CORES[i % CORES.length];
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
  const e = { registros: [], fixadas: ["Trabalho", "Estudos", "Casa"] };
  const limpo = (t) => (t ?? "").trim() || null;
  const copia = () => structuredClone(e);
  const prefs = { atalho: "Ctrl+Alt+F", esquecido_horas: 3, ausente_min: 10, iniciar_com_sistema: false,
    pomodoro: false, foco_min: 25, pausa_min: 5, sons: true,
    pasta_dados: "~/Library/Application Support/franguinho" };
  const novoId = () => Math.max(0, ...e.registros.map((r) => r.id)) + 1;
  const posicao = (id) => {
    const i = e.registros.findIndex((r) => r.id === id);
    if (i < 0) throw "Esse registro não existe mais.";
    return i;
  };
  const comandos = {
    carregar: copia,
    comecar({ tarefa }) {
      tarefa = limpo(tarefa);
      if (!tarefa) throw "Me conta o que você vai fazer!";
      const atual = e.registros.find((r) => !r.fim);
      if (atual) atual.fim = new Date().toISOString();
      if (atual?.tarefa === tarefa) { atual.fim = null; return copia(); }
      e.registros.push({ id: novoId(), tarefa, inicio: new Date().toISOString(), fim: null });
      return copia();
    },
    terminar() {
      const atual = e.registros.find((r) => !r.fim);
      if (atual) atual.fim = new Date().toISOString();
      return copia();
    },
    editar_registro({ id, tarefa, inicio, fim }) {
      if (fim && fim <= inicio) throw "O fim precisa ser depois do início.";
      Object.assign(e.registros[posicao(id)], { tarefa: limpo(tarefa), inicio, fim });
      e.registros.sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      return copia();
    },
    descontar_ausencia({ id, desde, continuar }) {
      const i = posicao(id);
      const atual = { ...e.registros[i] };
      if (atual.fim) throw "Essa tarefa já tinha terminado.";
      if (desde <= atual.inicio) e.registros.splice(i, 1);
      else e.registros[i].fim = desde;
      if (continuar) e.registros.push({ ...atual, id: novoId(), inicio: new Date().toISOString(), fim: null });
      return copia();
    },
    apagar_registro({ id }) { e.registros.splice(posicao(id), 1); return copia(); },
    fixar({ tarefa }) {
      if (!e.fixadas.includes(tarefa.trim())) e.fixadas.push(tarefa.trim());
      return copia();
    },
    desafixar({ tarefa }) { e.fixadas = e.fixadas.filter((t) => t !== tarefa); return copia(); },
    exportar_csv: () => "(modo navegador: nada foi exportado)",
    preferencias: () => ({ ...prefs }),
    salvar_preferencias({ config, iniciarComSistema }) {
      if (!/^(.+\+)+.+$/.test(config.atalho)) throw `Não entendi o atalho "${config.atalho}".`;
      Object.assign(prefs, config, { iniciar_com_sistema: iniciarComSistema });
      return { ...prefs };
    },
    suspender_atalho: () => {},
    pomodoro: () => ({ ligado: prefs.pomodoro, fase: "parado", fim: null, retomar: null, feitos_hoje: 0 }),
    versao: () => "0.1.0",
    procurar_atualizacao: () => ({ versao: "0.2.0", notas: null }),
    instalar_atualizacao: () => { throw "(modo navegador: nada pra instalar)"; },
    abrir_pasta_dados: () => { throw "(modo navegador: não há pasta pra abrir)"; },
  };
  // No navegador, dá pra testar o diálogo com simularAusencia(25) no console.
  window.simularAusencia = (minutos) =>
    mostrarAusencia({ id: emAndamento()?.id, desde: new Date(Date.now() - minutos * 60000).toISOString(), minutos });
  return async (comando, args) => comandos[comando](args ?? {});
}

// ---------- Início ----------

chamar("carregar");
invoke("preferencias").then(aplicarPreferencias).catch(() => {});
invoke("pomodoro").then(aplicarPomodoro).catch(() => {});
setInterval(() => {
  const r = emAndamento();
  if (r) $("relogio").textContent = relogio(duracao(r));
  atualizarPomodoro();
}, 1000);
setInterval(() => {
  atualizarFala();
  renderResumo();
  renderMapa();
}, 30000);
