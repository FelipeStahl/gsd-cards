// Teste de integração da prova de fundação SESS-06: spawna um processo real
// com um neto real (via `tree_kill_helper`, ver `src/bin/tree_kill_helper.rs`),
// aciona `TreeGuard::kill_tree` (o mecanismo sob teste — process_guard.rs) e
// confirma via `sysinfo` — inspecionando a tabela de processos real do SO,
// não a UI (o Pitfall 1 documentado em 02-RESEARCH.md é exatamente confundir
// "a UI deixou de mostrar o terminal" com "a árvore morreu") — que nem o
// filho nem o neto sobrevivem.
//
// Não-vacuoso por construção: também afirma que ambos os PIDs estão VIVOS
// antes do kill. Sem essa asserção positiva, um bug que fizesse o teste
// nunca encontrar os PIDs certos (ex.: parsing errado da linha do neto)
// passaria silenciosamente "morto depois" só porque nunca esteve vivo para
// começo de conversa.
//
// ── Robustez de plataforma (hotfix de CI) ────────────────────────────────
// 1. LEITURA TOLERANTE A ConPTY: a leitura do master do PTY NÃO usa framing
//    por linha (`BufReader::lines`). O ConPTY do Windows reescreve os fins de
//    linha como sequências VT (movimento de cursor), então um `\n` literal
//    pode NUNCA aparecer no stream do master — e `lines().next()` bloqueava
//    para sempre no runner Windows do GitHub Actions (o Unix passa `\n`
//    literal, por isso Ubuntu/macOS sempre passaram). Em vez disso lemos bytes
//    crus e varremos os marcadores como substrings, tolerante a ruído VT.
// 2. WATCHDOG DE TIMEOUT: o corpo roda numa thread com um limite de tempo, para
//    que qualquer I/O bloqueante de ConPTY (ou um `child.wait()` sobre uma
//    árvore que o kill não alcançou) FALHE RÁPIDO com mensagem clara em vez de
//    pendurar o job de CI por dezenas de minutos até o timeout do runner.

use std::io::Read;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use gsd_cards_lib::process_guard::TreeGuard;
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use sysinfo::{Pid, ProcessesToUpdate, System};

/// Teto de tempo do teste inteiro. O caminho feliz completa em poucos segundos
/// (as esperas de vivo/morto somam no máximo ~7s); este teto só existe para
/// converter um hang de plataforma em uma falha rápida e legível.
const TEST_TIMEOUT: Duration = Duration::from_secs(60);

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

/// Extrai o PID do neto do buffer acumulado do PTY, mas SÓ quando o número
/// está comprovadamente completo (dígitos seguidos de um terminador não-dígito
/// — o helper escreve `PID` + newline, e o ConPTY emite ao menos um CR/VT
/// depois). Sem exigir o terminador, poderíamos parsear um número truncado que
/// ainda está chegando pelo stream.
fn parse_grandchild_pid(buf: &str) -> Option<u32> {
    let start = buf.find("GRANDCHILD_PID=")? + "GRANDCHILD_PID=".len();
    let rest = &buf[start..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    // Precisa existir pelo menos um caractere após os dígitos (o terminador).
    rest[digits.len()..].chars().next()?;
    digits.parse().ok()
}

/// Lê bytes crus do master do PTY (sem depender de framing por `\n`, que o
/// ConPTY do Windows não garante) e retorna o PID do neto assim que AMBOS os
/// marcadores — `TREE_KILL_HELPER_READY` e um `GRANDCHILD_PID=<n>` completo —
/// aparecerem no stream. Para de ler nesse ponto: o helper dorme para sempre
/// segurando o slave aberto, então ler até EOF bloquearia. O watchdog do teste
/// cobre o caso em que os bytes nunca chegam.
fn read_grandchild_pid(reader: &mut (dyn Read)) -> u32 {
    let mut acc = String::new();
    let mut chunk = [0u8; 4096];
    loop {
        let n = reader
            .read(&mut chunk)
            .expect("leitura do master do PTY não deveria falhar");
        assert!(
            n > 0,
            "EOF do master do PTY antes dos dois marcadores; lido até agora: {acc:?}"
        );
        // Marcadores e dígitos são ASCII; a conversão lossy nunca os corrompe,
        // mesmo que um chunk caia no meio de uma sequência VT multibyte.
        acc.push_str(&String::from_utf8_lossy(&chunk[..n]));
        if acc.contains("TREE_KILL_HELPER_READY") {
            if let Some(pid) = parse_grandchild_pid(&acc) {
                return pid;
            }
        }
    }
}

/// Corpo real do teste. Roda numa thread de trabalho sob o watchdog de
/// `tree_kill_leaves_no_zombies` — panics aqui (asserts) são propagados como
/// falha real; um bloqueio indefinido vira timeout do watchdog.
fn run_tree_kill_body() {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("openpty deveria funcionar no ambiente de teste");

    // O binário compilado nesta mesma workspace pelo Cargo (ver Task 1 do
    // 02-02-PLAN.md e o `[[bin]]` em Cargo.toml) — `CARGO_BIN_EXE_<name>` é
    // injetado pelo próprio harness de teste do Cargo para qualquer target
    // de binário do pacote.
    let helper_path = env!("CARGO_BIN_EXE_tree_kill_helper");
    let cmd = CommandBuilder::new(helper_path);

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .expect("spawn do tree_kill_helper deveria funcionar");
    // Mesma exigência da API do portable-pty seguida em
    // pty.rs::spawn_session: o slave só deve viver no processo filho depois
    // do spawn.
    drop(pair.slave);

    // TreeGuard::attach no MESMO INSTANTE do spawn, exatamente como em
    // produção (pty.rs::spawn_session) — nunca adicionado depois; o kill de
    // árvore depende dessa associação ter acontecido antes de qualquer
    // descendente existir.
    let mut guard = TreeGuard::attach(child.as_ref() as &dyn Child)
        .expect("TreeGuard::attach deveria funcionar sobre um processo real recém-spawnado");

    let child_pid = child
        .process_id()
        .expect("child deveria ter pid logo após o spawn");

    let mut reader = pair
        .master
        .try_clone_reader()
        .expect("reader do master do PTY deveria funcionar");

    // Leitura tolerante a ConPTY (ver nota no topo do arquivo): varre bytes
    // crus pelos marcadores em vez de exigir framing por `\n`. A presença do
    // `TREE_KILL_HELPER_READY` é pré-requisito para extrair o PID do neto, o
    // que preserva a exigência de ordem/marcador do teste original.
    let grandchild_pid = read_grandchild_pid(reader.as_mut());

    let mut sys = System::new();

    // Não-vacuoso: confirma que ambos os PIDs estão de fato vivos ANTES do
    // kill — ver nota no topo do arquivo sobre por que essa asserção
    // positiva importa.
    assert!(
        wait_for_alive_state(&mut sys, child_pid, true, Duration::from_secs(2)),
        "processo filho (pid {child_pid}) deveria estar vivo antes do kill_tree"
    );
    assert!(
        wait_for_alive_state(&mut sys, grandchild_pid, true, Duration::from_secs(2)),
        "processo neto (pid {grandchild_pid}) deveria estar vivo antes do kill_tree"
    );

    // O mecanismo primário sob teste (Job Object no Windows / process group
    // no Unix via killpg) — NUNCA confiar só em Child::kill(), que mata
    // apenas o processo direto (threat_model T-02-02 do 02-02-PLAN.md;
    // Pattern 2 / Pitfall 1 do 02-RESEARCH.md).
    guard
        .kill_tree()
        .expect("kill_tree não deveria falhar sobre uma árvore ainda viva");
    // Rede de segurança, na mesma ordem usada em produção
    // (pty.rs::kill_session): reap do processo direto, depois do mecanismo
    // de árvore já ter sido acionado.
    let _ = child.kill();
    let _ = child.wait();

    assert!(
        wait_for_alive_state(&mut sys, child_pid, false, Duration::from_secs(5)),
        "processo filho (pid {child_pid}) ainda vivo depois de kill_tree — zumbi!"
    );
    assert!(
        wait_for_alive_state(&mut sys, grandchild_pid, false, Duration::from_secs(5)),
        "processo neto (pid {grandchild_pid}) ainda vivo depois de kill_tree — zumbi! \
         (Child::kill() sozinho nunca alcançaria este PID — ver Pattern 2 / T-02-02)"
    );
}

#[test]
fn tree_kill_leaves_no_zombies() {
    // Watchdog: roda o corpo numa thread e falha rápido se ele não terminar
    // dentro de `TEST_TIMEOUT`, em vez de deixar um I/O bloqueante de ConPTY
    // pendurar o job de CI. Um panic de asserção dentro do corpo é capturado e
    // re-propagado aqui, preservando a mensagem original da falha.
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(run_tree_kill_body));
        // Se o receiver já desistiu (timeout), o send falha silenciosamente —
        // esperado, o teste já foi marcado como falho pelo watchdog.
        let _ = tx.send(outcome);
    });

    match rx.recv_timeout(TEST_TIMEOUT) {
        Ok(Ok(())) => {}
        Ok(Err(payload)) => std::panic::resume_unwind(payload),
        Err(_) => panic!(
            "tree_kill_leaves_no_zombies excedeu {}s — provável hang de I/O do ConPTY \
             ou de child.wait() nesta plataforma (fail-fast em vez de pendurar o CI)",
            TEST_TIMEOUT.as_secs()
        ),
    }
}
