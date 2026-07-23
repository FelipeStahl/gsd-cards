// Portão único de entrada de filesystem do GSD Cards.
//
// `validate_project_root` é o único comando que aceita um caminho vindo do
// frontend. Ele canonicaliza a raiz (resolvendo symlinks), confirma que
// `.planning/` existe e está de fato contido na raiz canonicalizada (nunca
// por comparação textual de prefixo — ver `is_contained` e seus testes),
// e só então concede escopo de leitura ao `tauri-plugin-fs` para essa raiz.
//
// Mitiga T-01-01 (path traversal via symlink) e T-01-03b (escopo de fs
// concedido apenas por projeto aberto, nunca globalmente).

use std::fmt;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidatedProject {
    pub root: String,
    pub planning_dir: String,
    pub has_roadmap: bool,
    pub has_state: bool,
    /// Aditivo (Fase 2, PROJ-04): `true` quando gsd-core está instalado
    /// local-por-projeto (`<root>/.claude/gsd-core/`), no home do usuário
    /// (`~/.claude/gsd-core/`), OU resolve globalmente via `which gsd-tools`
    /// — qualquer uma das três é suficiente (02-RESEARCH.md Pattern 5,
    /// escopo mínimo v1 Claude-only da Open Question #2).
    pub has_gsd_core: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum ProjectError {
    NotAGsdProject(String),
    OutsideScope(String),
    Io(String),
}

impl fmt::Display for ProjectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProjectError::NotAGsdProject(msg) => write!(f, "NotAGsdProject: {msg}"),
            ProjectError::OutsideScope(msg) => write!(f, "OutsideScope: {msg}"),
            ProjectError::Io(msg) => write!(f, "Io: {msg}"),
        }
    }
}

impl std::error::Error for ProjectError {}

/// Verifica se `candidate` está contido em `root` por componentes de caminho,
/// nunca por prefixo textual — `/a/bc` NÃO é considerado contido em `/a/b`
/// (mitiga T-01-01: comparação de string ingênua permitiria esse escape).
fn is_contained(root: &Path, candidate: &Path) -> bool {
    candidate.starts_with(root)
}

/// Canonicaliza sem o prefixo `\\?\` que `std::fs::canonicalize` produz no
/// Windows — esse prefixo quebraria a concatenação de caminho feita no lado
/// TypeScript (`paths.ts`) para derivar `.planning/ROADMAP.md` etc.
fn canonicalize(path: &Path) -> std::io::Result<PathBuf> {
    dunce::canonicalize(path)
}

/// `true` quando `<dir>/.claude/gsd-core/` existe — checagem pura, testável
/// sem depender de um `AppHandle` real (usada tanto para a raiz do projeto
/// quanto para o home do usuário em `has_gsd_core_installed`).
fn dir_has_gsd_core(dir: &Path) -> bool {
    dir.join(".claude").join("gsd-core").exists()
}

/// Três formas observadas de gsd-core estar instalado (nenhuma delas
/// exclusiva): (a) local-por-projeto, (b) no home do usuário, (c) global via
/// PATH (`gsd-tools`). Não existe um comando "doctor"/health-check oficial do
/// gsd-core para isso (02-RESEARCH.md Pattern 5) — é inferência por
/// existência de diretório/binário, não uma API formal.
fn has_gsd_core_installed(app: &tauri::AppHandle, root_canonical: &Path) -> bool {
    if dir_has_gsd_core(root_canonical) {
        return true;
    }
    if let Ok(home) = app.path().home_dir() {
        if dir_has_gsd_core(&home) {
            return true;
        }
    }
    which::which("gsd-tools").is_ok()
}

#[tauri::command]
pub fn validate_project_root(
    app: tauri::AppHandle,
    root: String,
) -> Result<ValidatedProject, ProjectError> {
    let root_canonical = canonicalize(Path::new(&root)).map_err(|e| {
        ProjectError::Io(format!("Não foi possível acessar o diretório: {e}"))
    })?;

    let planning_dir_raw = root_canonical.join(".planning");
    if !planning_dir_raw.exists() {
        return Err(ProjectError::NotAGsdProject(
            "Diretório .planning/ não encontrado nesta pasta".to_string(),
        ));
    }

    let planning_canonical = canonicalize(&planning_dir_raw).map_err(|e| {
        ProjectError::Io(format!("Não foi possível acessar .planning/: {e}"))
    })?;

    if !is_contained(&root_canonical, &planning_canonical) {
        return Err(ProjectError::OutsideScope(
            "O diretório .planning/ resolve para fora da raiz selecionada (symlink escapando do escopo)"
                .to_string(),
        ));
    }

    let has_roadmap = planning_canonical.join("ROADMAP.md").exists();
    let has_state = planning_canonical.join("STATE.md").exists();
    let has_gsd_core = has_gsd_core_installed(&app, &root_canonical);

    // Concede escopo de leitura em runtime apenas para esta raiz canônica —
    // nenhum outro diretório recebe escopo (mitiga T-01-03b).
    app.fs_scope()
        .allow_directory(&root_canonical, true)
        .map_err(|e| {
            ProjectError::Io(format!("Não foi possível conceder escopo de leitura: {e}"))
        })?;

    Ok(ValidatedProject {
        root: root_canonical.to_string_lossy().replace('\\', "/"),
        planning_dir: planning_canonical.to_string_lossy().replace('\\', "/"),
        has_roadmap,
        has_state,
        has_gsd_core,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nested_path_is_contained() {
        assert!(is_contained(Path::new("/a/b"), Path::new("/a/b/c")));
    }

    #[test]
    fn sibling_with_common_text_prefix_is_not_contained() {
        // /a/bc partilha o prefixo textual "/a/b" com /a/b, mas NÃO é um
        // descendente dele — uma comparação de string ingênua erraria aqui.
        assert!(!is_contained(Path::new("/a/b"), Path::new("/a/bc")));
    }

    #[test]
    fn unrelated_path_is_not_contained() {
        assert!(!is_contained(Path::new("/a/b"), Path::new("/a/c")));
    }

    #[test]
    fn root_is_contained_in_itself() {
        assert!(is_contained(Path::new("/a/b"), Path::new("/a/b")));
    }

    #[test]
    fn dir_has_gsd_core_true_when_subpath_exists() {
        let dir = std::env::temp_dir().join(format!(
            "gsd-cards-test-has-gsd-core-{}-{}",
            std::process::id(),
            line!()
        ));
        std::fs::create_dir_all(dir.join(".claude").join("gsd-core")).unwrap();
        assert!(dir_has_gsd_core(&dir));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn dir_has_gsd_core_false_when_missing() {
        let dir = std::env::temp_dir().join(format!(
            "gsd-cards-test-no-gsd-core-{}-{}",
            std::process::id(),
            line!()
        ));
        assert!(!dir_has_gsd_core(&dir));
    }

    // Caminhos estilo Windows (drive + separador `\`) só têm semântica de
    // componentes de path quando compilados no Windows — no Unix `\` não é
    // separador, então `Path` enxerga um único componente e a asserção não
    // reflete o comportamento real de `is_contained`. Restritos a
    // `#[cfg(windows)]`; a matriz de CI cobre `windows-latest`.
    #[cfg(windows)]
    #[test]
    fn windows_style_sibling_with_common_prefix_is_not_contained() {
        assert!(!is_contained(
            Path::new(r"C:\dev\gsd"),
            Path::new(r"C:\dev\gsd-cards")
        ));
    }

    #[cfg(windows)]
    #[test]
    fn windows_style_nested_path_is_contained() {
        assert!(is_contained(
            Path::new(r"C:\dev\gsd-cards"),
            Path::new(r"C:\dev\gsd-cards\.planning")
        ));
    }
}
