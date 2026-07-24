// Spawn de PTY real (`portable-pty`) + streaming de bytes crus para o
// frontend via `tauri::ipc::Channel` (Fase 2, SESS-02/TERM-01/SESS-06).
//
// Mesmo shape de estado gerenciado de `planning_watcher.rs::WatcherState`
// (`Mutex` guardando o recurso vivo), mas acumulando uma entrada por sessão
// (`HashMap<sessionId, PtySession>`) em vez de substituir um singleton —
// múltiplas sessões coexistem, ao contrário do watcher único.
//
// O Rust NUNCA decodifica UTF-8 do output do processo — o loop de leitura
// (`pump_pty_output`) só move `Vec<u8>` cru até o `Channel`; é o xterm.js no
// frontend que interpreta os bytes (seu parser interno mantém estado de
// decodificação entre chamadas de `write()`, resolvendo de graça o problema
// de um chunk cortar um caractere multi-byte ao meio).
//
// `TreeGuard::attach` é chamado no MESMO INSTANTE do spawn, antes de
// qualquer outra coisa poder falhar — o kill de árvore (critério de
// fundação SESS-06) depende dessa associação ter acontecido antes de
// qualquer descendente existir (ver `process_guard.rs`).

use std::collections::HashMap;
use std::fmt;
use std::io::{Read, Write};
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;

use crate::process_guard::TreeGuard;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum PtyError {
    AlreadyExists(String),
    NotFound(String),
    Spawn(String),
    Io(String),
}

impl fmt::Display for PtyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            PtyError::AlreadyExists(id) => write!(f, "AlreadyExists: sessão {id} já existe"),
            PtyError::NotFound(id) => write!(f, "NotFound: sessão {id} não encontrada"),
            PtyError::Spawn(msg) => write!(f, "Spawn: {msg}"),
            PtyError::Io(msg) => write!(f, "Io: {msg}"),
        }
    }
}

impl std::error::Error for PtyError {}

/// Uma sessão de PTY viva: o par master/writer/child do `portable-pty`, o
/// `TreeGuard` associado no instante do spawn, e o handle da thread leitora
/// (mantido só para não ser dropado prematuramente — o join acontece
/// implicitamente quando o processo termina e a thread sai do loop).
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    guard: TreeGuard,
    #[allow(dead_code)]
    reader_thread: Option<std::thread::JoinHandle<()>>,
}

/// Estado gerenciado: uma sessão viva por id, nunca substituída às cegas —
/// `spawn_session` recusa sobrescrever um id já existente (`AlreadyExists`).
#[derive(Default)]
pub struct PtyManager(pub Mutex<HashMap<String, PtySession>>);

impl PtyManager {
    /// Mata a árvore de processos de TODAS as sessões vivas — chamado pelo
    /// handler de `RunEvent::ExitRequested` em `lib.rs` antes de o app
    /// fechar (cobre o caso de fechar a janela com sessões ainda vivas,
    /// critério de fundação SESS-06). Mutex poisoned não impede o cleanup —
    /// se uma thread pânicou segurando o lock, ainda assim tentamos matar
    /// todo processo real que sobrou, em vez de deixar zumbis para trás.
    pub fn kill_all(&self) {
        let mut sessions = match self.0.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        for (_, mut session) in sessions.drain() {
            let _ = session.guard.kill_tree();
            let _ = session.child.kill();
            let _ = session.child.wait();
        }
    }

    /// Escreve `data` no stdin do PTY da sessão `session_id` — a mesma
    /// lógica lock→`get_mut`→`ok_or_else(NotFound)`→`write_all` que o
    /// comando `write_session` abaixo delegava anteriormente. Extraído para
    /// um método público (mesmo precedente de `kill_all`) para que
    /// `tests/write_session_rejects.rs` — um crate externo, sem acesso a um
    /// `tauri::State` real — possa exercitar o caminho de rejeição
    /// (`PtyError::NotFound`) sobre um `PtyManager` de verdade, não um mock
    /// JS (03-01-PLAN.md Task 3, T-03-02). Comportamento byte-a-byte
    /// idêntico ao anterior — pura relocação, nenhuma escrita nova.
    pub fn write(&self, session_id: &str, data: &str) -> Result<(), PtyError> {
        let mut sessions = self
            .0
            .lock()
            .map_err(|_| PtyError::Io("Estado do PtyManager corrompido (mutex poisoned)".to_string()))?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| PtyError::NotFound(session_id.to_string()))?;
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| PtyError::Io(e.to_string()))?;
        Ok(())
    }
}

/// Loop de leitura testável isoladamente: lê do `reader` até EOF (`Ok(0)`)
/// ou erro, empurrando cada chunk cru (nunca decodificado) para `sink`.
/// Extraído da thread leitora de `spawn_session` para que o data path
/// PTY→sink seja verificável sem precisar de um `Channel` real nem de um
/// `claude` de verdade (ver teste `pump_pty_output_forwards_bytes...` abaixo,
/// que usa um binário substituto real via `std::process::Command`).
pub fn pump_pty_output(mut reader: impl Read, mut sink: impl FnMut(Vec<u8>)) {
    let mut buf = [0u8; 4096];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => sink(buf[..n].to_vec()),
            Err(_) => break,
        }
    }
}

/// Sobe o `claude` (ou o binário substituto usado em teste manual) num PTY
/// real, no `cwd` fornecido. `cwd` DEVE vir exclusivamente do `root` já
/// canonicalizado por `project::validate_project_root` (Fase 1) — o
/// frontend nunca deve passar um caminho cru adicional aqui (mitigação
/// T-02-03 do threat model desta fase; `spawn_session` em si não
/// re-canonicaliza porque essa responsabilidade já foi cumprida a montante,
/// no momento em que o projeto foi aberto).
///
/// `CommandBuilder::new("claude")` herda o ambiente do processo atual
/// (`std::env::vars_os()`, ver `portable-pty` `cmdbuilder.rs::get_base_env`)
/// sem nenhuma chamada a `.env(...)` — nenhuma variável específica do
/// processo Tauri/app é injetada (mitigação T-02-04).
#[tauri::command]
pub fn spawn_session(
    state: State<'_, PtyManager>,
    session_id: String,
    cwd: String,
    on_event: Channel<Vec<u8>>,
) -> Result<(), PtyError> {
    {
        let sessions = state
            .0
            .lock()
            .map_err(|_| PtyError::Io("Estado do PtyManager corrompido (mutex poisoned)".to_string()))?;
        if sessions.contains_key(&session_id) {
            return Err(PtyError::AlreadyExists(session_id));
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| PtyError::Spawn(e.to_string()))?;

    let mut cmd = CommandBuilder::new("claude");
    cmd.cwd(&cwd);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| PtyError::Spawn(e.to_string()))?;
    // Exigência da própria API do portable-pty: o slave só deve viver no
    // processo filho depois do spawn.
    drop(pair.slave);

    // TreeGuard::attach NO MESMO INSTANTE do spawn — nunca adicionado
    // depois (ver process_guard.rs e o key_link do PLAN.md desta tarefa).
    let guard = TreeGuard::attach(child.as_ref() as &dyn Child)
        .map_err(|e| PtyError::Spawn(e.to_string()))?;

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| PtyError::Io(e.to_string()))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| PtyError::Io(e.to_string()))?;

    let reader_thread = std::thread::spawn(move || {
        pump_pty_output(reader, move |chunk| {
            // Falha ao enviar (frontend desmontou o Channel) não derruba a
            // thread — só significa que ninguém está mais ouvindo; o loop
            // continua até o processo real sair (EOF), quando `kill_session`
            // ou `RunEvent::ExitRequested` já terão sido chamados de qualquer
            // forma.
            let _ = on_event.send(chunk);
        });
    });

    let session = PtySession {
        master: pair.master,
        writer,
        child,
        guard,
        reader_thread: Some(reader_thread),
    };

    let mut sessions = state
        .0
        .lock()
        .map_err(|_| PtyError::Io("Estado do PtyManager corrompido (mutex poisoned)".to_string()))?;
    sessions.insert(session_id, session);

    Ok(())
}

#[tauri::command]
pub fn write_session(
    state: State<'_, PtyManager>,
    session_id: String,
    data: String,
) -> Result<(), PtyError> {
    state.write(&session_id, &data)
}

#[tauri::command]
pub fn resize_session(
    state: State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), PtyError> {
    let sessions = state
        .0
        .lock()
        .map_err(|_| PtyError::Io("Estado do PtyManager corrompido (mutex poisoned)".to_string()))?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| PtyError::NotFound(session_id.clone()))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| PtyError::Io(e.to_string()))?;
    Ok(())
}

/// Aciona o TreeGuard ANTES de `Child::kill()`/`wait()` — o mecanismo de
/// árvore (Job Object/process group) é a defesa primária contra zumbis
/// (SESS-06); `child.kill()`/`wait()` do `portable-pty` roda depois, só como
/// rede de segurança para colher (reap) o processo direto.
#[tauri::command]
pub fn kill_session(state: State<'_, PtyManager>, session_id: String) -> Result<(), String> {
    let mut sessions = state
        .0
        .lock()
        .map_err(|_| "Estado do PtyManager corrompido (mutex poisoned)".to_string())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.guard.kill_tree();
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};
    use std::sync::{Arc, Mutex as StdMutex};

    /// Prova o data path PTY(processo real)→sink sem precisar de um
    /// `Channel` do Tauri nem do `claude` de verdade: spawna um binário
    /// substituto real (`printf` no Unix / `cmd /c echo` no Windows) com
    /// stdout via pipe, e passa esse stdout por `pump_pty_output` — a MESMA
    /// função usada pela thread leitora de `spawn_session`.
    #[test]
    fn pump_pty_output_forwards_bytes_from_a_real_process() {
        #[cfg(unix)]
        let mut child = Command::new("printf")
            .arg("ola-pty")
            .stdout(Stdio::piped())
            .spawn()
            .expect("printf deveria estar disponível neste ambiente de teste");

        #[cfg(windows)]
        let mut child = Command::new("cmd")
            .args(["/C", "echo", "ola-pty"])
            .stdout(Stdio::piped())
            .spawn()
            .expect("cmd deveria estar disponível neste ambiente de teste");

        let stdout = child.stdout.take().expect("stdout deveria estar piped");

        let collected: Arc<StdMutex<Vec<u8>>> = Arc::new(StdMutex::new(Vec::new()));
        let collected_for_sink = collected.clone();

        pump_pty_output(stdout, move |chunk| {
            collected_for_sink.lock().unwrap().extend_from_slice(&chunk);
        });

        child
            .wait()
            .expect("o processo substituto deveria terminar normalmente");

        let output = collected.lock().unwrap();
        let text = String::from_utf8_lossy(&output);
        assert!(
            text.contains("ola-pty"),
            "esperava 'ola-pty' no output recebido pelo sink, obtive: {text:?}"
        );
    }

    #[test]
    fn pty_error_display_variants() {
        assert!(PtyError::AlreadyExists("a".into()).to_string().contains("AlreadyExists"));
        assert!(PtyError::NotFound("a".into()).to_string().contains("NotFound"));
        assert!(PtyError::Spawn("boom".into()).to_string().contains("boom"));
        assert!(PtyError::Io("boom".into()).to_string().contains("boom"));
    }
}
