// Caminhos canônicos do gsd-core derivados de uma raiz de projeto validada.
//
// Atenção: o diretório de arquivamento de milestones é `.planning/milestones`,
// NÃO `.planning/archive` — `.planning/archive` é caminho morto no próprio
// gsd-core (nunca escrito por nenhum workflow); ver 01-RESEARCH.md Pitfall 3.

function normalizeRoot(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function planningDir(root: string): string {
  return `${normalizeRoot(root)}/.planning`;
}

export function roadmapPath(root: string): string {
  return `${planningDir(root)}/ROADMAP.md`;
}

export function statePath(root: string): string {
  return `${planningDir(root)}/STATE.md`;
}

export function phasesDir(root: string): string {
  return `${planningDir(root)}/phases`;
}

export function milestonesDir(root: string): string {
  return `${planningDir(root)}/milestones`;
}

export function milestonesIndexPath(root: string): string {
  return `${planningDir(root)}/MILESTONES.md`;
}
