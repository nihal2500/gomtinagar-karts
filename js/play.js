// ---------- Information about the choices ----------
const KARTS = {
  red:      { label: "Signal Red", color: "#d71921" },
  graphite: { label: "Graphite",   color: "#3a3a3a" },
  sky:      { label: "Sky Blue",   color: "#5aa9f0" }
};

const DIFFICULTY_LABELS = {
  easy:   "Easy bots",
  medium: "Medium bots",
  hard:   "Hard bots"
};

// The chosen settings are stored here so the game can use them.
window.gameSettings = null;

// ---------- Find things on the page ----------
const setupScreen = document.getElementById("setup");
const matchScreen = document.getElementById("match");
const nameInput = document.getElementById("player-name");
const startButton = document.getElementById("start-btn");
const backButton = document.getElementById("back-btn");

// ---------- What happens when the player clicks Start Match ----------
startButton.addEventListener("click", function () {
  const name = nameInput.value.trim() || "Player";
  const kartKey = document.querySelector('input[name="kart"]:checked').value;
  const difficulty = document.querySelector('input[name="difficulty"]:checked').value;

  window.gameSettings = {
    name: name,
    kartColor: KARTS[kartKey].color,
    kartKey: kartKey,
    difficulty: difficulty
  };

  document.getElementById("match-name").textContent = name;
  document.getElementById("match-swatch").style.background = KARTS[kartKey].color;
  document.getElementById("match-kart").textContent = KARTS[kartKey].label;
  document.getElementById("match-difficulty").textContent = DIFFICULTY_LABELS[difficulty];

  setupScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");
  window.scrollTo(0, 0);

  Game.start(window.gameSettings);
});

// ---------- Back to setup ----------
backButton.addEventListener("click", function () {
  Game.stop();
  matchScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  window.scrollTo(0, 0);
});