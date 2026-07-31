import Matter from 'matter-js';

export const TURBULENCE_STRENGTH = 0.00004;
/**
 * Kept below matter-js's built-in gravity pull (gravity.y * gravity.scale = 1 * 0.001 = 0.001 per
 * unit mass) so balls are net negatively buoyant at rest: they sink and settle on the bottom
 * support bar, same as real Waterful toy pieces, and only rise when the Air Jet overpowers gravity.
 */
export const BUOYANCY_ACCEL = 0.0006;
/** frictionAir for objects submerged in water — matter-js applies this as a safe multiplicative
 * velocity damper each step. Do NOT reimplement drag as `applyForce(-k*v)`: matter-js scales
 * applyForce by deltaTime^2 (~278 at 60fps), so a velocity-proportional force resonates into an
 * exponential blowup within a handful of frames instead of damping. */
export const WATER_FRICTION_AIR = 0.035;

export interface PhysicsWorld {
  engine: Matter.Engine;
  world: Matter.World;
  walls: Matter.Body[];
}

export function createPhysicsWorld(width: number, height: number): PhysicsWorld {
  const engine = Matter.Engine.create();
  engine.gravity.y = 1;
  engine.gravity.scale = 0.001;
  const world = engine.world;

  const wallThickness = 40;
  const walls = [
    Matter.Bodies.rectangle(width / 2, -wallThickness / 2, width, wallThickness, { isStatic: true, label: 'wall' }),
    Matter.Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, { isStatic: true, label: 'wall' }),
    Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, { isStatic: true, label: 'wall' }),
    Matter.Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, { isStatic: true, label: 'wall' }),
  ];
  Matter.World.add(world, walls);

  return { engine, world, walls };
}

/** Static horizontal ledge near the tank bottom that balls rest on before the jet lifts them. */
export function createSupportBar(world: Matter.World, width: number, y: number) {
  const bar = Matter.Bodies.rectangle(width / 2, y, width * 0.82, 14, {
    isStatic: true,
    label: 'support-bar',
    chamfer: { radius: 6 },
  });
  Matter.World.add(world, bar);
  return bar;
}

export interface CupBodies {
  floor: Matter.Body;
  leftWall: Matter.Body;
  rightWall: Matter.Body;
  /** World-space y of the floor — use this (not the cup's nominal y) for settle/scoring checks. */
  floorY: number;
}

/**
 * Physical basket: a flat floor plus two outward-flared walls, all static, so a ball that drifts
 * in through the flared mouth is funneled down onto the floor and physically held there — instead
 * of a bare sensor circle a ball could pass straight through or bounce out of indefinitely.
 */
export function createCup(world: Matter.World, x: number, y: number, radius: number, id: string): CupBodies {
  const wallHeight = radius * 1.3;
  const wallThickness = 7;
  const flare = 0.32; // radians the walls tilt outward at the mouth, forming a funnel
  const floorY = y + radius * 0.55;

  const floor = Matter.Bodies.rectangle(x, floorY, radius * 1.7, 10, {
    isStatic: true,
    friction: 0.9,
    restitution: 0.05,
    label: `cup-floor-${id}`,
  });

  const leftWall = Matter.Bodies.rectangle(x - radius * 0.85, y, wallThickness, wallHeight, {
    isStatic: true,
    angle: -flare,
    restitution: 0.05,
    label: `cup-wall-${id}`,
  });

  const rightWall = Matter.Bodies.rectangle(x + radius * 0.85, y, wallThickness, wallHeight, {
    isStatic: true,
    angle: flare,
    restitution: 0.05,
    label: `cup-wall-${id}`,
  });

  Matter.World.add(world, [floor, leftWall, rightWall]);
  return { floor, leftWall, rightWall, floorY };
}

/**
 * Submerged-in-liquid model: buoyancy counteracts gravity, turbulence adds life. Drag is handled
 * separately via `frictionAir` on each body (see WATER_FRICTION_AIR) rather than as a force here.
 */
export function applyWaterPhysics(bodies: Matter.Body[]) {
  for (const body of bodies) {
    if (body.isStatic || body.label === 'bubble') continue;

    Matter.Body.applyForce(body, body.position, { x: 0, y: -body.mass * BUOYANCY_ACCEL });

    Matter.Body.applyForce(body, body.position, {
      x: (Math.random() - 0.5) * TURBULENCE_STRENGTH * body.mass,
      y: (Math.random() - 0.5) * TURBULENCE_STRENGTH * body.mass,
    });
  }
}

/**
 * Continuous upward air column rising from the bottom-center Air Jet button. Unlike a localized
 * radial burst, this applies lift based only on horizontal distance from the column center, so
 * holding the button keeps carrying a ball upward for as long as it stays inside the column —
 * all the way from the bottom support bar up to targets near the top.
 */
export function applyAirJet(world: Matter.World, jetX: number, strength: number, columnHalfWidth: number) {
  const bodies = Matter.Composite.allBodies(world);
  for (const body of bodies) {
    if (body.isStatic) continue;
    const dx = body.position.x - jetX;
    const absDx = Math.abs(dx);
    if (absDx < columnHalfWidth) {
      const falloff = 1 - absDx / columnHalfWidth;
      Matter.Body.applyForce(body, body.position, {
        x: -dx * 0.00003 * falloff,
        y: -strength * falloff,
      });
    }
  }
}

let bubbleId = 0;

export function spawnBubble(world: Matter.World, x: number, y: number) {
  const radius = 3 + Math.random() * 5;
  const bubble = Matter.Bodies.circle(x + (Math.random() - 0.5) * 24, y, radius, {
    label: 'bubble',
    frictionAir: 0.02,
    density: 0.0001,
    collisionFilter: { group: -1 },
  });
  (bubble as any).bubbleId = bubbleId++;
  (bubble as any).spawnTime = Date.now();
  Matter.World.add(world, bubble);
  return bubble;
}

export function updateBubbles(world: Matter.World, maxAgeMs = 2500) {
  const now = Date.now();
  const bodies = Matter.Composite.allBodies(world);
  for (const body of bodies) {
    if (body.label !== 'bubble') continue;
    Matter.Body.applyForce(body, body.position, {
      x: (Math.random() - 0.5) * 0.00001,
      y: -0.00006,
    });
    if (now - (body as any).spawnTime > maxAgeMs) {
      Matter.World.remove(world, body);
    }
  }
}
