// Generic entity factory. No domain/type-specific branching here — entities
// carry a reference to their data-driven type definition and engine code only
// reads generic fields (x, d, alt, hp, type, flags).
let nextId = 1;

export function createEntity(opts) {
  const {
    kind,          // "enemy" | "crate" | "projectile"
    type = null,   // the data record (enemy def, crate def, weapon def) or null
    x = 0,
    d = 1,
    alt = 0,
    hp = 1,
    maxHp = hp,
  } = opts;

  return {
    uid: nextId++,
    kind,
    type,
    x, d, alt,
    hp, maxHp,
    dead: false,
    age: 0,
    flags: {},     // free-form per-behavior scratch space (e.g. hover state, weave phase)
    data: {},      // free-form scratch data for movement/weapon systems
  };
}

export function resetEntityIdCounter() {
  nextId = 1;
}
