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
