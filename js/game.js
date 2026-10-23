// =====================================================
//  Gomtinagar Karts: game engine (Stage 5)
//  Arena, 2.5D drawing and driving. Bots come later.
// =====================================================
const Game = (function () {

  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;   // 900
  const H = canvas.height;  // 520

  // ---------- The arena ----------
  const ARENA = { x: 50, y: 50, w: 800, h: 420 };
  const WALL = 14;
  const KART_RADIUS = 18;

  // Solid blocks in the arena. "hgt" is how tall they look.
  const OBSTACLES = [
    { x: 415, y: 225, w: 70, h: 70, hgt: 26, accent: true },
    { x: 210, y: 130, w: 60, h: 60, hgt: 20 },
    { x: 630, y: 130, w: 60, h: 60, hgt: 20 },
    { x: 210, y: 330, w: 60, h: 60, hgt: 20 },
    { x: 630, y: 330, w: 60, h: 60, hgt: 20 }
  ];

  // ---------- Driving feel (you can tweak these later) ----------
  const MAX_SPEED = 4.4;
  const MAX_REVERSE = 1.8;
  const ACCEL = 0.11;
  const BRAKE = 0.22;
  const FRICTION = 0.05;
  const TURN_RATE = 0.05;

  // ---------- Game state ----------
  let running = false;
  let rafId = null;
  let lastTime = 0;
  let settings = null;
  let kart = null;
  let keys = {};

  // ---------- Keyboard ----------
  const BLOCKED_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"];

  window.addEventListener("keydown", function (e) {
    if (!running) return;
    keys[e.code] = true;
    if (BLOCKED_KEYS.indexOf(e.code) !== -1) e.preventDefault(); // stop the page from scrolling
  });

  window.addEventListener("keyup", function (e) {
    keys[e.code] = false;
  });

  window.addEventListener("blur", function () {
    keys = {};
  });

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

  // The floor and the back walls never move, so we draw them once.
  function buildStaticLayer() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");

    g.fillStyle = "#f2f1ee";
    g.fillRect(0, 0, W, H);

    g.fillStyle = "#ffffff";
    g.fillRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);

    g.fillStyle = "rgba(16, 16, 16, 0.2)";
    for (let x = ARENA.x + 14; x < ARENA.x + ARENA.w; x += 28) {
      for (let y = ARENA.y + 14; y < ARENA.y + ARENA.h; y += 28) {
        g.beginPath();
        g.arc(x, y, 1.8, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Inside face of the north wall (gives depth)
    g.fillStyle = "#3a3a3a";
    g.fillRect(ARENA.x, ARENA.y, ARENA.w, 12);

    // Top of the north, west and east walls
    g.fillStyle = "#101010";
    g.fillRect(ARENA.x - WALL, ARENA.y - WALL, ARENA.w + 2 * WALL, WALL);
    g.fillRect(ARENA.x - WALL, ARENA.y, WALL, ARENA.h);
    g.fillRect(ARENA.x + ARENA.w, ARENA.y, WALL, ARENA.h);

    return c;
  }

  const staticLayer = buildStaticLayer();

  // The south wall is in front of everything, so it is drawn last.
  function drawSouthWall() {
    ctx.fillStyle = "#101010";
    ctx.fillRect(ARENA.x - WALL, ARENA.y + ARENA.h, ARENA.w + 2 * WALL, WALL);
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(ARENA.x - WALL, ARENA.y + ARENA.h + WALL, ARENA.w + 2 * WALL, 10);
  }

  function drawObstacle(o) {
    // shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(o.x + 7, o.y + 7, o.w, o.h);

    // front face
    ctx.fillStyle = o.accent ? "#8f0e14" : "#b9b6ae";
    ctx.fillRect(o.x, o.y + o.h - o.hgt, o.w, o.hgt);
    ctx.strokeStyle = "#101010";
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x, o.y + o.h - o.hgt, o.w, o.hgt);

    // top face (moved up by its height)
    ctx.fillStyle = o.accent ? "#d71921" : "#e9e7e2";
    ctx.fillRect(o.x, o.y - o.hgt, o.w, o.h);
    ctx.strokeRect(o.x, o.y - o.hgt, o.w, o.h);
  }

  function drawKart(k, color) {
    // shadow on the floor
    ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
    ctx.beginPath();
    ctx.ellipse(k.x + 3, k.y + 6, 24, 16, k.angle, 0, Math.PI * 2);
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
        ctx.arc(-2, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function drawHud() {
    ctx.textAlign = "left";
    ctx.fillStyle = "#101010";
    ctx.font = "bold 18px monospace";
    ctx.fillText(settings.name.toUpperCase(), ARENA.x, 30);

    // lives (display only for now)
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "#d71921";
      ctx.beginPath();
      ctx.arc(ARENA.x + ARENA.w - 8 - i * 24, 24, 8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#5d5d5a";
    ctx.font = "14px monospace";
    ctx.fillText("Arrow keys or W A S D to drive", W / 2, 512);
  }

  function draw() {
    ctx.drawImage(staticLayer, 0, 0);

    // draw blocks and the kart from back to front
    const things = [];
    OBSTACLES.forEach(function (o) {
      things.push({ sortY: o.y + o.h, draw: function () { drawObstacle(o); } });
    });
    things.push({ sortY: kart.y, draw: function () { drawKart(kart, settings.kartColor); } });
    things.sort(function (a, b) { return a.sortY - b.sortY; });
    things.forEach(function (t) { t.draw(); });

    drawSouthWall();
    drawHud();
  }

  // ---------- Game logic ----------
  function resetKart() {
    kart = { x: 130, y: ARENA.y + ARENA.h / 2, angle: 0, speed: 0 };
  }

  function update(dt) {
    const up = keys.ArrowUp || keys.KeyW;
    const down = keys.ArrowDown || keys.KeyS;
    const left = keys.ArrowLeft || keys.KeyA;
    const right = keys.ArrowRight || keys.KeyD;

    // speed
    if (up) {
      kart.speed += ACCEL * dt;
    } else if (down) {
      kart.speed -= (kart.speed > 0 ? BRAKE : ACCEL * 0.7) * dt;
    } else if (kart.speed > 0) {
      kart.speed = Math.max(0, kart.speed - FRICTION * dt);
    } else if (kart.speed < 0) {
      kart.speed = Math.min(0, kart.speed + FRICTION * dt);
    }
    kart.speed = Math.max(-MAX_REVERSE, Math.min(MAX_SPEED, kart.speed));

    // steering (only works while moving)
    const turn = (right ? 1 : 0) - (left ? 1 : 0);
    const grip = Math.max(-1, Math.min(1, kart.speed / 2));
    kart.angle += turn * TURN_RATE * grip * dt;

    // move
    kart.x += Math.cos(kart.angle) * kart.speed * dt;
    kart.y += Math.sin(kart.angle) * kart.speed * dt;

    // walls
    const minX = ARENA.x + KART_RADIUS;
    const maxX = ARENA.x + ARENA.w - KART_RADIUS;
    const minY = ARENA.y + KART_RADIUS;
    const maxY = ARENA.y + ARENA.h - KART_RADIUS;
    if (kart.x < minX) { kart.x = minX; kart.speed *= 0.7; }
    if (kart.x > maxX) { kart.x = maxX; kart.speed *= 0.7; }
    if (kart.y < minY) { kart.y = minY; kart.speed *= 0.7; }
    if (kart.y > maxY) { kart.y = maxY; kart.speed *= 0.7; }

    // blocks
    OBSTACLES.forEach(function (o) {
      const nearestX = Math.max(o.x, Math.min(kart.x, o.x + o.w));
      const nearestY = Math.max(o.y, Math.min(kart.y, o.y + o.h));
      const dx = kart.x - nearestX;
      const dy = kart.y - nearestY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < KART_RADIUS) {
        if (dist === 0) {
          kart.y = o.y - KART_RADIUS;
        } else {
          const push = KART_RADIUS - dist;
          kart.x += (dx / dist) * push;
          kart.y += (dy / dist) * push;
        }
        kart.speed *= 0.7;
      }
    });
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
    resetKart();
    keys = {};
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  return { start: start, stop: stop };
})();