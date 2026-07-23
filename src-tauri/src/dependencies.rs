// Detecção de dependências externas do app — Claude CLI (PROJ-04). Checagem
// GLOBAL, independente de qual projeto GSD está aberto: `which::which`
// resolve `claude` no PATH do sistema operacional (cross-platform, incluindo
// as extensões `.exe`/`.cmd` do Windows via `PATHEXT`, sem reimplementar essa
// lógica na mão — ver 02-RESEARCH.md Pattern 5).
//
// NENHUM caminho de código aqui instala binários — apenas detecta e devolve
// o resultado para o frontend decidir como instruir o usuário
// (REQUIREMENTS.md ## Out of Scope: auto-instalação é proibida).

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub claude_path: Option<String>,
}

/// Resolve `bin_name` no PATH do SO, devolvendo o caminho normalizado (barras
/// `/`, nunca `\`) quando encontrado. Extraído como função pura e parametrizada
/// (em vez de hardcoded só para "claude") para ser testável nos dois branches
/// (presente/ausente) sem depender de `claude` estar de fato instalado na
/// máquina que roda os testes — ver `mod tests` abaixo.
fn resolve_on_path(bin_name: &str) -> Option<String> {
    which::which(bin_name)
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"))
}

/// Checagem global de `claude` no PATH — roda uma vez (boot do app ou lazy
/// na primeira tentativa de abrir a sidebar de sessões) e é cacheada pelo
/// chamador; bloqueia a criação de sessão quando ausente, sem nunca tentar
/// instalar nada.
#[tauri::command]
pub fn check_claude_on_path() -> DependencyStatus {
    DependencyStatus {
        claude_path: resolve_on_path("claude"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_path_for_a_binary_known_to_be_on_path() {
        // `cargo` está garantidamente no PATH deste ambiente de build (é o
        // próprio toolchain rodando o teste) — usado aqui só para provar o
        // branch "presente" sem depender de `claude` de verdade estar
        // instalado na máquina que roda os testes/CI.
        let found = resolve_on_path("cargo");
        assert!(
            found.is_some(),
            "cargo deveria resolver no PATH deste ambiente de build"
        );
    }

    #[test]
    fn returns_none_for_a_binary_that_does_not_exist() {
        let missing = resolve_on_path("this-binary-does-not-exist-xyz-987654321");
        assert!(missing.is_none());
    }

    #[test]
    fn check_claude_on_path_returns_dependency_status_without_panicking() {
        // Não afirma presença/ausência do `claude` real (depende da máquina
        // que roda o teste) — garante só que o comando executa e devolve a
        // forma esperada (Option<String>), provando os dois branches via
        // `resolve_on_path` acima.
        let status = check_claude_on_path();
        match status.claude_path {
            Some(path) => assert!(!path.is_empty()),
            None => {}
        }
    }
}
