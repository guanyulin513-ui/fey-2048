export class UIManager {
  constructor(audio) {
    this.audio = audio;
    this.boardEl = document.getElementById("board");
    this.scoreEl = document.getElementById("scoreValue");
    this.bestEl = document.getElementById("bestValue");
    this.statusEl = document.getElementById("statusBar");
    this.overlayEl = document.getElementById("overlay");
    this.overlayTitleEl = document.getElementById("overlayTitle");
    this.overlayTextEl = document.getElementById("overlayText");
    this.particleLayer = document.getElementById("particleLayer");
    this.orientationLock = document.getElementById("orientationLock");
    this.controls = {
      mode: document.getElementById("modeSelect"),
      size: document.getElementById("sizeSelect"),
      start: document.getElementById("startBtn"),
      restart: document.getElementById("restartBtn"),
      pause: document.getElementById("pauseBtn"),
      resume: document.getElementById("resumeBtn"),
      volume: document.getElementById("volumeRange"),
      mute: document.getElementById("muteBtn"),
      bgm: document.getElementById("bgmBtn"),
      theme: document.getElementById("themeToggle"),
    };

    this.currentState = null;
    this.activeTiles = new Map();
    this.theme = localStorage.getItem("multiverse-2048-theme") || "light";
    document.body.classList.toggle("dark", this.theme === "dark");
    this.controls.theme.textContent = this.theme === "dark" ? "☀️" : "🌙";
  }

  bindControls(handlers) {
    this.controls.start.addEventListener("click", () => handlers.onStart(this.getConfig()));
    this.controls.restart.addEventListener("click", () => handlers.onRestart(this.getConfig()));
    this.controls.pause.addEventListener("click", handlers.onPause);
    this.controls.resume.addEventListener("click", handlers.onResume);
    this.controls.volume.addEventListener("input", (e) => handlers.onVolume(e.target.value));
    this.controls.mute.addEventListener("click", () => {
      const muted = handlers.onMute();
      this.controls.mute.textContent = muted ? "取消靜音" : "靜音";
    });
    this.controls.bgm.addEventListener("click", () => {
      const enabled = handlers.onBgm();
      this.controls.bgm.textContent = `背景音樂：${enabled ? "開" : "關"}`;
    });
    this.controls.theme.addEventListener("click", handlers.onTheme);
  }

  getConfig() {
    return {
      size: Number(this.controls.size.value),
      mode: this.controls.mode.value,
    };
  }

  async requestLandscape() {
    try {
      const isTouchDevice =
        ("ontouchstart" in window) ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0;

      if (!isTouchDevice) return;

      const orientation = screen.orientation;
      if (orientation && typeof orientation.lock === "function") {
        await orientation.lock("landscape");
      }
    } catch (_) {
      // 某些瀏覽器不支援，忽略即可
    }
  }

  render(state, meta = {}) {
    this.currentState = state;
    this.drawBoardBase(state.size);
    this.drawTiles(state);
    this.renderOverlay(state);

    if (meta.moveEvents?.length) {
      meta.moveEvents.forEach((event) => this.playEffect({ type: "burst", x: event.at.x, y: event.at.y }));
    }
  }

  updateScores(score, best) {
    this.scoreEl.textContent = score;
    this.bestEl.textContent = best;
  }

  setStatus(message) {
    this.statusEl.textContent = message;
  }

  renderOverlay(state) {
    const shouldShow = state.paused || state.gameOver;
    this.overlayEl.classList.toggle("hidden", !shouldShow);

    if (!shouldShow) return;
    this.overlayTitleEl.textContent = state.gameOver ? "遊戲結束" : "已暫停";
    this.overlayTextEl.textContent = state.gameOver
      ? "按下重新開始再來一局。"
      : "按下繼續按鈕回到遊戲。";
  }

  drawBoardBase(size) {
    const currentClass = Array.from(this.boardEl.classList).find((name) => name.startsWith("board-size-"));
    if (currentClass !== `board-size-${size}`) {
      if (currentClass) this.boardEl.classList.remove(currentClass);
      this.boardEl.classList.add(`board-size-${size}`);
    }

    if (this.boardEl.dataset.size == size) return;

    this.boardEl.innerHTML = "";
    this.activeTiles.clear();
    this.boardEl.dataset.size = size;

    for (let i = 0; i < size * size; i += 1) {
      const bg = document.createElement("div");
      bg.className = "cell-bg";
      this.boardEl.appendChild(bg);
    }
  }

  drawTiles(state) {
    const size = state.size;
    const tiles = state.board.flat().filter(Boolean);
    const rect = this.boardEl.getBoundingClientRect();
    const style = getComputedStyle(this.boardEl);
    const gap = parseFloat(style.gap);
    const padding = parseFloat(style.paddingLeft);
    const tileSize = (rect.width - padding * 2 - gap * (size - 1)) / size;
    const seen = new Set();

    tiles.forEach((tile) => {
      seen.add(tile.id);
      let el = this.activeTiles.get(tile.id);

      if (!el) {
        el = document.createElement("div");
        el.className = "tile spawn";
        el.innerHTML = "<span></span>";
        this.boardEl.appendChild(el);
        this.activeTiles.set(tile.id, el);
      }

      this.paintTile(el, tile);
      el.style.width = `${tileSize}px`;
      el.style.height = `${tileSize}px`;
      el.style.left = `${padding + tile.x * (tileSize + gap)}px`;
      el.style.top = `${padding + tile.y * (tileSize + gap)}px`;
      el.style.fontSize = `${Math.max(16, tileSize * 0.28)}px`;
      el.classList.toggle("merge", Boolean(tile.justMerged));
      el.classList.toggle("attack-flash", tile.lastEffect.includes("受傷"));
      el.classList.toggle("enemy", tile.type === "enemy");
    });

    Array.from(this.activeTiles.entries()).forEach(([id, el]) => {
      if (seen.has(id)) return;
      el.style.opacity = "0";
      setTimeout(() => {
        el.remove();
        this.activeTiles.delete(id);
      }, 160);
    });
  }

  paintTile(el, tile) {
    const palette = this.tilePalette(tile);
    el.style.background = palette.background;
    el.style.color = palette.color;

    const main = el.querySelector("span");
    if (tile.type === "enemy") {
      main.innerHTML = `
        <div class="hp-label">HP ${tile.hp}</div>
        ${tile.value}
        <div class="enemy-note">敵人等級</div>
      `;
      return;
    }

    const sub = tile.lastEffect ? `<div class="sub-label">${tile.lastEffect}</div>` : "";
    main.innerHTML = `${tile.value}${sub}`;
  }

  tilePalette(tile) {
    if (tile.type === "enemy") {
      return {
        background: "linear-gradient(135deg, #b91c1c, #ef4444)",
        color: "#fff",
      };
    }

    const map = {
      2: ["#f7efe2", "#433422"],
      4: ["#f5e0c6", "#433422"],
      8: ["#f9b66d", "#fff"],
      16: ["#f58b50", "#fff"],
      32: ["#ef6c47", "#fff"],
      64: ["#e34c42", "#fff"],
      128: ["#edcf73", "#2e2b1f"],
      256: ["#edcc62", "#2e2b1f"],
      512: ["#e9c34e", "#2e2b1f"],
      1024: ["#79c8ff", "#132132"],
      2048: ["#6d8bff", "#fff"],
    };

    const [background, color] = map[tile.value] || ["linear-gradient(135deg,#22c55e,#0ea5e9)", "#fff"];
    return { background, color };
  }

  attachSwipe(onSwipe) {
    let startX = 0;
    let startY = 0;
    let active = false;

    this.boardEl.addEventListener("touchstart", (e) => {
      const touch = e.changedTouches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      active = true;
    }, { passive: true });

    this.boardEl.addEventListener("touchend", (e) => {
      if (!active) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (Math.max(absX, absY) < 24) return;

      if (absX > absY) onSwipe(dx > 0 ? "right" : "left");
      else onSwipe(dy > 0 ? "down" : "up");
      active = false;
    }, { passive: true });
  }

  watchOrientation() {
    const update = () => {
      const isTouchDevice =
        ("ontouchstart" in window) ||
        navigator.maxTouchPoints > 0 ||
        navigator.msMaxTouchPoints > 0;

      const portrait = window.innerHeight > window.innerWidth;
      const smallScreen = Math.max(window.innerWidth, window.innerHeight) <= 1180;
      const showHint = isTouchDevice && portrait && smallScreen;

      this.orientationLock.classList.toggle("show", showHint);
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
  }

  toggleTheme() {
    document.body.classList.toggle("dark");
    const dark = document.body.classList.contains("dark");
    localStorage.setItem("multiverse-2048-theme", dark ? "dark" : "light");
    this.controls.theme.textContent = dark ? "☀️" : "🌙";
    this.audio.playUi("switch");
  }

  playEffect(effect) {
    if (!this.currentState) return;
    const size = this.currentState.size;
    const rect = this.boardEl.getBoundingClientRect();
    const style = getComputedStyle(this.boardEl);
    const gap = parseFloat(style.gap);
    const padding = parseFloat(style.paddingLeft);
    const tileSize = (rect.width - padding * 2 - gap * (size - 1)) / size;
    const centerX = padding + effect.x * (tileSize + gap) + tileSize / 2;
    const centerY = padding + effect.y * (tileSize + gap) + tileSize / 2;

    for (let i = 0; i < 8; i += 1) {
      const dot = document.createElement("div");
      dot.className = "particle";
      dot.style.left = `${centerX}px`;
      dot.style.top = `${centerY}px`;
      dot.style.setProperty("--dx", `${(Math.random() - 0.5) * 90}px`);
      dot.style.setProperty("--dy", `${(Math.random() - 0.5) * 90}px`);
      this.particleLayer.appendChild(dot);
      setTimeout(() => dot.remove(), 720);
    }
  }
}
