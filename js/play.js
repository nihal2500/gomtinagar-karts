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

// The chosen settings are stored here so the game can use them later.
window.gameSettings = null;

// ---------- Find things on the page ----------
const setupScreen = document.getElementById("setup");
const matchScreen = document.getElementById("match");
const nameInput = document.getElementById("player-name");
const startButton = document.getElementById("start-btn");
const backButton = document.getElementById("back-btn");
const canvas = document.getElementById("game-canvas");

// ---------- Draw a temporary picture in the arena area ----------
function drawPlaceholder() {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(16, 16, 16, 0.25)";
  for (let x = 20; x < canvas.width; x += 30) {
    for (let y = 20; y < canvas.height; y += 30) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#101010";
  ctx.font = "bold 28px monospace";
  ctx.textAlign = "center";
  ctx.fillText("Arena coming in the next stage", canvas.width / 2, canvas.height / 2);
}

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

  drawPlaceholder();
  setupScreen.classList.add("hidden");
  matchScreen.classList.remove("hidden");
  window.scrollTo(0, 0);
});

// ---------- Back to setup ----------
backButton.addEventListener("click", function () {
  matchScreen.classList.add("hidden");
  setupScreen.classList.remove("hidden");
  window.scrollTo(0, 0);
});