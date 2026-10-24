// =====================================================
//  Gomtinagar Karts: game engine (Stage 6)
//  Arena, 2.5D drawing, driving, power-ups and sounds.
//  Bots and real lives come in Stage 7.
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
    boost: function () {
      noise(0.5, 0.2, 4000);
      tone(200, 800, 0.5, "sawtooth", 0.1);
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

  // ---------- The arena ----------
  const ARENA = { x: 50, y: 66, w: 800, h: 400 };
  const WALL = 14;
  const FRONT = 12;
  const KART_RADIUS = 18;

  // Solid blocks. "hgt" is how tall they look.
  const OBSTACLES = [
    { x: 415, y: 231, w: 70, h: 70, hgt: 26, top: "#d71921", front: "#8f0e14" },
    { x: 210, y: 146, w: 60, h: 60, hgt: 20, top: "#a9d4ff", front: "#6fa8dc" },
    { x: 630, y: 146, w: 60, h: 60, hgt: 20, top: "#ffe27a", front: "#d9b43a" },
    { x: 210, y: 326, w: 60, h: 60, hgt: 20, top: "#ffe27a", front: "#d9b43a" },
    { x: 630, y: 326, w: 60, h: 60, hgt: 20, top: "#a9d4ff", front: "#6fa8dc" }
  ];

  // Where the power-up boxes sit
  const BOX_SPOTS = [
    { x: 450, y: 126 }, { x: 450, y: 406 },
    { x: 140, y: 126 }, { x: 140, y: 406 },
    { x: 760, y: 126 }, { x: 760, y: 406 },
    { x: 330, y: 266 }, { x: 570, y: 266 }
  ];
  const BOX_RESPAWN_SECONDS = 8;

  const POWERUPS = ["rocket", "mine", "shield", "boost"];
  const POWERUP_NAMES = { rocket: "ROCKET", mine: "MINE", shield: "SHIELD", boost: "BOOST" };

  // ---------- Driving feel (you can tweak these later) ----------
  const MAX_SPEED = 4.4;
  const BOOST_SPEED = 7;
  const MAX_REVERSE = 1.8;
  const ACCEL = 0.11;
  const BRAKE = 0.22;
  const FRICTION = 0.05;
  const TURN_RATE = 0.05;
  const ROCKET_SPEED = 9;

  // ---------- Game state ----------
  let running = false;
  let rafId = null;
  let lastTime = 0;
  let gameTime = 0;      // seconds since the match started
  let settings = null;
  let keys = {};
  let player = null;
  let karts = [];
  let boxes = [];
  let mines = [];
  let rockets = [];
  let particles = [];
  let staticLayer = null;

  // ---------- Keyboard ----------
  const BLOCKED_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];

  window.addEventListener("keydown", function (e) {
    if (!running) return;
    keys[e.code] = true;
    if (BLOCKED_KEYS.indexOf(e.code) !== -1) e.preventDefault(); // stop the page from scrolling
    if (e.code === "Space" && !e.repeat) usePowerup(player);
    if (e.code === "KeyM" && !e.repeat) Sfx.toggleMute();
  });

  window.addEventListener("keyup", function (e) {
    keys[e.code] = false;
  });

  window.addEventListener("blur", function () {
    keys = {};
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

  // A red and white striped barrier, like the edge of a real kart track
  function stripedBand(g, x, y, w, h, horizontal) {
    const seg = 28;
    const len = horizontal ? w : h;
    for (let i = 0, p = 0; p < len; i++, p += seg) {
      g.fillStyle = (i % 2 === 0) ? "#d71921" : "#ffffff";
      const l = Math.min(seg, len - p);
      if (horizontal) {
        g.fillRect(x + p, y, l, h);
      } else {
        g.fillRect(x, y + p, w, l);
      }
    }
    g.strokeStyle = "#101010";
    g.lineWidth = 1.5;
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
    stripedBand(g, ARENA.x - WALL, ARENA.y - WALL, ARENA.w + 2 * WALL, WALL, true);
    stripedBand(g, ARENA.x - WALL, ARENA.y, WALL, ARENA.h, false);
    stripedBand(g, ARENA.x + ARENA.w, ARENA.y, WALL, ARENA.h, false);

    return c;
  }

  staticLayer = buildStaticLayer(1);

  // The south barrier is in front of everything, so it is drawn last.
  function drawSouthWall() {
    stripedBand(ctx, ARENA.x - WALL, ARENA.y + ARENA.h, ARENA.w + 2 * WALL, WALL, true);
    ctx.fillStyle = "#cfccc4";
    ctx.fillRect(ARENA.x - WALL, ARENA.y + ARENA.h + WALL, ARENA.w + 2 * WALL, FRONT);
    ctx.strokeStyle = "#101010";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ARENA.x - WALL, ARENA.y + ARENA.h + WALL, ARENA.w + 2 * WALL, FRONT);
  }

  function drawObstacle(o) {
    // shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(o.x + 7, o.y + 7, o.w, o.h);

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

  function drawKart(k) {
    ctx.save();
    // blink for a moment after being hit
    if (k.invuln > 0 && k.shield <= 0 && Math.floor(gameTime * 12) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    // shadow on the floor
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
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
        ctx.fillStyle = k.color;
        roundedRect(ctx, -20, -12, 40, 24, 8);
        ctx.fill();

        if (i < 2) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
          roundedRect(ctx, -20, -12, 40, 24, 8);
          ctx.fill();
        }

        if (i === LAYERS - 2) {
          // top of the body: outline, stripe and headlight
          ctx.strokeStyle = "#101010";
          ctx.lineWidth = 2;
          roundedRect(ctx, -20, -12, 40, 24, 8);
          ctx.stroke();
          ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
          ctx.fillRect(-14, -2, 28, 4);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(15, -6, 4, 12);
        }
      } else {
        // the driver's helmet
        ctx.fillStyle = "#f2f1ee";
        ctx.strokeStyle = "#101010";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-2, 0, 7, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }

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
  }

  function drawBox(b) {
    const bob = Math.sin(gameTime * 3 + b.x) * 3;
    const lift = 10 + bob;
    const size = 26;
    const hgt = 12;
    const bx = b.x - size / 2;
    const by = b.y - size / 2;

    // shadow on the floor
    ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 8, 16, 9, 0, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = "#101010";
    ctx.lineWidth = 2;

    // front face
    ctx.fillStyle = "#d9d6cf";
    ctx.fillRect(bx, by + size - hgt - lift, size, hgt);
    ctx.strokeRect(bx, by + size - hgt - lift, size, hgt);

    // top face with a question mark
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bx, by - hgt - lift, size, size);
    ctx.strokeRect(bx, by - hgt - lift, size, size);

    ctx.fillStyle = "#d71921";
    ctx.font = "bold 20px monospace";
    ctx.textAlign = "center";
    ctx.fillText("?", b.x, by - hgt - lift + 20);
  }

  function drawMine(m) {
    const age = gameTime - m.born;
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
  }

  function drawRocket(r) {
    ctx.save();
    ctx.translate(r.x, r.y - 10);
    ctx.rotate(r.angle);
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
    } else if (type === "boost") {
      ctx.strokeStyle = "#d71921";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-6 * u, (-2 + i * 5) * u);
        ctx.lineTo(0, (-7 + i * 5) * u);
        ctx.lineTo(6 * u, (-2 + i * 5) * u);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawHud() {
    // player name and lives (lives are display only until Stage 7)
    ctx.textAlign = "left";
    ctx.fillStyle = "#101010";
    ctx.font = "bold 18px monospace";
    const label = settings.name.toUpperCase();
    ctx.fillText(label, ARENA.x, 32);
    const nameWidth = ctx.measureText(label).width;
    for (let i = 0; i < player.lives; i++) {
      ctx.fillStyle = "#d71921";
      ctx.beginPath();
      ctx.arc(ARENA.x + nameWidth + 20 + i * 22, 26, 7, 0, TAU);
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
    } else {
      ctx.fillStyle = "#5d5d5a";
      ctx.font = "14px monospace";
      ctx.fillText("grab a box", sx + 26, 31);
    }

    // help text at the bottom
    ctx.textAlign = "center";
    ctx.fillStyle = "#5d5d5a";
    ctx.font = "14px monospace";
    ctx.fillText("Drive: arrows / WASD  ·  Space: power-up  ·  F: fullscreen", W / 2, 512);

    ctx.textAlign = "right";
    ctx.fillText("Sound: " + (Sfx.isMuted() ? "Off" : "On") + " (M)", ARENA.x + ARENA.w + WALL, 512);
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
      color: color, name: name, lives: 3,
      powerup: null, shield: 0, boost: 0, spin: 0, invuln: 0
    };
  }

  // Moves one kart. "input" says which controls are pressed, so the
  // same code can drive the bots in Stage 7.
  function stepKart(k, input, dt) {
    const sec = dt / 60;
    if (k.shield > 0) k.shield = Math.max(0, k.shield - sec);
    if (k.boost > 0) k.boost = Math.max(0, k.boost - sec);
    if (k.invuln > 0) k.invuln = Math.max(0, k.invuln - sec);

    if (k.spin > 0) {
      // spinning out after a hit: no control for a moment
      k.spin = Math.max(0, k.spin - sec);
      k.angle += 0.35 * dt;
      k.speed = 0;
      return;
    }

    if (k.boost > 0) {
      k.speed = Math.min(BOOST_SPEED, k.speed + 0.35 * dt);
      addParticle(k.x - Math.cos(k.angle) * 24, k.y - Math.sin(k.angle) * 24,
        -Math.cos(k.angle) * 1.5 + (Math.random() - 0.5), -Math.sin(k.angle) * 1.5 + (Math.random() - 0.5),
        0.3, Math.random() < 0.5 ? "#ffb400" : "#d71921", 3 + Math.random() * 2, 4);
    } else {
      if (input.up) {
        if (k.speed < MAX_SPEED) k.speed = Math.min(MAX_SPEED, k.speed + ACCEL * dt);
      } else if (input.down) {
        k.speed -= (k.speed > 0 ? BRAKE : ACCEL * 0.7) * dt;
      } else if (k.speed > 0) {
        k.speed = Math.max(0, k.speed - FRICTION * dt);
      } else if (k.speed < 0) {
        k.speed = Math.min(0, k.speed + FRICTION * dt);
      }
      if (k.speed > MAX_SPEED) k.speed = Math.max(MAX_SPEED, k.speed - 0.12 * dt);
    }
    if (k.speed < -MAX_REVERSE) k.speed = -MAX_REVERSE;

    // steering (only works while moving)
    const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const grip = Math.max(-1, Math.min(1, k.speed / 2));
    k.angle += turn * TURN_RATE * grip * dt;

    // move
    k.x += Math.cos(k.angle) * k.speed * dt;
    k.y += Math.sin(k.angle) * k.speed * dt;
  }

  function resolveCollisions(k) {
    // walls
    const minX = ARENA.x + KART_RADIUS;
    const maxX = ARENA.x + ARENA.w - KART_RADIUS;
    const minY = ARENA.y + KART_RADIUS;
    const maxY = ARENA.y + ARENA.h - KART_RADIUS;
    if (k.x < minX) { k.x = minX; k.speed *= 0.7; }
    if (k.x > maxX) { k.x = maxX; k.speed *= 0.7; }
    if (k.y < minY) { k.y = minY; k.speed *= 0.7; }
    if (k.y > maxY) { k.y = maxY; k.speed *= 0.7; }

    // blocks
    OBSTACLES.forEach(function (o) {
      const nearestX = Math.max(o.x, Math.min(k.x, o.x + o.w));
      const nearestY = Math.max(o.y, Math.min(k.y, o.y + o.h));
      const dx = k.x - nearestX;
      const dy = k.y - nearestY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < KART_RADIUS) {
        if (dist === 0) {
          k.y = o.y - KART_RADIUS;
        } else {
          const push = KART_RADIUS - dist;
          k.x += (dx / dist) * push;
          k.y += (dy / dist) * push;
        }
        k.speed *= 0.7;
      }
    });
  }

  // A kart gets hit by a rocket or a mine.
  function hitKart(k) {
    if (k.invuln > 0) return;
    if (k.shield > 0) {
      // the shield takes the hit
      k.shield = 0;
      k.invuln = 0.8;
      addExplosion(k.x, k.y, false, "#a9d4ff");
      Sfx.shieldPop();
      return;
    }
    // spin out (real lives are added in Stage 7)
    k.spin = 1.0;
    k.invuln = 2.0;
    k.speed = 0;
    k.boost = 0;
    addExplosion(k.x, k.y, true);
    Sfx.explode();
  }

  // ---------- Power-ups ----------
  function usePowerup(k) {
    if (!k.powerup || k.spin > 0) return;
    const type = k.powerup;
    const dirX = Math.cos(k.angle);
    const dirY = Math.sin(k.angle);

    if (type === "boost") {
      k.boost = 1.8;
      Sfx.boost();
    } else if (type === "shield") {
      k.shield = 6;
      Sfx.shield();
    } else if (type === "mine") {
      const mx = Math.max(ARENA.x + 12, Math.min(ARENA.x + ARENA.w - 12, k.x - dirX * 32));
      const my = Math.max(ARENA.y + 12, Math.min(ARENA.y + ARENA.h - 12, k.y - dirY * 32));
      mines.push({ x: mx, y: my, owner: k, born: gameTime });
      Sfx.mine();
    } else if (type === "rocket") {
      rockets.push({ x: k.x + dirX * 28, y: k.y + dirY * 28, angle: k.angle, owner: k, born: gameTime });
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
        if (!b.active || k.powerup || k.spin > 0) return;
        if (Math.hypot(k.x - b.x, k.y - b.y) < KART_RADIUS + 14) {
          k.powerup = POWERUPS[Math.floor(Math.random() * POWERUPS.length)];
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
      addParticle(r.x, r.y, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.3,
        Math.random() < 0.5 ? "#ffb400" : "#8a8a85", 3 + Math.random() * 2, 10);

      let boom = false;
      if (r.x < ARENA.x || r.x > ARENA.x + ARENA.w || r.y < ARENA.y || r.y > ARENA.y + ARENA.h) boom = true;
      OBSTACLES.forEach(function (o) {
        if (r.x > o.x && r.x < o.x + o.w && r.y > o.y && r.y < o.y + o.h) boom = true;
      });
      karts.forEach(function (k) {
        if (k !== r.owner && Math.hypot(k.x - r.x, k.y - r.y) < KART_RADIUS + 6) {
          boom = true;
          hitKart(k);
        }
      });
      if (gameTime - r.born > 3) boom = true;

      if (boom) {
        addExplosion(r.x, r.y, false);
        Sfx.explode();
        rockets.splice(i, 1);
      }
    }

    // mines
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      const age = gameTime - m.born;
      if (age > 25) {
        mines.splice(i, 1);
        continue;
      }
      if (age < 0.5) continue;
      for (let j = 0; j < karts.length; j++) {
        const k = karts[j];
        if (k === m.owner && age < 1.5) continue;
        if (Math.hypot(k.x - m.x, k.y - m.y) < KART_RADIUS + 10) {
          addExplosion(m.x, m.y, true);
          Sfx.explode();
          hitKart(k);
          mines.splice(i, 1);
          break;
        }
      }
    }
  }

  // ---------- The game loop ----------
  function resetWorld() {
    gameTime = 0;
    player = makeKart(130, ARENA.y + ARENA.h / 2, 0, settings.kartColor, settings.name);
    karts = [player];
    boxes = BOX_SPOTS.map(function (s) {
      return { x: s.x, y: s.y, active: true, respawnAt: 0 };
    });
    mines = [];
    rockets = [];
    particles = [];
  }

  function update(dt) {
    gameTime += dt / 60;

    const input = {
      up: keys.ArrowUp || keys.KeyW,
      down: keys.ArrowDown || keys.KeyS,
      left: keys.ArrowLeft || keys.KeyA,
      right: keys.ArrowRight || keys.KeyD
    };

    stepKart(player, input, dt);
    resolveCollisions(player);
    updateBoxes();
    updateWeapons(dt);
    updateParticles(dt);
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