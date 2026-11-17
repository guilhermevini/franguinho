//! Integração com o sistema: ícone na bandeja/barra de menu, atalho global, o
//! aviso de "esqueceu ligado?" e a detecção de ausência.

use crate::{Franguinho, estado::Estado};
use chrono::{DateTime, Local, TimeDelta};
use serde::Serialize;
use std::{thread, time::Duration};
use tauri::{
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Wry,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

const INTERVALO: Duration = Duration::from_secs(15);
const BANDEJA: &str = "franguinho";
const MINI: &str = "mini";

/// Enviado à janela no evento "ausencia" quando você volta.
#[derive(Clone, Serialize)]
struct Ausencia {
    /// A tarefa que estava rodando, pra descontar dela mesmo se você trocar antes de responder.
    id: u64,
    desde: DateTime<Local>,
    minutos: i64,
}

pub fn criar_bandeja(app: &AppHandle) -> tauri::Result<()> {
    let estado = app.state::<Franguinho>().ler();
    let mut bandeja = TrayIconBuilder::with_id(BANDEJA)
        .tooltip("Franguinho")
        .menu(&montar_menu(app, &estado)?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, evento| ao_clicar(app, evento.id.as_ref()));
    if let Some(icone) = app.default_window_icon() {
        bandeja = bandeja.icon(icone.clone());
    }
    let bandeja = bandeja.build(app)?;
    atualizar_titulo(&bandeja, &estado);
    Ok(())
}

/// Chamado a cada mudança de estado: refaz o menu e o título da bandeja.
pub fn atualizar(app: &AppHandle, estado: &Estado) {
    let Some(bandeja) = app.tray_by_id(BANDEJA) else {
        return;
    };
    if let Ok(menu) = montar_menu(app, estado) {
        let _ = bandeja.set_menu(Some(menu));
    }
    atualizar_titulo(&bandeja, estado);
}

fn montar_menu(app: &AppHandle, estado: &Estado) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    let atual = estado.em_andamento();

    let status = match atual {
        Some(r) => format!("⏱ {} (desde {})", r.tarefa, r.inicio.format("%H:%M")),
        None => "😴 Nenhuma tarefa rolando".to_owned(),
    };
    menu.append(&MenuItem::with_id(
        app,
        "status",
        status,
        false,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "terminar",
        "🏁 Terminar",
        atual.is_some(),
        None::<&str>,
    )?)?;

    if !estado.projetos.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        let ativo = atual.and_then(|r| r.projeto.as_deref());
        for (i, p) in estado.projetos.iter().enumerate() {
            let rotulo = if ativo == Some(p.as_str()) {
                format!("● {p}")
            } else {
                format!("▶ {p}")
            };
            menu.append(&MenuItem::with_id(
                app,
                format!("projeto:{i}"),
                rotulo,
                true,
                None::<&str>,
            )?)?;
        }
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "mini",
        "🪟 Mini janela",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(
        app,
        "abrir",
        "Abrir o Franguinho",
        true,
        None::<&str>,
    )?)?;
    menu.append(&MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?)?;
    Ok(menu)
}

fn ao_clicar(app: &AppHandle, id: &str) {
    let f = app.state::<Franguinho>();
    let resultado = match id {
        "terminar" => f.terminar(app).map(|_| ()),
        "abrir" => {
            mostrar_janela(app);
            Ok(())
        }
        "mini" => alternar_mini(app).map_err(|e| e.to_string()),
        "sair" => {
            app.exit(0);
            Ok(())
        }
        _ => {
            let projeto = id
                .strip_prefix("projeto:")
                .and_then(|i| i.parse::<usize>().ok())
                .and_then(|i| f.ler().projetos.get(i).cloned());
            match projeto {
                Some(p) => f.comecar(app, None, Some(p)).map(|_| ()),
                None => Ok(()),
            }
        }
    };
    if let Err(e) = resultado {
        let _ = app.emit("aviso", e);
    }
}

/// No macOS, o tempo da tarefa aparece do lado do ícone na barra de menu.
/// Nos outros sistemas, fica na dica ao passar o mouse.
fn atualizar_titulo(bandeja: &TrayIcon, estado: &Estado) {
    match estado.em_andamento() {
        Some(r) => {
            let tempo = curto(r.duracao());
            let _ = bandeja.set_title(Some(&tempo));
            let _ = bandeja.set_tooltip(Some(format!("{} · {tempo}", r.tarefa)));
        }
        None => {
            let _ = bandeja.set_title(None::<&str>);
            let _ = bandeja.set_tooltip(Some("Franguinho"));
        }
    }
}

/// Instala o plugin de atalhos (o mesmo tratador vale pra qualquer atalho) e
/// registra o das configurações.
pub fn registrar_atalho(app: &AppHandle, atalho: &str) -> Result<(), Box<dyn std::error::Error>> {
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _atalho, evento| {
                if evento.state() == ShortcutState::Pressed {
                    alternar(app);
                }
            })
            .build(),
    )?;
    app.global_shortcut().register(atalho)?;
    Ok(())
}

/// Troca o atalho global; se o novo não puder ser usado, volta pro antigo.
pub fn trocar_atalho(app: &AppHandle, antigo: &str, novo: &str) -> Result<(), String> {
    let atalhos = app.global_shortcut();
    let _ = atalhos.unregister_all();
    if atalhos.register(novo).is_err() {
        let _ = atalhos.register(antigo);
        return Err(format!("O atalho {novo} já está em uso por outro app."));
    }
    Ok(())
}

/// Enquanto você grava um atalho novo, o atual fica desligado — senão apertar a
/// combinação de hoje terminaria a tarefa.
pub fn suspender_atalho(app: &AppHandle, suspenso: bool) {
    let atalhos = app.global_shortcut();
    let _ = atalhos.unregister_all();
    if !suspenso {
        let atalho = app.state::<Franguinho>().config().atalho;
        if let Err(e) = atalhos.register(atalho.as_str()) {
            eprintln!("não consegui religar o atalho {atalho}: {e}");
        }
    }
}

fn alternar(app: &AppHandle) {
    let f = app.state::<Franguinho>();
    if f.ler().em_andamento().is_some() {
        if let Err(e) = f.terminar(app) {
            let _ = app.emit("aviso", e);
        }
    } else {
        mostrar_janela(app);
        let _ = app.emit("focar-campo", ());
    }
}

/// Mostra ou esconde a mini janela: só o franguinho e o cronômetro, sem bordas,
/// sempre por cima. Na primeira vez ela nasce no canto superior direito.
pub fn alternar_mini(app: &AppHandle) -> tauri::Result<()> {
    if let Some(mini) = app.get_webview_window(MINI) {
        if mini.is_visible()? {
            mini.hide()?;
        } else {
            mini.show()?;
        }
        return Ok(());
    }
    let (largura, altura) = (260.0, 80.0);
    let mut janela = WebviewWindowBuilder::new(app, MINI, WebviewUrl::App("mini.html".into()))
        .title("Franguinho mini")
        .inner_size(largura, altura)
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .focused(false);
    if let Some(monitor) = app.primary_monitor()? {
        let escala = monitor.scale_factor();
        let tamanho = monitor.size().to_logical::<f64>(escala);
        let origem = monitor.position().to_logical::<f64>(escala);
        janela = janela.position(origem.x + tamanho.width - largura - 24.0, origem.y + 48.0);
    }
    janela.build()?;
    Ok(())
}

pub fn mostrar_janela(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window("main") {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

/// De tempos em tempos: atualiza o relógio da bandeja, avisa de tarefas
/// esquecidas ligadas e percebe quando você saiu e voltou.
pub fn vigiar(app: AppHandle) {
    thread::spawn(move || {
        let mut avisado: Option<(DateTime<Local>, i64)> = None;
        let mut ausente_desde: Option<DateTime<Local>> = None;
        let mut ultima_volta = Local::now();
        let mut dia_do_backup = ultima_volta.date_naive(); // o de hoje foi feito ao abrir
        loop {
            thread::sleep(INTERVALO);
            let agora = Local::now();
            if agora.date_naive() != dia_do_backup {
                app.state::<Franguinho>().backup_diario();
                dia_do_backup = agora.date_naive();
            }
            let estado = app.state::<Franguinho>().ler();
            let config = app.state::<Franguinho>().config();
            if let Some(bandeja) = app.tray_by_id(BANDEJA) {
                atualizar_titulo(&bandeja, &estado);
            }
            let Some(r) = estado.em_andamento() else {
                ausente_desde = None;
                ultima_volta = agora;
                continue;
            };

            // Ausência: ocioso no sistema, ou o computador dormiu (o laço parou).
            let limite = TimeDelta::minutes(config.ausente_min.into());
            let ocioso = user_idle::UserIdle::get_time()
                .map(|t| TimeDelta::seconds(t.as_seconds() as i64))
                .unwrap_or_default();
            let pulo = agora - ultima_volta;
            ultima_volta = agora;
            if config.ausente_min == 0 {
                ausente_desde = None; // desligado nas configurações
            } else if pulo > limite {
                let saiu = agora - pulo;
                ausente_desde = Some(ausente_desde.map_or(saiu, |d| d.min(saiu)));
            } else if ocioso >= limite && ausente_desde.is_none() {
                ausente_desde = Some(agora - ocioso);
            }
            if let Some(desde) = ausente_desde
                && ocioso < TimeDelta::minutes(1)
            {
                ausente_desde = None;
                let desde = desde.max(r.inicio);
                let minutos = (agora - desde).num_minutes();
                if minutos >= config.ausente_min.into() {
                    mostrar_janela(&app);
                    let _ = app.emit(
                        "ausencia",
                        Ausencia {
                            id: r.id,
                            desde,
                            minutos,
                        },
                    );
                }
            }

            // Esqueceu ligado: uma notificação por hora depois do limite (0 desliga).
            let esquecido = i64::from(config.esquecido_horas);
            let horas = r.duracao().num_hours();
            let ja_avisado = avisado
                .filter(|(inicio, _)| *inicio == r.inicio)
                .map_or(0, |(_, h)| h);
            if esquecido > 0 && horas >= esquecido && horas > ja_avisado {
                let _ = app
                    .notification()
                    .builder()
                    .title("Esqueceu ligado? 🐔")
                    .body(format!("\"{}\" está rodando há {horas}h.", r.tarefa))
                    .show();
                avisado = Some((r.inicio, horas));
            }
        }
    });
}

fn curto(d: TimeDelta) -> String {
    let m = d.num_minutes().max(0);
    match (m / 60, m % 60) {
        (0, m) => format!("{m}min"),
        (h, 0) => format!("{h}h"),
        (h, m) => format!("{h}h{m:02}"),
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn curto_formata_pra_barra_de_menu() {
        assert_eq!(curto(TimeDelta::seconds(40)), "0min");
        assert_eq!(curto(TimeDelta::minutes(7)), "7min");
        assert_eq!(curto(TimeDelta::minutes(60)), "1h");
        assert_eq!(curto(TimeDelta::minutes(65)), "1h05");
        assert_eq!(curto(TimeDelta::minutes(-3)), "0min");
    }
}
