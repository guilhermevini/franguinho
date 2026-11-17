//! Atualização automática pelas releases do GitHub: procura de tempos em tempos,
//! avisa a janela e instala quando você pedir. O pacote só é aceito se a
//! assinatura bater com a chave pública do tauri.conf.json.

use serde::Serialize;
use std::{thread, time::Duration};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// Primeira procura um pouco depois de abrir; depois, de 6 em 6 horas.
const PRIMEIRA_PROCURA: Duration = Duration::from_secs(20);
const INTERVALO: Duration = Duration::from_secs(6 * 3600);

/// Enviado à janela no evento "atualizacao".
#[derive(Clone, Serialize)]
pub struct Novidade {
    versao: String,
    notas: Option<String>,
}

pub async fn procurar(app: &AppHandle) -> Result<Option<Novidade>, String> {
    let atualizacao = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("Não consegui procurar atualização: {e}"))?;
    Ok(atualizacao.map(|a| Novidade {
        versao: a.version.clone(),
        notas: a.body.clone(),
    }))
}

pub async fn instalar(app: &AppHandle) -> Result<(), String> {
    let atualizacao = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| format!("Não consegui procurar atualização: {e}"))?
        .ok_or("Você já está na versão mais nova. 🐔")?;
    atualizacao
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| format!("Não consegui instalar a atualização: {e}"))?;
    app.restart();
}

/// Procura em segundo plano e avisa a janela quando tiver versão nova. Erros
/// (sem internet, nenhuma release ainda) são ignorados: tenta de novo depois.
pub fn vigiar(app: AppHandle) {
    thread::spawn(move || {
        thread::sleep(PRIMEIRA_PROCURA);
        loop {
            if let Ok(Some(novidade)) = tauri::async_runtime::block_on(procurar(&app)) {
                let _ = app.emit("atualizacao", novidade);
            }
            thread::sleep(INTERVALO);
        }
    });
}
