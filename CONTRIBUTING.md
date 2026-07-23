# Contribuindo com o GSD Cards

Obrigado por considerar contribuir com o GSD Cards! Este documento cobre o que você precisa instalar na sua máquina antes de rodar o app localmente.

## Pré-requisitos

Independente da plataforma, você precisa de:

- **Node.js >= 22** (LTS recomendado)
- **npm** (vem junto com o Node.js)
- **git**
- **Rust stable** via [rustup](https://rustup.rs/)

Além disso, cada sistema operacional exige um linker/toolchain nativo para compilar o backend Tauri (Rust):

### Windows

Instale o Visual Studio Build Tools 2022 com o workload de desenvolvimento em C++ (VCTools). Via `winget`:

```powershell
winget install --id Rustlang.Rustup --exact --accept-source-agreements --accept-package-agreements
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.22621"
rustup default stable-x86_64-pc-windows-msvc
```

> **Nota sobre PATH:** o instalador do rustup atualiza a variável de ambiente `PATH` do usuário no nível do sistema operacional, mas **processos de shell já abertos não enxergam essa mudança automaticamente** — só uma sessão nova (novo terminal, ou logoff/login em casos raros) lê o `PATH` atualizado. Depois de instalar, abra um terminal novo antes de rodar os comandos de verificação abaixo.

### macOS

Instale as Command Line Tools do Xcode:

```bash
xcode-select --install
```

### Linux

Instale as dependências de sistema do WebKitGTK/AppIndicator usadas pelo Tauri (exemplo para distribuições baseadas em Debian/Ubuntu):

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf build-essential
```

E o Rust via rustup, como acima (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`).

## Verificação

Depois de instalar tudo, em um **terminal novo**, confirme:

```bash
rustc --version
cargo --version
```

Ambos devem responder com uma versão `1.x` sem erro. Se `cargo`/`rustc` não forem encontrados, feche e reabra o terminal (ver nota sobre PATH acima) antes de reportar um problema.

## Rodando o projeto

```bash
npm install
npm run tauri dev
```

Uma janela nativa do GSD Cards deve abrir.

## Mantendo o parser alinhado com o gsd-core (`npm run fixtures:refresh`)

O parser de `.planning/` (`src/planning/status.ts` e módulos relacionados)
replica literalmente a regra de derivação de status que o próprio gsd-core
usa — mas o gsd-core evolui na branch `next`, fora do controle deste
projeto. Para pegar esse tipo de drift em code review em vez de em um bug
report de usuário meses depois, o projeto usa o CLI local do gsd-core
(`gsd-tools`, já instalado como dependência de desenvolvimento do fluxo GSD)
como **oráculo de teste**: ele é a fonte que sabemos que está correta, e
`src/planning/oracle-drift.test.ts` compara a saída do nosso parser TS contra
um snapshot versionado dessa fonte.

**Importante:** o `gsd-tools` é usado exclusivamente em desenvolvimento —
`oracle-drift.test.ts` nunca o executa (só lê o snapshot já gerado) e o app
GSD Cards distribuído **não** depende de Node nem do gsd-core instalados na
máquina do usuário final para funcionar. Rodar o CLI oráculo é uma ação
manual do desenvolvedor, nunca algo que acontece em CI ou em runtime do app.

Depois de atualizar sua instalação local do gsd-core:

```bash
npm run fixtures:refresh
```

Isso regenera `src/planning/__fixtures__/oracle/gsd-tools-manager.json`
executando `gsd-tools init manager --raw` contra este próprio repositório (ou
outro projeto GSD, passando o caminho como argumento) e normalizando a saída
(removendo timestamps absolutos, caminhos de máquina e sinais dependentes de
mtime, que mudariam a cada execução sem indicar nenhuma mudança de formato
real).

Depois de rodar, inspecione o diff do snapshot (`git diff`):

- **Sem diff:** o parser já está alinhado com o gsd-core instalado — nada a
  fazer.
- **Com diff:** o gsd-core mudou de formato. Atualize `src/planning/status.ts`
  (e os demais parsers afetados) até que `npm run test` volte a passar antes
  de commitar o novo snapshot junto com a correção do parser — nunca
  commitar um snapshot atualizado sem também corrigir o parser que ele
  expôs como desalinhado.
