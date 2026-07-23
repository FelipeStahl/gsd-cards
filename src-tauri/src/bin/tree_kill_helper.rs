// Binário auxiliar de teste para a prova de fundação SESS-06 (kill de árvore
// de processos, ver `../process_guard.rs` e `../../tests/tree_kill.rs`).
//
// Reproduz a topologia mínima "claude (filho) → subprocesso (neto)" que o
// mecanismo de kill de árvore (Job Object no Windows / process group no
// Unix) precisa alcançar: este binário, ao rodar sem argumentos, imprime uma
// linha-marcador determinística, spawna um "neto" — uma segunda cópia de si
// mesmo, invocada com `--grandchild` — imprime o PID desse neto, e então
// dorme num loop longo até ser morto pelo teste.
//
// Spawnar o neto como uma nova invocação do próprio executável (em vez de um
// comando de sistema como `sleep`/`timeout`) evita depender de binários de
// SO que variam entre plataformas (ex.: `timeout.exe` no Windows recusa
// rodar sem um console real quando stdout está redirecionado por pipe) — o
// mesmo `tree_kill_helper` compilado serve tanto de "filho" quanto de
// "neto", mantendo o teste determinístico nas três plataformas de CI.

use std::env;
use std::io::Write;
use std::process::Command;
use std::time::Duration;

const READY_MARKER: &str = "TREE_KILL_HELPER_READY";
const GRANDCHILD_PID_PREFIX: &str = "GRANDCHILD_PID=";

/// Dorme indefinidamente em fatias curtas (em vez de uma única chamada longa
/// a `thread::sleep`) só para o loop ficar responsivo a sinais no Unix; o
/// mecanismo de kill real (SIGKILL/Job Object) não depende dessa escolha,
/// mas fatias curtas evitam qualquer necessidade futura de graceful shutdown
/// aqui.
fn sleep_forever() -> ! {
    loop {
        std::thread::sleep(Duration::from_secs(60));
    }
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let is_grandchild = args.iter().any(|a| a == "--grandchild");

    if is_grandchild {
        // Neto: não imprime nada nem spawna mais descendentes — só se
        // mantém vivo até o teste matar a árvore inteira.
        sleep_forever();
    }

    // Filho (topo da árvore sob teste): marcador determinístico primeiro,
    // com flush explícito porque stdout de processo não-interativo
    // normalmente é bufferizado por linha só quando conectado a um TTY —
    // aqui o master do PTY é um TTY real, mas o flush explícito remove
    // qualquer dúvida sobre buffering entre plataformas.
    println!("{READY_MARKER}");
    std::io::stdout().flush().expect("flush do marcador não deveria falhar");

    let current_exe = env::current_exe().expect("current_exe() deveria funcionar neste ambiente de teste");
    let grandchild = Command::new(current_exe)
        .arg("--grandchild")
        .spawn()
        .expect("spawn do neto não deveria falhar");

    println!("{GRANDCHILD_PID_PREFIX}{}", grandchild.id());
    std::io::stdout().flush().expect("flush do PID do neto não deveria falhar");

    sleep_forever();
}
