// Cleans raw Overpass elements so every run is drawn once, in one consistent colour:
//  1. Route relations (a named run made of several ways) pass their difficulty/name/ref down to
//     their member ways, then the relation is dropped. Otherwise a run is drawn twice, and the two
//     copies often disagree on difficulty.
//  2. Difficulty values are normalised to one fixed set ("Easy", "easy;intermediate", missing tag...).
//  3. Abandoned/disused runs are removed.
//  4. Consecutive segments of the same run are merged into one line, so there are no gaps or
//     colour flicker at segment joins, and labels are placed once per run, not once per segment.

export const DIFFICULTIES = ['novice', 'easy', 'intermediate', 'advanced', 'expert', 'freeride', 'unknown'];

const ALIASES = {
  novice: 'novice', beginner: 'novice', green: 'novice',
  easy: 'easy', blue: 'easy',
  intermediate: 'intermediate', red: 'intermediate',
  advanced: 'advanced', black: 'advanced', difficult: 'advanced',
  expert: 'expert', extreme: 'expert', 'double black': 'expert',
  freeride: 'freeride', yellow: 'freeride', orange: 'freeride',
};

/** "Easy" → easy, "easy;intermediate" → intermediate (the harder one wins), missing → unknown. */
export function normalizeDifficulty(raw) {
  if (raw == null) return 'unknown';
  let best = 'unknown';
  for (const part of String(raw).toLowerCase().split(/[;,/]/)) {
    const d = ALIASES[part.trim()];
    if (d && (best === 'unknown' || DIFFICULTIES.indexOf(d) > DIFFICULTIES.indexOf(best))) best = d;
  }
  return best;
}

const INHERIT = ['piste:type', 'piste:difficulty', 'piste:grooming', 'name', 'ref', 'piste:name', 'piste:ref'];
const isAbandoned = (t) =>
  t['piste:abandoned'] === 'yes' || t.abandoned === 'yes' || t.disused === 'yes' ||
  ['abandoned', 'disused', 'proposed'].includes(t['piste:status']);

export function cleanElements(overpassJson) {
  const elements = overpassJson.elements.map((e) => (e.tags ? { ...e, tags: { ...e.tags } } : { ...e }));
  const ways = new Map(elements.filter((e) => e.type === 'way').map((w) => [w.id, w]));
  const drop = new Set();

  // 1. Relations → member ways (the way's own tags win if it has them).
  for (const rel of elements) {
    if (rel.type !== 'relation' || !rel.tags?.['piste:type']) continue;
    const members = (rel.members ?? []).filter((m) => m.type === 'way' && ways.has(m.ref));
    if (!members.length) continue;               // keep relations we can't resolve
    for (const m of members) {
      const w = ways.get(m.ref);
      w.tags ??= {};
      if (w.tags['piste:type'] && w.tags['piste:type'] !== rel.tags['piste:type']) continue;
      for (const k of INHERIT) if (w.tags[k] == null && rel.tags[k] != null) w.tags[k] = rel.tags[k];
    }
    drop.add(`relation/${rel.id}`);
  }

  // 2 + 3. Normalise difficulty, remove abandoned runs.
  for (const w of ways.values()) {
    const t = w.tags;
    if (!t?.['piste:type']) continue;
    if (isAbandoned(t)) { drop.add(`way/${w.id}`); continue; }
    if (t['piste:type'] === 'downhill') t['piste:difficulty'] = normalizeDifficulty(t['piste:difficulty']);
    t.name ??= t['piste:name'];
    t.ref ??= t['piste:ref'];
  }

  // 4. Merge chains of downhill line segments that belong to the same run.
  const isLineWay = (w) => w.tags?.['piste:type'] === 'downhill' && w.tags.area !== 'yes' &&
    !drop.has(`way/${w.id}`) && w.nodes?.length > 1 && w.nodes[0] !== w.nodes.at(-1);
  const runKey = (t) => [t['piste:difficulty'], t.name ?? '', t.ref ?? '', t['piste:grooming'] ?? ''].join('|');

  const groups = new Map();
  for (const w of ways.values()) {
    if (!isLineWay(w)) continue;
    const k = runKey(w.tags);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(w);
  }
  for (const group of groups.values()) {
    // Unnamed, unnumbered segments of the same colour can be different runs: only merge at
    // simple joins (exactly two segments meet), which is also the rule for named runs.
    const ends = new Map();
    const addEnd = (n, w) => { if (!ends.has(n)) ends.set(n, new Set()); ends.get(n).add(w); };
    for (const w of group) { addEnd(w.nodes[0], w); addEnd(w.nodes.at(-1), w); }
    const alive = new Set(group);
    for (const [node, set] of ends) {
      if (set.size !== 2) continue;
      const [a, b] = [...set];
      if (a === b || !alive.has(a) || !alive.has(b)) continue;
      // Orient so a ends at node and b starts at node, then append.
      if (a.nodes.at(-1) !== node) a.nodes.reverse();
      if (b.nodes[0] !== node) b.nodes.reverse();
      if (a.nodes.at(-1) !== node || b.nodes[0] !== node) continue;
      const otherEnd = b.nodes.at(-1);
      a.nodes = [...a.nodes, ...b.nodes.slice(1)];
      alive.delete(b);
      drop.add(`way/${b.id}`);
      ends.get(otherEnd)?.delete(b);
      ends.get(otherEnd)?.add(a);
      ends.get(node).clear();
    }
  }

  return { ...overpassJson, elements: elements.filter((e) => !drop.has(`${e.type}/${e.id}`)) };
}
