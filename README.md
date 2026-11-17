# 🐔 Franguinho

Um franguinho simpático que registra o início e o fim das suas tarefas — um *time tracker*
manual para desktop (Windows, Linux e macOS), feito com [Tauri 2](https://tauri.app):
lógica e dados em Rust, interface em HTML/CSS/JS puro (sem npm, sem build).

## Estrutura

```
ui/                 interface (index.html, mini.html, app.js, mini.js, logica.js, mascote.js, CSS, fonte)
tests/              testes da interface (node --test)
src-tauri/          app Rust: regras (estado.rs), comandos, armazenamento, bandeja, ícones
assets/icone.svg    fonte do ícone (gere os PNG/ICNS/ICO com `cargo tauri icon`)
```

## Rodando

Pré-requisitos: Rust e o CLI do Tauri (`cargo install tauri-cli --version "^2" --locked`).

```sh
cd src-tauri
cargo tauri dev      # desenvolvimento
cargo tauri build    # gera o instalador (.dmg/.app, .msi/.exe, .deb/.rpm/.AppImage)
```

No Linux, instale antes as dependências do WebKitGTK
([lista completa](https://tauri.app/start/prerequisites/#linux)):

```sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libxss-dev
```

### Lançando uma versão

1. Suba a versão em `src-tauri/tauri.conf.json` e `src-tauri/Cargo.toml` (ex.: `0.2.0`) e faça o commit.
2. `git tag v0.2.0 && git push --tags`
3. O workflow **Release** gera os instaladores de macOS (Apple Silicon e Intel), Windows e Linux numa
   release em **rascunho**. Confira e clique em **Publish**.
4. Quem já tem o app vê a faixa "versão nova disponível" (ele procura ao abrir e a cada 6h) e
   atualiza com um clique. O pacote só é aceito se a assinatura bater com a chave pública do
   `tauri.conf.json`.

A chave privada que assina as atualizações fica em `~/.tauri/franguinho.key` (senha em
`~/.tauri/franguinho.senha`) e nos segredos `TAURI_SIGNING_PRIVATE_KEY` e
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` do repositório. **Guarde uma cópia num lugar seguro:** sem ela
não dá pra publicar atualizações que os apps instalados aceitem.

Os instaladores não são assinados pela Apple nem pela Microsoft (custa caro): na primeira vez o macOS
pede "botão direito → Abrir" e o Windows mostra o SmartScreen.

### Testes

```sh
cd src-tauri && cargo test   # regras (começar, terminar, editar, ausência…) e armazenamento
npm test                     # contas da interface (resumo, sequência, conquistas) — sem dependências
```

O GitHub Actions roda `cargo fmt`, `clippy` e os dois conjuntos de testes a cada push.

### Mexendo só no visual

Abra a pasta `ui/` num servidor qualquer (ex.: `python3 -m http.server -d ui`) e use o navegador.
Fora do Tauri, o `app.js` usa um backend de mentira em memória com os mesmos comandos.

## Tarefas e atalhos

Tudo é tarefa: digite um nome novo pra criar ou escolha uma já usada (o campo sugere enquanto você
digita). Os **atalhos** mostram as tarefas fixadas, cada uma com sua cor, e as últimas usadas; um
clique começa. Passe o mouse num atalho e clique em **📌** pra fixar ou **×** pra tirar; a tarefa
rodando também tem um botão **📌 fixar**. Começar outra tarefa termina a anterior.

## Bandeja, atalho e avisos

- **Bandeja / barra de menu:** mostra a tarefa atual, termina, começa qualquer tarefa fixada e abre a janela.
  No macOS, o tempo da tarefa aparece do lado do ícone. Fechar a janela só esconde — use **Sair** no menu.
- **Atalho global `Ctrl+Alt+F`:** de qualquer app, termina a tarefa rodando ou abre o Franguinho
  pronto pra digitar. Dá pra trocar nas configurações.
- **Esqueceu ligado?** Depois de 3h seguidas (ajustável), o franguinho reclama na janela e manda
  uma notificação do sistema — e de novo a cada hora a mais.

- **Você voltou?** Se você some por 10 min (ajustável) — sem mexer no mouse/teclado ou com o
  computador dormindo — com uma tarefa rodando, ao voltar o franguinho pergunta se é pra descontar e
  continuar, terminar na hora em que você saiu ou manter tudo.
- **Mini janela:** só o franguinho, a tarefa e o cronômetro, sem bordas e sempre por cima.
  Abra pelo botão **🪟 mini** da janela principal ou pelo menu da bandeja; arraste pra onde quiser.
- **Uma cópia só:** abrir o app de novo só traz a janela que já está aberta.

## Configurações

No ⚙️ da janela principal: iniciar com o sistema, trocar o atalho global (clique no campo e aperte a
combinação), as horas do aviso de tarefa esquecida e os minutos da ausência (0 desliga), e um botão
pra abrir a pasta dos dados. Fica salvo em `config.json`, na pasta de dados.

> "Iniciar com o sistema" registra o executável que está rodando. Ative pelo app instalado
> (`cargo tauri build`), não pelo `cargo tauri dev`, senão o sistema vai abrir a versão de desenvolvimento.

## Pomodoro 🍅

Opcional, nas configurações (foco de 25 min e pausa de 5 min por padrão). Com uma tarefa rodando,
aparece quanto falta pra pausa. No fim do foco a tarefa termina sozinha — a pausa não conta como
trabalho —, chega uma notificação e começa a contagem da pausa; no fim dela, outra notificação e um
botão pra voltar pra mesma tarefa. Os pomodoros do dia aparecem no ninho. O relógio roda no Rust,
então funciona com a janela escondida.

## Sons 🔊

Um "có!" ao começar, um "piu!" quando você cutuca o franguinho, um cacarejo ao terminar, um sininho na pausa do Pomodoro, duas notas no fim
dela e um arpejo nas conquistas. São sintetizados na hora (Web Audio API), sem arquivos de áudio.
Dá pra testar e desligar nas configurações.

## Ovos e conquistas

Cada tarefa terminada vira um 🥚 no ninho do dia, e dias seguidos de uso acendem uma 🔥 sequência.
Dez conquistas (primeiro ovo, foco de 90 min, madrugador, coruja, maratona…) são calculadas a partir
dos registros; quatro delas liberam acessórios pro franguinho — chapéu de festa, óculos escuros, laço
e coroa. Clique numa conquista feita para vestir.

## Franguinho sazonal

Em datas especiais o franguinho se veste sozinho e muda as falas: 🎭 Carnaval (máscara), 🐣 Páscoa
(orelhas de coelho), 🌽 festa junina (chapéu de palha), 🎃 Halloween (chapéu de bruxa), 🎅 Natal
(gorro) e 🎆 ano novo (chapéu de festa). Carnaval e Páscoa são calculados todo ano. Um acessório
escolhido nas conquistas tem prioridade sobre o da temporada.

## Ano no ninho

Um mapa de calor das últimas 53 semanas, no estilo do GitHub: cada quadradinho é um dia, mais laranja
quanto mais horas (até 1h, 3h, 5h e acima). Passe o mouse ou clique num dia pra ver as horas dele.

## Resumo e correções

- **Resumo:** horas por tarefa de hoje ou da semana (a partir de segunda), em barrinhas; as menores
  se juntam em "Outras".
- **Relatório da semana:** o botão **📋 Relatório** monta um texto com total, horas por tarefa (com %)
  e por dia, desta semana ou da passada, pronto pra copiar e colar num timesheet ou no chat.
- **Corrigir registros:** clique numa tarefa do histórico para mudar o nome e os horários
  (fim antes do início = passou da meia-noite). Na tarefa rodando, clique em "desde HH:MM ✏️".

## Onde ficam os dados

`registros.json`, `fixadas.json` e `config.json`, na pasta de dados do sistema:

| Sistema | Pasta |
|---|---|
| macOS | `~/Library/Application Support/franguinho` |
| Windows | `%APPDATA%\franguinho` |
| Linux | `~/.local/share/franguinho` |

O botão **📄 Exportar CSV** gera `registros.csv` na mesma pasta.

**Backup automático:** uma vez por dia (ao abrir e na virada do dia), os dois JSON são copiados para
`backups/AAAA-MM-DD/` nessa pasta. Ficam os 7 dias mais recentes. Pra restaurar, feche o app e copie
os arquivos de volta.

## Licença

[MIT](LICENSE). A fonte Nunito (`ui/fonts`) é distribuída sob a SIL Open Font License 1.1.
