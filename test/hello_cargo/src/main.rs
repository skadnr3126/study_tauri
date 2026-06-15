
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};
use std::path::{Path};

struct Note {
    id: String,
    title: String,
    content: String,
    tags: Vec<String>,
    created_at: String,
}

fn main() {
    let path = Path::new("base").join("subdir").join("file.txt");
    let mut buf: PathBuf = PathBuf::from("base");

    println!("path is {} pathbuf is {}", path.display(), buf.display());
    
    print_number(1);

}


fn print_number(n: i8) {
    match n {
        1 => println!("하나"),
        2 => println!("둘"),
        3 => println!("셋"),
        _ => println!("다수"),
    }
}fn handle(msg: Action) {
    match msg {
        Action::Start(x, y) => println!("Start at ({x}, {y})"),
        Action::Move { x, y } => println!("Move to ({x}, {y})"),
        Action::Quit => println!("Bye!"),
    }
}
