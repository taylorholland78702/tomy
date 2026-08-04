import Matter from 'matter-js';

/**
 * Ambient random jitter applied to every submerged body every frame. Needs to be large enough to
 * visibly break up synchronized motion under strong tilt — e.g. a cluster of balls slammed to the
 * top by a full downward tilt, then falling back as gravity flips: without enough turbulence,
 * near-identical starting positions/velocities under near-identical (mass-scaled) gravity forces
 * make them fall as a uniform block in a straight line instead of scattering naturally.
 */
export const TURBULENCE_STRENGTH = 0.002;
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
export const WATER_FRICTION_AIR = 0.05;

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

export interface RampPoints {
  leftPoint: { x: number; y: number };
  lowPoint: { x: number; y: number };
  rightPoint: { x: number; y: number };
}

export interface RampInfo extends RampPoints {
  leftSeg: Matter.Body;
  rightSeg: Matter.Body;
}

/**
 * Geometry for the V-shaped double ramp, factored out so physics and rendering always agree:
 * two straight ramps meeting at a centered low point directly beneath the Air Jet button.
 * The ends overlap the tank's side walls (not just approach them) so there's no gap a ball could
 * slip through and fall past the ramp down to the bottom of the tank.
 */
export function computeRampPoints(width: number, baseY: number): RampPoints {
  return {
    leftPoint: { x: -10, y: baseY - 32 },
    lowPoint: { x: width * 0.5, y: baseY },
    rightPoint: { x: width + 10, y: baseY - 32 },
  };
}

function rampSegment(x1: number, y1: number, x2: number, y2: number, thickness: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  return Matter.Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, length, thickness, {
    isStatic: true,
    angle,
    label: 'ramp',
    chamfer: { radius: thickness / 2 },
    // Low friction so balls roll/slide down to the low point instead of sticking partway.
    friction: 0.003,
    frictionStatic: 0.006,
  });
}

export function createVRamp(world: Matter.World, width: number, baseY: number): RampInfo {
  const thickness = 14;
  const { leftPoint, lowPoint, rightPoint } = computeRampPoints(width, baseY);

  const leftSeg = rampSegment(leftPoint.x, leftPoint.y, lowPoint.x, lowPoint.y, thickness);
  const rightSeg = rampSegment(lowPoint.x, lowPoint.y, rightPoint.x, rightPoint.y, thickness);
  Matter.World.add(world, [leftSeg, rightSeg]);

  return { leftSeg, rightSeg, leftPoint, lowPoint, rightPoint };
}

/** Small static bumper peg — purely an obstacle balls bounce and thread between, like the pegs between cups on the real toy. */
export function createPeg(world: Matter.World, x: number, y: number, radius = 6) {
  const peg = Matter.Bodies.circle(x, y, radius, {
    isStatic: true,
    restitution: 0.6,
    friction: 0.4,
    label: 'peg',
  });
  Matter.World.add(world, peg);
  return peg;
}

/** Radius of every ball in the tank. Cup geometry is derived from this, not level-configurable. */
export const BALL_RADIUS = 13;
/**
 * A true semicircular bowl, arc radius just barely bigger than a ball so it nests snugly — per
 * the "match the outer size of the balls" design goal, not an arbitrary bigger basket.
 */
export const CUP_RADIUS = BALL_RADIUS + 4;

export interface CupInfo {
  segments: Matter.Body[];
  /** World-space y a resting ball's *center* settles at — use this, not the cup's nominal y, for scoring. */
  restY: number;
}

/**
 * Physical basket: a true semicircular arc built from a chain of small static rectangle segments
 * (matter-js has no native curved-collider primitive), rim at `y`, deepest point at `y + CUP_RADIUS`.
 * Because the arc radius is only ~BALL_RADIUS + 4, a ball resting at the bottom sits almost exactly
 * at (x, y) with its top half poking up above the rim — the earlier flared-rectangle-funnel design
 * let balls hang up on the rim geometry itself, well above the zone the scoring check looked at.
 */
export function createCup(world: Matter.World, x: number, y: number, id: string): CupInfo {
  const segmentCount = 10;
  const thickness = 6;
  const segLength = (Math.PI * CUP_RADIUS) / segmentCount + 3; // + slight overlap to avoid gaps

  const segments: Matter.Body[] = [];
  for (let i = 0; i < segmentCount; i++) {
    const theta = -Math.PI / 2 + ((i + 0.5) / segmentCount) * Math.PI; // -90deg (left rim) to +90deg (right rim)
    const px = x + CUP_RADIUS * Math.sin(theta);
    const py = y + CUP_RADIUS * Math.cos(theta);
    segments.push(
      Matter.Bodies.rectangle(px, py, segLength, thickness, {
        isStatic: true,
        angle: -theta,
        friction: 0.9,
        restitution: 0.05,
        label: `cup-wall-${id}`,
      })
    );
  }

  Matter.World.add(world, segments);
  return { segments, restY: y + (CUP_RADIUS - BALL_RADIUS) };
}

export interface CupAnchor {
  x: number;
  restY: number;
}

/**
 * Gives cups real retention: a ball within captureRadius of a cup's rest position gets pulled
 * back toward it, proportional to displacement (a simple spring). The cup's rigid walls alone
 * aren't enough — any nonzero jet or turbulence force will eventually walk a resting ball out
 * given enough time, since matter-js has no built-in "stick to a spot" behavior — this models the
 * ball actually settling into a physical dip rather than just balancing on a rail.
 *
 * Because it's a spring (force grows with displacement) rather than a hard clamp, it has a
 * natural breaking point: at captureRadius the restoring force caps out at `strength *
 * captureRadius`. A disturbance weaker than that (normal jet operation) settles into a stable,
 * slightly-offset equilibrium — visible as a jiggle, not an escape. A disturbance whose sustained
 * force exceeds that cap — a large device tilt adding to gravity, or the jet compounding with
 * tilt/turbulence over a long hold — keeps accelerating the ball past the boundary and out, which
 * is deliberately what makes "tips the phone a lot" or "presses a lot" able to still dislodge it.
 */
export function applyCupRetention(bodies: Matter.Body[], anchors: CupAnchor[], strength: number, captureRadius: number) {
  for (const body of bodies) {
    if (body.isStatic || !body.label.startsWith('ball-')) continue;

    for (const anchor of anchors) {
      const ddx = body.position.x - anchor.x;
      const ddy = body.position.y - anchor.restY;
      if (Math.abs(ddx) > captureRadius || Math.abs(ddy) > captureRadius) continue;
      if (Math.hypot(ddx, ddy) > captureRadius) continue;

      Matter.Body.applyForce(body, body.position, { x: -ddx * strength, y: -ddy * strength });
      break; // cups are spaced far enough apart that a ball is never in two capture zones at once
    }
  }
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
 * Phase 5's "Undertow" hazard: a directional (not random, unlike applyWaterPhysics's turbulence)
 * mass-scaled sideways force applied to every submerged body. `strength` is expected to already be
 * signed and oscillating (the caller drives it with a sine wave over time — see GameCanvas.tsx) so
 * this function itself stays a simple, reusable constant push rather than owning any timing logic.
 */
export function applyCurrent(bodies: Matter.Body[], strength: number) {
  for (const body of bodies) {
    if (body.isStatic || body.label === 'bubble') continue;
    Matter.Body.applyForce(body, body.position, { x: strength * body.mass, y: 0 });
  }
}

/**
 * Gently pulls balls sitting near the ramp horizontally toward its low point, on top of (not
 * instead of) the ramp's own incline. The ramp's true slope-driven roll is barely noticeable
 * because BUOYANCY_ACCEL is deliberately close to gravity (for the "light/floaty" feel), which
 * leaves almost no net downward force — and with the incline only ~9 degrees, the resulting
 * tangential pull is tiny regardless of how low ramp/ball friction is set. This models the V
 * shape's guiding effect directly so balls reliably roll to the bottom at a natural pace,
 * without having to fight buoyancy tuning elsewhere to get there.
 */
export function applyRampGuide(bodies: Matter.Body[], rampLowX: number, rampBaseY: number, strength: number) {
  const activeZoneAbove = 70;
  const activeZoneBelow = 40;
  // Bigger than one ball's diameter: once a ball is already this close to the low point, stop
  // shoving it — a constant push all the way down to a couple of px keeps every resting ball
  // fighting for the exact same spot instead of settling side by side, which reads as balls
  // "sticking together" rather than resting naturally next to each other.
  const deadZone = 24;
  for (const body of bodies) {
    if (body.isStatic || body.label === 'bubble') continue;
    const heightAboveBase = rampBaseY - body.position.y;
    if (heightAboveBase > activeZoneAbove || heightAboveBase < -activeZoneBelow) continue;

    const dx = body.position.x - rampLowX;
    if (Math.abs(dx) < deadZone) continue;
    Matter.Body.applyForce(body, body.position, { x: -Math.sign(dx) * strength * body.mass, y: 0 });
  }
}

/**
 * Upward air column rising from the bottom-center Air Jet button, modeled like a real bubble
 * plume rather than a rigid laser: it's narrowest and strongest right at the origin, WIDENS
 * (fans out left/right) the higher it rises, and its strength fades continuously with height —
 * both together, so by the time it nears the top cup row it's a broad, gentle drift rather than a
 * concentrated blast. This is also what makes side cups vulnerable: at greater heights the
 * (weaker, but nonzero) plume is wide enough to reach dx columns it wouldn't touch near the
 * bottom, so a held press can gradually jiggle — and occasionally knock loose — an off-center
 * ball, while a dead-center resting ball still gets zero force once verticalRange is exceeded.
 *
 * On top of the lift, adds an outward (not rotational) push whose strength grows with height, so
 * a ball already drifted slightly off-center gets nudged further from the centerline the higher
 * it rises — trajectories fan out into a widening V/cone as they climb, matching a real spray,
 * rather than curling around a fixed point like a whirlpool. A ball still exactly on the
 * centerline (dx=0) gets no outward push either way; only turbulence's natural jitter decides
 * which side of the V it ends up drifting into, so which side any given press favors is organic
 * rather than a single global "spin direction" applied to every ball at once.
 */
export function applyAirJet(
  world: Matter.World,
  jetX: number,
  jetY: number,
  strength: number,
  baseColumnHalfWidth: number,
  verticalRange: number,
  fanRate: number,
  spreadStrength: number
) {
  const bodies = Matter.Composite.allBodies(world);

  for (const body of bodies) {
    if (body.isStatic) continue;

    const heightRisen = Math.max(0, jetY - body.position.y); // 0 at/below the origin
    const verticalFalloff = Math.max(0, 1 - heightRisen / verticalRange);
    if (verticalFalloff <= 0) continue;

    const columnHalfWidth = baseColumnHalfWidth + fanRate * heightRisen;
    const dx = body.position.x - jetX;
    const absDx = Math.abs(dx);
    if (absDx >= columnHalfWidth) continue;
    const horizontalFalloff = 1 - absDx / columnHalfWidth;

    const falloff = horizontalFalloff * verticalFalloff;
    if (falloff <= 0) continue;

    // Grows linearly with height risen, same shape as the column's own widening, so the push
    // outward tracks the V the column itself traces.
    const outwardX = Math.sign(dx) * heightRisen * spreadStrength * falloff;

    Matter.Body.applyForce(body, body.position, {
      x: -dx * 0.00002 * falloff + outwardX,
      y: -strength * falloff,
    });
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
