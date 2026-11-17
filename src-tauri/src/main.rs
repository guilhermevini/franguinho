#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // sem console no Windows

mod sistema;
mod store;

use chrono::{DateTime, Local, TimeDelta};
use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use store::{Registro, Store};
use tauri::{AppHandle, Emitter, State};

/// Tudo o que a interface precisa pra se desenhar. Toda mudança devolve (e emite
/// no evento "estado") o estado completo, então o frontend só re-renderiza.
#[derive(Clone, Serialize)]
pub struct Estado {
    registros: Vec<Registro>,
    projetos: Vec<String>,
}

impl Estado {
    pub fn em_andamento(&self) -> Option<&Registro> {
        self.registros.iter().find(|r| r.fim.is_none())
    }
}

pub struct Franguinho {
    store: Store,
    estado: Mutex<Estado>,
}

type Resultado = Result<Estado, String>;

impl Franguinho {
    fn trava(&self) -> MutexGuard<'_, Estado> {
        self.estado.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn ler(&self) -> Estado {
        self.trava().clone()
    }

    /// Aplica uma mudança, salva e avisa a janela e a bandeja.
    fn alterar(
        &self,
        app: &AppHandle,
        mudanca: impl FnOnce(&mut Estado) -> Result<(), String>,
    ) -> Resultado {
        let novo = {
            let mut estado = self.trava();
            mudanca(&mut estado)?;
            self.store
                .salvar(&estado.registros)
                .and_then(|_| self.store.salvar_projetos(&estado.projetos))
                .map_err(|e| format!("Ih, não consegui salvar: {e}"))?;
            estado.clone()
        };
        sistema::atualizar(app, &novo);
        let _ = app.emit("estado", &novo);
        Ok(novo)
    }

    /// Começa uma tarefa. Num projeto sem descrição, a tarefa leva o nome do projeto.
    /// Só uma tarefa roda por vez: a anterior termina automaticamente.
    pub fn comecar(
        &self,
        app: &AppHandle,
        tarefa: Option<String>,
        projeto: Option<String>,
    ) -> Resultado {
        let projeto = limpo(projeto);
        let tarefa = limpo(tarefa)
            .or_else(|| projeto.clone())
            .ok_or("Me conta o que você vai fazer!")?;
        self.alterar(app, |e| {
            if let Some(atual) = e.registros.iter_mut().find(|r| r.fim.is_none()) {
                if atual.tarefa == tarefa && atual.projeto == projeto {
                    return Ok(()); // já está rodando exatamente isso
                }
                atual.fim = Some(Local::now());
            }
            e.registros.push(Registro {
                tarefa,
                projeto,
                inicio: Local::now(),
                fim: None,
            });
            Ok(())
        })
    }

    /// Desconta uma ausência: a tarefa rodando termina quando você saiu e, se
    /// `continuar`, recomeça agora com o mesmo nome e projeto.
    pub fn descontar_ausencia(
        &self,
        app: &AppHandle,
        desde: DateTime<Local>,
        continuar: bool,
    ) -> Resultado {
        self.alterar(app, |e| {
            let i = e
                .registros
                .iter()
                .position(|r| r.fim.is_none())
                .ok_or("Não tem tarefa rodando.")?;
            let atual = e.registros[i].clone();
            if desde <= atual.inicio {
                e.registros.remove(i); // saiu logo que começou: não sobra nada
            } else {
                e.registros[i].fim = Some(desde.min(Local::now()));
            }
            if continuar {
                e.registros.push(Registro {
                    inicio: Local::now(),
                    fim: None,
                    ..atual
                });
            }
            Ok(())
        })
    }

    pub fn terminar(&self, app: &AppHandle) -> Resultado {
        self.alterar(app, |e| {
            if let Some(atual) = e.registros.iter_mut().find(|r| r.fim.is_none()) {
                atual.fim = Some(Local::now());
            }
            Ok(())
        })
    }
}

fn limpo(texto: Option<String>) -> Option<String> {
    texto
        .map(|t| t.trim().to_owned())
        .filter(|t| !t.is_empty())
}

#[tauri::command]
fn carregar(f: State<Franguinho>) -> Estado {
    f.ler()
}

#[tauri::command]
fn comecar(
    app: AppHandle,
    f: State<Franguinho>,
    tarefa: Option<String>,
    projeto: Option<String>,
) -> Resultado {
    f.comecar(&app, tarefa, projeto)
}

#[tauri::command]
fn terminar(app: AppHandle, f: State<Franguinho>) -> Resultado {
    f.terminar(&app)
}

#[tauri::command]
fn descontar_ausencia(
    app: AppHandle,
    f: State<Franguinho>,
    desde: DateTime<Local>,
    continuar: bool,
) -> Resultado {
    f.descontar_ausencia(&app, desde, continuar)
}

/// Corrige um registro (nome, projeto e horários), pra quando você esquece de
/// apertar começar ou terminar na hora certa.
#[tauri::command]
fn editar_registro(
    app: AppHandle,
    f: State<Franguinho>,
    indice: usize,
    tarefa: String,
    projeto: Option<String>,
    inicio: DateTime<Local>,
    fim: Option<DateTime<Local>>,
) -> Resultado {
    let projeto = limpo(projeto);
    let tarefa = limpo(Some(tarefa))
        .or_else(|| projeto.clone())
        .ok_or("A tarefa precisa de um nome.")?;
    let limite = Local::now() + TimeDelta::minutes(1);
    if inicio > limite {
        return Err("O início não pode ser no futuro.".into());
    }
    if let Some(fim) = fim {
        if fim <= inicio {
            return Err("O fim precisa ser depois do início.".into());
        }
        if fim > limite {
            return Err("O fim não pode ser no futuro.".into());
        }
    }
    f.alterar(&app, |e| {
        let r = e
            .registros
            .get_mut(indice)
            .ok_or("Esse registro não existe mais.")?;
        if r.fim.is_none() != fim.is_none() {
            return Err("Não dá pra mudar se a tarefa está rodando ou não.".into());
        }
        *r = Registro {
            tarefa,
            projeto,
            inicio,
            fim,
        };
        e.registros.sort_by_key(|r| r.inicio);
        Ok(())
    })
}

#[tauri::command]
fn apagar_registro(app: AppHandle, f: State<Franguinho>, indice: usize) -> Resultado {
    f.alterar(&app, |e| {
        if indice >= e.registros.len() {
            return Err("Esse registro não existe mais.".into());
        }
        e.registros.remove(indice);
        Ok(())
    })
}

#[tauri::command]
fn adicionar_projeto(app: AppHandle, f: State<Franguinho>, nome: String) -> Resultado {
    let nome = limpo(Some(nome)).ok_or("O projeto precisa de um nome.")?;
    f.alterar(&app, |e| {
        if !e.projetos.contains(&nome) {
            e.projetos.push(nome);
        }
        Ok(())
    })
}

#[tauri::command]
fn remover_projeto(app: AppHandle, f: State<Franguinho>, nome: String) -> Resultado {
    f.alterar(&app, |e| {
        e.projetos.retain(|p| *p != nome);
        Ok(())
    })
}

#[tauri::command]
fn exportar_csv(f: State<Franguinho>) -> Result<String, String> {
    f.store
        .exportar_csv(&f.trava().registros)
        .map(|p| p.display().to_string())
        .map_err(|e| format!("Não deu pra exportar: {e}"))
}

#[tauri::command]
fn atalho() -> &'static str {
    sistema::ATALHO
}

fn main() {
    let store = Store::new();
    let estado = Estado {
        registros: store.carregar(),
        projetos: store.carregar_projetos(),
    };

    tauri::Builder::default()
        // Abrir o app de novo só traz a janela da cópia que já está rodando,
        // em vez de ter dois franguinhos escrevendo no mesmo arquivo.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            sistema::mostrar_janela(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .manage(Franguinho {
            store,
            estado: Mutex::new(estado),
        })
        .setup(|app| {
            let app = app.handle();
            sistema::criar_bandeja(app)?;
            if let Err(e) = sistema::registrar_atalho(app) {
                // Outro app pode já usar a combinação; o Franguinho segue sem ela.
                eprintln!("não consegui registrar o atalho {}: {e}", sistema::ATALHO);
            }
            sistema::vigiar(app.clone());
            Ok(())
        })
        .on_window_event(|janela, evento| {
            // Fechar a janela só esconde: o franguinho continua na bandeja.
            if let tauri::WindowEvent::CloseRequested { api, .. } = evento {
                api.prevent_close();
                let _ = janela.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            carregar,
            comecar,
            terminar,
            descontar_ausencia,
            editar_registro,
            apagar_registro,
            adicionar_projeto,
            remover_projeto,
            exportar_csv,
            atalho,
        ])
        .build(tauri::generate_context!())
        .expect("erro ao abrir o Franguinho")
        .run(|_app, _evento| {
            // No macOS, clicar no ícone do Dock com a janela escondida traz ela de volta.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _evento {
                sistema::mostrar_janela(_app);
            }
        });
}
