// Binário auxiliar de teste para a prova de fundação SESS-06 (kill de árvore
// de processos, ver `../process_guard.rs` e `../../tests/tree_kill.rs`).
//
// Reproduz a topologia mínima "filho → neto" que o mecanismo de kill de árvore
// (Job Object no Windows / process group no Unix) precisa alcançar. Rodando
// sem `--grandchild`, este binário:
//   1. espera um sinal "go" no stdin — o teste anexa o TreeGuard (Job Object /
//      pid do grupo) ANTES de mandar o go, garantindo que o neto (criado só
//      depois) já nasça dentro do job/grupo, sem corrida;
//   2. spawna o neto (uma segunda cópia de si mesmo, com `--grandchild`) com
//      stdio próprio (null) — como um subprocesso real (git/MCP), que não
//      herda o stdio do pai;
//   3. imprime o PID do neto no stdout (um pipe comum — o teste NÃO usa PTY,
//      então a leitura é confiável nas três plataformas, sem os problemas do
//      ConPTY do Windows) e dorme até ser morto.
//
// O teste NÃO spawna via PTY: o ConPTY do Windows, em runner headless de CI,
// não executa o processo filho (ele trava na anexação ao pseudoconsole antes
// do main). O mecanismo de kill de árvore, porém, independe de PTY — só
// depende do Job Object (Windows) / process group (Unix), que este teste
// exercita fielmente.

use std::env;
use std::io::{BufRead, Write};
use std::process::{Command, Stdio};
use std::time::Duration;

const GRANDCHILD_PID_PREFIX: &str = "GRANDCHILD_PID=";

fn sleep_forever() -> ! {
    loop {
        std::thread::sleep(Duration::from_secs(60));
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|a| a == "--grandchild") {
        // Neto: não spawna descendentes nem escreve nada — só se mantém vivo
        // até o teste matar a árvore inteira.
        sleep_forever();
    }

    // (1) Espera o "go" do teste (uma linha no stdin). Bloqueia até o teste
    // ter anexado o TreeGuard — assim o neto sempre nasce dentro do job/grupo.
    let mut line = String::new();
    let _ = std::io::stdin().lock().read_line(&mut line);

    // (2) Spawna o neto com stdio próprio (não herda o stdout do pai, senão
    // seguraria o pipe aberto).
    let current_exe =
        env::current_exe().expect("current_exe() deveria funcionar neste ambiente de teste");
    let grandchild = Command::new(current_exe)
        .arg("--grandchild")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn do neto não deveria falhar");

    // (3) Reporta o PID do neto pelo stdout (pipe comum).
    let mut stdout = std::io::stdout();
    let _ = writeln!(stdout, "{GRANDCHILD_PID_PREFIX}{}", grandchild.id());
    let _ = stdout.flush();

    sleep_forever();
}
