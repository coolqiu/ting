use rubato::{FftFixedIn, Resampler};

fn main() {
    let mut resampler = FftFixedIn::<f32>::new(44100, 16000, 1024, 1, 1).unwrap();
    println!("Works");
}
