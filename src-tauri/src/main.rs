#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // sem console no Windows

mod estado;
mod sistema;
mod store;

use chrono::{DateTime, Local};
use estado::Estado;
use std::sync::{Mutex, MutexGuard};
use store::Store;
use tauri::{AppHandle, Emitter, State};

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

    pub fn comecar(
        &self,
        app: &AppHandle,
        tarefa: Option<String>,
        projeto: Option<String>,
    ) -> Resultado {
        self.alterar(app, |e| e.comecar(tarefa, projeto, Local::now()))
    }

    pub fn terminar(&self, app: &AppHandle) -> Resultado {
        self.alterar(app, |e| {
            e.terminar(Local::now());
            Ok(())
        })
    }
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
    id: u64,
    desde: DateTime<Local>,
    continuar: bool,
) -> Resultado {
    f.alterar(&app, |e| {
        e.descontar_ausencia(id, desde, continuar, Local::now())
    })
}

#[tauri::command]
fn editar_registro(
    app: AppHandle,
    f: State<Franguinho>,
    id: u64,
    tarefa: String,
    projeto: Option<String>,
    inicio: DateTime<Local>,
    fim: Option<DateTime<Local>>,
) -> Resultado {
    f.alterar(&app, |e| {
        e.editar(id, tarefa, projeto, inicio, fim, Local::now())
    })
}

#[tauri::command]
fn apagar_registro(app: AppHandle, f: State<Franguinho>, id: u64) -> Resultado {
    f.alterar(&app, |e| e.apagar(id))
}

#[tauri::command]
fn adicionar_projeto(app: AppHandle, f: State<Franguinho>, nome: String) -> Resultado {
    f.alterar(&app, |e| e.adicionar_projeto(nome))
}

#[tauri::command]
fn remover_projeto(app: AppHandle, f: State<Franguinho>, nome: String) -> Resultado {
    f.alterar(&app, |e| {
        e.remover_projeto(&nome);
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
    let (estado, corrigiu) = Estado::novo(store.carregar(), store.carregar_projetos());
    if corrigiu {
        // Grava os ids novos pra eles continuarem os mesmos na próxima vez.
        if let Err(e) = store.salvar(&estado.registros) {
            eprintln!("não consegui gravar os ids dos registros: {e}");
        }
    }

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
