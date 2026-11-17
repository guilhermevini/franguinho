//! Preferências do usuário (config.json), com padrões pra quem nunca mexeu.

use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tauri_plugin_global_shortcut::Shortcut;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Atalho global: termina a tarefa rodando ou abre a janela.
    pub atalho: String,
    /// Avisa de tarefa esquecida ligada depois de tantas horas (0 desliga).
    pub esquecido_horas: u32,
    /// Pergunta sobre ausência depois de tantos minutos parado (0 desliga).
    pub ausente_min: u32,
    /// Modo Pomodoro: blocos de foco com pausa no meio.
    pub pomodoro: bool,
    pub foco_min: u32,
    pub pausa_min: u32,
    /// Sons ao começar, terminar, nas viradas do Pomodoro e nas conquistas.
    pub sons: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            atalho: "Ctrl+Alt+F".into(),
            esquecido_horas: 3,
            ausente_min: 10,
            pomodoro: false,
            foco_min: 25,
            pausa_min: 5,
            sons: true,
        }
    }
}

impl Config {
    /// Confere os valores antes de salvar, com mensagens pra mostrar na tela.
    pub fn validado(mut self) -> Result<Self, String> {
        self.atalho = self.atalho.trim().to_owned();
        let atalho = Shortcut::from_str(&self.atalho)
            .map_err(|_| format!("Não entendi o atalho \"{}\".", self.atalho))?;
        if atalho.mods.is_empty() {
            return Err("O atalho precisa de Ctrl, Alt ou Cmd junto da tecla.".into());
        }
        if self.esquecido_horas > 24 {
            return Err("O aviso de tarefa esquecida vai até 24 horas.".into());
        }
        if self.ausente_min > 240 {
            return Err("A ausência vai até 240 minutos.".into());
        }
        if !(5..=120).contains(&self.foco_min) {
            return Err("O foco do Pomodoro vai de 5 a 120 minutos.".into());
        }
        if !(1..=60).contains(&self.pausa_min) {
            return Err("A pausa do Pomodoro vai de 1 a 60 minutos.".into());
        }
        Ok(self)
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn com_atalho(atalho: &str) -> Config {
        Config {
            atalho: atalho.into(),
            ..Config::default()
        }
    }

    #[test]
    fn padrao_e_valido() {
        assert_eq!(Config::default().validado(), Ok(Config::default()));
    }

    #[test]
    fn atalho_precisa_ser_entendido_e_ter_modificador() {
        assert_eq!(
            com_atalho("  Cmd+Shift+T ").validado().unwrap().atalho,
            "Cmd+Shift+T"
        );
        assert!(com_atalho("CmdOrCtrl+Alt+1").validado().is_ok());
        assert!(com_atalho("F").validado().is_err());
        assert!(com_atalho("Ctrl+Banana").validado().is_err());
        assert!(com_atalho("").validado().is_err());
    }

    #[test]
    fn limites_dos_numeros() {
        let mut c = Config {
            esquecido_horas: 0,
            ausente_min: 0,
            ..Config::default()
        };
        assert!(c.clone().validado().is_ok(), "0 desliga");
        c.esquecido_horas = 25;
        assert!(c.clone().validado().is_err());
        c.esquecido_horas = 3;
        c.ausente_min = 241;
        assert!(c.validado().is_err());
    }

    #[test]
    fn limites_do_pomodoro() {
        let com = |foco_min, pausa_min| Config {
            foco_min,
            pausa_min,
            ..Config::default()
        };
        assert!(com(25, 5).validado().is_ok());
        assert!(com(4, 5).validado().is_err());
        assert!(com(121, 5).validado().is_err());
        assert!(com(25, 0).validado().is_err());
        assert!(com(25, 61).validado().is_err());
    }

    #[test]
    fn arquivo_parcial_usa_padroes() {
        let c: Config = serde_json::from_str(r#"{"ausente_min": 5}"#).unwrap();
        assert_eq!(c.ausente_min, 5);
        assert_eq!(c.atalho, "Ctrl+Alt+F");
    }
}
