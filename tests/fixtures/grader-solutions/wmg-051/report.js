export function byTeam(people) {
  const grouped = Object.groupBy(people, (p) => p.team);
  const out = {};
  for (const [team, list] of Object.entries(grouped)) {
    out[team] = list.map((p) => p.name);
  }
  return out;
}

export function byTeamMap(people) {
  const grouped = Map.groupBy(people, (p) => p.team);
  const out = new Map();
  for (const [team, list] of grouped) {
    out.set(team, list.map((p) => p.name));
  }
  return out;
}

export function ranked(scores) {
  return scores.toSorted((a, b) => b - a);
}
