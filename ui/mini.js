import { conquistas, duracao, relogio } from "./logica.js";
import { svgMascote } from "./mascote.js";

const tauri = window.__TAURI__;
// No navegador (prévia do visual), uma tarefa de mentira rodando.
const invoke = tauri?.core.invoke ?? (async (comando) => comando === "carregar"
  ? { projetos: ["Trabalho"], registros: [{ id: 1, tarefa: "revisar PR do login", projeto: "Trabalho",
      inicio: new Date(Date.now() - 754000).toISOString(), fim: null }] }
  : undefined);

const ESQUECIDO_MS = 3 * 3600 * 1000;
const $ = (id) => document.getElementById(id);
let estado = { registros: [], projetos: [] };
let comemorandoAte = 0;

$("mascote").innerHTML = svgMascote;

const emAndamento = () => estado.registros.find((r) => !r.fim);

function aplicar(novo) {
  const rodavaAntes = !!emAndamento();
  estado = novo;
  if (rodavaAntes && !emAndamento()) {
    comemorandoAte = Date.now() + 3000;
    setTimeout(render, 3000);
  }
  render();
}

function render() {
  const r = emAndamento();
  const m = $("mascote");
  m.classList.remove("dormindo", "trabalhando", "comemorando");
  m.classList.add(Date.now() < comemorandoAte ? "comemorando" : r ? "trabalhando" : "dormindo");
  // Mesmo acessório da janela principal (mesmo armazenamento local).
  let acessorio = "";
  try { acessorio = localStorage.getItem("franguinho.acessorio") ?? ""; } catch { /* sem armazenamento */ }
  const liberados = new Set(conquistas(estado.registros).filter((c) => c.ok).map((c) => c.acessorio));
  m.dataset.acessorio = liberados.has(acessorio) ? acessorio : "";

  document.body.classList.toggle("ocioso", !r);
  document.body.classList.toggle("alerta", !!r && duracao(r) >= ESQUECIDO_MS);
  $("tarefa").textContent = r ? r.tarefa : "Zzz...";
  $("tarefa").title = r ? `${r.projeto ? r.projeto + " · " : ""}${r.tarefa}` : "";
  $("relogio").textContent = r ? relogio(duracao(r)) : "clique pra começar";
  $("acao").textContent = r ? "■" : "▶";
  $("acao").title = r ? "Terminar" : "Começar uma tarefa";
  $("acao").classList.toggle("terminar", !!r);
}

async function chamar(comando) {
  try {
    const novo = await invoke(comando);
    if (novo) aplicar(novo);
  } catch (erro) {
    $("relogio").textContent = String(erro);
  }
}

$("acao").addEventListener("click", () => chamar(emAndamento() ? "terminar" : "abrir_janela"));
$("mascote").addEventListener("click", () => chamar("abrir_janela"));
$("fechar").addEventListener("click", () => chamar("alternar_mini"));

if (tauri) {
  tauri.event.listen("estado", (e) => aplicar(e.payload));
  // Trocar o acessório na janela principal também troca aqui.
  window.addEventListener("storage", render);
}

chamar("carregar");
setInterval(() => {
  const r = emAndamento();
  if (r) $("relogio").textContent = relogio(duracao(r));
}, 1000);
setInterval(render, 30000);
