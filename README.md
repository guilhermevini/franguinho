# 🐔 Franguinho

Um franguinho simpático que registra o início e o fim das suas tarefas — um *time tracker*
manual para desktop (Windows, Linux e macOS), feito com [Tauri 2](https://tauri.app):
lógica e dados em Rust, interface em HTML/CSS/JS puro (sem npm, sem build).

## Estrutura

```
ui/                 interface (index.html, style.css, app.js, fonte Nunito)
src-tauri/          app Rust: comandos, armazenamento, config do Tauri e ícones
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
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

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
