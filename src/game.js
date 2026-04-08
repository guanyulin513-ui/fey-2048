const STORAGE_KEYS = {
  best: "multiverse-2048-best-score",
  theme: "multiverse-2048-theme",
};

const DIRECTIONS = {
  left: { axis: "row", reverse: false, delta: { x: -1, y: 0 } },
  right: { axis: "row", reverse: true, delta: { x: 1, y: 0 } },
  up: { axis: "col", reverse: false, delta: { x: 0, y: -1 } },
  down: { axis: "col", reverse: true, delta: { x: 0, y: 1 } },
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
    this.turn = 0;
  }

  start({ size, mode }) {
    this.size = Number(size) || 4;
    this.mode = mode || "classic";
    this.score = 0;
    this.turn = 0;
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
    this.sync({ paused: this.paused });
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
        if (
          next &&
          next.type !== "enemy" &&
          this.canMerge(current, next)
        ) {
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
      if (this.mode === "card") {
        this.resolveCardEffects();
      }
    } else {
      this.audio.playSfx("move");
    }

    this.turn += 1;
    this.addRandomTile();

    if (this.mode === "card" && Math.random() < 0.14) {
      this.addRandomTile(true);
    }

    if (this.mode === "battle") {
      if (Math.random() < 0.35) this.spawnEnemy();
      this.damageEnemiesDecay();
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

  addRandomTile(forceSpecial = false) {
    const empties = this.getEmptyCells();
    if (!empties.length) return false;
    const cell = empties[Math.floor(Math.random() * empties.length)];
    const tile = this.createTile({
      x: cell.x,
      y: cell.y,
      value: Math.random() < 0.9 ? 2 : 4,
    });

    if (this.mode === "card" && forceSpecial) {
      tile.special = this.randomSpecialCard();
      tile.card = true;
    }

    this.state[cell.y][cell.x] = tile;
    return true;
  }

  createTile({ x, y, value, type = "number", special = null, hp = null }) {
    return {
      id: tileId++,
      x,
      y,
      value,
      type,
      special,
      hp: hp ?? (type === "enemy" ? Math.max(2, Math.floor(value / 2)) : Math.max(1, Math.floor(Math.log2(value)))),
      justMerged: false,
      justSpawned: true,
      lastEffect: "",
    };
  }

  canMerge(a, b) {
    return a.value === b.value && !a.special && !b.special && a.type === "number" && b.type === "number";
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

  resolveCardEffects() {
    const tiles = this.flatTiles();
    tiles.forEach((tile) => {
      if (!tile.special) return;
      if (Math.random() > 0.45) return;

      if (tile.special === "double") {
        this.score += tile.value;
        tile.lastEffect = "倍率 x2";
        this.audio.playSfx("card");
        this.onEffect?.({ type: "burst", x: tile.x, y: tile.y });
      }

      if (tile.special === "clear") {
        const candidates = this.flatTiles().filter((item) => item.id !== tile.id && item.type !== "enemy");
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        if (target) {
          this.state[target.y][target.x] = null;
          tile.lastEffect = "消除";
          this.audio.playSfx("card");
          this.onEffect?.({ type: "burst", x: target.x, y: target.y });
        }
      }

      if (tile.special === "shuffle") {
        const numbers = this.flatTiles().filter((item) => item.type !== "enemy");
        const empties = [];
        for (let y = 0; y < this.size; y += 1) {
          for (let x = 0; x < this.size; x += 1) {
            if (!this.state[y][x] || this.state[y][x].type !== "enemy") empties.push({ x, y });
            if (this.state[y][x]?.type !== "enemy") this.state[y][x] = null;
          }
        }
        const shuffled = [...numbers].sort(() => Math.random() - 0.5);
        shuffled.forEach((item, index) => {
          const spot = empties[index];
          item.x = spot.x;
          item.y = spot.y;
          item.lastEffect = "洗牌";
          this.state[spot.y][spot.x] = item;
        });
        tile.lastEffect = "洗牌";
        this.audio.playSfx("card");
      }
    });
  }

  randomSpecialCard() {
    const roll = Math.random();
    if (roll < 0.45) return "double";
    if (roll < 0.75) return "clear";
    return "shuffle";
  }

  spawnEnemy(force = false) {
    const empties = this.getEmptyCells();
    if (!empties.length) return false;
    if (!force && Math.random() > 0.6) return false;
    const cell = empties[Math.floor(Math.random() * empties.length)];
    const valueBase = [8, 16, 32][Math.floor(Math.random() * 3)];
    this.state[cell.y][cell.x] = this.createTile({
      x: cell.x,
      y: cell.y,
      value: valueBase,
      type: "enemy",
      hp: Math.max(2, Math.floor(Math.log2(valueBase)) + 1),
    });
    return true;
  }

  resolveBattleDamage() {
    const mergedTiles = this.flatTiles().filter((tile) => tile.justMerged);
    mergedTiles.forEach((tile) => {
      const splash = Math.max(1, Math.floor(Math.log2(tile.value) / 2));
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
        target.lastEffect = `-${splash} HP`;
        target.justMerged = true;
        this.audio.playSfx("attack");
        this.onEffect?.({ type: "attack", x, y });
        if (target.hp <= 0) {
          this.score += target.value;
          this.state[y][x] = null;
          this.onEffect?.({ type: "burst", x, y });
        }
      });
    });
  }

  damageEnemiesDecay() {
    this.flatTiles().forEach((tile) => {
      if (tile.type === "enemy") {
        tile.lastEffect = tile.lastEffect || `HP ${tile.hp}`;
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
      classic: "Classic Mode",
      card: "Card Mode",
      battle: "Block Battle Mode",
    }[this.mode] || "Classic Mode";
  }
}
