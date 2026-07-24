// Mecanismo de kill de árvore de processos (critério de fundação SESS-06).
//
// `portable-pty::Child::kill()` mata só o processo direto que ele spawnou (o
// `claude`/shell), nunca os descendentes que esse processo eventualmente cria
// (git, subprocessos MCP, etc.) — ver `02-RESEARCH.md` Pattern 2. `TreeGuard`
// isola o mecanismo específico de plataforma que resolve isso: Job Object no
// Windows (kill-on-close) e process group no Unix (`killpg`). `attach` DEVE
// ser chamado no mesmo instante do spawn (nunca adicionado depois) — o kill
// de árvore depende da associação ter acontecido antes de qualquer
// descendente existir.
//
// SPIKE A1 (resolvido nesta tarefa, lendo o código-fonte do crate `win32job`
// 2.0.3 diretamente em
// `~/.cargo/registry/src/index.crates.io-*/win32job-2.0.3/src/job.rs`, não
// só por busca): o método que associa um processo FILHO já spawnado (não o
// processo atual) a um `Job` é
//
//     pub fn assign_process(&self, proc_handle: isize) -> Result<(), JobError>
//
// — equivalente direto a `AssignProcessToJobObject(job_handle, child_handle)`
// (distinto de `assign_current_process()`, que só serve para o processo
// atual). O handle vem de `portable_pty::Child::as_raw_handle(&self) ->
// Option<std::os::windows::io::RawHandle>` (também confirmado por leitura do
// código-fonte de `portable-pty` 0.9.0, `src/lib.rs`), convertido para
// `isize` antes de passar a `assign_process`. Resolve Assumptions Log A1 /
// Open Question #3 de `02-RESEARCH.md`.

use std::fmt;

#[derive(Debug, Clone)]
#[cfg_attr(test, derive(PartialEq))]
pub enum GuardError {
    NoPid,
    NoHandle,
    Platform(String),
}

impl fmt::Display for GuardError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            GuardError::NoPid => write!(f, "processo filho sem pid (já encerrado?)"),
            GuardError::NoHandle => write!(f, "processo filho sem handle de sistema (Windows)"),
            GuardError::Platform(msg) => write!(f, "falha de plataforma no mecanismo de kill de árvore: {msg}"),
        }
    }
}

impl std::error::Error for GuardError {}

#[cfg(windows)]
pub struct TreeGuard {
    // `Option` (não `win32job::Job` direto) porque `kill_tree` precisa poder
    // fechar o handle do job SOB DEMANDA (kill explícito de `kill_session`),
    // não só implicitamente quando a struct inteira é dropada ao remover a
    // sessão do `PtyManager` — `win32job::Job` não expõe um "close sem
    // consumir", então `Option::take()` + drop do valor tomado é a forma
    // idiomática de fechar o handle uma vez, sob demanda, mantendo a struct
    // `TreeGuard` viva (o `PtySession` ainda existe no HashMap até
    // `kill_session` terminar de limpar).
    job: Option<win32job::Job>,
}

#[cfg(windows)]
impl TreeGuard {
    /// Cria um Job Object com `limit_kill_on_job_close` e associa o processo
    /// filho já spawnado (via seu handle bruto) a ele. Fechar o handle do
    /// job (via `kill_tree`, ou implicitamente ao dropar `TreeGuard`) mata
    /// toda a árvore ainda viva associada — inclusive descendentes que
    /// `claude` tenha spawnado, que herdam a associação automaticamente
    /// (comportamento documentado da API Win32).
    pub fn attach(child: &dyn portable_pty::Child) -> Result<Self, GuardError> {
        let handle = child.as_raw_handle().ok_or(GuardError::NoHandle)?;
        Self::from_raw_handle(handle)
    }

    /// Mesma lógica de `attach`, mas a partir do handle bruto do Windows —
    /// permite anexar a QUALQUER processo já spawnado, não só os do
    /// portable-pty (ex.: um `std::process::Child` num teste que não usa PTY).
    /// O mecanismo de Job Object é idêntico independente de como o processo
    /// foi criado; `attach` é só o caso particular que extrai o handle de um
    /// `portable_pty::Child`.
    pub fn from_raw_handle(handle: std::os::windows::io::RawHandle) -> Result<Self, GuardError> {
        let job = win32job::Job::create()
            .map_err(|e| GuardError::Platform(e.to_string()))?;
        let mut info = job.query_extended_limit_info()
            .map_err(|e| GuardError::Platform(e.to_string()))?;
        info.limit_kill_on_job_close();
        job.set_extended_limit_info(&info)
            .map_err(|e| GuardError::Platform(e.to_string()))?;
        job.assign_process(handle as isize)
            .map_err(|e| GuardError::Platform(e.to_string()))?;

        Ok(Self { job: Some(job) })
    }

    /// Fecha o handle do job agora (`Option::take` + drop do valor tomado) —
    /// com `limit_kill_on_job_close` já configurado em `attach`, isso mata
    /// toda a árvore de processos ainda associada, imediatamente, sem
    /// esperar o `TreeGuard` inteiro ser dropado. Idempotente: chamar de
    /// novo depois de já ter matado é um no-op (`job` já é `None`).
    pub fn kill_tree(&mut self) -> Result<(), GuardError> {
        self.job.take();
        Ok(())
    }
}

#[cfg(unix)]
pub struct TreeGuard {
    pid: i32,
}

#[cfg(unix)]
impl TreeGuard {
    /// Guarda o pid do processo filho. No Unix, o processo anexado ao lado
    /// slave de um PTY normalmente vira líder de sessão/grupo (via `setsid`,
    /// confirmado em `portable-pty` 0.9.0 `src/unix.rs`) — então seus
    /// próprios filhos (que não chamam `setsid()` de novo) herdam o mesmo
    /// grupo e morrem juntos com um único `killpg`.
    pub fn attach(child: &dyn portable_pty::Child) -> Result<Self, GuardError> {
        let pid = child.process_id().ok_or(GuardError::NoPid)?;
        Ok(Self::from_pid(pid))
    }

    /// Mesma lógica de `attach`, mas a partir do pid — permite anexar a
    /// qualquer processo já spawnado (ex.: um `std::process::Child` num teste
    /// que não usa PTY). O pid DEVE ser o líder do process group (o alvo do
    /// `killpg`); em produção o portable-pty garante isso via `setsid`, e um
    /// teste sem PTY precisa fazer o `setsid` equivalente no filho.
    pub fn from_pid(pid: u32) -> Self {
        Self { pid: pid as i32 }
    }

    /// Mata o grupo de processos inteiro (pid negativo) — alcança qualquer
    /// descendente que não tenha criado sua própria sessão. `&mut self` só
    /// por simetria de assinatura com a variante Windows (chamado sob o
    /// mesmo lock de mutex em `pty.rs` de qualquer forma); a lógica em si
    /// não precisa de mutação.
    pub fn kill_tree(&mut self) -> Result<(), GuardError> {
        use nix::sys::signal::{killpg, Signal};
        use nix::unistd::Pid;

        match killpg(Pid::from_raw(self.pid), Signal::SIGKILL) {
            Ok(()) => Ok(()),
            // ESRCH: o grupo já não tem nenhum processo vivo — não é uma
            // falha real do mecanismo de kill, apenas "já estava morto".
            Err(nix::errno::Errno::ESRCH) => Ok(()),
            Err(e) => Err(GuardError::Platform(e.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn guard_error_display_no_pid() {
        assert_eq!(
            GuardError::NoPid.to_string(),
            "processo filho sem pid (já encerrado?)"
        );
    }

    #[test]
    fn guard_error_display_no_handle() {
        assert_eq!(
            GuardError::NoHandle.to_string(),
            "processo filho sem handle de sistema (Windows)"
        );
    }

    #[test]
    fn guard_error_display_platform() {
        let err = GuardError::Platform("falha de teste".to_string());
        assert_eq!(
            err.to_string(),
            "falha de plataforma no mecanismo de kill de árvore: falha de teste"
        );
    }

    #[test]
    fn guard_error_equality_by_variant() {
        assert_eq!(GuardError::NoPid, GuardError::NoPid);
        assert_ne!(GuardError::NoPid, GuardError::NoHandle);
    }

    #[cfg(unix)]
    #[test]
    fn pid_cast_preserves_value_within_i32_range() {
        let pid_u32: u32 = 12345;
        assert_eq!(pid_u32 as i32, 12345i32);
    }
}
