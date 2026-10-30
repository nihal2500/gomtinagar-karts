// =====================================================
//  Gomtinagar Karts 3D: the arena layout
//  The numbers match the 2.5D game: x goes east, y goes south.
//  (In the 3D scene, y becomes the "z" direction and height is "up".)
// =====================================================
const ARENA3D = {
  x: 50, y: 66, w: 800, h: 400,   // the floor
  wallHeight: 34,                 // how tall the outer walls are
  wallThickness: 14,

  // Solid blocks. x, y = top-left corner on the floor, w, h = size on the floor,
  // height = how tall the block is.
  blocks: [
    { x: 420, y: 236, w: 60, h: 60, height: 48, color: 0xd71921 },   // the tower in the middle
    { x: 216, y: 152, w: 48, h: 48, height: 30, color: 0x5aa9f0 },   // four pillars
    { x: 636, y: 152, w: 48, h: 48, height: 30, color: 0xf4c20d },
    { x: 216, y: 332, w: 48, h: 48, height: 30, color: 0xf4c20d },
    { x: 636, y: 332, w: 48, h: 48, height: 30, color: 0x5aa9f0 },
    { x: 332, y: 226, w: 12, h: 80, height: 24, color: 0xe9e3d3 },   // two long thin walls
    { x: 556, y: 226, w: 12, h: 80, height: 24, color: 0xe9e3d3 },
    { x: 300, y: 100, w: 32, h: 32, height: 20, color: 0x4fcf8d },   // four crates
    { x: 568, y: 100, w: 32, h: 32, height: 20, color: 0x4fcf8d },
    { x: 300, y: 334, w: 32, h: 32, height: 20, color: 0x4fcf8d },
    { x: 568, y: 334, w: 32, h: 32, height: 20, color: 0x4fcf8d }
  ],

  // Ramps. "dir" is the direction you drive to go UP the slope.
  ramps: [
    { x: 360, y: 100, w: 90, h: 48, dir: "east",  height: 22, color: 0xffb400 },
    { x: 450, y: 384, w: 90, h: 48, dir: "west",  height: 22, color: 0xffb400 },
    { x: 744, y: 170, w: 48, h: 90, dir: "south", height: 22, color: 0xffb400 },
    { x: 108, y: 272, w: 48, h: 90, dir: "north", height: 22, color: 0xffb400 }
  ]
};