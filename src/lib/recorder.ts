/**
 * Records mono 16 kHz WAV in the browser.
 *
 * Not MediaRecorder, and that is deliberate. Chrome produces `audio/webm`,
 * which Gnani refuses outright:
 *
 *   400 UNSUPPORTED_AUDIO_FORMAT
 *   "Supported formats: aac, mp3, m4a, ogg, wav, flac"
 *
 * Safari happens to produce `audio/mp4`, which it accepts, so MediaRecorder
 * would have worked on one browser and failed on another with an error nobody
 * would connect to the recorder. Capturing the samples and writing the WAV
 * header here is forty lines and behaves identically everywhere.
 *
 * 16 kHz mono because that is what speech recognition wants; it also keeps a
 * thirty-second account around a megabyte, well inside the upload limit.
 */

export interface Recording {
  blob: Blob
  seconds: number
}

/** True when this browser can record at all. Needs a secure context. */
export const canRecord = (): boolean =>
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  Boolean((window as any).AudioContext || (window as any).webkitAudioContext)

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const str = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }

  str(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)          // PCM header size
  view.setUint16(20, 1, true)           // format: PCM
  view.setUint16(22, 1, true)           // channels: mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)           // block align
  view.setUint16(34, 16, true)          // bits per sample
  str(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  // Float -1..1 to signed 16-bit, clamped: a clipped sample is better than a
  // wrapped one, which would arrive as a loud click.
  let at = 44
  for (let i = 0; i < samples.length; i++, at += 2) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(at, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  }

  return new Blob([view], { type: 'audio/wav' })
}

export class WavRecorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: ScriptProcessorNode | null = null
  private sink: GainNode | null = null
  private chunks: Float32Array[] = []
  private rate = 16000
  private rms = 0

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })

    const Ctor: any = (window as any).AudioContext || (window as any).webkitAudioContext
    // A browser may refuse the asked-for rate, so read back what it gave us and
    // put that in the header rather than assuming.
    this.ctx = new Ctor({ sampleRate: 16000 })
    this.rate = this.ctx!.sampleRate

    const source = this.ctx!.createMediaStreamSource(this.stream)
    this.node = this.ctx!.createScriptProcessor(4096, 1, 1)
    this.chunks = []
    this.node.onaudioprocess = (e) => {
      // Copied, not referenced: the buffer is reused between callbacks.
      const block = new Float32Array(e.inputBuffer.getChannelData(0))
      this.chunks.push(block)

      // Loudness of this block, kept so the UI can draw something that moves
      // with the voice. A meter that is really the microphone is the difference
      // between "it is listening" and "there is an animation playing".
      let sum = 0
      for (let i = 0; i < block.length; i++) sum += block[i] * block[i]
      const next = Math.sqrt(sum / block.length)
      // Eased, so the bars settle rather than strobe between frames.
      this.rms = this.rms * 0.6 + next * 0.4
    }

    // A ScriptProcessor only runs while connected to the graph, but routing the
    // microphone to the speakers would howl. A silent gain node keeps it
    // pulling with nothing audible coming out.
    this.sink = this.ctx!.createGain()
    this.sink.gain.value = 0
    source.connect(this.node)
    this.node.connect(this.sink)
    this.sink.connect(this.ctx!.destination)
  }

  /**
   * How loud it is right now, 0 to 1, already scaled for drawing. Speech sits
   * around an RMS of 0.02-0.15, so the raw figure would barely move a bar.
   */
  get level(): number {
    return Math.max(0, Math.min(1, this.rms * 6))
  }

  /** Seconds captured so far, for a live counter. */
  get seconds(): number {
    return this.chunks.reduce((n, c) => n + c.length, 0) / this.rate
  }

  async stop(): Promise<Recording> {
    if (this.node) this.node.onaudioprocess = null
    this.node?.disconnect()
    this.sink?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    await this.ctx?.close().catch(() => {})

    const total = this.chunks.reduce((n, c) => n + c.length, 0)
    const samples = new Float32Array(total)
    let at = 0
    for (const c of this.chunks) { samples.set(c, at); at += c.length }

    const rate = this.rate
    this.ctx = null; this.stream = null; this.node = null; this.sink = null; this.chunks = []; this.rms = 0
    return { blob: encodeWav(samples, rate), seconds: total / rate }
  }

  /** Throw it all away: used when somebody cancels rather than sends. */
  discard(): void {
    if (this.node) this.node.onaudioprocess = null
    this.node?.disconnect()
    this.sink?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close().catch(() => {})
    this.ctx = null; this.stream = null; this.node = null; this.sink = null; this.chunks = []
  }
}
