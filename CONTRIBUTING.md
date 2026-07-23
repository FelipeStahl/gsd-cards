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
