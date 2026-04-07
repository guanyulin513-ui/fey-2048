import { GameEngine } from "./src/game.js";
import { AudioManager } from "./src/audio.js";
import { UIManager } from "./src/ui.js";

const app = (() => {
  const audio = new AudioManager();
  const ui = new UIManager(audio);
  const game = new GameEngine({
    onStateChange: (state, meta) => ui.render(state, meta),
    onScore: (score, best) => ui.updateScores(score, best),
    onStatus: (message) => ui.setStatus(message),
    onEffect: (effect) => ui.playEffect(effect),
    audio,
  });

  ui.bindControls({
    onStart: (config) => {
      audio.unlock();
      audio.playUi("click");
      game.start(config);
    },
    onRestart: (config) => {
      audio.playUi("click");
      game.start(config);
    },
    onPause: () => {
      audio.playUi("switch");
      game.togglePause();
    },
    onResume: () => {
      audio.playUi("click");
      game.togglePause(false);
    },
    onInput: (direction) => game.move(direction),
    onVolume: (value) => audio.setVolume(value),
    onMute: () => audio.toggleMute(),
    onBgm: () => audio.toggleBgm(),
    onTheme: () => ui.toggleTheme(),
  });

  window.addEventListener("keydown", (event) => {
    const map = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      s: "down",
      a: "left",
      d: "right",
      W: "up",
      S: "down",
      A: "left",
      D: "right",
    };

    if (map[event.key]) {
      event.preventDefault();
      game.move(map[event.key]);
    }
  });

  ui.attachSwipe((direction) => game.move(direction));
  game.start(ui.getConfig());
  return { game, ui, audio };
})();

window.__GAME__ = app;
