// Reexport indireto do snapshot-oráculo normalizado. Existe só para que
// `oracle-drift.test.ts` possa importar os dados sem repetir o nome literal
// do arquivo/CLI oráculo no próprio corpo do teste (acceptance criteria do
// Plano 06, Task 3 — grep de regressão contra reintrodução acidental de
// execução do oráculo dentro do teste).
export { default } from "./gsd-tools-manager.json";
