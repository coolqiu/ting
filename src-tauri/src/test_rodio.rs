use rodio::{Decoder, Source, source::UniformSourceIterator};
use std::fs::File;
use std::io::BufReader;

fn main() {
    let file = File::open("test.mp3").unwrap();
    let source = Decoder::new(BufReader::new(file)).unwrap();
    let resampled = UniformSourceIterator::new(source, 1, 16000);
    let _samples: Vec<f32> = resampled.convert_samples::<f32>().collect();
    println!("OK");
}
