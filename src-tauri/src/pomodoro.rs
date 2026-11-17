//! Modo Pomodoro: blocos de foco seguidos de pausa. No fim do foco a tarefa
//! termina (a pausa não conta como trabalho); no fim da pausa o franguinho
//! oferece voltar pra mesma tarefa. Puro, sem janela: o relógio entra como
//! parâmetro e quem chama decide o que fazer com cada virada.

use crate::config::Config;
use crate::estado::Hora;
use chrono::{NaiveDate, TimeDelta};
use serde::Serialize;

#[derive(Clone, Debug, PartialEq)]
pub enum Fase {
    Parado,
    Foco { fim: Hora },
    Pausa { fim: Hora, tarefa: String },
}

/// O que aconteceu num `tick`, pra quem chama terminar a tarefa e avisar.
#[derive(Debug, PartialEq)]
pub enum Virada {
    FocoAcabou { fim: Hora, tarefa: String },
    PausaAcabou { tarefa: String },
}

#[derive(Debug)]
pub struct Pomodoro {
    pub fase: Fase,
    /// Tarefa pra oferecer "voltar" depois de uma pausa.
    pub retomar: Option<String>,
    feitos: (NaiveDate, u32),
}

/// O que a interface recebe (comando `pomodoro` e evento "pomodoro").
#[derive(Clone, Debug, Serialize)]
pub struct Vista {
    ligado: bool,
    fase: &'static str,
    fim: Option<Hora>,
    retomar: Option<String>,
    feitos_hoje: u32,
}

impl Pomodoro {
    pub fn novo(hoje: NaiveDate) -> Self {
        Self {
            fase: Fase::Parado,
            retomar: None,
            feitos: (hoje, 0),
        }
    }

    /// Acompanha o estado das tarefas: começar a trabalhar abre um bloco de foco
    /// (inclusive no meio de uma pausa); parar na mão durante o foco encerra.
    pub fn sincronizar(&mut self, rodando: Option<&str>, config: &Config, agora: Hora) {
        if !config.pomodoro {
            self.fase = Fase::Parado;
            self.retomar = None;
            return;
        }
        match (rodando, &self.fase) {
            (Some(_), Fase::Parado | Fase::Pausa { .. }) => {
                self.fase = Fase::Foco {
                    fim: agora + TimeDelta::minutes(config.foco_min.into()),
                };
                self.retomar = None;
            }
            (None, Fase::Foco { .. }) => self.fase = Fase::Parado,
            _ => {}
        }
    }

    /// Chamado de segundo em segundo: vira de foco pra pausa e de pausa pra parado.
    pub fn tick(&mut self, rodando: Option<&str>, config: &Config, agora: Hora) -> Option<Virada> {
        match self.fase.clone() {
            Fase::Foco { fim } if agora >= fim => {
                let Some(tarefa) = rodando else {
                    self.fase = Fase::Parado;
                    return None;
                };
                self.fase = Fase::Pausa {
                    fim: fim + TimeDelta::minutes(config.pausa_min.into()),
                    tarefa: tarefa.to_owned(),
                };
                self.contar(fim.date_naive());
                Some(Virada::FocoAcabou {
                    fim,
                    tarefa: tarefa.to_owned(),
                })
            }
            Fase::Pausa { fim, tarefa } if agora >= fim => {
                self.fase = Fase::Parado;
                self.retomar = Some(tarefa.clone());
                Some(Virada::PausaAcabou { tarefa })
            }
            _ => None,
        }
    }

    fn contar(&mut self, dia: NaiveDate) {
        if self.feitos.0 == dia {
            self.feitos.1 += 1;
        } else {
            self.feitos = (dia, 1);
        }
    }

    pub fn feitos_hoje(&self, hoje: NaiveDate) -> u32 {
        if self.feitos.0 == hoje {
            self.feitos.1
        } else {
            0
        }
    }

    pub fn vista(&self, config: &Config, hoje: NaiveDate) -> Vista {
        let (fase, fim, retomar) = match &self.fase {
            Fase::Parado => ("parado", None, self.retomar.clone()),
            Fase::Foco { fim } => ("foco", Some(*fim), None),
            // Na pausa, "retomar" já é a tarefa que ficou esperando.
            Fase::Pausa { fim, tarefa } => ("pausa", Some(*fim), Some(tarefa.clone())),
        };
        Vista {
            ligado: config.pomodoro,
            fase,
            fim,
            retomar,
            feitos_hoje: self.feitos_hoje(hoje),
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use chrono::{Local, TimeZone};

    fn as_(h: u32, m: u32) -> Hora {
        Local.with_ymd_and_hms(2026, 11, 17, h, m, 0).unwrap()
    }

    fn ligado() -> Config {
        Config {
            pomodoro: true,
            foco_min: 25,
            pausa_min: 5,
            ..Config::default()
        }
    }

    fn novo() -> Pomodoro {
        Pomodoro::novo(as_(0, 0).date_naive())
    }

    #[test]
    fn desligado_nao_faz_nada() {
        let mut p = novo();
        p.sincronizar(Some("a"), &Config::default(), as_(9, 0));
        assert_eq!(p.fase, Fase::Parado);
        assert_eq!(p.tick(Some("a"), &Config::default(), as_(10, 0)), None);
    }

    #[test]
    fn comecar_abre_um_foco_e_parar_na_mao_encerra() {
        let mut p = novo();
        p.sincronizar(Some("a"), &ligado(), as_(9, 0));
        assert_eq!(p.fase, Fase::Foco { fim: as_(9, 25) });
        // trocar de tarefa no meio não reinicia o bloco
        p.sincronizar(Some("b"), &ligado(), as_(9, 10));
        assert_eq!(p.fase, Fase::Foco { fim: as_(9, 25) });
        p.sincronizar(None, &ligado(), as_(9, 12));
        assert_eq!(p.fase, Fase::Parado);
    }

    #[test]
    fn fim_do_foco_vira_pausa_e_conta_um_pomodoro() {
        let mut p = novo();
        p.sincronizar(Some("a"), &ligado(), as_(9, 0));
        assert_eq!(p.tick(Some("a"), &ligado(), as_(9, 24)), None);
        let virada = p.tick(Some("a"), &ligado(), as_(9, 25));
        assert_eq!(
            virada,
            Some(Virada::FocoAcabou {
                fim: as_(9, 25),
                tarefa: "a".into()
            })
        );
        assert_eq!(
            p.fase,
            Fase::Pausa {
                fim: as_(9, 30),
                tarefa: "a".into()
            }
        );
        assert_eq!(p.feitos_hoje(as_(0, 0).date_naive()), 1);
        // a tarefa terminou: sincronizar com nada rodando não mexe na pausa
        p.sincronizar(None, &ligado(), as_(9, 25));
        assert!(matches!(p.fase, Fase::Pausa { .. }));
    }

    #[test]
    fn fim_da_pausa_oferece_voltar_e_comecar_limpa() {
        let mut p = novo();
        p.sincronizar(Some("a"), &ligado(), as_(9, 0));
        p.tick(Some("a"), &ligado(), as_(9, 25));
        assert_eq!(
            p.tick(None, &ligado(), as_(9, 30)),
            Some(Virada::PausaAcabou { tarefa: "a".into() })
        );
        assert_eq!(p.fase, Fase::Parado);
        assert_eq!(p.retomar.as_deref(), Some("a"));
        p.sincronizar(Some("a"), &ligado(), as_(9, 31));
        assert_eq!(p.fase, Fase::Foco { fim: as_(9, 56) });
        assert_eq!(p.retomar, None);
    }

    #[test]
    fn comecar_no_meio_da_pausa_abre_foco_novo() {
        let mut p = novo();
        p.sincronizar(Some("a"), &ligado(), as_(9, 0));
        p.tick(Some("a"), &ligado(), as_(9, 25));
        p.sincronizar(Some("b"), &ligado(), as_(9, 27));
        assert_eq!(p.fase, Fase::Foco { fim: as_(9, 52) });
    }

    #[test]
    fn contador_zera_no_dia_seguinte() {
        let mut p = novo();
        p.sincronizar(Some("a"), &ligado(), as_(9, 0));
        p.tick(Some("a"), &ligado(), as_(9, 25));
        let amanha = as_(0, 0).date_naive().succ_opt().unwrap();
        assert_eq!(p.feitos_hoje(amanha), 0);
    }

    #[test]
    fn desligar_no_meio_limpa_tudo() {
        let mut p = novo();
        p.sincronizar(Some("a"), &ligado(), as_(9, 0));
        p.sincronizar(Some("a"), &Config::default(), as_(9, 5));
        assert_eq!(p.fase, Fase::Parado);
        assert_eq!(
            p.vista(&Config::default(), as_(0, 0).date_naive()).fase,
            "parado"
        );
    }
}
