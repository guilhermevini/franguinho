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

### Testes

```sh
cd src-tauri && cargo test   # regras (começar, terminar, editar, ausência…) e armazenamento
npm test                     # contas da interface (resumo, sequência, conquistas) — sem dependências
```

O GitHub Actions roda `cargo fmt`, `clippy` e os dois conjuntos de testes a cada push.

### Mexendo só no visual

Abra a pasta `ui/` num servidor qualquer (ex.: `python3 -m http.server -d ui`) e use o navegador.
Fora do Tauri, o `app.js` usa um backend de mentira em memória com os mesmos comandos.

## Projetos

Clique em **+ projeto** para criar um atalho. Um clique no projeto já começa a tarefa
(se tiver algo digitado no campo, vira a descrição da tarefa dentro do projeto).
Clicar noutro projeto troca de tarefa; passe o mouse e clique no **×** para remover.

## Bandeja, atalho e avisos

- **Bandeja / barra de menu:** mostra a tarefa atual, termina, começa qualquer projeto e abre a janela.
  No macOS, o tempo da tarefa aparece do lado do ícone. Fechar a janela só esconde — use **Sair** no menu.
- **Atalho global `Ctrl+Alt+F`:** de qualquer app, termina a tarefa rodando ou abre o Franguinho
  pronto pra digitar. Mude em `ATALHO`, no `src-tauri/src/sistema.rs`.
- **Esqueceu ligado?** Depois de 3h seguidas (`ESQUECIDO_HORAS`), o franguinho reclama na janela e manda
  uma notificação do sistema — e de novo a cada hora a mais.

- **Você voltou?** Se você some por 10 min (`AUSENTE_MIN`) — sem mexer no mouse/teclado ou com o
  computador dormindo — com uma tarefa rodando, ao voltar o franguinho pergunta se é pra descontar e
  continuar, terminar na hora em que você saiu ou manter tudo.
- **Mini janela:** só o franguinho, a tarefa e o cronômetro, sem bordas e sempre por cima.
  Abra pelo botão **🪟 mini** da janela principal ou pelo menu da bandeja; arraste pra onde quiser.
- **Uma cópia só:** abrir o app de novo só traz a janela que já está aberta.

## Ovos e conquistas

Cada tarefa terminada vira um 🥚 no ninho do dia, e dias seguidos de uso acendem uma 🔥 sequência.
Dez conquistas (primeiro ovo, foco de 90 min, madrugador, coruja, maratona…) são calculadas a partir
dos registros; quatro delas liberam acessórios pro franguinho — chapéu de festa, óculos escuros, laço
e coroa. Clique numa conquista feita para vestir.

## Resumo e correções

- **Resumo:** horas por projeto de hoje ou da semana (a partir de segunda), em barrinhas.
- **Corrigir registros:** clique numa tarefa do histórico para mudar nome, projeto e horários
  (fim antes do início = passou da meia-noite). Na tarefa rodando, clique em "desde HH:MM ✏️".

## Onde ficam os dados

`registros.json` e `projetos.json`, na pasta de dados do sistema:

| Sistema | Pasta |
|---|---|
| macOS | `~/Library/Application Support/franguinho` |
| Windows | `%APPDATA%\franguinho` |
| Linux | `~/.local/share/franguinho` |

O botão **📄 Exportar CSV** gera `registros.csv` na mesma pasta.

## Licença

[MIT](LICENSE). A fonte Nunito (`ui/fonts`) é distribuída sob a SIL Open Font License 1.1.
