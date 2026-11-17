//! Integração com o sistema: ícone na bandeja/barra de menu, atalho global e o
//! aviso de "esqueceu ligado?".

use crate::{Estado, Franguinho};
use chrono::{DateTime, Local, TimeDelta};
use std::{thread, time::Duration};
use tauri::{
    AppHandle, Emitter, Manager, Wry,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_notification::NotificationExt;

/// Começa/termina de qualquer lugar: termina a tarefa rodando ou abre a janela
/// pronta pra digitar uma nova.
pub const ATALHO: &str = "Ctrl+Alt+F";
/// A partir de quantas horas seguidas o franguinho desconfia que você esqueceu.
const ESQUECIDO_HORAS: i64 = 3;
const BANDEJA: &str = "franguinho";

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
    menu.append(&MenuItem::with_id(app, "status", status, false, None::<&str>)?)?;
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
    menu.append(&MenuItem::with_id(app, "abrir", "Abrir o Franguinho", true, None::<&str>)?)?;
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

pub fn registrar_atalho(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts([ATALHO])?
            .with_handler(|app, _atalho, evento| {
                if evento.state() == ShortcutState::Pressed {
                    alternar(app);
                }
            })
            .build(),
    )?;
    Ok(())
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

pub fn mostrar_janela(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window("main") {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

/// De tempos em tempos: atualiza o relógio da bandeja e, se uma tarefa passou de
/// ESQUECIDO_HORAS, manda uma notificação (uma por hora a mais).
pub fn vigiar(app: AppHandle) {
    thread::spawn(move || {
        let mut avisado: Option<(DateTime<Local>, i64)> = None;
        loop {
            thread::sleep(Duration::from_secs(20));
            let estado = app.state::<Franguinho>().ler();
            if let Some(bandeja) = app.tray_by_id(BANDEJA) {
                atualizar_titulo(&bandeja, &estado);
            }
            let Some(r) = estado.em_andamento() else {
                continue;
            };
            let horas = r.duracao().num_hours();
            let ja_avisado = avisado
                .filter(|(inicio, _)| *inicio == r.inicio)
                .map_or(0, |(_, h)| h);
            if horas >= ESQUECIDO_HORAS && horas > ja_avisado {
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
