import { acessorioVisivel, duracao, relogio } from "./logica.js";
import { svgMascote } from "./mascote.js";

const tauri = window.__TAURI__;
// No navegador (prévia do visual), uma tarefa de mentira rodando.
const invoke = tauri?.core.invoke ?? (async (comando) => comando === "carregar"
  ? { fixadas: ["Trabalho"], registros: [{ id: 1, tarefa: "Trabalho · revisar PR",
      inicio: new Date(Date.now() - 754000).toISOString(), fim: null }] }
  : undefined);

const $ = (id) => document.getElementById(id);
let estado = { registros: [], fixadas: [] };
let comemorandoAte = 0;
let esquecidoMs = 3 * 3600 * 1000; // atualizado pelas configurações
let pomodoro = { fase: "parado", fim: null, retomar: null };
const naPausa = () => !emAndamento() && pomodoro.fase === "pausa";
const faltaDaPausa = () => relogio(Math.max(0, new Date(pomodoro.fim) - Date.now())).slice(3);

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
  m.dataset.acessorio = acessorioVisivel(estado.registros, acessorio);

  document.body.classList.toggle("alerta", !!r && esquecidoMs > 0 && duracao(r) >= esquecidoMs);
  $("tarefa").textContent = r ? r.tarefa : naPausa() ? `☕ pausa · ${pomodoro.retomar}` : "Zzz...";
  $("tarefa").title = r ? r.tarefa : "";
  $("relogio").textContent = r ? relogio(duracao(r)) : naPausa() ? faltaDaPausa() : "clique pra começar";
  document.body.classList.toggle("ocioso", !r && !naPausa());
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

$("acao").addEventListener("click", () => {
  if (emAndamento()) chamar("terminar");
  else if (pomodoro.retomar) invoke("comecar", { tarefa: pomodoro.retomar }).then(aplicar).catch(() => {});
  else chamar("abrir_janela");
});
$("mascote").addEventListener("click", () => chamar("abrir_janela"));
$("fechar").addEventListener("click", () => chamar("alternar_mini"));

if (tauri) {
  tauri.event.listen("estado", (e) => aplicar(e.payload));
  const usarPreferencias = (p) => {
    esquecidoMs = p.esquecido_horas * 3600000;
    render();
  };
  invoke("preferencias").then(usarPreferencias).catch(() => {});
  const usarPomodoro = (p) => {
    pomodoro = p;
    render();
  };
  invoke("pomodoro").then(usarPomodoro).catch(() => {});
  tauri.event.listen("pomodoro", (e) => usarPomodoro(e.payload));
  tauri.event.listen("preferencias", (e) => usarPreferencias(e.payload));
  // Trocar o acessório na janela principal também troca aqui.
  window.addEventListener("storage", render);
}

chamar("carregar");
setInterval(() => {
  const r = emAndamento();
  if (r) $("relogio").textContent = relogio(duracao(r));
  else if (naPausa()) $("relogio").textContent = faltaDaPausa();
}, 1000);
setInterval(render, 30000);
