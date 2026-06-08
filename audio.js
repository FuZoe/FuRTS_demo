// Procedural sound effects and HUD sound toggle.
(function () {
  const style = document.createElement('style');
  style.textContent = `
.hud-sound-btn {
  background: #020;
  color: #0f0;
  border: 1px solid #0a0;
  padding: 3px 8px;
  cursor: pointer;
  font: 12px 'Courier New', monospace;
}
.hud-sound-btn:hover { background: #040; }
.hud-sound-btn.muted {
  color: #060;
  border-color: #050;
  background: #010;
}
`;
  document.head.appendChild(style);

  const AudioManager = {
    ctx: null,
    enabled: true,

    init() {
      if (this.ctx) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        this.enabled = false;
        this.updateToggle();
        return;
      }
      this.ctx = new AudioContext();
    },

    async resume() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch (err) {
          return false;
        }
      }
      return this.ctx && this.ctx.state === 'running';
    },

    async play(frequency, duration, type = 'sine', volume = 0.1) {
      if (!this.enabled) return;
      const ready = await this.resume();
      if (!ready || !this.enabled) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.frequency.value = frequency;
      osc.type = type;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.start(now);
      osc.stop(now + duration);
    },

    updateToggle() {
      const btn = document.getElementById('soundToggle');
      if (!btn) return;
      btn.textContent = this.enabled ? '音效: 开' : '音效: 关';
      btn.classList.toggle('muted', !this.enabled);
      btn.title = this.enabled ? '点击关闭音效' : '点击开启音效';
    },

    toggle() {
      this.enabled = !this.enabled;
      if (this.enabled) {
        this.resume();
        this.select();
      }
      this.updateToggle();
    },

    attack() { this.play(200, 0.1, 'square', 0.08); },
    select() { this.play(600, 0.05, 'sine', 0.05); },
    move() { this.play(400, 0.08, 'sine', 0.04); },
    build() { this.play(300, 0.15, 'triangle', 0.06); },
    error() { this.play(100, 0.2, 'sawtooth', 0.08); },
    unitReady() {
      this.play(800, 0.1, 'sine', 0.06);
      setTimeout(() => this.play(1000, 0.1, 'sine', 0.06), 80);
    },
  };

  function installSoundToggle() {
    const hud = document.getElementById('hud');
    if (!hud || document.getElementById('soundToggle')) return;

    const hint = hud.querySelector('.hud-item[style*="margin-left:auto"]');
    const btn = document.createElement('button');
    btn.id = 'soundToggle';
    btn.className = 'hud-sound-btn';
    btn.type = 'button';
    btn.addEventListener('click', () => AudioManager.toggle());
    hud.insertBefore(btn, hint);
    AudioManager.updateToggle();
  }

  window.AudioManager = AudioManager;
  window.toggleSound = () => AudioManager.toggle();

  installSoundToggle();
  document.addEventListener('click', () => AudioManager.resume(), { once: true });
}());
