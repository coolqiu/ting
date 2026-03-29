/**
 * AudioRecorder — Tauri WebView2 Compatible
 *
 * Uses ScriptProcessorNode (no module loading, works in all WebViews) instead of
 * AudioWorklet (whose Blob URL is CSP-blocked in Tauri WebView2 on Windows).
 *
 * Strategy:
 *  1. Open AudioContext at the browser's native rate (usually 44100 / 48000 Hz)
 *  2. Capture raw Float32 PCM via ScriptProcessorNode into a buffer
 *  3. After stopping, downsample the buffer to 16000 Hz (required by Whisper)
 *  4. Encode as a standard RIFF WAV Blob
 */

const TARGET_SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096; // ScriptProcessorNode render quantum

export class AudioRecorder {
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private scriptNode: any = null; // ScriptProcessorNode type
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private recordedChunks: Float32Array[] = [];
    private nativeSampleRate = 44100;
    private isRecording = false;

    async start(): Promise<void> {
        if (this.isRecording) return;

        // Request microphone — must come before AudioContext to work in Tauri
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

        // Use native rate; we'll resample in stop()
        this.audioContext = new AudioContext();
        this.nativeSampleRate = this.audioContext.sampleRate;

        this.recordedChunks = [];
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

        // ScriptProcessorNode works without any module/blob loading
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = this.audioContext as any;
        this.scriptNode = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);

        this.scriptNode.onaudioprocess = (evt: AudioProcessingEvent) => {
            if (!this.isRecording) return;
            // getChannelData returns a live buffer — copy it
            const data = evt.inputBuffer.getChannelData(0);
            this.recordedChunks.push(new Float32Array(data));
        };

        // Must connect to destination or the browser may not call onaudioprocess
        this.sourceNode.connect(this.scriptNode);
        this.scriptNode.connect(this.audioContext.destination);

        this.isRecording = true;
    }

    stop(): Blob {
        if (!this.isRecording) throw new Error('Not recording');

        this.isRecording = false;

        // Stop mic tracks first
        this.mediaStream?.getTracks().forEach(t => t.stop());

        // Disconnect nodes
        try { this.sourceNode?.disconnect(); } catch (_) { /* ignore */ }
        try { this.scriptNode?.disconnect(); } catch (_) { /* ignore */ }

        // Flatten all chunks
        const totalLength = this.recordedChunks.reduce((acc, c) => acc + c.length, 0);
        const rawPcm = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of this.recordedChunks) {
            rawPcm.set(chunk, offset);
            offset += chunk.length;
        }

        // Downsample from native rate to 16000 Hz
        const resampled = downsampleBuffer(rawPcm, this.nativeSampleRate, TARGET_SAMPLE_RATE);

        const wavBlob = encodeWAV(resampled, TARGET_SAMPLE_RATE);

        // Clean up
        this.audioContext?.close();
        this.audioContext = null;
        this.mediaStream = null;
        this.scriptNode = null;
        this.sourceNode = null;
        this.recordedChunks = [];

        return wavBlob;
    }

    get recording() {
        return this.isRecording;
    }
}

// ---- Downsampling ----

/**
 * Linear interpolation downsampler.
 * Takes Float32 PCM at `fromRate` Hz and returns Float32 PCM at `toRate` Hz.
 */
function downsampleBuffer(
    buffer: Float32Array,
    fromRate: number,
    toRate: number
): Float32Array {
    if (fromRate === toRate) return buffer;

    const ratio = fromRate / toRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);

    for (let i = 0; i < newLength; i++) {
        const srcIdx = i * ratio;
        const lower = Math.floor(srcIdx);
        const upper = Math.min(lower + 1, buffer.length - 1);
        const frac = srcIdx - lower;
        result[i] = buffer[lower] * (1 - frac) + buffer[upper] * frac;
    }

    return result;
}

// ---- WAV Encoding ----

function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);           // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Float32 [-1, 1] → Int16
    let idx = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        idx += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
