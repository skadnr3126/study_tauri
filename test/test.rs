
#[derive(Debug)]
struct Note {
    id: String,
    title: String,
    content: String,
    tags: Vec<String>,
    created_at: String,
}
fn main() {
    let a = "하이요";
    //let a = a.to_string();
    
    println!("{}", a);

    println!("Hello, world!");
    let my_note = Note {
        id: "1".to_string(),
        title: "My First Note".to_string(),
        content: "This is the content of my first note.".to_string(),
        tags: vec!["personal".to_string(), "important".to_string()],
        created_at: "created_at".to_string(),
    };
    println!("{:?}", my_note)
}