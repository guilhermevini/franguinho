use chrono::{DateTime, Local, TimeDelta};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{fs, io, path::PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Registro {
    /// Identificador fixo; registros antigos (sem id) ganham um ao carregar.
    #[serde(default)]
    pub id: u64,
    pub tarefa: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub projeto: Option<String>,
    pub inicio: DateTime<Local>,
    pub fim: Option<DateTime<Local>>,
}

impl Registro {
    /// Duração até o fim, ou até agora se a tarefa ainda está rolando.
    pub fn duracao(&self) -> TimeDelta {
        self.fim.unwrap_or_else(Local::now) - self.inicio
    }
}

/// Guarda os dados em JSON dentro da pasta de dados do sistema
/// (ex.: ~/Library/Application Support/franguinho no macOS,
/// %APPDATA%\franguinho no Windows, ~/.local/share/franguinho no Linux).
pub struct Store {
    pasta: PathBuf,
}

impl Store {
    pub fn new() -> Self {
        let pasta = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("franguinho");
        Self { pasta }
    }

    /// Uma pasta qualquer, pros testes não mexerem nos dados de verdade.
    #[cfg(test)]
    fn em(pasta: PathBuf) -> Self {
        Self { pasta }
    }

    pub fn carregar(&self) -> Vec<Registro> {
        self.ler("registros.json")
    }

    pub fn salvar(&self, registros: &[Registro]) -> io::Result<()> {
        self.gravar("registros.json", registros)
    }

    pub fn carregar_projetos(&self) -> Vec<String> {
        self.ler("projetos.json")
    }

    pub fn salvar_projetos(&self, projetos: &[String]) -> io::Result<()> {
        self.gravar("projetos.json", projetos)
    }

    fn ler<T: DeserializeOwned + Default>(&self, nome: &str) -> T {
        let caminho = self.pasta.join(nome);
        let Ok(conteudo) = fs::read_to_string(&caminho) else {
            return T::default();
        };
        match serde_json::from_str(&conteudo) {
            Ok(dados) => dados,
            Err(_) => {
                // Não sobrescreve um arquivo que não conseguimos ler: guarda uma cópia antes.
                let backup = caminho.with_extension(format!(
                    "json.corrompido-{}",
                    Local::now().format("%Y%m%d%H%M%S")
                ));
                let _ = fs::copy(&caminho, backup);
                T::default()
            }
        }
    }

    fn gravar<T: Serialize + ?Sized>(&self, nome: &str, dados: &T) -> io::Result<()> {
        fs::create_dir_all(&self.pasta)?;
        let caminho = self.pasta.join(nome);
        let json = serde_json::to_string_pretty(dados).map_err(io::Error::other)?;
        // Escreve num temporário e renomeia, pra nunca deixar o arquivo pela metade.
        let tmp = caminho.with_extension("json.tmp");
        fs::write(&tmp, json)?;
        fs::rename(&tmp, &caminho)
    }

    pub fn exportar_csv(&self, registros: &[Registro]) -> io::Result<PathBuf> {
        fs::create_dir_all(&self.pasta)?;
        let destino = self.pasta.join("registros.csv");
        let aspas = |s: &str| format!("\"{}\"", s.replace('"', "\"\""));
        let mut csv = String::from("projeto,tarefa,inicio,fim,duracao_minutos\n");
        for r in registros {
            let fim = r.fim.map(|f| f.to_rfc3339()).unwrap_or_default();
            csv.push_str(&format!(
                "{},{},{},{},{}\n",
                aspas(r.projeto.as_deref().unwrap_or_default()),
                aspas(&r.tarefa),
                r.inicio.to_rfc3339(),
                fim,
                r.duracao().num_minutes()
            ));
        }
        fs::write(&destino, csv)?;
        Ok(destino)
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use chrono::TimeZone;

    /// Pasta temporária própria de cada teste, apagada no fim.
    struct Pasta(PathBuf);

    impl Pasta {
        fn nova(nome: &str) -> Self {
            let p = std::env::temp_dir()
                .join(format!("franguinho-teste-{nome}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&p);
            Self(p)
        }
    }

    impl Drop for Pasta {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn registro(id: u64, tarefa: &str, projeto: Option<&str>) -> Registro {
        let inicio = Local.with_ymd_and_hms(2026, 11, 17, 9, 0, 0).unwrap();
        Registro {
            id,
            tarefa: tarefa.into(),
            projeto: projeto.map(Into::into),
            inicio,
            fim: Some(inicio + TimeDelta::minutes(90)),
        }
    }

    #[test]
    fn sem_arquivo_comeca_vazio() {
        let pasta = Pasta::nova("vazio");
        let store = Store::em(pasta.0.clone());
        assert!(store.carregar().is_empty());
        assert!(store.carregar_projetos().is_empty());
    }

    #[test]
    fn salva_e_carrega_de_volta() {
        let pasta = Pasta::nova("ida-e-volta");
        let store = Store::em(pasta.0.clone());
        store
            .salvar(&[registro(1, "a", Some("Trabalho")), registro(2, "b", None)])
            .unwrap();
        store.salvar_projetos(&["Trabalho".into()]).unwrap();

        let lidos = store.carregar();
        assert_eq!(lidos.len(), 2);
        assert_eq!(
            (lidos[0].id, lidos[0].projeto.as_deref()),
            (1, Some("Trabalho"))
        );
        assert_eq!(lidos[1].duracao(), TimeDelta::minutes(90));
        assert_eq!(store.carregar_projetos(), vec!["Trabalho"]);
        assert!(!pasta.0.join("registros.json.tmp").exists());
    }

    #[test]
    fn le_o_formato_antigo_sem_id_nem_projeto() {
        let pasta = Pasta::nova("antigo");
        fs::create_dir_all(&pasta.0).unwrap();
        fs::write(
            pasta.0.join("registros.json"),
            r#"[{"tarefa":"x","inicio":"2026-11-16T09:00:00-03:00","fim":null}]"#,
        )
        .unwrap();
        let lidos = Store::em(pasta.0.clone()).carregar();
        assert_eq!((lidos[0].id, lidos[0].projeto.clone()), (0, None));
    }

    #[test]
    fn arquivo_corrompido_vira_backup_em_vez_de_sumir() {
        let pasta = Pasta::nova("corrompido");
        fs::create_dir_all(&pasta.0).unwrap();
        fs::write(pasta.0.join("registros.json"), "isso não é json").unwrap();
        assert!(Store::em(pasta.0.clone()).carregar().is_empty());
        let backups: Vec<_> = fs::read_dir(&pasta.0)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains("corrompido"))
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(
            fs::read_to_string(backups[0].path()).unwrap(),
            "isso não é json"
        );
    }

    #[test]
    fn csv_escapa_aspas_e_virgulas() {
        let pasta = Pasta::nova("csv");
        let store = Store::em(pasta.0.clone());
        let caminho = store
            .exportar_csv(&[registro(1, "revisar \"PR\", urgente", Some("Trabalho"))])
            .unwrap();
        let csv = fs::read_to_string(caminho).unwrap();
        let linhas: Vec<&str> = csv.lines().collect();
        assert_eq!(linhas[0], "projeto,tarefa,inicio,fim,duracao_minutos");
        assert!(linhas[1].starts_with("\"Trabalho\",\"revisar \"\"PR\"\", urgente\","));
        assert!(linhas[1].ends_with(",90"));
    }
}
