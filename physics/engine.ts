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

/**
 * Collision categories/masks. Balls collide with each other and with static geometry (walls,
 * pegs, ramp, cup walls) but never with bubbles — bubbles are purely decorative exhaust and were
 * always meant to be non-colliding (see spawnBubble's mask below), but the previous `{ group: -1
 * }` attempt was inert: matter-js's negative-group rule only suppresses collision between two
 * bodies sharing that SAME group value, and nothing else in this codebase used group -1, so
 * bubbles were actually colliding with balls/pegs/cup-walls the whole time. Static bodies only
 * need to collide with balls (static-vs-static pairs are already skipped by matter-js itself,
 * before any category/mask check runs, so restricting their mask is for clarity, not performance).
 */
export const COLLISION_CATEGORY_BALL = 0x0002;
export const COLLISION_CATEGORY_STATIC = 0x0004;
export const COLLISION_CATEGORY_BUBBLE = 0x0008;

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
  const staticFilter = { collisionFilter: { category: COLLISION_CATEGORY_STATIC, mask: COLLISION_CATEGORY_BALL } };
  const walls = [
    Matter.Bodies.rectangle(width / 2, -wallThickness / 2, width, wallThickness, { isStatic: true, label: 'wall', ...staticFilter }),
    Matter.Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, { isStatic: true, label: 'wall', ...staticFilter }),
    Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, { isStatic: true, label: 'wall', ...staticFilter }),
    Matter.Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, { isStatic: true, label: 'wall', ...staticFilter }),
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
    collisionFilter: { category: COLLISION_CATEGORY_STATIC, mask: COLLISION_CATEGORY_BALL },
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
    collisionFilter: { category: COLLISION_CATEGORY_STATIC, mask: COLLISION_CATEGORY_BALL },
  });
  Matter.World.add(world, peg);
  return peg;
}

/**
 * Reef's rotating-gear obstacle: a regular polygon, spun continuously via rotateGear below. A
 * circle would look like it's spinning but be physically identical to a static one at every
 * angle — the polygon shape is what actually makes the collision surface (and therefore bounces)
 * change as it rotates.
 */
export function createGear(world: Matter.World, x: number, y: number, radius: number, sides: number, id: string) {
  const gear = Matter.Bodies.polygon(x, y, sides, radius, {
    isStatic: true,
    restitution: 0.7,
    friction: 0.3,
    label: `gear-${id}`,
    collisionFilter: { category: COLLISION_CATEGORY_STATIC, mask: COLLISION_CATEGORY_BALL },
  });
  Matter.World.add(world, gear);
  return gear;
}

/** Incremental rotation (like translateCup, not an absolute angle) around the gear's own center. */
export function rotateGear(gear: Matter.Body, deltaRad: number) {
  Matter.Body.rotate(gear, deltaRad);
}

/**
 * Trench's periodic gate: a static wall segment whose collisionFilter.mask toggles between
 * blocking (COLLISION_CATEGORY_BALL) and passable (0) on a repeating open/closed cycle. Matches
 * the existing collision-category idiom rather than introducing Body.setStatic (unused anywhere
 * in this codebase, and this project's matter-js type defs are already known stale in one spot).
 */
export function createGate(world: Matter.World, x: number, y: number, width: number, height: number, id: string) {
  const gate = Matter.Bodies.rectangle(x, y, width, height, {
    isStatic: true,
    restitution: 0.3,
    friction: 0.5,
    label: `gate-${id}`,
    collisionFilter: { category: COLLISION_CATEGORY_STATIC, mask: COLLISION_CATEGORY_BALL },
  });
  Matter.World.add(world, gate);
  return gate;
}

export function setGateOpen(gate: Matter.Body, open: boolean) {
  gate.collisionFilter.mask = open ? 0 : COLLISION_CATEGORY_BALL;
}

/**
 * Trench's crumbling peg: identical body to a normal peg (see createPeg above), but labeled
 * distinctly so a collisionStart handler can recognize it and count hits toward breaking.
 */
export function createCrumblingPeg(world: Matter.World, x: number, y: number, radius: number, id: string) {
  const peg = Matter.Bodies.circle(x, y, radius, {
    isStatic: true,
    restitution: 0.6,
    friction: 0.4,
    label: `crumble-peg-${id}`,
    collisionFilter: { category: COLLISION_CATEGORY_STATIC, mask: COLLISION_CATEGORY_BALL },
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
        collisionFilter: { category: COLLISION_CATEGORY_STATIC, mask: COLLISION_CATEGORY_BALL },
      })
    );
  }

  Matter.World.add(world, segments);
  // The bottom segment's solid rectangle spans from CUP_RADIUS - thickness/2 to CUP_RADIUS +
  // thickness/2 from the bowl's virtual center - a ball resting on top of it touches the INNER
  // (upward-facing) surface at CUP_RADIUS - thickness/2, not the arc's centerline. Confirmed
  // directly: a ball dropped and left to settle under real gravity comes to rest ~2.8px above
  // (shallower than) the un-corrected y + (CUP_RADIUS - BALL_RADIUS), matching this formula
  // (~3px, thickness/2) far more closely than the old one did.
  return { segments, restY: y + (CUP_RADIUS - thickness / 2 - BALL_RADIUS) };
}

/** Phase 8: rigidly translates every wall segment of a cup by the same incremental delta — used for the sway mechanic. */
export function translateCup(segments: Matter.Body[], deltaX: number, deltaY: number = 0) {
  for (const seg of segments) Matter.Body.translate(seg, { x: deltaX, y: deltaY });
}

/**
 * Phase 8: rigidly rotates every wall segment of a cup around a shared pivot by an incremental
 * delta (like translateCup, not an absolute angle) — used for the tilt mechanic. The pivot should
 * be the cup's own circle center (the (x, y) originally passed to createCup), so all segments
 * revolve together as one tilted bowl rather than spinning individually in place.
 */
export function rotateCup(segments: Matter.Body[], deltaRad: number, pivot: { x: number; y: number }) {
  // @types/matter-js's Body.rotate signature is missing the (fully supported at runtime, per
  // matter-js's own source) third `point` argument that rotates position as well as angle — cast
  // to bypass the stale type declaration rather than reimplementing rotate-about-a-point by hand.
  const rotate = Matter.Body.rotate as (body: Matter.Body, rotation: number, point: { x: number; y: number }) => void;
  for (const seg of segments) rotate(seg, deltaRad, pivot);
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
 * Hard cup lock, for levels with LevelConfig.stickyRetention set — pins a settled ball exactly to
 * its cup's rest anchor and zeroes its velocity/angular velocity, every frame, for as long as the
 * caller keeps calling it. Unlike applyCupRetention's spring (which has a deliberate breaking
 * point — see its doc comment), this has none: nothing short of the caller no longer invoking it
 * (see GameCanvas.tsx's forward-tilt eject) can move the ball.
 *
 * Deliberately not `isStatic: true` — GameCanvas's render loop filters out static bodies before
 * mapping them to renderable circles, so a statically-locked ball would simply vanish from the
 * screen. This keeps the body fully dynamic and rendering normally; it's re-pinned to its anchor
 * every frame instead, after Matter.Engine.update has already run, so this call is always the last
 * word on the ball's position/velocity for the frame.
 */
export function lockBallAtAnchor(body: Matter.Body, anchor: CupAnchor) {
  Matter.Body.setPosition(body, { x: anchor.x, y: anchor.restY });
  Matter.Body.setVelocity(body, { x: 0, y: 0 });
  Matter.Body.setAngularVelocity(body, 0);
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
 * Phase 6's magnet-ball power-up: pulls every other ball within `radius` of `magnetBody` toward
 * it, falling off linearly with distance (so balls right next to the magnet feel a strong tug,
 * balls near the edge of its range barely anything) — a small self-contained addition, not a
 * change to any existing force function. The caller only invokes this while the magnet ball
 * itself is still in flight (see GameCanvas.tsx), so the pull naturally stops once it settles.
 */
export function applyMagnetAttraction(bodies: Matter.Body[], magnetBody: Matter.Body, radius: number, strength: number) {
  for (const body of bodies) {
    if (body.isStatic || body.label === 'bubble' || body === magnetBody) continue;

    const dx = magnetBody.position.x - body.position.x;
    const dy = magnetBody.position.y - body.position.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= radius || distance === 0) continue;

    const falloff = 1 - distance / radius;
    const forceMagnitude = strength * falloff * body.mass;
    Matter.Body.applyForce(body, body.position, {
      x: (dx / distance) * forceMagnitude,
      y: (dy / distance) * forceMagnitude,
    });
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
  spreadStrength: number,
  clipX?: { min?: number; max?: number }
) {
  const bodies = Matter.Composite.allBodies(world);

  for (const body of bodies) {
    if (body.isStatic) continue;
    // Phase 7's split buttons: a hard boundary (not just the falloff below) so each button only
    // ever affects balls on its own half, however strong the press — the natural distance falloff
    // alone would let a strong-enough hold reach across the tank, undermining the "split" premise.
    if (clipX?.min !== undefined && body.position.x < clipX.min) continue;
    if (clipX?.max !== undefined && body.position.x > clipX.max) continue;

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
    // mask: 0 means this collides with nothing at all — the correct fix for what { group: -1 }
    // was trying (and, per the module doc comment above, failing) to do.
    collisionFilter: { category: COLLISION_CATEGORY_BUBBLE, mask: 0 },
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
