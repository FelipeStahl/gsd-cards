// Impede que uma janela de console adicional apareça no Windows em release, sem afetar o console em debug.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gsd_cards_lib::run()
}
