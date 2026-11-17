use chrono::{DateTime, Local, TimeDelta};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use std::{fs, io, path::PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Registro {
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
