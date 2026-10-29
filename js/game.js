// =====================================================
//  Gomtinagar Karts: game engine (Stage 7)
//  Arena, 2.5D drawing, driving, health, power-ups, sounds,
//  bots, lives, win/lose screens and a kill feed.
// =====================================================

// ---------- Sound effects (made with code, no sound files needed) ----------
const Sfx = (function () {
  let ac = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;

  function init() {
    if (ac) {
      if (ac.state === "suspended") ac.resume();
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    ac = new AudioContextClass();
    master = ac.createGain();
    master.gain.value = 0.3;
    master.connect(ac.destination);

    noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  function tone(freq, endFreq, dur, type, vol, delay) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, delay) {
    if (!ac || muted) return;
    const t = ac.currentTime + (delay || 0);
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFreq, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + dur);
    const gain = ac.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  return {
    init: init,
    toggleMute: function () { muted = !muted; },
    isMuted: function () { return muted; },
    pickup: function () {
      tone(660, 880, 0.1, "square", 0.12);
      tone(880, 1320, 0.12, "square", 0.12, 0.09);
    },
    rocket: function () {
      noise(0.35, 0.25, 2500);
      tone(500, 120, 0.35, "sawtooth", 0.1);
    },
    explode: function () {
      noise(0.5, 0.45, 1200);
      tone(140, 40, 0.4, "sine", 0.35);
    },
    hit: function () {
      noise(0.2, 0.3, 1800);
      tone(200, 70, 0.18, "square", 0.15);
    },
    mine: function () {
      tone(300, 150, 0.12, "square", 0.14);
      tone(200, 100, 0.1, "square", 0.12, 0.1);
    },
    shield: function () {
      tone(440, 880, 0.2, "sine", 0.18);
      tone(660, 1320, 0.25, "sine", 0.14, 0.08);
    },
    shieldPop: function () {
      tone(900, 300, 0.15, "triangle", 0.2);
      noise(0.15, 0.15, 3000);
    },
    beast: function () {
      tone(110, 60, 0.6, "sawtooth", 0.2);
      tone(220, 80, 0.5, "square", 0.08, 0.05);
      noise(0.4, 0.15, 800);
    },
    eat: function () {
      noise(0.25, 0.35, 1800);
      tone(160, 50, 0.25, "square", 0.2);
      tone(90, 40, 0.2, "sawtooth", 0.2, 0.1);
    },
    tick: function () {
      tone(520, 520, 0.12, "square", 0.12);
    },
    go: function () {
      tone(880, 1320, 0.3, "square", 0.15);
    },
    win: function () {
      tone(523, 523, 0.15, "square", 0.12);
      tone(659, 659, 0.15, "square", 0.12, 0.15);
      tone(784, 784, 0.15, "square", 0.12, 0.3);
      tone(1047, 1047, 0.4, "square", 0.12, 0.45);
    },
    lose: function () {
      tone(400, 100, 0.7, "sawtooth", 0.15);
    }
  };
})();


// ---------- The game ----------
const Game = (function () {

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");

  // The game thinks in a 900 x 520 world. The real canvas can be bigger
  // (for sharp pictures); "scale" converts between the two.
  const W = 900;
  const H = 520;
  const TAU = Math.PI * 2;
  let scale = 1;

  // ---------- Colors you can change ----------
  const BARRIER_COLOR = "#d71921";   // the single color of the arena barriers
  const BARRIER_DARK = "#8f0e14";    // a darker shade of the same color (edges and front)

  // Power-up boxes: a blend of red and orange
  const BOX_RED = "#d71921";
  const BOX_ORANGE = "#ff9a1f";
  const BOX_DEEP_RED = "#a3121a";

  // ---------- The arena ----------
  const ARENA = { x: 50, y: 66, w: 800, h: 400 };
  const WALL = 14;
  const FRONT = 12;
  const KART_RADIUS = 18;

  // Solid blocks. "hgt" is how tall they look.
  const OBSTACLES = [
    { x: 422, y: 238, w: 56, h: 56, hgt: 22, top: "#d71921", front: "#8f0e14" },
    { x: 216, y: 152, w: 48, h: 48, hgt: 17, top: "#a9d4ff", front: "#6fa8dc" },
    { x: 636, y: 152, w: 48, h: 48, hgt: 17, top: "#ffe27a", front: "#d9b43a" },
    { x: 216, y: 332, w: 48, h: 48, hgt: 17, top: "#ffe27a", front: "#d9b43a" },
    { x: 636, y: 332, w: 48, h: 48, hgt: 17, top: "#a9d4ff", front: "#6fa8dc" }
  ];

  // Where the power-up boxes sit (only a few, so power-ups feel special)
  const BOX_SPOTS = [
    { x: 450, y: 126 }, { x: 450, y: 406 },
    { x: 330, y: 266 }, { x: 570, y: 266 },
    { x: 760, y: 266 }
  ];
  const BOX_RESPAWN_SECONDS = 7;

  // Where karts come back after being knocked out
  const SPAWN_SPOTS = [
    { x: 100, y: 110 }, { x: 800, y: 110 },
    { x: 100, y: 422 }, { x: 800, y: 422 }
  ];

  // Where the bots start (it depends on how many bots you choose)
  const BOT_STARTS = {
    1: [
      { x: 790, y: 200, angle: Math.PI }
    ],
    2: [
      { x: 790, y: 110, angle: Math.PI },
      { x: 790, y: 422, angle: Math.PI }
    ],
    3: [
      { x: 790, y: 110, angle: Math.PI },
      { x: 790, y: 422, angle: Math.PI },
      { x: 450, y: 92, angle: Math.PI / 2 }
    ]
  };
  const BOT_NAMES = ["Zippy", "Bolt", "Nova"];
  const BOT_COLORS = ["#d71921", "#5aa9f0", "#4fcf8d", "#f4c20d", "#3a3a3a"];

  // ---------- How tough the bots are ----------
  // SKILL says how good each single bot is: 0 = very weak, 1 = a very strong player.
  // The three numbers in each row are for 1 bot, 2 bots and 3 bots.
  // With more bots, each bot is a little weaker, but together they are harder to beat.
  // (For comparison: the old Easy bot was about 0.3, the old Medium about 0.7, the old Hard about 1.0.)
  const SKILL = {
    easy:   [0.54, 0.50, 0.46],
    medium: [0.88, 0.83, 0.79],
    hard:   [1.08, 1.05, 1.03]
  };
  // How often the bots go after YOU instead of each other (matters with 2 or 3 bots)
  const FOCUS = { easy: 0.45, medium: 0.65, hard: 0.95 };

  // How likely each power-up is (the numbers are percentages and add up to 100)
  const POWERUP_WEIGHTS = [
    { type: "rocket", weight: 40 },
    { type: "beast",  weight: 20 },
    { type: "shield", weight: 22 },
    { type: "mine",   weight: 18 }
  ];
  const POWERUP_NAMES = { rocket: "ROCKETS", mine: "MINE", shield: "SHIELD", beast: "BEAST" };
  const VERBS = { rocket: "rocketed", mine: "mined", beast: "ate" };

  // ---------- Game numbers (you can tweak these later) ----------
  const MAX_SPEED = 4.4;
  const BEAST_SPEED = 5.6;
  const MAX_REVERSE = 1.8;
  const ACCEL = 0.11;
  const BRAKE = 0.22;
  const FRICTION = 0.05;
  const TURN_RATE = 0.05;

  const ROCKET_SPEED = 9;
  const ROCKET_DAMAGE = 34;     // three rockets together = 102 damage
  const MINE_DAMAGE = 60;
  const MINE_LIFETIME = 6;      // seconds before a mine disappears
  const SHIELD_TIME = 5;        // seconds
  const BEAST_TIME = 3;         // seconds
  const EAT_TIME = 0.55;        // seconds the "eating" takes
  const MAX_HP = 100;
  const START_LIVES = 3;
  const COUNTDOWN_SECONDS = 3;

  // ---------- Game state ----------
  let running = false;
  let rafId = null;
  let lastTime = 0;
  let gameTime = 0;        // seconds since the match started
  let state = "playing";   // "playing", "won" or "lost"
  let countdown = 0;       // seconds left before the race starts
  let goTimer = 0;         // shows "GO!" for a moment
  let lastTick = 0;
  let place = 1;
  let settings = null;
  let keys = {};
  let player = null;
  let karts = [];          // karts still in the match
  let bots = [];           // all the bots (even after they are out)
  let boxes = [];
  let mines = [];
  let rockets = [];
  let particles = [];
  let feed = [];
  let staticLayer = null;

  // ---------- Keyboard and mouse ----------
  const BLOCKED_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];

  window.addEventListener("keydown", function (e) {
    if (!running) return;
    keys[e.code] = true;
    if (BLOCKED_KEYS.indexOf(e.code) !== -1) e.preventDefault(); // stop the page from scrolling
    if (e.code === "Space" && !e.repeat && state === "playing" && countdown <= 0) usePowerup(player);
    if (e.code === "KeyM" && !e.repeat) Sfx.toggleMute();
    if (e.code === "Enter" && state !== "playing") restart();
  });

  window.addEventListener("keyup", function (e) {
    keys[e.code] = false;
  });

  window.addEventListener("blur", function () {
    keys = {};
  });

  // The "Play Again" button is drawn on the canvas, so we check clicks ourselves
  const AGAIN_BUTTON = { x: 340, y: 322, w: 220, h: 54 };

  canvas.addEventListener("click", function (e) {
    if (!running || state === "playing") return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (W / rect.width);
    const y = (e.clientY - rect.top) * (H / rect.height);
    if (x > AGAIN_BUTTON.x && x < AGAIN_BUTTON.x + AGAIN_BUTTON.w &&
        y > AGAIN_BUTTON.y && y < AGAIN_BUTTON.y + AGAIN_BUTTON.h) {
      restart();
    }
  });

  // ---------- Making the picture sharp ----------
  // If the canvas is shown bigger (like in fullscreen), we make its
  // real pixel size bigger too, so nothing looks blurry.
  function fitCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(1, Math.min(2.5, (rect.width * dpr) / W));
    const pw = Math.round(W * s);
    const ph = Math.round(H * s);
    if (canvas.width === pw && canvas.height === ph && staticLayer) return;
    canvas.width = pw;
    canvas.height = ph;
    scale = s;
    staticLayer = buildStaticLayer(s);
  }

  window.addEventListener("resize", fitCanvas);
  if (window.ResizeObserver) {
    new ResizeObserver(fitCanvas).observe(canvas);
  }

  // ---------- Small helpers ----------
  function angleDiff(a, b) {
    // how far to turn from angle b to reach angle a (between -PI and PI)
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
  }

  function ordinal(n) {
    if (n === 1) return "1st";
    if (n === 2) return "2nd";
    if (n === 3) return "3rd";
    return n + "th";
  }

  // ---------- Drawing helpers ----------
  function roundedRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // One solid barrier piece, in the single barrier color
  function barrier(g, x, y, w, h, horizontal) {
    g.fillStyle = BARRIER_COLOR;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255, 255, 255, 0.28)";
    if (horizontal) {
      g.fillRect(x + 2, y + 2, w - 4, 3);
    } else {
      g.fillRect(x + 2, y + 2, 3, h - 4);
    }
    g.strokeStyle = BARRIER_DARK;
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
  }

  // The floor and the back walls never move, so we draw them once.
  function buildStaticLayer(s) {
    const c = document.createElement("canvas");
    c.width = Math.round(W * s);
    c.height = Math.round(H * s);
    const g = c.getContext("2d");
    g.setTransform(s, 0, 0, s, 0, 0);

    // dotted background
    g.fillStyle = "#efeee9";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(16, 16, 16, 0.12)";
    for (let x = 12; x < W; x += 24) {
      for (let y = 12; y < H; y += 24) {
        g.beginPath();
        g.arc(x, y, 1.3, 0, TAU);
        g.fill();
      }
    }

    // floor tiles
    const cols = 16;
    const rows = 8;
    const tw = ARENA.w / cols;
    const th = ARENA.h / rows;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        g.fillStyle = ((cx + cy) % 2 === 0) ? "#fbfaf6" : "#f1efe9";
        g.fillRect(ARENA.x + cx * tw, ARENA.y + cy * th, tw, th);
      }
    }

    // colored corner patches
    g.save();
    g.beginPath();
    g.rect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    g.clip();
    const patches = [
      { x: ARENA.x, y: ARENA.y, color: "#cfe6ff" },
      { x: ARENA.x + ARENA.w, y: ARENA.y, color: "#fff0b3" },
      { x: ARENA.x, y: ARENA.y + ARENA.h, color: "#ffd0d2" },
      { x: ARENA.x + ARENA.w, y: ARENA.y + ARENA.h, color: "#cfe6ff" }
    ];
    patches.forEach(function (p) {
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, 110, 0, TAU);
      g.fill();
    });

    // dotted ring in the middle, plus a faint inner ring
    const mx = ARENA.x + ARENA.w / 2;
    const my = ARENA.y + ARENA.h / 2;
    g.strokeStyle = "rgba(215, 25, 33, 0.6)";
    g.lineWidth = 3;
    g.lineCap = "round";
    g.setLineDash([1, 11]);
    g.beginPath();
    g.arc(mx, my, 130, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = "rgba(16, 16, 16, 0.14)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(mx, my, 70, 0, TAU);
    g.stroke();

    // faint name on the floor
    g.fillStyle = "rgba(16, 16, 16, 0.07)";
    g.font = "bold 30px monospace";
    g.textAlign = "center";
    g.fillText("GOMTINAGAR KARTS", mx, ARENA.y + 50);
    g.fillText("GOMTINAGAR KARTS", mx, ARENA.y + ARENA.h - 32);

    // soft shadows inside the walls
    let grad = g.createLinearGradient(0, ARENA.y, 0, ARENA.y + 16);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.16)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = grad;
    g.fillRect(ARENA.x, ARENA.y, ARENA.w, 16);

    grad = g.createLinearGradient(ARENA.x, 0, ARENA.x + 16, 0);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.16)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = grad;
    g.fillRect(ARENA.x, ARENA.y, 16, ARENA.h);

    grad = g.createLinearGradient(ARENA.x + ARENA.w, 0, ARENA.x + ARENA.w - 16, 0);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.16)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = grad;
    g.fillRect(ARENA.x + ARENA.w - 16, ARENA.y, 16, ARENA.h);
    g.restore();

    // north, west and east barriers
    barrier(g, ARENA.x - WALL, ARENA.y - WALL, ARENA.w + 2 * WALL, WALL, true);
    barrier(g, ARENA.x - WALL, ARENA.y, WALL, ARENA.h, false);
    barrier(g, ARENA.x + ARENA.w, ARENA.y, WALL, ARENA.h, false);

    return c;
  }

  staticLayer = buildStaticLayer(1);

  // The south barrier is in front of everything, so it is drawn last.
  function drawSouthWall() {
    barrier(ctx, ARENA.x - WALL, ARENA.y + ARENA.h, ARENA.w + 2 * WALL, WALL, true);
    ctx.fillStyle = BARRIER_DARK;
    ctx.fillRect(ARENA.x - WALL, ARENA.y + ARENA.h + WALL, ARENA.w + 2 * WALL, FRONT);
  }

  function drawObstacle(o) {
    // shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(o.x + 6, o.y + 6, o.w, o.h);

    ctx.strokeStyle = "#101010";
    ctx.lineWidth = 2;

    // front face
    ctx.fillStyle = o.front;
    ctx.fillRect(o.x, o.y + o.h - o.hgt, o.w, o.hgt);
    ctx.strokeRect(o.x, o.y + o.h - o.hgt, o.w, o.hgt);

    // top face (moved up by its height)
    ctx.fillStyle = o.top;
    ctx.fillRect(o.x, o.y - o.hgt, o.w, o.h);
    ctx.strokeRect(o.x, o.y - o.hgt, o.w, o.h);

    // little circle symbol on top
    const cx = o.x + o.w / 2;
    const cy = o.y - o.hgt + o.h / 2;
    ctx.strokeStyle = "rgba(16, 16, 16, 0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, o.w * 0.22, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = "rgba(16, 16, 16, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, TAU);
    ctx.fill();
  }

  // The outline of a kart's body: rounded normally, pointed in beast mode
  function bodyPath(beast) {
    if (!beast) {
      roundedRect(ctx, -20, -12, 40, 24, 8);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(27, 0);
    ctx.lineTo(10, -9);
    ctx.lineTo(-6, -14);
    ctx.lineTo(-22, -10);
    ctx.lineTo(-22, 10);
    ctx.lineTo(-6, 14);
    ctx.lineTo(10, 9);
    ctx.closePath();
  }

  // The wide-open mouth, shown while a beast is eating a kart
  function drawJaws(k) {
    const t = Math.min(1, k.eating.eaten.t);
    const open = Math.sin(t * Math.PI) * 0.85;
    ctx.save();
    ctx.translate(k.x, k.y - 6);
    ctx.rotate(k.angle);
    ctx.translate(22, 0);

    // inside of the mouth
    ctx.fillStyle = "#7a0a10";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(36 * Math.cos(open), -36 * Math.sin(open));
    ctx.lineTo(36 * Math.cos(open), 36 * Math.sin(open));
    ctx.closePath();
    ctx.fill();

    // upper and lower jaw
    [-1, 1].forEach(function (side) {
      ctx.save();
      ctx.rotate(side * open);
      ctx.fillStyle = "#0b0b0d";
      ctx.strokeStyle = "#c0141c";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(38, 0);
      ctx.lineTo(6, side * 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  }

  function drawHpBar(k) {
    if (k.hp >= MAX_HP || k.eaten) return;
    const frac = Math.max(0, k.hp / MAX_HP);
    ctx.fillStyle = "rgba(16, 16, 16, 0.25)";
    ctx.fillRect(k.x - 19, k.y - 44, 38, 6);
    ctx.fillStyle = frac > 0.5 ? "#101010" : (frac > 0.25 ? "#e0b83a" : "#d71921");
    ctx.fillRect(k.x - 18, k.y - 43, 36 * frac, 4);
  }

  // The bot's name above its kart
  function drawNameplate(k) {
    if (!k.isBot || k.eaten) return;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeText(k.name.toUpperCase(), k.x, k.y - 50);
    ctx.fillStyle = "#101010";
    ctx.fillText(k.name.toUpperCase(), k.x, k.y - 50);
  }

  function drawKart(k) {
    const beast = k.beast > 0;
    const color = beast ? "#0b0b0d" : k.color;

    ctx.save();

    // being eaten: shrink into the beast's mouth
    if (k.eaten) {
      const sz = Math.max(0.05, 1 - k.eaten.t);
      ctx.translate(k.x, k.y);
      ctx.scale(sz, sz);
      ctx.translate(-k.x, -k.y);
    }

    // blink for a moment after being hit
    if ((k.flash > 0 || (k.invuln > 0 && k.shield <= 0)) && Math.floor(gameTime * 12) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    // shadow on the floor
    ctx.fillStyle = beast ? "rgba(120, 0, 0, 0.35)" : "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(k.x + 3, k.y + 6, 24, 16, k.angle, 0, TAU);
    ctx.fill();

    // stack thin layers to make the kart look raised
    const LAYERS = 6;
    for (let i = 0; i < LAYERS; i++) {
      ctx.save();
      ctx.translate(k.x, k.y - i * 1.8);
      ctx.rotate(k.angle);

      if (i < 2) {
        // wheels (only in the bottom layers)
        ctx.fillStyle = "#101010";
        ctx.fillRect(-18, -16, 12, 6);
        ctx.fillRect(-18, 10, 12, 6);
        ctx.fillRect(8, -16, 12, 6);
        ctx.fillRect(8, 10, 12, 6);
      }

      if (i < LAYERS - 1) {
        // body
        ctx.fillStyle = color;
        bodyPath(beast);
        ctx.fill();

        if (i < 2) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
          bodyPath(beast);
          ctx.fill();
        }

        if (beast && i >= 1) {
          // sharp spikes at the back
          ctx.fillStyle = "#0b0b0d";
          ctx.beginPath();
          ctx.moveTo(-21, -10);
          ctx.lineTo(-32, -13);
          ctx.lineTo(-21, -4);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-21, 10);
          ctx.lineTo(-32, 13);
          ctx.lineTo(-21, 4);
          ctx.closePath();
          ctx.fill();
        }

        if (i === LAYERS - 2) {
          // top of the body
          ctx.strokeStyle = beast ? "#c0141c" : "#101010";
          ctx.lineWidth = beast ? 1.5 : 2;
          bodyPath(beast);
          ctx.stroke();

          if (beast) {
            // glowing red eyes
            ctx.fillStyle = "#ff2a2a";
            ctx.beginPath();
            ctx.moveTo(9, -7);
            ctx.lineTo(19, -3);
            ctx.lineTo(9, -3);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(9, 7);
            ctx.lineTo(19, 3);
            ctx.lineTo(9, 3);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
            ctx.fillRect(-14, -2, 28, 4);
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(15, -6, 4, 12);
          }
        }
      } else {
        // the driver's helmet
        ctx.fillStyle = beast ? "#1a1a1d" : "#f2f1ee";
        ctx.strokeStyle = beast ? "#ff2a2a" : "#101010";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-2, 0, 7, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

    // open mouth while eating
    if (k.eating && k.eating.eaten) drawJaws(k);

    // shield bubble
    if (k.shield > 0 && (k.shield > 1.5 || Math.floor(gameTime * 10) % 2 === 0)) {
      ctx.fillStyle = "rgba(169, 212, 255, 0.28)";
      ctx.strokeStyle = "rgba(60, 130, 210, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(k.x, k.y - 6, 30, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    drawHpBar(k);
    drawNameplate(k);
  }

  // A power-up box: red and orange blended together, with nothing under it
  function drawBox(b) {
    const bob = Math.sin(gameTime * 3 + b.x) * 3;
    const lift = 10 + bob;
    const size = 26;
    const hgt = 12;
    const bx = b.x - size / 2;
    const by = b.y - size / 2;
    const topY = by - hgt - lift;
    const frontY = by + size - hgt - lift;

    ctx.strokeStyle = "#101010";
    ctx.lineWidth = 2;

    // front face: orange fading into deep red
    let blend = ctx.createLinearGradient(0, frontY, 0, frontY + hgt);
    blend.addColorStop(0, BOX_ORANGE);
    blend.addColorStop(1, BOX_DEEP_RED);
    ctx.fillStyle = blend;
    ctx.fillRect(bx, frontY, size, hgt);
    ctx.strokeRect(bx, frontY, size, hgt);

    // top face: red blending into orange
    blend = ctx.createLinearGradient(bx, topY, bx + size, topY + size);
    blend.addColorStop(0, BOX_RED);
    blend.addColorStop(1, BOX_ORANGE);
    ctx.fillStyle = blend;
    ctx.fillRect(bx, topY, size, size);
    ctx.strokeRect(bx, topY, size, size);

    // soft light border and a little shine
    ctx.strokeStyle = "rgba(255, 240, 200, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 3, topY + 3, size - 6, size - 6);
    ctx.fillStyle = "rgba(255, 255, 255, 0.28)";
    ctx.beginPath();
    ctx.moveTo(bx + 4, topY + 4);
    ctx.lineTo(bx + 15, topY + 4);
    ctx.lineTo(bx + 4, topY + 15);
    ctx.closePath();
    ctx.fill();

    // question mark
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = BOX_DEEP_RED;
    ctx.strokeText("?", b.x, topY + 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("?", b.x, topY + 20);
  }

  function drawMine(m) {
    const age = gameTime - m.born;
    const timeLeft = MINE_LIFETIME - age;

    ctx.save();
    // blink during the last moments before it disappears
    if (timeLeft < 1.5 && Math.floor(gameTime * 8) % 2 === 0) ctx.globalAlpha = 0.35;

    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.beginPath();
    ctx.ellipse(m.x + 2, m.y + 3, 13, 8, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#101010";
    ctx.beginPath();
    ctx.ellipse(m.x, m.y, 12, 8, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#3a3a3a";
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 3, 12, 8, 0, 0, TAU);
    ctx.fill();

    // blinking red light
    const on = age < 0.5 ? false : (Math.floor(gameTime * 4) % 2 === 0);
    ctx.fillStyle = on ? "#ff3b3b" : "#7a1014";
    ctx.beginPath();
    ctx.arc(m.x, m.y - 4, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // A small rocket (three of them are fired at once)
  function drawRocket(r) {
    ctx.save();
    ctx.translate(r.x, r.y - 10);
    ctx.rotate(r.angle);
    ctx.scale(0.8, 0.8);
    ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    ctx.beginPath();
    ctx.ellipse(-2, 12, 10, 4, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#d71921";
    ctx.strokeStyle = "#101010";
    ctx.lineWidth = 2;
    roundedRect(ctx, -9, -4, 18, 8, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#101010";
    ctx.beginPath();
    ctx.moveTo(9, -4);
    ctx.lineTo(15, 0);
    ctx.lineTo(9, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Small pictures for the power-up slot
  function drawPowerIcon(type, cx, cy, size) {
    const u = size / 10;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#101010";

    if (type === "rocket") {
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = "#d71921";
      roundedRect(ctx, -3 * u, -8 * u, 6 * u, 14 * u, 3 * u);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#101010";
      ctx.beginPath();
      ctx.moveTo(-3 * u, -8 * u);
      ctx.lineTo(0, -13 * u);
      ctx.lineTo(3 * u, -8 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffb400";
      ctx.beginPath();
      ctx.moveTo(-2 * u, 6 * u);
      ctx.lineTo(0, 11 * u);
      ctx.lineTo(2 * u, 6 * u);
      ctx.closePath();
      ctx.fill();
    } else if (type === "mine") {
      ctx.fillStyle = "#101010";
      ctx.beginPath();
      ctx.arc(0, 0, 6 * u, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 6 * u, Math.sin(a) * 6 * u);
        ctx.lineTo(Math.cos(a) * 9 * u, Math.sin(a) * 9 * u);
        ctx.stroke();
      }
      ctx.fillStyle = "#d71921";
      ctx.beginPath();
      ctx.arc(0, 0, 2 * u, 0, TAU);
      ctx.fill();
    } else if (type === "shield") {
      ctx.fillStyle = "#a9d4ff";
      ctx.beginPath();
      ctx.moveTo(0, -9 * u);
      ctx.lineTo(7 * u, -6 * u);
      ctx.lineTo(7 * u, 0);
      ctx.quadraticCurveTo(7 * u, 6 * u, 0, 9 * u);
      ctx.quadraticCurveTo(-7 * u, 6 * u, -7 * u, 0);
      ctx.lineTo(-7 * u, -6 * u);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (type === "beast") {
      // a pointed dark head with two red eyes
      ctx.fillStyle = "#0b0b0d";
      ctx.beginPath();
      ctx.moveTo(0, -10 * u);
      ctx.lineTo(8 * u, 6 * u);
      ctx.lineTo(0, 3 * u);
      ctx.lineTo(-8 * u, 6 * u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ff2a2a";
      ctx.fillRect(-4.5 * u, -1 * u, 3 * u, 1.6 * u);
      ctx.fillRect(1.5 * u, -1 * u, 3 * u, 1.6 * u);
    }
    ctx.restore();
  }

  // Text with a light outline, so it stays readable on top of the arena
  function outlinedText(text, x, y, color) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  function drawHud() {
    // player name and lives
    ctx.textAlign = "left";
    ctx.fillStyle = "#101010";
    ctx.font = "bold 18px monospace";
    const label = settings.name.toUpperCase();
    ctx.fillText(label, ARENA.x, 32);
    const nameWidth = ctx.measureText(label).width;
    for (let i = 0; i < START_LIVES; i++) {
      ctx.fillStyle = i < player.lives ? "#d71921" : "rgba(16, 16, 16, 0.18)";
      ctx.beginPath();
      ctx.arc(ARENA.x + nameWidth + 20 + i * 22, 26, 7, 0, TAU);
      ctx.fill();
    }

    // health bar under the name
    const frac = Math.max(0, player.hp / MAX_HP);
    ctx.fillStyle = "rgba(16, 16, 16, 0.15)";
    roundedRect(ctx, ARENA.x, 38, 140, 8, 4);
    ctx.fill();
    if (frac > 0) {
      ctx.fillStyle = frac > 0.5 ? "#101010" : (frac > 0.25 ? "#e0b83a" : "#d71921");
      roundedRect(ctx, ARENA.x, 38, Math.max(8, 140 * frac), 8, 4);
      ctx.fill();
    }

    // power-up slot in the top middle
    const sx = W / 2 - 40;
    const sy = 26;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#101010";
    ctx.lineWidth = 2;
    if (!player.powerup) ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.arc(sx, sy, 17, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.textAlign = "left";
    if (player.powerup) {
      drawPowerIcon(player.powerup, sx, sy, 11);
      ctx.fillStyle = "#101010";
      ctx.font = "bold 16px monospace";
      ctx.fillText(POWERUP_NAMES[player.powerup], sx + 26, 25);
      ctx.fillStyle = "#5d5d5a";
      ctx.font = "12px monospace";
      ctx.fillText("press SPACE", sx + 26, 40);
    } else if (player.beast > 0) {
      drawPowerIcon("beast", sx, sy, 11);
      ctx.fillStyle = "#d71921";
      ctx.font = "bold 16px monospace";
      ctx.fillText("BEAST MODE " + player.beast.toFixed(1) + "s", sx + 26, 31);
    } else if (player.shield > 0) {
      drawPowerIcon("shield", sx, sy, 11);
      ctx.fillStyle = "#3c82d2";
      ctx.font = "bold 16px monospace";
      ctx.fillText("SHIELD " + player.shield.toFixed(1) + "s", sx + 26, 31);
    } else {
      ctx.fillStyle = "#5d5d5a";
      ctx.font = "14px monospace";
      ctx.fillText("grab a box", sx + 26, 31);
    }

    // opponents and their lives (top left, inside the arena)
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    bots.forEach(function (b, i) {
      const y = ARENA.y + 24 + i * 18;
      ctx.fillStyle = b.color;
      ctx.fillRect(ARENA.x + 10, y - 9, 10, 10);
      ctx.strokeStyle = "#101010";
      ctx.lineWidth = 1;
      ctx.strokeRect(ARENA.x + 10, y - 9, 10, 10);
      outlinedText(b.name.toUpperCase(), ARENA.x + 26, y, b.out ? "#8a8a85" : "#101010");
      if (b.out) {
        outlinedText("OUT", ARENA.x + 82, y, "#d71921");
      } else {
        for (let l = 0; l < START_LIVES; l++) {
          ctx.fillStyle = l < b.lives ? "#d71921" : "rgba(16, 16, 16, 0.18)";
          ctx.beginPath();
          ctx.arc(ARENA.x + 90 + l * 12, y - 4, 4, 0, TAU);
          ctx.fill();
        }
      }
    });

    // kill feed (top left, right below the lives list)
    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    const feedTop = ARENA.y + 24 + bots.length * 18 + 14;
    let row = 0;
    for (let i = feed.length - 1; i >= 0 && row < 4; i--) {
      const age = gameTime - feed[i].born;
      if (age > 5) continue;
      ctx.globalAlpha = Math.min(1, (5 - age) / 1);
      outlinedText(feed[i].text, ARENA.x + 10, feedTop + row * 18, "#101010");
      row++;
    }
    ctx.globalAlpha = 1;

    // help text at the bottom
    ctx.textAlign = "center";
    ctx.fillStyle = "#5d5d5a";
    ctx.font = "14px monospace";
    ctx.fillText("Drive: arrows / WASD  ·  Space: power-up  ·  F: fullscreen", W / 2, 512);

    ctx.textAlign = "right";
    ctx.fillText("Sound: " + (Sfx.isMuted() ? "Off" : "On") + " (M)", ARENA.x + ARENA.w + WALL, 512);
  }

  // "3, 2, 1, GO!" before the race starts
  function drawCountdown() {
    const cx = ARENA.x + ARENA.w / 2;
    const cy = ARENA.y + ARENA.h / 2;
    ctx.textAlign = "center";
    if (countdown > 0) {
      ctx.fillStyle = "rgba(242, 241, 238, 0.55)";
      ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
      ctx.font = "bold 110px monospace";
      outlinedText(String(Math.ceil(countdown)), cx, cy + 30, "#d71921");
      ctx.font = "bold 20px monospace";
      outlinedText("GET READY", cx, cy - 70, "#101010");
    } else if (goTimer > 0) {
      ctx.font = "bold 90px monospace";
      outlinedText("GO!", cx, cy + 25, "#d71921");
    }
  }

  // The screen shown when the match is over
  function drawEndScreen() {
    ctx.fillStyle = "rgba(242, 241, 238, 0.88)";
    ctx.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);

    const cx = ARENA.x + ARENA.w / 2;
    ctx.textAlign = "center";
    ctx.fillStyle = state === "won" ? "#d71921" : "#101010";
    ctx.font = "bold 64px monospace";
    ctx.fillText(state === "won" ? "YOU WIN!" : "KNOCKED OUT", cx, 200);

    ctx.fillStyle = "#101010";
    ctx.font = "bold 22px monospace";
    if (state === "won") {
      ctx.fillText("Last kart standing", cx, 245);
    } else {
      ctx.fillText("You finished " + ordinal(place) + " of " + (bots.length + 1), cx, 245);
    }
    ctx.fillStyle = "#5d5d5a";
    ctx.font = "16px monospace";
    ctx.fillText("Knock-outs: " + (player.kills || 0) + "   ·   " + settings.difficulty + " · " + bots.length + (bots.length === 1 ? " bot" : " bots"), cx, 275);

    // Play Again button
    ctx.fillStyle = "#d71921";
    roundedRect(ctx, AGAIN_BUTTON.x, AGAIN_BUTTON.y, AGAIN_BUTTON.w, AGAIN_BUTTON.h, 27);
    ctx.fill();
    ctx.strokeStyle = "#8f0e14";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 22px monospace";
    ctx.fillText("PLAY AGAIN", cx, AGAIN_BUTTON.y + 35);

    ctx.fillStyle = "#5d5d5a";
    ctx.font = "14px monospace";
    ctx.fillText("or press ENTER  ·  use \"Back to setup\" below to change your kart or difficulty", cx, 410);
  }

  function drawParticles() {
    particles.forEach(function (p) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y - p.lift, p.size * (0.4 + 0.6 * a), 0, TAU);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticLayer, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // things lying on the floor
    mines.forEach(drawMine);

    // blocks, boxes and karts, drawn from back to front
    const things = [];
    OBSTACLES.forEach(function (o) {
      things.push({ sortY: o.y + o.h, draw: function () { drawObstacle(o); } });
    });
    boxes.forEach(function (b) {
      if (b.active) things.push({ sortY: b.y, draw: function () { drawBox(b); } });
    });
    karts.forEach(function (k) {
      things.push({ sortY: k.y, draw: function () { drawKart(k); } });
    });
    things.sort(function (a, b) { return a.sortY - b.sortY; });
    things.forEach(function (t) { t.draw(); });

    rockets.forEach(drawRocket);
    drawParticles();
    drawSouthWall();
    drawHud();

    if (state === "playing") {
      drawCountdown();
    } else {
      drawEndScreen();
    }
  }

  // ---------- Particles (sparks and smoke) ----------
  function addParticle(x, y, vx, vy, life, color, size, lift) {
    particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, maxLife: life, color: color, size: size, lift: lift || 0 });
  }

  function addExplosion(x, y, big, tint) {
    const colors = tint ? [tint, "#ffffff"] : ["#d71921", "#ffe27a", "#101010", "#ffffff"];
    const count = big ? 26 : 14;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const sp = 1 + Math.random() * (big ? 4.5 : 3);
      addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.4 + Math.random() * 0.5,
        colors[Math.floor(Math.random() * colors.length)], 3 + Math.random() * 4, 8);
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt / 60;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // ---------- Karts ----------
  function makeKart(x, y, angle, color, name) {
    return {
      x: x, y: y, angle: angle, speed: 0,
      color: color, name: name,
      lives: START_LIVES, hp: MAX_HP, kills: 0,
      powerup: null, shield: 0, beast: 0, invuln: 0, flash: 0,
      speedMul: 1, turnMul: 1,
      touchTimer: 0, turnInput: 0, out: false, isBot: false, ai: null,
      eating: null,   // the kart a beast is eating right now
      eaten: null     // set while this kart is being eaten
    };
  }

  // Moves one kart. "input" says which controls are pressed, so the
  // same code drives you and the bots.
  function stepKart(k, input, dt) {
    const sec = dt / 60;
    if (k.shield > 0) k.shield = Math.max(0, k.shield - sec);
    if (k.beast > 0) k.beast = Math.max(0, k.beast - sec);
    if (k.invuln > 0) k.invuln = Math.max(0, k.invuln - sec);
    if (k.flash > 0) k.flash = Math.max(0, k.flash - sec);
    if (k.touchTimer > 0) k.touchTimer = Math.max(0, k.touchTimer - sec);

    const topSpeed = (k.beast > 0 ? BEAST_SPEED : MAX_SPEED) * k.speedMul;

    if (input.up) {
      if (k.speed < topSpeed) k.speed = Math.min(topSpeed, k.speed + ACCEL * dt);
    } else if (input.down) {
      k.speed -= (k.speed > 0 ? BRAKE : ACCEL * 0.7) * dt;
    } else if (k.speed > 0) {
      k.speed = Math.max(0, k.speed - FRICTION * dt);
    } else if (k.speed < 0) {
      k.speed = Math.min(0, k.speed + FRICTION * dt);
    }
    if (k.speed > topSpeed) k.speed = Math.max(topSpeed, k.speed - 0.12 * dt);
    if (k.speed < -MAX_REVERSE) k.speed = -MAX_REVERSE;

    // steering
    const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let grip = Math.max(-1, Math.min(1, k.speed / 2));
    if (turn !== 0) {
      // you can turn a little even when you are almost stopped...
      if (Math.abs(grip) < 0.45 && (input.up || input.down)) {
        grip = (input.down && !input.up) ? -0.45 : 0.45;
      }
      // ...and a lot when you have just touched a wall, so you can always swing away
      if (k.touchTimer > 0 && Math.abs(grip) < 0.9) {
        grip = grip < 0 ? -0.9 : 0.9;
      }
    }
    k.angle += turn * TURN_RATE * k.turnMul * grip * dt;
    k.turnInput = turn;

    // move
    k.x += Math.cos(k.angle) * k.speed * dt;
    k.y += Math.sin(k.angle) * k.speed * dt;
  }

  // What happens when a kart pushes into a surface.
  // (nx, ny) points away from the surface, into the free space.
  function bumpKart(k, nx, ny, dt) {
    k.touchTimer = 0.35;
    const dir = k.speed >= 0 ? 1 : -1;
    const mx = Math.cos(k.angle) * dir;
    const my = Math.sin(k.angle) * dir;
    const into = -(mx * nx + my * ny);   // 1 = straight into the surface, 0 = sliding along it
    if (into <= 0.02) return;

    // a hard head-on hit bounces you back a little
    if (into > 0.7 && Math.abs(k.speed) > 1.5) {
      k.speed = -k.speed * 0.25;
      return;
    }

    // scraping along a wall only slows you a little
    k.speed *= 1 - 0.3 * into * Math.min(1, dt);

    // and, if you are not steering yourself, gently turns you so you slide along
    // the wall instead of sticking
    if (k.turnInput) return;
    const tx = mx + nx * into;
    const ty = my + ny * into;
    if (Math.hypot(tx, ty) > 0.15) {
      let target = Math.atan2(ty, tx);
      if (dir < 0) target += Math.PI;
      k.angle += angleDiff(target, k.angle) * Math.min(1, 0.18 * dt);
    }
  }

  function resolveCollisions(k, dt) {
    // walls
    const minX = ARENA.x + KART_RADIUS;
    const maxX = ARENA.x + ARENA.w - KART_RADIUS;
    const minY = ARENA.y + KART_RADIUS;
    const maxY = ARENA.y + ARENA.h - KART_RADIUS;
    if (k.x < minX) { k.x = minX; bumpKart(k, 1, 0, dt); }
    if (k.x > maxX) { k.x = maxX; bumpKart(k, -1, 0, dt); }
    if (k.y < minY) { k.y = minY; bumpKart(k, 0, 1, dt); }
    if (k.y > maxY) { k.y = maxY; bumpKart(k, 0, -1, dt); }

    // blocks
    OBSTACLES.forEach(function (o) {
      const nearestX = Math.max(o.x, Math.min(k.x, o.x + o.w));
      const nearestY = Math.max(o.y, Math.min(k.y, o.y + o.h));
      const dx = k.x - nearestX;
      const dy = k.y - nearestY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < KART_RADIUS) {
        let nx = 0;
        let ny = -1;
        if (dist === 0) {
          k.y = o.y - KART_RADIUS;
        } else {
          nx = dx / dist;
          ny = dy / dist;
          const push = KART_RADIUS - dist;
          k.x += nx * push;
          k.y += ny * push;
        }
        bumpKart(k, nx, ny, dt);
      }
    });
  }

  // Karts push each other instead of driving through each other
  function separateKarts() {
    const minDist = KART_RADIUS * 1.7;
    for (let i = 0; i < karts.length; i++) {
      for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i];
        const b = karts[j];
        if (a.out || b.out || a.eaten || b.eaten) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          if (dist === 0) { dx = 1; dy = 0; dist = 1; }
          const push = (minDist - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          a.speed *= 0.95;
          b.speed *= 0.95;
        }
      }
    }
  }

  // ---------- Health, damage and knock-outs ----------
  function addFeed(text) {
    feed.push({ text: text, born: gameTime });
    if (feed.length > 6) feed.shift();
  }

  function respawnKart(k) {
    // come back at the corner that is farthest from the other karts
    let best = SPAWN_SPOTS[0];
    let bestDist = -1;
    SPAWN_SPOTS.forEach(function (s) {
      let nearest = 9999;
      karts.forEach(function (o) {
        if (o !== k && !o.out) nearest = Math.min(nearest, Math.hypot(o.x - s.x, o.y - s.y));
      });
      if (nearest > bestDist) { bestDist = nearest; best = s; }
    });
    k.x = best.x;
    k.y = best.y;
    k.angle = Math.atan2(ARENA.y + ARENA.h / 2 - best.y, ARENA.x + ARENA.w / 2 - best.x);
    k.speed = 0;
    k.hp = MAX_HP;
    k.powerup = null;
    k.shield = 0;
    k.beast = 0;
    k.flash = 0;
    k.invuln = 2;
    k.eating = null;
    k.eaten = null;
    if (k.ai) {
      k.ai.reverse = 0;
      k.ai.stuck = 0;
      k.ai.retarget = 0;
    }
  }

  function knockOut(k, attacker, how) {
    addExplosion(k.x, k.y, true);
    Sfx.explode();
    k.lives -= 1;
    const out = k.lives <= 0;

    let text;
    if (!attacker || attacker === k) {
      text = k.name.toUpperCase() + " blew up";
    } else {
      text = attacker.name.toUpperCase() + " " + VERBS[how] + " " + k.name.toUpperCase();
      attacker.kills += 1;
    }
    if (out) text += " (OUT)";
    addFeed(text);

    if (out) {
      k.out = true;
      k.eaten = null;
      karts.forEach(function (o) {
        if (o.eating === k) o.eating = null;
      });
    } else {
      respawnKart(k);
    }
  }

  function damageKart(k, amount, attacker, how) {
    if (k.beast > 0 || k.invuln > 0 || k.eaten || k.out) return;
    if (k.shield > 0) {
      // the shield takes the hit
      k.shield = 0;
      k.invuln = 0.8;
      addExplosion(k.x, k.y, false, "#a9d4ff");
      Sfx.shieldPop();
      return;
    }
    k.hp -= amount;
    k.flash = 0.3;
    k.speed *= 0.5;
    if (k.hp <= 0) {
      knockOut(k, attacker, how);
    } else {
      addExplosion(k.x, k.y, false);
      Sfx.hit();
    }
  }

  // ---------- Beast mode: eat other karts ----------
  function updateBeasts() {
    karts.forEach(function (b) {
      if (b.beast <= 0 || b.eating || b.eaten || b.out) return;
      for (let i = 0; i < karts.length; i++) {
        const v = karts[i];
        if (v === b || v.out || v.eaten || v.beast > 0 || v.invuln > 0 || v.shield > 0) continue;  // a shield protects against everything
        if (Math.hypot(v.x - b.x, v.y - b.y) < KART_RADIUS * 2) {
          v.eaten = { by: b, t: 0 };
          b.eating = v;
          Sfx.eat();
          break;
        }
      }
    });
  }

  function updateEaten(v, dt) {
    const b = v.eaten.by;
    v.eaten.t += dt / 60 / EAT_TIME;
    // slide into the beast's mouth
    const mouthX = b.x + Math.cos(b.angle) * 30;
    const mouthY = b.y + Math.sin(b.angle) * 30;
    const pull = Math.min(1, 0.3 * dt);
    v.x += (mouthX - v.x) * pull;
    v.y += (mouthY - v.y) * pull;

    if (v.eaten.t >= 1) {
      b.eating = null;
      v.eaten = null;
      addExplosion(v.x, v.y, false, "#101010");
      knockOut(v, b, "beast");
    }
  }

  // ---------- Power-ups ----------
  function randomPowerup() {
    let r = Math.random() * 100;
    for (let i = 0; i < POWERUP_WEIGHTS.length; i++) {
      r -= POWERUP_WEIGHTS[i].weight;
      if (r <= 0) return POWERUP_WEIGHTS[i].type;
    }
    return POWERUP_WEIGHTS[0].type;
  }

  function usePowerup(k) {
    if (!k.powerup || k.eaten || k.out) return;
    const type = k.powerup;
    const dirX = Math.cos(k.angle);
    const dirY = Math.sin(k.angle);

    if (type === "beast") {
      k.beast = BEAST_TIME;
      Sfx.beast();
    } else if (type === "shield") {
      k.shield = SHIELD_TIME;
      Sfx.shield();
    } else if (type === "mine") {
      const mx = Math.max(ARENA.x + 12, Math.min(ARENA.x + ARENA.w - 12, k.x - dirX * 32));
      const my = Math.max(ARENA.y + 12, Math.min(ARENA.y + ARENA.h - 12, k.y - dirY * 32));
      mines.push({ x: mx, y: my, owner: k, born: gameTime });
      Sfx.mine();
    } else if (type === "rocket") {
      // three small rockets in a narrow fan, so they are easier to aim
      const spread = [-0.07, 0, 0.07];
      const sideX = -dirY;
      const sideY = dirX;
      spread.forEach(function (offset, i) {
        const sideways = (i - 1) * 9;
        rockets.push({
          x: k.x + dirX * 28 + sideX * sideways,
          y: k.y + dirY * 28 + sideY * sideways,
          angle: k.angle + offset,
          owner: k,
          born: gameTime,
          damage: ROCKET_DAMAGE
        });
      });
      Sfx.rocket();
    }
    k.powerup = null;
  }

  function updateBoxes() {
    boxes.forEach(function (b) {
      if (!b.active) {
        if (gameTime >= b.respawnAt) b.active = true;
        return;
      }
      karts.forEach(function (k) {
        if (!b.active || k.powerup || k.eaten || k.out) return;
        if (Math.hypot(k.x - b.x, k.y - b.y) < KART_RADIUS + 14) {
          k.powerup = randomPowerup();
          if (k.ai) k.ai.hold = 0;
          b.active = false;
          b.respawnAt = gameTime + BOX_RESPAWN_SECONDS;
          if (k === player) Sfx.pickup();
        }
      });
    });
  }

  function updateWeapons(dt) {
    // rockets
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.x += Math.cos(r.angle) * ROCKET_SPEED * dt;
      r.y += Math.sin(r.angle) * ROCKET_SPEED * dt;
      addParticle(r.x, r.y, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.25,
        Math.random() < 0.5 ? "#ffb400" : "#8a8a85", 2 + Math.random() * 2, 10);

      let boom = false;
      if (r.x < ARENA.x || r.x > ARENA.x + ARENA.w || r.y < ARENA.y || r.y > ARENA.y + ARENA.h) boom = true;
      OBSTACLES.forEach(function (o) {
        if (r.x > o.x && r.x < o.x + o.w && r.y > o.y && r.y < o.y + o.h) boom = true;
      });
      karts.forEach(function (k) {
        if (k !== r.owner && !k.eaten && !k.out && Math.hypot(k.x - r.x, k.y - r.y) < KART_RADIUS + 8) {
          boom = true;
          damageKart(k, r.damage, r.owner, "rocket");
        }
      });
      if (gameTime - r.born > 3) boom = true;

      if (boom) {
        addExplosion(r.x, r.y, false);
        rockets.splice(i, 1);
      }
    }

    // mines
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      const age = gameTime - m.born;
      if (age > MINE_LIFETIME) {
        mines.splice(i, 1);
        continue;
      }
      if (age < 0.5) continue;
      for (let j = 0; j < karts.length; j++) {
        const k = karts[j];
        if (k.eaten || k.out || k.beast > 0) continue;
        if (k === m.owner && age < 1.5) continue;
        if (Math.hypot(k.x - m.x, k.y - m.y) < KART_RADIUS + 10) {
          addExplosion(m.x, m.y, true);
          damageKart(k, MINE_DAMAGE, m.owner, "mine");
          Sfx.explode();
          mines.splice(i, 1);
          break;
        }
      }
    }
  }

  // ---------- Bots ----------
  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  // Turns one "skill" number into everything a bot needs
  function botParams(skill, focus) {
    return {
      skill: skill,
      speed: 0.60 + 0.40 * skill,            // how fast it drives compared with you
      turn: 0.75 + 0.40 * skill,             // how sharply it steers
      aim: Math.max(0.08, 0.42 - 0.31 * skill),         // how exactly it must aim before firing (smaller = better)
      aimNoise: Math.max(0.02, 0.55 - 0.50 * skill),    // how much it wobbles while chasing
      reaction: Math.max(0.2, 1.6 - 1.3 * skill),       // seconds it waits before using a power-up
      lead: clamp01((skill - 0.4) / 0.5),    // aims where you WILL be, not where you are
      dodge: clamp01((skill - 0.35) / 0.5),  // chance to notice rockets and mines and dodge them
      focus: focus                           // how often it goes after you instead of other bots
    };
  }

  function newAI(params) {
    return {
      diff: params,
      target: { x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2 },
      retarget: 0,
      noise: 0,
      stuck: 0,
      reverse: 0,
      reverseTurn: 1,
      hold: 0,
      chasePlayer: false,
      reroll: 0,
      noticed: new WeakMap()
    };
  }

  function makeBot(index, color, level, count) {
    const params = botParams(SKILL[level][count - 1], FOCUS[level]);
    const start = BOT_STARTS[count][index];
    const bot = makeKart(start.x, start.y, start.angle, color, BOT_NAMES[index]);
    bot.isBot = true;
    bot.speedMul = params.speed;
    bot.turnMul = params.turn;
    bot.ai = newAI(params);
    return bot;
  }

  function enemiesOf(k) {
    return karts.filter(function (o) {
      return o !== k && !o.out && !o.eaten;
    });
  }

  function nearestEnemy(k) {
    let best = null;
    let bestDist = 1e9;
    enemiesOf(k).forEach(function (o) {
      const d = Math.hypot(o.x - k.x, o.y - k.y);
      if (d < bestDist) { bestDist = d; best = o; }
    });
    return best;
  }

  // The closest kart a beast can actually eat (a shield protects against everything)
  function nearestPrey(k) {
    let best = null;
    let bestDist = 1e9;
    enemiesOf(k).forEach(function (o) {
      if (o.shield > 0 || o.beast > 0) return;
      const d = Math.hypot(o.x - k.x, o.y - k.y);
      if (d < bestDist) { bestDist = d; best = o; }
    });
    return best;
  }

  // Who does this bot go after? Sometimes you, sometimes whoever is closest.
  function pickFoe(k) {
    const ai = k.ai;
    if (ai.chasePlayer && player !== k && !player.out && !player.eaten) return player;
    return nearestEnemy(k);
  }

  // Where will this kart be soon? (strong bots aim there instead of where you are now)
  function predictPos(o, dist, lead) {
    if (!lead) return { x: o.x, y: o.y };
    const frames = dist / ROCKET_SPEED;
    const x = o.x + Math.cos(o.angle) * o.speed * frames * lead;
    const y = o.y + Math.sin(o.angle) * o.speed * frames * lead;
    return {
      x: Math.max(ARENA.x, Math.min(ARENA.x + ARENA.w, x)),
      y: Math.max(ARENA.y, Math.min(ARENA.y + ARENA.h, y))
    };
  }

  // Is this spot too close to a wall or a block for a kart to drive through?
  function botBlocked(px, py) {
    const margin = 26;
    if (px < ARENA.x + margin || px > ARENA.x + ARENA.w - margin ||
        py < ARENA.y + margin || py > ARENA.y + ARENA.h - margin) return true;
    for (let i = 0; i < OBSTACLES.length; i++) {
      const o = OBSTACLES[i];
      if (px > o.x - margin && px < o.x + o.w + margin && py > o.y - margin && py < o.y + o.h + margin) return true;
    }
    return false;
  }

  // Is a mine lying close to this spot? (good bots drive around mines)
  function mineNear(px, py, k) {
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      if (m.owner === k && gameTime - m.born < 1.5) continue;
      if (Math.hypot(px - m.x, py - m.y) < 34) return true;
    }
    return false;
  }

  // Is there a block between two points? (rockets cannot fly through blocks)
  function lineBlocked(x1, y1, x2, y2) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.ceil(dist / 14);
    for (let s = 1; s < steps; s++) {
      const px = x1 + (x2 - x1) * (s / steps);
      const py = y1 + (y2 - y1) * (s / steps);
      for (let i = 0; i < OBSTACLES.length; i++) {
        const o = OBSTACLES[i];
        if (px > o.x - 4 && px < o.x + o.w + 4 && py > o.y - 4 && py < o.y + o.h + 4) return true;
      }
    }
    return false;
  }

  // Is a rocket flying straight at this kart?
  function incomingRocket(k) {
    let found = null;
    for (let i = 0; i < rockets.length; i++) {
      const r = rockets[i];
      if (r.owner === k) continue;
      const dx = k.x - r.x;
      const dy = k.y - r.y;
      const dirX = Math.cos(r.angle);
      const dirY = Math.sin(r.angle);
      const along = dx * dirX + dy * dirY;      // how far ahead of the rocket we are
      if (along < 20 || along > 260) continue;
      const side = dirX * dy - dirY * dx;       // how far to the side of its path we are
      if (Math.abs(side) > 36) continue;
      if (!found || along < found.along) found = { r: r, along: along, side: side };
    }
    return found;
  }

  // Decide what the bot is heading for: a box, an enemy, or just a wander spot
  function botChooseTarget(k) {
    const ai = k.ai;

    if (k.beast > 0) {
      const prey = nearestPrey(k) || nearestEnemy(k);
      if (prey) {
        ai.target = { kart: prey };
        return;
      }
    }

    if (!k.powerup) {
      let best = null;
      let bestDist = 1e9;
      boxes.forEach(function (b) {
        if (!b.active) return;
        const d = Math.hypot(b.x - k.x, b.y - k.y);
        if (d < bestDist) { bestDist = d; best = b; }
      });
      if (best) {
        ai.target = { x: best.x, y: best.y };
        return;
      }
    }

    const foe = pickFoe(k);
    if (foe) {
      ai.target = { kart: foe };
      return;
    }

    ai.target = {
      x: ARENA.x + 60 + Math.random() * (ARENA.w - 120),
      y: ARENA.y + 60 + Math.random() * (ARENA.h - 120)
    };
  }

  // Bots use their power-up when it makes sense
  function botUsePowerup(k) {
    const ai = k.ai;
    const d = ai.diff;
    if (!k.powerup || ai.hold < d.reaction) return;
    const foes = enemiesOf(k);
    if (foes.length === 0) return;
    const near = nearestEnemy(k);
    const nearDist = Math.hypot(near.x - k.x, near.y - k.y);

    if (k.powerup === "rocket") {
      for (let i = 0; i < foes.length; i++) {
        const o = foes[i];
        if (o.beast > 0) continue;   // rockets do nothing to a beast
        const dist = Math.hypot(o.x - k.x, o.y - k.y);
        if (dist < 70 || dist > 420) continue;
        const spot = predictPos(o, dist, d.lead);
        const aimOff = Math.abs(angleDiff(Math.atan2(spot.y - k.y, spot.x - k.x), k.angle));
        if (aimOff < d.aim && !lineBlocked(k.x, k.y, spot.x, spot.y)) {
          usePowerup(k);
          return;
        }
      }
      if (ai.hold > 9) usePowerup(k);   // do not carry it around forever
    } else if (k.powerup === "mine") {
      for (let i = 0; i < foes.length; i++) {
        const o = foes[i];
        const dist = Math.hypot(o.x - k.x, o.y - k.y);
        const behind = Math.abs(angleDiff(Math.atan2(o.y - k.y, o.x - k.x) + Math.PI, k.angle)) < 0.7;
        if (dist < 170 && behind) {
          usePowerup(k);
          return;
        }
      }
      if (ai.hold > 7) usePowerup(k);
    } else if (k.powerup === "shield") {
      if (nearDist < 220 || k.hp < 60 || ai.hold > 6) usePowerup(k);
    } else if (k.powerup === "beast") {
      const prey = nearestPrey(k);
      const preyDist = prey ? Math.hypot(prey.x - k.x, prey.y - k.y) : 9999;
      if (preyDist < 300 || ai.hold > 6) usePowerup(k);
    }
  }

  // Works out which controls the bot "presses" this frame
  function botInput(k, dt) {
    const ai = k.ai;
    const d = ai.diff;
    const sec = dt / 60;
    const input = { up: false, down: false, left: false, right: false };

    // backing out of a corner
    if (ai.reverse > 0) {
      ai.reverse -= sec;
      input.down = true;
      if (ai.reverseTurn > 0) input.right = true; else input.left = true;
      return input;
    }

    if (k.powerup) ai.hold += sec; else ai.hold = 0;

    // every few seconds, decide whether to go after you or after whoever is closest
    ai.reroll -= sec;
    if (ai.reroll <= 0) {
      ai.chasePlayer = Math.random() < d.focus;
      ai.reroll = 3 + Math.random() * 3;
    }

    // pick a new target every so often
    ai.retarget -= sec;
    const t0 = ai.target;
    if (ai.retarget <= 0 || (t0.kart && (t0.kart.out || t0.kart.eaten))) {
      botChooseTarget(k);
      ai.retarget = 0.35 + Math.random() * 0.35;
      ai.noise = (Math.random() - 0.5) * d.aimNoise * 2;
    }

    const t = ai.target;
    let tx = t.x;
    let ty = t.y;
    if (t.kart) {
      const spot = predictPos(t.kart, Math.hypot(t.kart.x - k.x, t.kart.y - k.y), d.lead * 0.6);
      tx = spot.x;
      ty = spot.y;
    }
    let steer = angleDiff(Math.atan2(ty - k.y, tx - k.x) + ai.noise, k.angle);

    // strong bots dodge incoming rockets
    let dodging = false;
    if (d.dodge > 0.25) {
      const threat = incomingRocket(k);
      if (threat) {
        if (!ai.noticed.has(threat.r)) ai.noticed.set(threat.r, Math.random() < d.dodge);
        if (ai.noticed.get(threat.r)) {
          const sideSign = threat.side >= 0 ? 1 : -1;
          steer = angleDiff(threat.r.angle + sideSign * Math.PI / 2, k.angle);
          dodging = true;
          if (k.powerup === "shield" && d.dodge > 0.5 && threat.along < 170) usePowerup(k);
        }
      }
    }

    // look ahead for walls, blocks and (for good bots) mines, and steer around them
    const avoidMines = d.dodge > 0.3;
    const probe = function (a, dist) {
      const px = k.x + Math.cos(a) * dist;
      const py = k.y + Math.sin(a) * dist;
      return botBlocked(px, py) || (avoidMines && mineNear(px, py, k));
    };
    const centerBlocked = probe(k.angle, 70) || probe(k.angle, 40);
    const leftBlocked = probe(k.angle - 0.6, 60);
    const rightBlocked = probe(k.angle + 0.6, 60);

    if (centerBlocked) {
      if (!leftBlocked && !rightBlocked) steer = (steer >= 0 ? 1 : -1) * 1.3;
      else if (!leftBlocked) steer = -1.3;
      else if (!rightBlocked) steer = 1.3;
      else steer = ai.reverseTurn * 1.3;
    } else if (leftBlocked && !rightBlocked) {
      steer = Math.max(steer, 0.5);
    } else if (rightBlocked && !leftBlocked) {
      steer = Math.min(steer, -0.5);
    }

    if (steer > 0.08) input.right = true;
    else if (steer < -0.08) input.left = true;

    input.up = true;
    if (!dodging && Math.abs(steer) > 1.4 && k.speed > 2.5) input.up = false;

    // not getting anywhere? reverse for a moment
    if (Math.abs(k.speed) < 0.6) ai.stuck += sec; else ai.stuck = 0;
    if (ai.stuck > 0.8) {
      ai.stuck = 0;
      ai.reverse = 0.7;
      ai.reverseTurn = Math.random() < 0.5 ? 1 : -1;
    }

    botUsePowerup(k);
    return input;
  }

  // ---------- The game loop ----------
  function resetWorld() {
    gameTime = 0;
    state = "playing";
    countdown = COUNTDOWN_SECONDS;
    goTimer = 0;
    lastTick = COUNTDOWN_SECONDS + 1;
    place = 1;
    feed = [];
    mines = [];
    rockets = [];
    particles = [];

    player = makeKart(130, ARENA.y + ARENA.h / 2, 0, settings.kartColor, settings.name);
    karts = [player];

    // how many bots, and how tough (the bots get kart colors different from yours)
    const level = SKILL[settings.difficulty] ? settings.difficulty : "medium";
    const count = Math.max(1, Math.min(3, parseInt(settings.botCount, 10) || 2));
    const colors = BOT_COLORS.filter(function (c) { return c !== settings.kartColor; });
    bots = [];
    for (let i = 0; i < count; i++) {
      const bot = makeBot(i, colors[i], level, count);
      bots.push(bot);
      karts.push(bot);
    }

    boxes = BOX_SPOTS.map(function (s) {
      return { x: s.x, y: s.y, active: true, respawnAt: 0 };
    });
  }

  function restart() {
    resetWorld();
    keys = {};
  }

  function playerInput() {
    return {
      up: keys.ArrowUp || keys.KeyW,
      down: keys.ArrowDown || keys.KeyS,
      left: keys.ArrowLeft || keys.KeyA,
      right: keys.ArrowRight || keys.KeyD
    };
  }

  function update(dt) {
    gameTime += dt / 60;
    updateParticles(dt);
    if (state !== "playing") return;

    // 3, 2, 1, GO!
    if (countdown > 0) {
      countdown -= dt / 60;
      const shown = Math.ceil(countdown);
      if (shown > 0 && shown < lastTick) {
        lastTick = shown;
        Sfx.tick();
      }
      if (countdown <= 0) {
        goTimer = 0.8;
        Sfx.go();
      }
      return;
    }
    if (goTimer > 0) goTimer -= dt / 60;

    // drive everyone
    karts.forEach(function (k) {
      if (k.out) return;
      if (k.eaten) {
        updateEaten(k, dt);
        return;
      }
      const input = k.isBot ? botInput(k, dt) : playerInput();
      stepKart(k, input, dt);
    });
    separateKarts();
    karts.forEach(function (k) {
      if (!k.out && !k.eaten) resolveCollisions(k, dt);
    });

    updateBeasts();
    updateBoxes();
    updateWeapons(dt);

    // remove karts that are out, then see if the match is over
    karts = karts.filter(function (k) { return !k.out; });
    if (player.out) {
      state = "lost";
      place = karts.length + 1;
      Sfx.lose();
    } else if (karts.length === 1) {
      state = "won";
      Sfx.win();
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 16.667, 3); // 1 = one frame at 60 per second
    lastTime = now;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  // ---------- Start and stop (called from play.js) ----------
  function start(chosenSettings) {
    settings = chosenSettings;
    Sfx.init();
    resetWorld();
    keys = {};
    running = true;
    fitCanvas();
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  return { start: start, stop: stop };
})();