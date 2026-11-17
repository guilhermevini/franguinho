#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // sem console no Windows

mod atualizacao;
mod config;
mod estado;
mod pomodoro;
mod sistema;
mod store;

use chrono::{DateTime, Local};
use config::Config;
use estado::Estado;
use pomodoro::Pomodoro;
use serde::Serialize;
use std::sync::{Mutex, MutexGuard};
use store::Store;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

pub struct Franguinho {
    store: Store,
    estado: Mutex<Estado>,
    config: Mutex<Config>,
    pomodoro: Mutex<Pomodoro>,
}

/// O que a tela de configurações mostra: o config.json e o que mora no sistema.
#[derive(Clone, Serialize)]
struct Preferencias {
    #[serde(flatten)]
    config: Config,
    iniciar_com_sistema: bool,
    pasta_dados: String,
}

type Resultado = Result<Estado, String>;

impl Franguinho {
    fn trava(&self) -> MutexGuard<'_, Estado> {
        self.estado.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn ler(&self) -> Estado {
        self.trava().clone()
    }

    pub fn config(&self) -> Config {
        self.config
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
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
                .and_then(|_| self.store.salvar_fixadas(&estado.fixadas))
                .map_err(|e| format!("Ih, não consegui salvar: {e}"))?;
            estado.clone()
        };
        sistema::atualizar(app, &novo);
        let _ = app.emit("estado", &novo);
        self.sincronizar_pomodoro(app, &novo);
        Ok(novo)
    }

    fn trava_pomodoro(&self) -> MutexGuard<'_, Pomodoro> {
        self.pomodoro.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Acompanha a tarefa rodando (abre ou encerra o bloco de foco) e avisa a janela.
    fn sincronizar_pomodoro(&self, app: &AppHandle, estado: &Estado) {
        let rodando = estado.em_andamento().map(|r| r.tarefa.as_str());
        self.trava_pomodoro()
            .sincronizar(rodando, &self.config(), Local::now());
        self.emitir_pomodoro(app);
    }

    pub fn tick_pomodoro(&self) -> Option<pomodoro::Virada> {
        let estado = self.ler();
        let rodando = estado.em_andamento().map(|r| r.tarefa.as_str());
        self.trava_pomodoro()
            .tick(rodando, &self.config(), Local::now())
    }

    fn vista_pomodoro(&self) -> pomodoro::Vista {
        self.trava_pomodoro()
            .vista(&self.config(), Local::now().date_naive())
    }

    pub fn emitir_pomodoro(&self, app: &AppHandle) {
        let _ = app.emit("pomodoro", self.vista_pomodoro());
    }

    pub fn comecar(&self, app: &AppHandle, tarefa: Option<String>) -> Resultado {
        self.alterar(app, |e| e.comecar(tarefa, Local::now()))
    }

    /// Backup do dia, se ainda não foi feito (ver Store::backup_diario).
    pub fn backup_diario(&self) {
        if let Err(e) = self.store.backup_diario(Local::now().date_naive()) {
            eprintln!("não consegui fazer o backup do dia: {e}");
        }
    }

    pub fn terminar(&self, app: &AppHandle) -> Resultado {
        self.terminar_em(app, Local::now())
    }

    pub fn terminar_em(&self, app: &AppHandle, quando: estado::Hora) -> Resultado {
        self.alterar(app, |e| {
            e.terminar(quando);
            Ok(())
        })
    }
}

#[tauri::command]
fn carregar(f: State<Franguinho>) -> Estado {
    f.ler()
}

#[tauri::command]
fn comecar(app: AppHandle, f: State<Franguinho>, tarefa: Option<String>) -> Resultado {
    f.comecar(&app, tarefa)
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
    inicio: DateTime<Local>,
    fim: Option<DateTime<Local>>,
) -> Resultado {
    f.alterar(&app, |e| e.editar(id, tarefa, inicio, fim, Local::now()))
}

#[tauri::command]
fn apagar_registro(app: AppHandle, f: State<Franguinho>, id: u64) -> Resultado {
    f.alterar(&app, |e| e.apagar(id))
}

#[tauri::command]
fn fixar(app: AppHandle, f: State<Franguinho>, tarefa: String) -> Resultado {
    f.alterar(&app, |e| e.fixar(tarefa))
}

#[tauri::command]
fn desafixar(app: AppHandle, f: State<Franguinho>, tarefa: String) -> Resultado {
    f.alterar(&app, |e| {
        e.desafixar(&tarefa);
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

/// Assíncrono de propósito: criar janela num comando síncrono trava no Windows.
#[tauri::command]
async fn alternar_mini(app: AppHandle) -> Result<(), String> {
    sistema::alternar_mini(&app).map_err(|e| e.to_string())
}

/// Traz a janela principal, pronta pra digitar uma tarefa nova.
#[tauri::command]
fn abrir_janela(app: AppHandle) {
    sistema::mostrar_janela(&app);
    let _ = app.emit("focar-campo", ());
}

fn preferencias_de(app: &AppHandle, f: &Franguinho) -> Preferencias {
    Preferencias {
        config: f.config(),
        iniciar_com_sistema: app.autolaunch().is_enabled().unwrap_or(false),
        pasta_dados: f.store.pasta().display().to_string(),
    }
}

#[tauri::command]
fn preferencias(app: AppHandle, f: State<Franguinho>) -> Preferencias {
    preferencias_de(&app, &f)
}

#[tauri::command]
fn salvar_preferencias(
    app: AppHandle,
    f: State<Franguinho>,
    config: Config,
    iniciar_com_sistema: bool,
) -> Result<Preferencias, String> {
    let novo = config.validado()?;
    let antigo = f.config();
    if novo.atalho != antigo.atalho {
        sistema::trocar_atalho(&app, &antigo.atalho, &novo.atalho)?;
    }
    let autostart = app.autolaunch();
    if autostart.is_enabled().unwrap_or(false) != iniciar_com_sistema {
        let mudou = if iniciar_com_sistema {
            autostart.enable()
        } else {
            autostart.disable()
        };
        mudou.map_err(|e| format!("Não consegui mudar o iniciar com o sistema: {e}"))?;
    }
    f.store
        .salvar_config(&novo)
        .map_err(|e| format!("Ih, não consegui salvar as configurações: {e}"))?;
    *f.config.lock().unwrap_or_else(|e| e.into_inner()) = novo;
    f.sincronizar_pomodoro(&app, &f.ler());
    let prefs = preferencias_de(&app, &f);
    let _ = app.emit("preferencias", &prefs);
    Ok(prefs)
}

#[tauri::command]
fn pomodoro(f: State<Franguinho>) -> pomodoro::Vista {
    f.vista_pomodoro()
}

#[tauri::command]
fn copiar(app: AppHandle, texto: String) -> Result<(), String> {
    app.clipboard()
        .write_text(texto)
        .map_err(|e| format!("Não consegui copiar: {e}"))
}

#[tauri::command]
fn versao(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
async fn procurar_atualizacao(app: AppHandle) -> Result<Option<atualizacao::Novidade>, String> {
    atualizacao::procurar(&app).await
}

#[tauri::command]
async fn instalar_atualizacao(app: AppHandle) -> Result<(), String> {
    atualizacao::instalar(&app).await
}

#[tauri::command]
fn suspender_atalho(app: AppHandle, suspenso: bool) {
    sistema::suspender_atalho(&app, suspenso);
}

#[tauri::command]
fn abrir_pasta_dados(app: AppHandle, f: State<Franguinho>) -> Result<(), String> {
    app.opener()
        .open_path(f.store.pasta().display().to_string(), None::<&str>)
        .map_err(|e| format!("Não consegui abrir a pasta: {e}"))
}

fn main() {
    let store = Store::new();
    // Retrato dos dados como estavam antes de qualquer mudança de hoje.
    if let Err(e) = store.backup_diario(Local::now().date_naive()) {
        eprintln!("não consegui fazer o backup do dia: {e}");
    }
    let (estado, corrigiu) = Estado::novo(store.carregar(), store.carregar_fixadas());
    let config = store.carregar_config();
    let atalho = config.atalho.clone();
    if corrigiu {
        // Grava as correções (ids novos, tarefas que tinham projeto) pra valerem de vez.
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(Franguinho {
            store,
            estado: Mutex::new(estado),
            config: Mutex::new(config),
            pomodoro: Mutex::new(Pomodoro::novo(Local::now().date_naive())),
        })
        .setup(move |app| {
            let app = app.handle();
            sistema::criar_bandeja(app)?;
            if let Err(e) = sistema::registrar_atalho(app, &atalho) {
                // Outro app pode já usar a combinação; o Franguinho segue sem ela.
                eprintln!("não consegui registrar o atalho {atalho}: {e}");
            }
            sistema::vigiar(app.clone());
            sistema::vigiar_pomodoro(app.clone());
            atualizacao::vigiar(app.clone());
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
            fixar,
            desafixar,
            exportar_csv,
            alternar_mini,
            abrir_janela,
            preferencias,
            salvar_preferencias,
            suspender_atalho,
            abrir_pasta_dados,
            copiar,
            pomodoro,
            versao,
            procurar_atualizacao,
            instalar_atualizacao,
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
