// ---------- Information about the choices ----------
const KARTS = {
  red:      { label: "Signal Red",   color: "#d71921" },
  sky:      { label: "Sky Blue",     color: "#5aa9f0" },
  green:    { label: "Mint Green",   color: "#4fcf8d" },
  yellow:   { label: "Sunny Yellow", color: "#f4c20d" },
  graphite: { label: "Graphite",     color: "#3a3a3a" }
};

const DIFFICULTY_LABELS = {
  easy:   "Easy",
  medium: "Medium",
  hard:   "Hard"
};

// The chosen settings are stored here so the game can use them.
window.gameSettings = null;

// ---------- Find things on the page ----------
const setupScreen = document.getElementById("setup");
const matchScreen = document.getElementById("match");
const nameInput = document.getElementById("player-name");
const startButton = document.getElementById("start-btn");
const backButton = document.getElementById("back-btn");
const gameWrap = document.getElementById("game-wrap");
const fullscreenButton = document.getElementById("fullscreen-btn");
const setupError = document.getElementById("setup-error");

// ---------- The difficulty and bots buttons use the color of the kart you picked ----------
function applyKartColor() {
  const kartInput = document.querySelector('input[name="kart"]:checked');
  if (kartInput) {
    setupScreen.style.setProperty("--kart-ac", KARTS[kartInput.value].color);
  } else {
    setupScreen.style.removeProperty("--kart-ac");
  }
}

document.querySelectorAll('input[name="kart"]').forEach(function (radio) {
  radio.addEventListener("change", applyKartColor);
});

// ---------- Nothing is chosen when the page opens ----------
function resetChoices() {
  if (setupScreen.classList.contains("hidden")) return;
  document.querySelectorAll('#setup input[type="radio"]').forEach(function (radio) {
    radio.checked = false;
  });
  applyKartColor();
}
resetChoices();
window.addEventListener("pageshow", resetChoices);

// When something is chosen, its "please choose" reminder goes away
document.querySelectorAll('#setup input[type="radio"]').forEach(function (radio) {
  radio.addEventListener("change", function () {
    const panel = radio.closest(".panel");
    if (panel) panel.classList.remove("missing");
    if (!document.querySelector(".panel.missing")) setupError.classList.add("hidden");
  });
});

function joinList(items) {
  if (items.length === 1) return items[0];
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

// ---------- Fullscreen ----------
function isFullscreen() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}

function enterFullscreen() {
  if (gameWrap.requestFullscreen) {
    gameWrap.requestFullscreen();
  } else if (gameWrap.webkitRequestFullscreen) {
    gameWrap.webkitRequestFullscreen();
  }
}

function exitFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

function toggleFullscreen() {
  if (isFullscreen()) {
    exitFullscreen();
  } else {
    enterFullscreen();
  }
}

function updateFullscreenButton() {
  fullscreenButton.textContent = isFullscreen() ? "Exit Fullscreen" : "Fullscreen";
}

fullscreenButton.addEventListener("click", function () {
  toggleFullscreen();
  fullscreenButton.blur(); // so the Space key never "presses" this button
});

document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

// The F key also toggles fullscreen while a match is on screen.
window.addEventListener("keydown", function (e) {
  if (e.code === "KeyF" && !e.repeat && !matchScreen.classList.contains("hidden")) {
    toggleFullscreen();
  }
});

// ---------- What happens when the player clicks Start Match ----------
startButton.addEventListener("click", function () {
  const kartInput = document.querySelector('input[name="kart"]:checked');
  const difficultyInput = document.querySelector('input[name="difficulty"]:checked');
  const botsInput = document.querySelector('input[name="bots"]:checked');

  // make sure the player has chosen everything
  const missing = [];
  if (!kartInput) missing.push({ panel: "panel-kart", label: "a kart color" });
  if (!difficultyInput) missing.push({ panel: "panel-difficulty", label: "the bot difficulty" });
  if (!botsInput) missing.push({ panel: "panel-bots", label: "the number of bots" });

  document.querySelectorAll(".panel.missing").forEach(function (panel) {
    panel.classList.remove("missing");
  });

  if (missing.length > 0) {
    missing.forEach(function (m) {
      document.getElementById(m.panel).classList.add("missing");
    });
    setupError.textContent = "Please choose " + joinList(missing.map(function (m) { return m.label; })) + " before you start.";
    setupError.classList.remove("hidden");
    document.getElementById(missing[0].panel).scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  setupError.classList.add("hidden");

  const name = nameInput.value.trim() || "Player";
  const kartKey = kartInput.value;
  const difficulty = difficultyInput.value;
  const botCount = parseInt(botsInput.value, 10);

  window.gameSettings = {
    name: name,
    kartColor: KARTS[kartKey].color,
    kartKey: kartKey,
    difficulty: difficulty,
    botCount: botCount
  };

  document.getElementById("match-name").textContent = name;
  document.getElementById("match-swatch").style.background = KARTS[kartKey].color;
  document.getElementById("match-kart").textContent = KARTS[kartKey].label;
  document.getElementById("match-difficulty").textContent =
    DIFFICULTY_LABELS[difficulty] + " · " + botCount + (botCount === 1 ? " bot" : " bots");

  setupScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");
  window.scrollTo(0, 0);

  Game.start(window.gameSettings);
});

// ---------- Back to setup ----------
backButton.addEventListener("click", function () {
  if (isFullscreen()) {
    exitFullscreen();
  }
  Game.stop();
  matchScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  window.scrollTo(0, 0);
});