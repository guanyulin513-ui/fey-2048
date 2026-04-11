const STORAGE_KEYS = {
  best: "multiverse-2048-best-score",
};

const DIRECTIONS = {
  left: { axis: "row", reverse: false },
  right: { axis: "row", reverse: true },
  up: { axis: "col", reverse: false },
  down: { axis: "col", reverse: true },
};

let tileId = 1;

export class GameEngine {
  constructor({ onStateChange, onScore, onStatus, onEffect, audio }) {
    this.onStateChange = onStateChange;
    this.onScore = onScore;
    this.onStatus = onStatus;
    this.onEffect = onEffect;
    this.audio = audio;
    this.size = 4;
    this.mode = "classic";
    this.state = [];
    this.score = 0;
    this.bestScore = Number(localStorage.getItem(STORAGE_KEYS.best) || 0);
    this.paused = false;
    this.gameOver = false;
  }

  start({ size, mode }) {
    this.size = Number(size) || 4;
    this.mode = mode || "classic";
    this.score = 0;
    this.paused = false;
    this.gameOver = false;
    this.state = this.createEmptyBoard();
    this.addRandomTile();
    this.addRandomTile();

    if (this.mode === "battle") {
      this.spawnEnemy(true);
    }

    this.audio.playBgm(true);
    this.emitStatus(this.modeLabel() + " 開始");
    this.sync();
  }

  togglePause(force) {
    if (this.gameOver) return;
    this.paused = typeof force === "boolean" ? force : !this.paused;
    this.emitStatus(this.paused ? "遊戲已暫停" : "遊戲繼續");
    this.sync();
  }

  move(direction) {
    if (this.paused || this.gameOver) return;
    const descriptor = DIRECTIONS[direction];
    if (!descriptor) return;

    const cloned = this.cloneBoard(this.state);
    const moveEvents = [];
    let scoreGain = 0;
    let changed = false;

    this.resetFlags(cloned);

    for (let index = 0; index < this.size; index += 1) {
      const line = this.extractLine(cloned, descriptor, index);
      const nonEmpty = line.filter(Boolean);
      let working = descriptor.reverse ? [...nonEmpty].reverse() : [...nonEmpty];
      const merged = [];

      for (let i = 0; i < working.length; i += 1) {
        const current = working[i];
        if (!current || current.type === "enemy") {
          merged.push(current);
          continue;
        }

        const next = working[i + 1];
        if (next && next.type !== "enemy" && this.canMerge(current, next)) {
          const mergedTile = this.createMergedTile(current, next);
          scoreGain += mergedTile.value;
          moveEvents.push({
            type: "merge",
            at: { x: mergedTile.x, y: mergedTile.y },
            value: mergedTile.value,
          });
          merged.push(mergedTile);
          i += 1;
          changed = true;
          continue;
        }

        merged.push(current);
      }

      while (merged.length < this.size) merged.push(null);
      if (descriptor.reverse) merged.reverse();

      for (let slot = 0; slot < this.size; slot += 1) {
        const coord = descriptor.axis === "row"
          ? { x: slot, y: index }
          : { x: index, y: slot };
        const previous = line[slot];
        const tile = merged[slot];

        if (tile) {
          if (!previous || previous.id !== tile.id || previous.x !== coord.x || previous.y !== coord.y) {
            changed = true;
          }
          tile.x = coord.x;
          tile.y = coord.y;
        } else if (previous) {
          changed = true;
        }

        this.setCell(cloned, coord.x, coord.y, tile);
      }
    }

    if (!changed) {
      this.audio.playSfx("bump");
      this.emitStatus("這一步無法移動");
      this.sync();
      return;
    }

    this.state = cloned;
    this.score += scoreGain;

    if (scoreGain > 0) {
      this.audio.playMerge(scoreGain);
      if (this.mode === "battle") {
        this.resolveBattleDamage();
      }
    } else {
      this.audio.playSfx("move");
    }

    this.addRandomTile();

    if (this.mode === "battle") {
      if (Math.random() < 0.16) this.spawnEnemy();
      this.decorateEnemies();
    }

    this.updateBest();
    this.checkEndState();
    this.sync({ moveEvents });
  }

  createEmptyBoard() {
    return Array.from({ length: this.size }, () => Array(this.size).fill(null));
  }

  cloneBoard(board) {
    return board.map((row) => row.map((tile) => (tile ? { ...tile } : null)));
  }

  resetFlags(board) {
    board.forEach((row) => row.forEach((tile) => {
      if (tile) {
        tile.justMerged = false;
        tile.justSpawned = false;
        tile.lastEffect = "";
      }
    }));
  }

  extractLine(board, descriptor, index) {
    const line = [];
    for (let i = 0; i < this.size; i += 1) {
      line.push(
        descriptor.axis === "row"
          ? board[index][i]
          : board[i][index]
      );
    }
    return line;
  }

  setCell(board, x, y, value) {
    board[y][x] = value;
  }

  getCell(x, y) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
    return this.state[y][x];
  }

  getEmptyCells() {
    const cells = [];
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (!this.state[y][x]) cells.push({ x, y });
      }
    }
    return cells;
  }

  addRandomTile() {
    const empties = this.getEmptyCells();
    if (!empties.length) return false;
    const cell = empties[Math.floor(Math.random() * empties.length)];
    this.state[cell.y][cell.x] = this.createTile({
      x: cell.x,
      y: cell.y,
      value: Math.random() < 0.9 ? 2 : 4,
    });
    return true;
  }

  createTile({ x, y, value, type = "number", hp = null }) {
    return {
      id: tileId++,
      x,
      y,
      value,
      type,
      hp: hp ?? (type === "enemy" ? Math.max(1, Math.floor(Math.log2(value)) - 1) : 0),
      justMerged: false,
      justSpawned: true,
      lastEffect: "",
    };
  }

  canMerge(a, b) {
    return a.value === b.value && a.type === "number" && b.type === "number";
  }

  createMergedTile(a, b) {
    const tile = this.createTile({
      x: a.x,
      y: a.y,
      value: a.value * 2,
    });
    tile.justMerged = true;
    return tile;
  }

  spawnEnemy(force = false) {
    const empties = this.getEmptyCells();
    if (!empties.length) return false;
    if (!force && Math.random() > 0.55) return false;

    const cell = empties[Math.floor(Math.random() * empties.length)];
    const valueBase = [4, 8, 8, 16][Math.floor(Math.random() * 4)];
    this.state[cell.y][cell.x] = this.createTile({
      x: cell.x,
      y: cell.y,
      value: valueBase,
      type: "enemy",
      hp: Math.max(1, Math.floor(Math.log2(valueBase)) - 1),
    });
    return true;
  }

  resolveBattleDamage() {
    const mergedTiles = this.flatTiles().filter((tile) => tile.justMerged);
    mergedTiles.forEach((tile) => {
      const splash = Math.max(1, Math.floor(Math.log2(tile.value) / 3) + 1);
      const neighbors = [
        [tile.x - 1, tile.y],
        [tile.x + 1, tile.y],
        [tile.x, tile.y - 1],
        [tile.x, tile.y + 1],
      ];

      neighbors.forEach(([x, y]) => {
        const target = this.getCell(x, y);
        if (!target || target.type !== "enemy") return;
        target.hp -= splash;
        target.lastEffect = `受傷 -${splash}`;
        target.justMerged = true;
        this.audio.playSfx("attack");
        this.onEffect?.({ type: "attack", x, y });

        if (target.hp <= 0) {
          this.score += target.value;
          this.state[y][x] = null;
          this.onEffect?.({ type: "burst", x, y });
          this.emitStatus("敵人已被擊破");
        }
      });
    });
  }

  decorateEnemies() {
    this.flatTiles().forEach((tile) => {
      if (tile.type === "enemy" && !tile.lastEffect) {
        tile.lastEffect = "敵人";
      }
    });
  }

  updateBest() {
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem(STORAGE_KEYS.best, String(this.bestScore));
    }
  }

  checkEndState() {
    if (this.hasWinningTile()) {
      this.emitStatus("你做出了 2048！可以繼續挑戰更高分。");
    }

    if (this.getEmptyCells().length > 0) return;
    if (this.hasPossibleMoves()) return;

    if (this.mode === "battle" && this.flatTiles().some((tile) => tile.type === "enemy")) {
      this.gameOver = true;
      this.audio.playSfx("lose");
      this.emitStatus("棋盤已滿且敵人仍存在，戰鬥失敗！");
      return;
    }

    this.gameOver = true;
    this.audio.playSfx("lose");
    this.emitStatus("沒有可移動空間，遊戲結束");
  }

  hasWinningTile() {
    return this.flatTiles().some((tile) => tile.type === "number" && tile.value >= 2048);
  }

  hasPossibleMoves() {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        const tile = this.state[y][x];
        if (!tile || tile.type === "enemy") continue;
        const neighbors = [
          this.getCell(x + 1, y),
          this.getCell(x - 1, y),
          this.getCell(x, y + 1),
          this.getCell(x, y - 1),
        ];
        if (neighbors.some((other) => other && this.canMerge(tile, other))) return true;
      }
    }
    return false;
  }

  flatTiles() {
    return this.state.flat().filter(Boolean);
  }

  sync(meta = {}) {
    this.onScore?.(this.score, this.bestScore);
    this.onStateChange?.({
      board: this.cloneBoard(this.state),
      size: this.size,
      mode: this.mode,
      paused: this.paused,
      gameOver: this.gameOver,
      score: this.score,
      bestScore: this.bestScore,
    }, meta);
  }

  emitStatus(message) {
    this.onStatus?.(message);
  }

  modeLabel() {
    return {
      classic: "經典模式",
      battle: "敵人戰鬥模式",
    }[this.mode] || "經典模式";
  }
}
