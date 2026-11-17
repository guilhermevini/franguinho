//! As regras do Franguinho, sem janela nem disco — por isso dá pra testar.
//! Toda função recebe `agora`, em vez de ler o relógio, pelo mesmo motivo.

use crate::store::Registro;
use chrono::{DateTime, Local, TimeDelta};
use serde::Serialize;
use std::collections::HashSet;

pub type Hora = DateTime<Local>;

/// Tudo o que a interface precisa pra se desenhar. Toda mudança devolve (e emite
/// no evento "estado") o estado completo, então o frontend só re-renderiza.
#[derive(Clone, Debug, Serialize)]
pub struct Estado {
    pub registros: Vec<Registro>,
    /// Tarefas fixadas nos atalhos, na ordem em que aparecem (e com a cor dessa posição).
    pub fixadas: Vec<String>,
}

impl Estado {
    /// Monta o estado carregado do disco e corrige o que vier do formato antigo:
    /// registros sem id (ou com id repetido) e registros com projeto, que viram
    /// uma tarefa só ("Projeto · descrição"). Devolve também se algo mudou.
    pub fn novo(mut registros: Vec<Registro>, fixadas: Vec<String>) -> (Self, bool) {
        let mut vistos = HashSet::new();
        let mut proximo = registros.iter().map(|r| r.id).max().unwrap_or(0) + 1;
        let mut corrigiu = false;
        for r in &mut registros {
            if r.id == 0 || !vistos.insert(r.id) {
                r.id = proximo;
                vistos.insert(proximo);
                proximo += 1;
                corrigiu = true;
            }
            if let Some(projeto) = r.projeto.take() {
                if projeto != r.tarefa {
                    r.tarefa = format!("{projeto} · {}", r.tarefa);
                }
                corrigiu = true;
            }
        }
        (Self { registros, fixadas }, corrigiu)
    }

    pub fn em_andamento(&self) -> Option<&Registro> {
        self.registros.iter().find(|r| r.fim.is_none())
    }

    fn proximo_id(&self) -> u64 {
        self.registros.iter().map(|r| r.id).max().unwrap_or(0) + 1
    }

    fn posicao(&self, id: u64) -> Result<usize, String> {
        self.registros
            .iter()
            .position(|r| r.id == id)
            .ok_or_else(|| "Esse registro não existe mais.".to_owned())
    }

    /// Começa uma tarefa, nova ou já usada antes (é o nome que liga as duas).
    /// Só uma tarefa roda por vez: a anterior termina automaticamente.
    pub fn comecar(&mut self, tarefa: Option<String>, agora: Hora) -> Result<(), String> {
        let tarefa = limpo(tarefa).ok_or("Me conta o que você vai fazer!")?;
        if let Some(atual) = self.registros.iter_mut().find(|r| r.fim.is_none()) {
            if atual.tarefa == tarefa {
                return Ok(()); // já está rodando exatamente isso
            }
            atual.fim = Some(agora);
        }
        let id = self.proximo_id();
        self.registros.push(Registro {
            id,
            tarefa,
            projeto: None,
            inicio: agora,
            fim: None,
        });
        Ok(())
    }

    pub fn terminar(&mut self, agora: Hora) {
        if let Some(atual) = self.registros.iter_mut().find(|r| r.fim.is_none()) {
            atual.fim = Some(agora);
        }
    }

    /// Desconta uma ausência da tarefa `id`: ela termina quando você saiu e, se
    /// `continuar`, recomeça agora com o mesmo nome.
    pub fn descontar_ausencia(
        &mut self,
        id: u64,
        desde: Hora,
        continuar: bool,
        agora: Hora,
    ) -> Result<(), String> {
        let i = self.posicao(id)?;
        let atual = self.registros[i].clone();
        if atual.fim.is_some() {
            return Err("Essa tarefa já tinha terminado.".into());
        }
        if desde <= atual.inicio {
            self.registros.remove(i); // saiu logo que começou: não sobra nada
        } else {
            self.registros[i].fim = Some(desde.min(agora));
        }
        if continuar {
            let id = self.proximo_id();
            self.registros.push(Registro {
                id,
                inicio: agora,
                fim: None,
                ..atual
            });
        }
        Ok(())
    }

    /// Corrige um registro (nome e horários), pra quando você esquece de apertar
    /// começar ou terminar na hora certa.
    pub fn editar(
        &mut self,
        id: u64,
        tarefa: String,
        inicio: Hora,
        fim: Option<Hora>,
        agora: Hora,
    ) -> Result<(), String> {
        let tarefa = limpo(Some(tarefa)).ok_or("A tarefa precisa de um nome.")?;
        let limite = agora + TimeDelta::minutes(1);
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
        let i = self.posicao(id)?;
        let r = &mut self.registros[i];
        if r.fim.is_none() != fim.is_none() {
            return Err("Não dá pra mudar se a tarefa está rodando ou não.".into());
        }
        *r = Registro {
            id,
            tarefa,
            projeto: None,
            inicio,
            fim,
        };
        self.registros.sort_by_key(|r| r.inicio);
        Ok(())
    }

    pub fn apagar(&mut self, id: u64) -> Result<(), String> {
        let i = self.posicao(id)?;
        self.registros.remove(i);
        Ok(())
    }

    /// Fixa uma tarefa nos atalhos (no fim da lista, pra não mudar as cores das outras).
    pub fn fixar(&mut self, tarefa: String) -> Result<(), String> {
        let tarefa = limpo(Some(tarefa)).ok_or("A tarefa precisa de um nome.")?;
        if !self.fixadas.contains(&tarefa) {
            self.fixadas.push(tarefa);
        }
        Ok(())
    }

    pub fn desafixar(&mut self, tarefa: &str) {
        self.fixadas.retain(|t| t != tarefa);
    }
}

fn limpo(texto: Option<String>) -> Option<String> {
    texto.map(|t| t.trim().to_owned()).filter(|t| !t.is_empty())
}

#[cfg(test)]
mod testes {
    use super::*;
    use chrono::TimeZone;

    fn as_(h: u32, m: u32) -> Hora {
        Local.with_ymd_and_hms(2026, 11, 17, h, m, 0).unwrap()
    }

    fn vazio() -> Estado {
        Estado::novo(Vec::new(), vec!["Trabalho".into()]).0
    }

    fn texto(s: &str) -> Option<String> {
        Some(s.to_owned())
    }

    fn feito(id: u64, tarefa: &str, inicio: Hora, fim: Hora) -> Registro {
        Registro {
            id,
            tarefa: tarefa.into(),
            projeto: None,
            inicio,
            fim: Some(fim),
        }
    }

    #[test]
    fn comecar_cria_tarefa_rodando() {
        let mut e = vazio();
        e.comecar(texto("  escrever  "), as_(9, 0)).unwrap();
        let r = e.em_andamento().unwrap();
        assert_eq!(
            (r.id, r.tarefa.as_str(), r.inicio),
            (1, "escrever", as_(9, 0))
        );
    }

    #[test]
    fn comecar_sem_nome_da_erro() {
        let mut e = vazio();
        assert!(e.comecar(None, as_(9, 0)).is_err());
        assert!(e.comecar(texto("  "), as_(9, 0)).is_err());
        assert!(e.registros.is_empty());
    }

    #[test]
    fn comecar_outra_termina_a_anterior() {
        let mut e = vazio();
        e.comecar(texto("a"), as_(9, 0)).unwrap();
        e.comecar(texto("b"), as_(9, 30)).unwrap();
        assert_eq!(e.registros[0].fim, Some(as_(9, 30)));
        assert_eq!(e.em_andamento().unwrap().tarefa, "b");
        assert_eq!(e.registros[1].id, 2);
    }

    #[test]
    fn comecar_a_mesma_tarefa_nao_duplica() {
        let mut e = vazio();
        e.comecar(texto("a"), as_(9, 0)).unwrap();
        e.comecar(texto("a "), as_(9, 5)).unwrap();
        assert_eq!(e.registros.len(), 1);
        assert_eq!(e.registros[0].inicio, as_(9, 0));
    }

    #[test]
    fn terminar_fecha_a_tarefa_e_sem_tarefa_nao_faz_nada() {
        let mut e = vazio();
        e.terminar(as_(9, 0));
        assert!(e.registros.is_empty());
        e.comecar(texto("a"), as_(9, 0)).unwrap();
        e.terminar(as_(10, 0));
        assert_eq!(e.registros[0].fim, Some(as_(10, 0)));
        assert!(e.em_andamento().is_none());
    }

    #[test]
    fn descontar_termina_quando_saiu() {
        let mut e = vazio();
        e.comecar(texto("a"), as_(9, 0)).unwrap();
        e.descontar_ausencia(1, as_(10, 0), false, as_(10, 30))
            .unwrap();
        assert_eq!(e.registros[0].fim, Some(as_(10, 0)));
        assert!(e.em_andamento().is_none());
    }

    #[test]
    fn descontar_e_continuar_recomeca_com_novo_id() {
        let mut e = vazio();
        e.comecar(texto("a"), as_(9, 0)).unwrap();
        e.descontar_ausencia(1, as_(10, 0), true, as_(10, 30))
            .unwrap();
        let r = e.em_andamento().unwrap();
        assert_eq!((r.id, r.tarefa.as_str(), r.inicio), (2, "a", as_(10, 30)));
    }

    #[test]
    fn descontar_ausencia_desde_antes_do_inicio_apaga_a_tarefa() {
        let mut e = vazio();
        e.comecar(texto("a"), as_(9, 0)).unwrap();
        e.descontar_ausencia(1, as_(8, 50), false, as_(9, 30))
            .unwrap();
        assert!(e.registros.is_empty());
    }

    #[test]
    fn descontar_tarefa_ja_terminada_ou_inexistente_da_erro() {
        let mut e = vazio();
        e.comecar(texto("a"), as_(9, 0)).unwrap();
        e.comecar(texto("b"), as_(9, 30)).unwrap(); // "a" terminou
        assert!(
            e.descontar_ausencia(1, as_(9, 10), false, as_(10, 0))
                .is_err()
        );
        assert!(
            e.descontar_ausencia(99, as_(9, 10), false, as_(10, 0))
                .is_err()
        );
        assert_eq!(e.registros[0].fim, Some(as_(9, 30)));
    }

    #[test]
    fn editar_muda_nome_e_horarios_e_reordena() {
        let (mut e, _) = Estado::novo(
            vec![
                feito(1, "a", as_(8, 0), as_(9, 0)),
                feito(2, "b", as_(10, 0), as_(11, 0)),
            ],
            vec![],
        );
        e.editar(2, "b2".into(), as_(7, 0), Some(as_(7, 30)), as_(12, 0))
            .unwrap();
        assert_eq!(
            (e.registros[0].id, e.registros[0].tarefa.as_str()),
            (2, "b2")
        );
        assert_eq!(e.registros[1].id, 1);
    }

    #[test]
    fn editar_recusa_horarios_invalidos_e_nome_vazio() {
        let (mut e, _) = Estado::novo(vec![feito(1, "a", as_(8, 0), as_(9, 0))], vec![]);
        let agora = as_(12, 0);
        let editar = |e: &mut Estado, ini, fim| e.editar(1, "a".into(), ini, fim, agora);
        assert!(editar(&mut e, as_(9, 0), Some(as_(9, 0))).is_err()); // fim = início
        assert!(editar(&mut e, as_(9, 0), Some(as_(8, 0))).is_err()); // fim antes
        assert!(editar(&mut e, as_(11, 0), Some(as_(13, 0))).is_err()); // fim no futuro
        assert!(editar(&mut e, as_(13, 0), Some(as_(14, 0))).is_err()); // início no futuro
        assert!(editar(&mut e, as_(9, 0), None).is_err()); // não dá pra "desterminar"
        assert!(
            e.editar(1, " ".into(), as_(8, 0), Some(as_(9, 0)), agora)
                .is_err()
        );
        assert_eq!(e.registros[0].inicio, as_(8, 0));
    }

    #[test]
    fn apagar_pelo_id() {
        let (mut e, _) = Estado::novo(
            vec![
                feito(1, "a", as_(8, 0), as_(9, 0)),
                feito(2, "b", as_(10, 0), as_(11, 0)),
            ],
            vec![],
        );
        e.apagar(1).unwrap();
        assert_eq!(e.registros.len(), 1);
        assert_eq!(e.registros[0].tarefa, "b");
        assert!(e.apagar(1).is_err());
    }

    #[test]
    fn novo_da_ids_a_registros_antigos_e_repetidos() {
        let (e, corrigiu) = Estado::novo(
            vec![
                feito(0, "sem id", as_(8, 0), as_(9, 0)),
                feito(5, "com id", as_(9, 0), as_(10, 0)),
                feito(5, "repetido", as_(10, 0), as_(11, 0)),
            ],
            vec![],
        );
        assert!(corrigiu);
        let ids: Vec<u64> = e.registros.iter().map(|r| r.id).collect();
        assert_eq!(ids, vec![6, 5, 7]);

        let (_, corrigiu) = Estado::novo(e.registros, vec![]);
        assert!(!corrigiu);
    }

    #[test]
    fn novo_junta_projeto_e_descricao_numa_tarefa_so() {
        let com_projeto = |id, tarefa: &str, projeto: &str| Registro {
            projeto: Some(projeto.into()),
            ..feito(id, tarefa, as_(8, 0), as_(9, 0))
        };
        let (e, corrigiu) = Estado::novo(
            vec![
                com_projeto(1, "revisar PR", "Trabalho"),
                com_projeto(2, "Casa", "Casa"), // projeto sem descrição
                feito(3, "avulsa", as_(8, 0), as_(9, 0)),
            ],
            vec!["Trabalho".into()],
        );
        assert!(corrigiu);
        let nomes: Vec<&str> = e.registros.iter().map(|r| r.tarefa.as_str()).collect();
        assert_eq!(nomes, vec!["Trabalho · revisar PR", "Casa", "avulsa"]);
        assert!(e.registros.iter().all(|r| r.projeto.is_none()));
    }

    #[test]
    fn fixar_sem_repetir_nem_vazio() {
        let mut e = vazio();
        e.fixar("  Casa ".into()).unwrap();
        e.fixar("Casa".into()).unwrap();
        assert!(e.fixar("   ".into()).is_err());
        assert_eq!(e.fixadas, vec!["Trabalho", "Casa"]);
        e.desafixar("Trabalho");
        assert_eq!(e.fixadas, vec!["Casa"]);
    }
}
