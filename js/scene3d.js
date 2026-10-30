// =====================================================
//  Gomtinagar Karts 3D: Stage A, the 3D arena preview
//  Builds the arena with Three.js and slowly circles around it.
// =====================================================
(function () {

  const container = document.getElementById("scene3d");
  const wrap = document.getElementById("scene-wrap");
  const fpsLabel = document.getElementById("scene-fps");
  const message = document.getElementById("scene-message");
  const fullscreenButton = document.getElementById("fullscreen-btn");

  function showMessage(text) {
    message.textContent = text;
    message.classList.remove("hidden");
  }

  // Is the 3D library there?
  if (typeof THREE === "undefined") {
    showMessage("The 3D library could not be loaded. Please check your internet connection and refresh the page.");
    return;
  }

  // Can this computer draw 3D?
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    showMessage("Your browser could not start 3D graphics (WebGL). Try Chrome or Edge, and make sure hardware acceleration is on.");
    return;
  }

  const A = ARENA3D;
  const centerX = A.x + A.w / 2;
  const centerZ = A.y + A.h / 2;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // ---------- Scene, camera and lights ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xefeee9);
  scene.fog = new THREE.Fog(0xefeee9, 1000, 2400);

  const camera = new THREE.PerspectiveCamera(50, 900 / 520, 1, 4000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d4c8, 0.62));

  const sun = new THREE.DirectionalLight(0xffffff, 0.5);
  sun.position.set(centerX + 320, 620, centerZ + 260);
  sun.target.position.set(centerX, 0, centerZ);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -620;
  sun.shadow.camera.right = 620;
  sun.shadow.camera.top = 620;
  sun.shadow.camera.bottom = -620;
  sun.shadow.camera.near = 100;
  sun.shadow.camera.far = 1800;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- Small helpers ----------
  const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x101010 });

  function material(color) {
    return new THREE.MeshLambertMaterial({ color: color });
  }

  // a thin dark outline around a shape (gives the cartoon look)
  function addOutline(mesh) {
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), outlineMaterial));
  }

  // x, y = top-left corner on the floor; w along x, d along y
  function addBox(x, y, w, d, height, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), material(color));
    mesh.position.set(x + w / 2, height / 2, y + d / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh);
    scene.add(mesh);
    return mesh;
  }

  // ---------- The floor ----------
  // We paint the floor (tiles, colored corners, dotted ring) on a flat picture first,
  // then lay that picture on the ground.
  function makeFloorTexture() {
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = 800;
    const g = c.getContext("2d");
    g.scale(2, 2);   // we draw in the 800 x 400 floor size

    const cols = 16;
    const rows = 8;
    const tw = A.w / cols;
    const th = A.h / rows;
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        g.fillStyle = ((cx + cy) % 2 === 0) ? "#fbfaf6" : "#f1efe9";
        g.fillRect(cx * tw, cy * th, tw, th);
      }
    }

    // colored corner patches
    const patches = [
      { x: 0, y: 0, color: "#cfe6ff" },
      { x: A.w, y: 0, color: "#fff0b3" },
      { x: 0, y: A.h, color: "#ffd0d2" },
      { x: A.w, y: A.h, color: "#cfe6ff" }
    ];
    patches.forEach(function (p) {
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, 110, 0, Math.PI * 2);
      g.fill();
    });

    // dotted red ring and a faint inner ring in the middle
    g.strokeStyle = "rgba(215, 25, 33, 0.6)";
    g.lineWidth = 3;
    g.lineCap = "round";
    g.setLineDash([1, 11]);
    g.beginPath();
    g.arc(A.w / 2, A.h / 2, 130, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = "rgba(16, 16, 16, 0.14)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(A.w / 2, A.h / 2, 70, 0, Math.PI * 2);
    g.stroke();

    // faint name on the floor
    g.fillStyle = "rgba(16, 16, 16, 0.07)";
    g.font = "bold 30px monospace";
    g.textAlign = "center";
    g.fillText("GOMTINAGAR KARTS", A.w / 2, 50);
    g.fillText("GOMTINAGAR KARTS", A.w / 2, A.h - 32);

    const texture = new THREE.CanvasTexture(c);
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(A.w, A.h),
    new THREE.MeshLambertMaterial({ map: makeFloorTexture() })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  floor.receiveShadow = true;
  scene.add(floor);

  // the ground around the arena
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshLambertMaterial({ color: 0xe6e4dd })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, -0.6, centerZ);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- The walls: tall and red, with a light cap on top ----------
  function addWall(x, y, w, d) {
    addBox(x, y, w, d, A.wallHeight, 0xd71921);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 4, d + 2), material(0xfff4e6));
    cap.position.set(x + w / 2, A.wallHeight + 2, y + d / 2);
    cap.castShadow = true;
    addOutline(cap);
    scene.add(cap);
  }

  const t = A.wallThickness;
  addWall(A.x - t, A.y - t, A.w + 2 * t, t);   // north
  addWall(A.x - t, A.y + A.h, A.w + 2 * t, t); // south
  addWall(A.x - t, A.y, t, A.h);               // west
  addWall(A.x + A.w, A.y, t, A.h);             // east

  // ---------- Blocks ----------
  A.blocks.forEach(function (b) {
    addBox(b.x, b.y, b.w, b.h, b.height, b.color);

    // a little dark ring on top of the bigger blocks
    const size = Math.min(b.w, b.h);
    if (size >= 30) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(size * 0.22, size * 0.32, 32),
        new THREE.MeshBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.5 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(b.x + b.w / 2, b.height + 0.3, b.y + b.h / 2);
      scene.add(ring);
    }
  });

  // ---------- Ramps ----------
  function addRamp(r) {
    const horizontal = (r.dir === "east" || r.dir === "west");
    const length = horizontal ? r.w : r.h;   // how long the slope is
    const width = horizontal ? r.h : r.w;    // how wide it is

    // a triangle (the side view of the slope), pulled out sideways into a wedge
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(length, r.height);
    shape.lineTo(0, 0);

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.translate(-length / 2, 0, -width / 2);

    // turn the wedge so that it climbs toward the right side
    if (r.dir === "west") geometry.rotateY(Math.PI);
    else if (r.dir === "north") geometry.rotateY(Math.PI / 2);
    else if (r.dir === "south") geometry.rotateY(-Math.PI / 2);

    const mesh = new THREE.Mesh(geometry, material(r.color));
    mesh.position.set(r.x + r.w / 2, 0, r.y + r.h / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh);
    scene.add(mesh);
  }

  A.ramps.forEach(addRamp);

  // ---------- Size of the picture ----------
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener("resize", resize);
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(container);
  }
  resize();

  // ---------- Fullscreen ----------
  function isFullscreen() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }

  function toggleFullscreen() {
    if (isFullscreen()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else if (wrap.requestFullscreen) {
      wrap.requestFullscreen();
    } else if (wrap.webkitRequestFullscreen) {
      wrap.webkitRequestFullscreen();
    }
  }

  function updateFullscreenButton() {
    fullscreenButton.textContent = isFullscreen() ? "Exit Fullscreen" : "Fullscreen";
  }

  fullscreenButton.addEventListener("click", function () {
    toggleFullscreen();
    fullscreenButton.blur();
  });
  document.addEventListener("fullscreenchange", updateFullscreenButton);
  document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

  // ---------- Camera controls for looking around ----------
  let angle = 0.6;      // how far around the arena we are
  let radius = 700;     // how far away the camera is
  let paused = false;

  window.addEventListener("keydown", function (e) {
    if (e.code === "ArrowLeft") angle -= 0.1;
    else if (e.code === "ArrowRight") angle += 0.1;
    else if (e.code === "ArrowUp") radius = Math.max(250, radius - 40);
    else if (e.code === "ArrowDown") radius = Math.min(1100, radius + 40);
    else if (e.code === "Space" && !e.repeat) paused = !paused;
    else if (e.code === "KeyF" && !e.repeat) toggleFullscreen();
    else return;
    e.preventDefault();
  });

  // ---------- The loop ----------
  let last = performance.now();
  let fpsTime = last;
  let fpsFrames = 0;

  function frame(now) {
    requestAnimationFrame(frame);

    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (!paused) angle += dt * 0.12;

    camera.position.set(
      centerX + Math.sin(angle) * radius,
      radius * 0.55,
      centerZ + Math.cos(angle) * radius
    );
    camera.lookAt(centerX, 10, centerZ);

    renderer.render(scene, camera);

    // frames per second, updated twice a second
    fpsFrames++;
    if (now - fpsTime > 500) {
      fpsLabel.textContent = "FPS " + Math.round((fpsFrames * 1000) / (now - fpsTime));
      fpsFrames = 0;
      fpsTime = now;
    }
  }
  requestAnimationFrame(frame);

})();