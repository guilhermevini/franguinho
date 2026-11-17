// As contas do Franguinho, sem DOM: usadas pela interface e testadas no Node
// (`node --test`). Toda função que depende do relógio aceita `agora`.

export const SEM_PROJETO = "Sem projeto";

export function duracao(r, agora = new Date()) {
  const fim = r.fim ? new Date(r.fim) : agora;
  return Math.max(0, fim - new Date(r.inicio));
}

export function relogio(ms) {
  const s = Math.floor(ms / 1000);
  const dois = (n) => String(n).padStart(2, "0");
  return `${dois(Math.floor(s / 3600))}:${dois(Math.floor(s / 60) % 60)}:${dois(s % 60)}`;
}

export function curto(ms) {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  if (h === 0 && m === 0) return `${Math.floor(ms / 1000)}s`;
  if (h === 0) return `${m}min`;
  return m % 60 ? `${h}h ${String(m % 60).padStart(2, "0")}min` : `${h}h`;
}

/// "HH:MM" no fuso local, pro valor de um <input type="time">.
export function horaCampo(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/// Mesma data de `iso`, com a hora trocada pelo "HH:MM" do campo.
export function comHora(iso, hhmm) {
  const d = new Date(iso);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

/// "AAAA-MM-DD" no fuso local (ordenável).
export function diaLocal(data) {
  const d = new Date(data);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function diasEntre(a, b) {
  return Math.round((new Date(`${b}T12:00`) - new Date(`${a}T12:00`)) / 86400000);
}

export function nomeDoDia(iso, agora = new Date()) {
  const d = diaLocal(iso);
  if (d === diaLocal(agora)) return "Hoje";
  if (diasEntre(d, diaLocal(agora)) === 1) return "Ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
}

/// Horas por projeto desde o começo do dia ("hoje") ou da semana, a partir de
/// segunda ("semana"). Inclui a tarefa rodando. Linhas da maior pra menor.
export function resumo(registros, periodo, agora = new Date()) {
  const desde = new Date(agora);
  desde.setHours(0, 0, 0, 0);
  if (periodo === "semana") {
    desde.setDate(desde.getDate() - ((desde.getDay() + 6) % 7)); // volta pra segunda
  }

  const porProjeto = new Map();
  for (const r of registros) {
    if (new Date(r.inicio) < desde) continue;
    const nome = r.projeto ?? SEM_PROJETO;
    porProjeto.set(nome, (porProjeto.get(nome) ?? 0) + duracao(r, agora));
  }
  const linhas = [...porProjeto].sort((a, b) => b[1] - a[1]);
  return { linhas, total: linhas.reduce((soma, [, ms]) => soma + ms, 0) };
}

/// Dias seguidos com pelo menos uma tarefa terminada: a sequência atual
/// (vale até ontem, pra não "zerar" de manhã) e a melhor de todas.
export function sequencias(registros, agora = new Date()) {
  const dias = new Set(registros.filter((r) => r.fim).map((r) => diaLocal(r.inicio)));
  let melhor = 0;
  let corrida = 0;
  let anterior = null;
  for (const d of [...dias].sort()) {
    corrida = anterior && diasEntre(anterior, d) === 1 ? corrida + 1 : 1;
    melhor = Math.max(melhor, corrida);
    anterior = d;
  }
  let atual = 0;
  const cursor = new Date(agora);
  if (!dias.has(diaLocal(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dias.has(diaLocal(cursor))) {
    atual++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { atual, melhor };
}

/// Tudo calculado a partir dos registros: nada extra pra salvar.
export function conquistas(registros, agora = new Date()) {
  const feitos = registros.filter((r) => r.fim);
  const dias = new Map(); // dia → { ms, projetos }
  for (const r of feitos) {
    const dia = diaLocal(r.inicio);
    const d = dias.get(dia) ?? { ms: 0, projetos: new Set() };
    d.ms += duracao(r);
    if (r.projeto) d.projetos.add(r.projeto);
    dias.set(dia, d);
  }
  const horaDe = (iso) => new Date(iso).getHours();
  const horas = Math.floor(feitos.reduce((s, r) => s + duracao(r), 0) / 3600000);
  const melhor = sequencias(registros, agora).melhor;

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

// ---------- Temporadas ----------

/// Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), no fuso local.
export function pascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

export const TEMPORADAS = {
  carnaval: { emoji: "🎭", nome: "Carnaval", acessorio: "mascara",
    dormindo: "Ê, carnaval! Uma tarefinha antes do bloco?", trabalhando: "Foco no samba... digo, na tarefa!" },
  pascoa: { emoji: "🐣", nome: "Páscoa", acessorio: "orelhas",
    dormindo: "Pintinho de Páscoa às ordens!", trabalhando: "Escondendo ovos de produtividade..." },
  junina: { emoji: "🌽", nome: "Festa junina", acessorio: "palha",
    dormindo: "Arraiá do franguinho! Bora ciscar?", trabalhando: "Olha a pamonha... digo, o foco!" },
  halloween: { emoji: "🎃", nome: "Halloween", acessorio: "bruxa",
    dormindo: "Buuu! Tô com medo de ficar parado.", trabalhando: "Gostosuras ou tarefas!" },
  natal: { emoji: "🎅", nome: "Clima de Natal", acessorio: "gorro",
    dormindo: "Ho ho ho... me dá uma tarefa?", trabalhando: "Ho ho ho! Foco antes da ceia!" },
  anoNovo: { emoji: "🎆", nome: "Ano novo", acessorio: "chapeu",
    dormindo: "Feliz ano novo! Bora começar?", trabalhando: "Ano novo, ovos novos!" },
};

/// A temporada do dia, ou null. Carnaval e Páscoa mudam de data todo ano.
export function temporada(agora = new Date()) {
  const ano = agora.getFullYear();
  const mes = agora.getMonth() + 1;
  const dia = agora.getDate();
  const hoje = new Date(ano, agora.getMonth(), dia);
  const somar = (data, dias) => new Date(data.getFullYear(), data.getMonth(), data.getDate() + dias);
  const entre = (inicio, fim) => hoje >= inicio && hoje <= fim;

  const domingoDePascoa = pascoa(ano);
  const tercaDeCarnaval = somar(domingoDePascoa, -47);
  const comId = (id) => ({ id, ...TEMPORADAS[id] });

  if (entre(somar(tercaDeCarnaval, -3), somar(tercaDeCarnaval, 1))) return comId("carnaval");
  if (entre(somar(domingoDePascoa, -7), domingoDePascoa)) return comId("pascoa");
  if (mes === 6) return comId("junina");
  if (mes === 10 && dia >= 25) return comId("halloween");
  if (mes === 12 && dia <= 26) return comId("natal");
  if ((mes === 12 && dia >= 27) || (mes === 1 && dia <= 2)) return comId("anoNovo");
  return null;
}

/// O que o franguinho veste: o acessório escolhido, se a conquista dele ainda
/// vale; senão o da temporada; senão nada.
export function acessorioVisivel(registros, escolhido, agora = new Date()) {
  const liberados = new Set(conquistas(registros, agora).filter((c) => c.ok).map((c) => c.acessorio));
  if (escolhido && liberados.has(escolhido)) return escolhido;
  return temporada(agora)?.acessorio ?? "";
}

// ---------- Atalho ----------

/// Converte um keydown no formato de atalho do Tauri ("Ctrl+Alt+F"), ou null
/// enquanto a combinação não está completa. Precisa de Ctrl, Alt ou Cmd.
export function atalhoDoEvento(e, mac = false) {
  const tecla = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3)
    : /^Digit[0-9]$/.test(e.code) ? e.code.slice(5)
    : /^F([1-9]|1[0-9]|2[0-4])$/.test(e.code) ? e.code
    : e.code === "Space" ? "Space"
    : null;
  if (!tecla || !(e.ctrlKey || e.altKey || e.metaKey)) return null;
  const mods = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push(mac ? "Cmd" : "Super");
  return [...mods, tecla].join("+");
}
