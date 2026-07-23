// Escopo estreito de leitura para descoberta de sessões do Claude Code
// (`~/.claude/projects/<encoded>/`) — SESS-01.
//
// Reusa a mesma disciplina de canonicalização+concessão de escopo de
// `project.rs` (T-01-03b), mas o escopo concedido aqui é deliberadamente
// mais estreito: SÓ a subpasta codificada do projeto atualmente aberto,
// NUNCA `~/.claude/projects/` inteira (mitiga T-02-01 — vazaria sessões de
// outros projetos não relacionados do mesmo usuário para o frontend).
//
// `register_sessions_scope` NÃO exige que a pasta codificada já exista no
// disco: `allow_directory` só registra um padrão de ACL (glob), sem I/O —
// ver `tauri::scope::fs::Scope::allow_directory`. Projetos novos sem
// nenhuma sessão ainda criada simplesmente não têm essa subpasta; a
// degradação para "sem sessões" acontece no lado TS (`discover.ts`), quando
// `readDir` falha porque o diretório não existe.

use std::fmt;
use std::path::PathBuf;

use serde::Serialize;
use tauri::Manager;
use tauri_plugin_fs::FsExt;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum SessionsError {
    NoHomeDir(String),
    Io(String),
}

impl fmt::Display for SessionsError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SessionsError::NoHomeDir(msg) => write!(f, "NoHomeDir: {msg}"),
            SessionsError::Io(msg) => write!(f, "Io: {msg}"),
        }
    }
}

impl std::error::Error for SessionsError {}

/// Reproduz a regra verificada diretamente no ambiente real do Claude Code:
/// cada separador de caminho (`/` no Unix, `\` no Windows) vira um traço.
/// Ex.: `/home/user/gsd-cards` → `-home-user-gsd-cards`.
pub fn encode_project_path(root: &str) -> String {
    let normalized = root.replace('\\', "/");
    normalized.replace('/', "-")
}

/// Concede escopo de leitura do `plugin-fs` SÓ para a subpasta codificada do
/// projeto atualmente aberto dentro de `~/.claude/projects/` — nunca para o
/// diretório pai (mitiga T-02-01). `project_root` deve vir do `root` já
/// canonicalizado por `validate_project_root` (mesma disciplina de
/// containment de `project.rs` — a responsabilidade de canonicalizar um
/// caminho vindo do usuário já foi cumprida a montante, no momento em que o
/// projeto foi aberto). Devolve o caminho da subpasta codificada para o
/// frontend usar diretamente em `readDir`/`stat` (`discover.ts`).
#[tauri::command]
pub fn register_sessions_scope(
    app: tauri::AppHandle,
    project_root: String,
) -> Result<String, SessionsError> {
    let home = app.path().home_dir().map_err(|e| {
        SessionsError::NoHomeDir(format!("Não foi possível resolver o diretório home: {e}"))
    })?;

    let encoded_dir: PathBuf = home
        .join(".claude")
        .join("projects")
        .join(encode_project_path(&project_root));

    app.fs_scope()
        .allow_directory(&encoded_dir, true)
        .map_err(|e| {
            SessionsError::Io(format!("Não foi possível conceder escopo de leitura: {e}"))
        })?;

    Ok(encoded_dir.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_project_path_matches_verified_claude_code_rule() {
        // Regra verificada por leitura direta do filesystem real desta
        // máquina (02-RESEARCH.md Pattern 4), não só inferida.
        assert_eq!(
            encode_project_path("/home/user/gsd-cards"),
            "-home-user-gsd-cards"
        );
    }

    #[test]
    fn encode_project_path_handles_arbitrary_nested_segments() {
        assert_eq!(encode_project_path("/a/b/c"), "-a-b-c");
    }

    #[test]
    fn encode_project_path_normalizes_backslashes_before_encoding() {
        // Um caminho com barras invertidas já normalizadas para `/` (como
        // devolvido por `project::validate_project_root`) deve encodar
        // exatamente igual ao caminho POSIX equivalente.
        assert_eq!(
            encode_project_path("C:/dev/gsd-cards"),
            encode_project_path(r"C:\dev\gsd-cards")
        );
    }

    #[cfg(windows)]
    #[test]
    fn encode_project_path_normalizes_windows_backslashes() {
        assert_eq!(
            encode_project_path(r"C:\dev\gsd-cards"),
            "C:-dev-gsd-cards"
        );
    }
}
