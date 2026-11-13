export function byTeam(people) {
  return people.reduce((acc, p) => {
    const list = acc[p.team] ?? [];
    list.push(p.name);
    acc[p.team] = list;
    return acc;
  }, {});
}

export function byTeamMap(people) {
  return people.reduce((acc, p) => {
    const list = acc.get(p.team) ?? [];
    list.push(p.name);
    acc.set(p.team, list);
    return acc;
  }, new Map());
}

export function ranked(scores) {
  return scores.sort((a, b) => b - a);
}
