import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acessorioVisivel, atalhoDoEvento, comHora, conquistas, curto, diasEntre, duracao, horaCampo, nomeDoDia, pascoa,
  recentes, relogio, resumo, sequencias, sugestoes, temporada,
} from "../ui/logica.js";

// 17/11/2026 é uma terça. Datas montadas no fuso local, como o app faz.
const em = (dia, h, m = 0) => new Date(2026, 10, dia, h, m).toISOString();
const feito = (tarefa, dia, h1, m1, h2, m2) =>
  ({ tarefa, inicio: em(dia, h1, m1), fim: em(dia, h2, m2) });
const MIN = 60000;

test("curto e relogio formatam durações", () => {
  assert.equal(curto(42 * 1000), "42s");
  assert.equal(curto(7 * MIN), "7min");
  assert.equal(curto(60 * MIN), "1h");
  assert.equal(curto(65 * MIN), "1h 05min");
  assert.equal(relogio((3600 + 61) * 1000), "01:01:01");
});

test("duracao usa agora pra tarefa rodando e nunca fica negativa", () => {
  const agora = new Date(em(17, 10));
  assert.equal(duracao({ inicio: em(17, 9), fim: null }, agora), 60 * MIN);
  assert.equal(duracao({ inicio: em(17, 9), fim: em(17, 8) }), 0);
});

test("comHora troca só a hora e horaCampo volta", () => {
  const d = comHora(em(17, 9, 15), "23:05");
  assert.equal(d.getDate(), 17);
  assert.equal(horaCampo(d), "23:05");
});

test("diasEntre atravessa virada de mês", () => {
  assert.equal(diasEntre("2026-10-31", "2026-11-01"), 1);
  assert.equal(diasEntre("2026-11-17", "2026-11-17"), 0);
});

test("nomeDoDia diz Hoje e Ontem", () => {
  const agora = new Date(em(17, 12));
  assert.equal(nomeDoDia(em(17, 9), agora), "Hoje");
  assert.equal(nomeDoDia(em(16, 9), agora), "Ontem");
  assert.notEqual(nomeDoDia(em(14, 9), agora), "Ontem");
});

test("resumo separa hoje da semana (a partir de segunda) e conta a tarefa rodando", () => {
  const agora = new Date(em(18, 12)); // quarta
  const registros = [
    feito("Trabalho", 15, 9, 0, 10, 0), // domingo: semana passada
    feito("Trabalho", 16, 9, 0, 10, 0),
    feito("Trabalho", 18, 9, 0, 9, 30),
    feito("e-mails", 18, 10, 0, 10, 15),
    { tarefa: "Estudos", inicio: em(18, 11, 30), fim: null },
  ];
  const hoje = resumo(registros, "hoje", agora);
  assert.equal(hoje.total, 75 * MIN);
  assert.deepEqual(Object.fromEntries(hoje.linhas),
    { Trabalho: 30 * MIN, Estudos: 30 * MIN, "e-mails": 15 * MIN });

  const semana = resumo(registros, "semana", agora);
  assert.deepEqual(semana.linhas[0], ["Trabalho", 90 * MIN]);
  assert.equal(semana.total, 135 * MIN);
});

test("resumo junta as menores em Outras quando passa do limite", () => {
  const agora = new Date(em(17, 23));
  const registros = ["a", "b", "c", "d"].map((t, i) => feito(t, 17, 9 + i, 0, 9 + i, 40 - i * 10));
  const { linhas, total } = resumo(registros, "hoje", agora, 3);
  assert.equal(linhas.length, 3);
  assert.deepEqual(linhas.slice(0, 2).map((l) => l[0]), ["a", "b"]);
  assert.equal(linhas[2][0], "Outras 2 tarefas");
  assert.equal(linhas[2][1], (20 + 10) * MIN);
  assert.ok(linhas[2][2].outras);
  assert.equal(total, (40 + 30 + 20 + 10) * MIN);
});

test("sugestoes e recentes vêm do uso mais recente, sem repetir nem fixadas", () => {
  const registros = [
    feito("a", 15, 9, 0, 10, 0),
    feito("b", 16, 9, 0, 10, 0),
    feito("a", 17, 9, 0, 10, 0),
    feito("c", 17, 11, 0, 12, 0),
  ];
  assert.deepEqual(sugestoes(registros), ["c", "a", "b"]);
  assert.deepEqual(recentes(registros, ["a"]), ["c", "b"]);
  assert.deepEqual(recentes(registros, [], 2), ["c", "a"]);
});

test("sequencias: atual vale até ontem e melhor guarda o recorde", () => {
  const registros = [10, 11, 14, 15, 16, 17].map((d) => feito("x", d, 9, 0, 10, 0));
  assert.deepEqual(sequencias(registros, new Date(em(17, 20))), { atual: 4, melhor: 4 });
  assert.deepEqual(sequencias(registros, new Date(em(18, 8))), { atual: 4, melhor: 4 });
  assert.deepEqual(sequencias(registros, new Date(em(19, 8))), { atual: 0, melhor: 4 });
  // tarefa rodando não conta como dia feito
  assert.equal(sequencias([{ inicio: em(17, 9), fim: null }], new Date(em(17, 10))).atual, 0);
});

test("conquistas são calculadas a partir dos registros", () => {
  const ok = (registros) =>
    new Set(conquistas(registros, new Date(em(17, 23, 30))).filter((c) => c.ok).map((c) => c.id));

  assert.equal(ok([]).size, 0);
  assert.ok(ok([feito("a", 17, 9, 0, 9, 10)]).has("primeiro"));
  assert.ok(ok([feito("longa", 17, 9, 0, 10, 30)]).has("foco"));
  assert.ok(!ok([feito("quase", 17, 9, 0, 10, 29)]).has("foco"));
  assert.ok(ok([feito("cedo", 17, 6, 0, 6, 30)]).has("madrugador"));
  assert.ok(ok([feito("tarde", 17, 22, 0, 23, 0)]).has("coruja"));
  assert.ok(ok(["A", "B", "C"].map((t, i) => feito(t, 17, 9 + i, 0, 9 + i, 30))).has("versatil"));
  assert.ok(!ok(["A", "A", "B"].map((t, i) => feito(t, 17, 9 + i, 0, 9 + i, 30))).has("versatil"));
  assert.ok(ok([feito("maratona", 17, 8, 0, 14, 0)]).has("maratona"));

  const duzia = conquistas([feito("a", 17, 9, 0, 9, 10)]).find((c) => c.id === "duzia");
  assert.deepEqual(duzia.prog, [1, 12]);
  assert.equal(duzia.acessorio, "chapeu");
});

test("pascoa bate com o calendário", () => {
  const iso = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  assert.equal(iso(pascoa(2025)), "2025-4-20");
  assert.equal(iso(pascoa(2026)), "2026-4-5");
  assert.equal(iso(pascoa(2027)), "2027-3-28");
  assert.equal(iso(pascoa(2038)), "2038-4-25"); // a mais tardia possível
});

test("temporada de cada época do ano", () => {
  const t = (ano, mes, dia) => temporada(new Date(ano, mes - 1, dia, 12))?.id ?? null;
  // Carnaval 2026: terça 17/02 → de sábado 14 a quarta 18
  assert.equal(t(2026, 2, 13), null);
  assert.equal(t(2026, 2, 14), "carnaval");
  assert.equal(t(2026, 2, 18), "carnaval");
  assert.equal(t(2026, 2, 19), null);
  // Páscoa 2026: 05/04 → semana de 29/03 a 05/04
  assert.equal(t(2026, 3, 28), null);
  assert.equal(t(2026, 3, 29), "pascoa");
  assert.equal(t(2026, 4, 5), "pascoa");
  assert.equal(t(2026, 4, 6), null);
  assert.equal(t(2026, 6, 24), "junina");
  assert.equal(t(2026, 10, 24), null);
  assert.equal(t(2026, 10, 31), "halloween");
  assert.equal(t(2026, 11, 30), null);
  assert.equal(t(2026, 12, 1), "natal");
  assert.equal(t(2026, 12, 25), "natal");
  assert.equal(t(2026, 12, 31), "anoNovo");
  assert.equal(t(2027, 1, 2), "anoNovo");
  assert.equal(t(2027, 1, 3), null);
});

test("acessório escolhido vence a temporada, se a conquista ainda vale", () => {
  const natal = new Date(2026, 11, 10, 12);
  const longa = [feito("longa", 17, 9, 0, 10, 30)]; // libera os óculos
  assert.equal(acessorioVisivel([], "", natal), "gorro");
  assert.equal(acessorioVisivel(longa, "oculos", natal), "oculos");
  assert.equal(acessorioVisivel([], "oculos", natal), "gorro"); // sem a conquista, volta pro gorro
  assert.equal(acessorioVisivel([], "", new Date(2026, 7, 10)), "");
});

test("atalhoDoEvento monta a combinação e ignora teclas soltas", () => {
  const ev = (code, mods = {}) => ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  assert.equal(atalhoDoEvento(ev("KeyF", { ctrlKey: true, altKey: true })), "Ctrl+Alt+F");
  assert.equal(atalhoDoEvento(ev("KeyT", { metaKey: true, shiftKey: true }), true), "Shift+Cmd+T");
  assert.equal(atalhoDoEvento(ev("KeyT", { metaKey: true }), false), "Super+T");
  assert.equal(atalhoDoEvento(ev("Digit1", { altKey: true })), "Alt+1");
  assert.equal(atalhoDoEvento(ev("F5", { ctrlKey: true })), "Ctrl+F5");
  assert.equal(atalhoDoEvento(ev("Space", { ctrlKey: true })), "Ctrl+Space");
  assert.equal(atalhoDoEvento(ev("KeyF")), null, "sem modificador");
  assert.equal(atalhoDoEvento(ev("KeyF", { shiftKey: true })), null, "só Shift não basta");
  assert.equal(atalhoDoEvento(ev("ControlLeft", { ctrlKey: true })), null, "só o modificador");
});
