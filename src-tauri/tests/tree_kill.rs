// Teste de integração da prova de fundação SESS-06: spawna um processo real
// com um neto real (via `tree_kill_helper`), aciona `TreeGuard::kill_tree`
// (o mecanismo sob teste — process_guard.rs) e confirma via `sysinfo` —
// inspecionando a tabela de processos real do SO, não a UI — que nem o filho
// nem o neto sobrevivem. Não-vacuoso: também afirma que ambos estão vivos
// antes do kill.
//
// ── Por que NÃO usamos PTY aqui ───────────────────────────────────────────
// O teste original spawnava o filho num PTY (via portable-pty) para espelhar
// produção (spawn_session). No Windows headless do CI isso NÃO funciona: o
// ConPTY não executa o processo filho — ele trava na anexação ao pseudoconsole
// ANTES do main() (comprovado: nem uma escrita de "prova de vida" na
// primeiríssima linha aparecia). O mecanismo de kill de árvore, porém,
// INDEPENDE de PTY: é Job Object (Windows) / process group via killpg (Unix),
// e ambos funcionam sobre qualquer processo. Então spawnamos o filho com
// `std::process::Command` (que roda de forma confiável nas três plataformas —
// ver `pump_pty_output_forwards_bytes...` em pty.rs) e anexamos o TreeGuard
// pelo handle/pid bruto (`from_raw_handle`/`from_pid`). No Unix o filho recebe
// `setsid()` via `pre_exec`, virando líder de process group — exatamente o que
// o portable-pty faz em produção — para que `killpg` alcance seus descendentes.
//
// Ordem sem corrida: anexamos o TreeGuard e SÓ ENTÃO mandamos o "go" pelo
// stdin; o filho só spawna o neto depois do go, então o neto sempre nasce
// dentro do job/grupo. O PID do neto vem pelo stdout (pipe comum, leitura
// confiável — sem os problemas do ConPTY). Nada no corpo bloqueia sem timeout;
// o watchdog é rede de segurança.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::io::AsRawHandle;

use gsd_cards_lib::process_guard::TreeGuard;
use sysinfo::{Pid, ProcessesToUpdate, System};

const TEST_TIMEOUT: Duration = Duration::from_secs(60);

fn log_stage(msg: &str) {
    eprintln!("[tree_kill] {msg}");
}

/// Espera até `timeout` pela condição de vivo/morto desejada, para absorver
/// a pequena latência entre o SO processar o kill (fechar o Job Object no
/// Windows / `killpg` no Unix) e a tabela de processos refletir isso — sem
/// essa espera o teste seria flaky em CI sob carga, não porque o mecanismo
/// de kill esteja incorreto.
fn wait_for_alive_state(sys: &mut System, pid: u32, expected_alive: bool, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        sys.refresh_processes(ProcessesToUpdate::All, true);
        let alive = sys.process(Pid::from_u32(pid)).is_some();
        if alive == expected_alive {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn run_tree_kill_body() {
    let helper_path = env!("CARGO_BIN_EXE_tree_kill_helper");
    let mut command = Command::new(helper_path);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    // No Unix, torna o filho líder de sessão/process group (como o portable-pty
    // faz em produção via setsid) para que `killpg(child_pid)` alcance o neto.
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // SAFETY: pre_exec roda no filho após fork, antes de exec; `setsid` é
        // uma única syscall async-signal-safe, sem alocação.
        unsafe {
            command.pre_exec(|| {
                if libc::setsid() == -1 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }

    let mut child = command
        .spawn()
        .expect("spawn do tree_kill_helper deveria funcionar");
    let child_pid = child.id();
    log_stage(&format!("filho spawnado pid={child_pid}"));

    // TreeGuard::attach ANTES de mandar o "go" — como em produção, a associação
    // acontece antes de qualquer descendente existir (o filho só spawna o neto
    // depois de receber o go). Sem PTY: anexa pelo handle/pid bruto.
    #[cfg(windows)]
    let mut guard = TreeGuard::from_raw_handle(child.as_raw_handle())
        .expect("TreeGuard::from_raw_handle deveria funcionar sobre um processo real");
    #[cfg(unix)]
    let mut guard = TreeGuard::from_pid(child_pid);

    // Libera o filho para spawnar o neto (ele estava bloqueado lendo o stdin).
    {
        let mut stdin = child.stdin.take().expect("stdin do filho deveria estar piped");
        stdin
            .write_all(b"go\n")
            .expect("deveria conseguir mandar o sinal 'go' pelo stdin do filho");
        let _ = stdin.flush();
    }

    // Lê o PID do neto pelo stdout (pipe comum — leitura confiável). O helper
    // escreve a linha e dorme, então `lines().next()` retorna assim que a linha
    // chega, sem esperar EOF. Se o filho morrer sem escrever, vem EOF → None →
    // panic claro (não hang).
    let stdout = child.stdout.take().expect("stdout do filho deveria estar piped");
    let mut lines = BufReader::new(stdout).lines();
    let line = lines
        .next()
        .expect("stdout do filho deveria produzir a linha do PID do neto")
        .expect("linha do PID do neto deveria ser lida sem erro de IO");
    let grandchild_pid: u32 = line
        .trim()
        .strip_prefix("GRANDCHILD_PID=")
        .unwrap_or_else(|| panic!("linha inesperada do helper (esperava GRANDCHILD_PID=<pid>): {line:?}"))
        .trim()
        .parse()
        .expect("PID do neto deveria ser um u32 válido");
    log_stage(&format!("neto reportado pid={grandchild_pid}"));

    let mut sys = System::new();

    // Não-vacuoso: confirma que ambos os PIDs estão de fato vivos ANTES do kill.
    assert!(
        wait_for_alive_state(&mut sys, child_pid, true, Duration::from_secs(2)),
        "processo filho (pid {child_pid}) deveria estar vivo antes do kill_tree"
    );
    assert!(
        wait_for_alive_state(&mut sys, grandchild_pid, true, Duration::from_secs(2)),
        "processo neto (pid {grandchild_pid}) deveria estar vivo antes do kill_tree"
    );
    log_stage("ambos vivos — acionando kill_tree");

    // O mecanismo primário sob teste (Job Object no Windows / process group no
    // Unix via killpg) — NUNCA confiar só em Child::kill(), que mata apenas o
    // processo direto (threat_model T-02-02; Pattern 2 / Pitfall 1).
    guard
        .kill_tree()
        .expect("kill_tree não deveria falhar sobre uma árvore ainda viva");
    // Rede de segurança, na mesma ordem de produção (kill_session): reap do
    // processo direto depois de acionado o mecanismo de árvore.
    let _ = child.kill();
    let _ = child.wait();
    log_stage("kill_tree + reap concluídos");

    assert!(
        wait_for_alive_state(&mut sys, child_pid, false, Duration::from_secs(5)),
        "processo filho (pid {child_pid}) ainda vivo depois de kill_tree — zumbi!"
    );
    assert!(
        wait_for_alive_state(&mut sys, grandchild_pid, false, Duration::from_secs(5)),
        "processo neto (pid {grandchild_pid}) ainda vivo depois de kill_tree — zumbi! \
         (Child::kill() sozinho nunca alcançaria este PID — ver Pattern 2 / T-02-02)"
    );
    log_stage("ambos mortos — sem zumbis");
}

#[test]
fn tree_kill_leaves_no_zombies() {
    // Watchdog: roda o corpo numa thread e falha rápido se ele não terminar
    // dentro de `TEST_TIMEOUT`, em vez de deixar um hang inesperado pendurar o
    // job de CI. Um panic de asserção é capturado e re-propagado, preservando
    // a mensagem original.
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run_tree_kill_body));
        let _ = tx.send(outcome);
    });

    match rx.recv_timeout(TEST_TIMEOUT) {
        Ok(Ok(())) => {}
        Ok(Err(payload)) => std::panic::resume_unwind(payload),
        Err(_) => panic!(
            "tree_kill_leaves_no_zombies excedeu {}s — hang inesperado (ver stages [tree_kill])",
            TEST_TIMEOUT.as_secs()
        ),
    }
}
