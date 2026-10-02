/**
 * Ambient street motion (walkers, traffic): move along the street's length
 * and come back in at the other end, keeping any overshoot so a long frame
 * does not bunch everyone up at the edge.
 */
export function advanceAlongStreet(
  z: number,
  velocity: number,
  dt: number,
  halfLength: number,
  margin: number,
): number {
  const limit = halfLength + margin;
  const span = limit * 2;
  const next = z + velocity * dt;
  if (next >= -limit && next <= limit) return next;
  return ((((next + limit) % span) + span) % span) - limit;
}
