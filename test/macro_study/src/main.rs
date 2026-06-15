use macro_study::{add_generated_helper, make_answer, make_function};

macro_rules! say_hi_to {
    ($name : expr) => {
        println!("hi {}" , $name);
    }
}


fn main() {
    let b = make_answer!();
    make_function!(generated_by_function_like);

    let a :&str = "123";
    println!("{}", b);
    println!("{}", generated_by_function_like());
    println!("{}", generated_helper());
    
    say_hi_to!("123");
    println!("Hello, world!");
}

#[add_generated_helper]
fn original_function() {
    println!("this function existed before the attribute macro ran");
}
