/* Yengil WebAudio ovoz dvigateli — tashqi audio fayllarsiz (sintez qilinadi).
   Host ekranida quiz davomida "musobaqa" fon musiqasi, taymer tugashidan oldin
   ogohlantiruvchi signal va vaqt tugaganda ovoz chiqaradi.
   Brauzer autoplay siyosati sababli AudioContext faqat foydalanuvchi harakatidan
   keyin ishlaydi — shu sabab unlockAudio() tugma bosilganda chaqiriladi. */

let ctx: AudioContext | null = null;
let muted = false;
let musicTimer: ReturnType<typeof setTimeout> | null = null;
let musicGain: GainNode | null = null;
let step = 0;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  return ctx;
}

// Foydalanuvchi harakati (tugma bosish) ichida chaqirilsa, audio ruxsatini ochadi
export function unlockAudio(): void {
  const c = ac();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

export function setMuted(m: boolean): void {
  muted = m;
  if (m) stopMusic();
}
export function isMuted(): boolean {
  return muted;
}

// Bitta ohang (nota)
function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode): void {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.03);
}

// Zarb (kick) — past chastotali tushuvchi sinus
function kick(start: number, dest: AudioNode): void {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(150, start);
  o.frequency.exponentialRampToValueAtTime(50, start + 0.12);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.45, start + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + 0.2);
}

// Fon musiqasi — energetik arpeggio (pentatonik) + bass + kick loop
export function startMusic(): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  c.resume().catch(() => {});
  if (musicTimer != null) return; // allaqachon chalinayapti
  if (!musicGain) {
    musicGain = c.createGain();
    musicGain.gain.value = 0.6;
    musicGain.connect(c.destination);
  }
  const arp = [523.25, 659.25, 783.99, 659.25, 587.33, 783.99, 880.0, 783.99];
  const bass = [130.81, 130.81, 174.61, 196.0];
  step = 0;
  const tempo = 220; // ms / step
  const loop = () => {
    if (muted) {
      musicTimer = null;
      return;
    }
    const cc = ac();
    if (!cc || !musicGain) {
      musicTimer = null;
      return;
    }
    const t = cc.currentTime + 0.03;
    tone(arp[step % arp.length], t, 0.2, "triangle", 0.16, musicGain);
    if (step % 4 === 0) tone(bass[Math.floor(step / 4) % bass.length], t, 0.34, "sawtooth", 0.1, musicGain);
    if (step % 2 === 0) kick(t, musicGain);
    step++;
    musicTimer = setTimeout(loop, tempo);
  };
  loop();
}

export function stopMusic(): void {
  if (musicTimer != null) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}

// Taymer ogohlantirish signali (oxirgi soniyalarda har soniyada bitta)
export function playTick(): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  tone(880, c.currentTime + 0.01, 0.12, "square", 0.22, c.destination);
}

// Vaqt tugadi signali (ikki notali tushuvchi)
export function playTimeUp(): void {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.01;
  tone(660, t, 0.18, "square", 0.28, c.destination);
  tone(440, t + 0.2, 0.32, "square", 0.28, c.destination);
}
