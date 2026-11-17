// Os sons do franguinho, sintetizados na hora com a Web Audio API: nada de
// arquivos de áudio. Cada som é uma lista de notas (frequência, início,
// duração, formato da onda e, se quiser, a frequência pra onde ela escorrega).

let contexto = null;

/// O navegador só deixa tocar depois de um clique: o contexto nasce (ou acorda)
/// no primeiro uso e em qualquer clique na janela.
function audio() {
  contexto ??= new AudioContext();
  if (contexto.state === "suspended") contexto.resume();
  return contexto;
}
document.addEventListener("pointerdown", () => contexto?.resume(), { capture: true });

function nota(ctx, { freq, ate, inicio = 0, dur, onda = "triangle", volume = 0.18 }) {
  const t = ctx.currentTime + inicio;
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();
  osc.type = onda;
  osc.frequency.setValueAtTime(freq, t);
  if (ate) osc.frequency.exponentialRampToValueAtTime(ate, t + dur);
  ganho.gain.setValueAtTime(0.0001, t);
  ganho.gain.exponentialRampToValueAtTime(volume, t + 0.012);
  ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(ganho).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

const SONS = {
  // "Có!": sobe e desce rapidinho.
  comecar: [
    { freq: 650, ate: 1150, dur: 0.07 },
    { freq: 1150, ate: 700, inicio: 0.07, dur: 0.1 },
  ],
  // "Có-có-cocó!": três bicadas e um cacarejo esticado.
  terminar: [
    { freq: 520, ate: 420, dur: 0.07, onda: "square", volume: 0.07 },
    { freq: 540, ate: 430, inicio: 0.11, dur: 0.07, onda: "square", volume: 0.07 },
    { freq: 560, ate: 440, inicio: 0.22, dur: 0.07, onda: "square", volume: 0.07 },
    { freq: 620, ate: 980, inicio: 0.34, dur: 0.22, onda: "square", volume: 0.07 },
  ],
  // Sininho da pausa: fundamental e um harmônico, com cauda longa.
  pausa: [
    { freq: 880, dur: 1.3, onda: "sine", volume: 0.22 },
    { freq: 1760, dur: 0.8, onda: "sine", volume: 0.06 },
    { freq: 1320, inicio: 0.18, dur: 1.1, onda: "sine", volume: 0.12 },
  ],
  // Fim da pausa: duas notas chamando de volta.
  voltar: [
    { freq: 660, dur: 0.16, onda: "sine" },
    { freq: 990, inicio: 0.16, dur: 0.3, onda: "sine" },
  ],
  // Cutucar o franguinho: um "piu!" agudinho.
  cutucar: [
    { freq: 1300, ate: 1900, dur: 0.06, onda: "sine", volume: 0.16 },
    { freq: 1900, ate: 1450, inicio: 0.06, dur: 0.07, onda: "sine", volume: 0.16 },
  ],
  // Conquista: arpejo de dó maior.
  conquista: [523, 659, 784, 1047].map((freq, i) => ({ freq, inicio: i * 0.09, dur: i === 3 ? 0.45 : 0.14 })),
};

/// `tom` multiplica as frequências (1 = normal), pra variar um som repetido.
export function tocar(nome, tom = 1) {
  const notas = SONS[nome];
  if (!notas) return;
  try {
    const ctx = audio();
    for (const n of notas) nota(ctx, { ...n, freq: n.freq * tom, ate: n.ate && n.ate * tom });
  } catch {
    // Sem áudio (ou bloqueado): o franguinho fica quieto.
  }
}
