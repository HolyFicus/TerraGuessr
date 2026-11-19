class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(val: boolean): void {
    this.muted = val;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = 'sine',
    gainPeak = 0.08,
    delaySec = 0,
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  public playPinDrop(): void {
    this.playTone(540, 0.08, 'triangle', 0.07);
    this.playTone(760, 0.07, 'sine', 0.05, 0.03);
  }

  public playGuessConfirm(): void {
    this.playTone(392, 0.11, 'triangle', 0.09);
    this.playTone(587.33, 0.14, 'sine', 0.07, 0.06);
  }

  public playReveal(score: number): void {
    if (score >= 4500) {
      this.playTone(523.25, 0.16, 'triangle', 0.09, 0);
      this.playTone(659.25, 0.16, 'triangle', 0.09, 0.08);
      this.playTone(783.99, 0.22, 'triangle', 0.09, 0.16);
      this.playTone(1046.5, 0.35, 'sine', 0.08, 0.24);
    } else if (score >= 2500) {
      this.playTone(440, 0.14, 'triangle', 0.08, 0);
      this.playTone(554.37, 0.18, 'sine', 0.08, 0.09);
      this.playTone(659.25, 0.25, 'sine', 0.07, 0.18);
    } else {
      this.playTone(330, 0.18, 'sine', 0.07, 0);
      this.playTone(293.66, 0.24, 'sine', 0.06, 0.11);
    }
  }

  public playTick(): void {
    this.playTone(880, 0.04, 'sine', 0.04);
  }

  public playVictory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.28, 'triangle', 0.08, idx * 0.09);
    });
  }
}

export const soundEngine = new SoundEngine();
