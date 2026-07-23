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

use std::io::{BufRead, BufReader};
use std::time::{Duration, Instant};

use gsd_cards_lib::process_guard::TreeGuard;
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use sysinfo::{Pid, ProcessesToUpdate, System};

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

#[test]
fn tree_kill_leaves_no_zombies() {
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

    let reader = pair
        .master
        .try_clone_reader()
        .expect("reader do master do PTY deveria funcionar");
    let mut lines = BufReader::new(reader).lines();

    let marker_line = lines
        .next()
        .expect("stream do PTY deveria produzir a linha-marcador")
        .expect("linha-marcador deveria ser lida sem erro de IO");
    assert!(
        marker_line.contains("TREE_KILL_HELPER_READY"),
        "esperava a linha-marcador do helper, obtive: {marker_line:?}"
    );

    let grandchild_line = lines
        .next()
        .expect("stream do PTY deveria produzir a linha do PID do neto")
        .expect("linha do PID do neto deveria ser lida sem erro de IO");
    let grandchild_pid: u32 = grandchild_line
        .trim()
        .strip_prefix("GRANDCHILD_PID=")
        .unwrap_or_else(|| {
            panic!("linha inesperada do helper (esperava GRANDCHILD_PID=<pid>): {grandchild_line:?}")
        })
        .trim()
        .parse()
        .expect("PID do neto deveria ser um u32 válido");

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
