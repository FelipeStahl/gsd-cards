// Teste de integração da prova de fundação ACT-02/T-03-02: um `write` para
// um id de sessão ausente do `PtyManager` retorna `PtyError::NotFound`
// tipado e serde-serializável — nunca um `Ok(())` silencioso. Isto é
// exatamente o `get_mut → None` que `write_session` (o comando Tauri) já
// atravessa, mas provado aqui sobre um `PtyManager` real, sem precisar de
// um `tauri::State`/`Channel`/PTY vivo (um teste jsdom/Vitest não consegue
// spawnar nem matar um PTY real — ver 03-RESEARCH.md ## Common Pitfalls
// Pitfall 3).
//
// Como `kill_session` faz `sessions.remove(&id)` (pty.rs), um write para
// uma sessão RECÉM-MATADA cai exatamente neste mesmo branch de id ausente —
// então este único teste, sobre um `PtyManager::default()` (nunca teve
// nenhuma sessão), cobre igualmente o caminho spawn-então-kill sem
// precisar simular o kill em si.
//
// Contrato provado (não apenas `is_err()`):
// 1. A variante exata é `PtyError::NotFound(id)` com `id` igual ao pedido.
// 2. A serialização serde carrega `"kind":"NotFound"` — o payload que
//    efetivamente atravessa o IPC e chega ao `.catch()` do JS
//    (`PhaseCardAction.tsx`, `writeSession(...).catch(...)`).
// 3. `Display` contém `NotFound` — confirma que não é um erro genérico
//    mascarado atrás de uma mensagem solta.

use gsd_cards_lib::pty::{PtyError, PtyManager};

#[test]
fn write_to_absent_session_returns_typed_not_found() {
    let manager = PtyManager::default();

    let result = manager.write("absent-session", "/gsd-execute-phase 03\r");

    // Asserção na variante exata, não em `is_err()` — um `Ok(())` silencioso
    // aqui seria exatamente o bug que ACT-02's backstop existe para evitar.
    match &result {
        Err(PtyError::NotFound(id)) => {
            assert_eq!(
                id, "absent-session",
                "PtyError::NotFound deveria carregar o id pedido, obteve: {id:?}"
            );
        }
        other => panic!("esperava Err(PtyError::NotFound(_)), obteve: {other:?}"),
    }
    assert!(
        matches!(result, Err(PtyError::NotFound(_))),
        "asserção redundante via matches! — variante exata, não apenas is_err()"
    );

    let error = result.unwrap_err();

    // O payload serializável que cruza o boundary IPC e chega ao `.catch()`
    // do frontend (`#[serde(tag = "kind", content = "message")]` em pty.rs).
    let serialized = serde_json::to_string(&error).expect("PtyError deveria serializar via serde");
    assert!(
        serialized.contains("NotFound"),
        "payload serializado deveria conter \"NotFound\" (tag do enum), obteve: {serialized}"
    );

    let displayed = error.to_string();
    assert!(
        displayed.contains("NotFound"),
        "Display de PtyError::NotFound deveria conter \"NotFound\", obteve: {displayed}"
    );
}
