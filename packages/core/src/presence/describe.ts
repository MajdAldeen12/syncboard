import type { Activity, Person } from "./view";

const VERB: Record<Activity["doing"], { one: string; many: string }> = {
  editing: { one: "is editing", many: "are editing" },
  dragging: { one: "is moving this", many: "are moving this" },
};

/** "Ana", "Ana and Bo", or "Ana and 2 others". */
function namePeople(names: readonly string[]): string {
  const [first, second] = names;
  if (names.length === 1) return first!;
  if (names.length === 2) return `${first} and ${second}`;
  return `${first} and ${names.length - 1} others`;
}

/**
 * What the tag on a card or column says about the people at it: "Ana is
 * editing", "Ana and Bo are editing", "Ana is moving this, Bo is editing".
 *
 * People are grouped by what they are doing, in the order they started. A
 * person with several tabs on the same item counts once.
 */
export function describeActivity(activity: readonly Activity[]): string {
  const groups = new Map<Activity["doing"], Map<string, string>>();
  for (const { user, doing } of activity) {
    let names = groups.get(doing);
    if (!names) {
      names = new Map();
      groups.set(doing, names);
    }
    if (!names.has(user.id)) names.set(user.id, user.name);
  }

  return [...groups]
    .map(([doing, byId]) => {
      const names = [...byId.values()];
      const verb = names.length === 1 ? VERB[doing].one : VERB[doing].many;
      return `${namePeople(names)} ${verb}`;
    })
    .join(", ");
}

/** "Ana", "Ana and Bo", "Ana, Bo and Cy", or "4 people". */
function listPeople(names: readonly string[]): string {
  if (names.length > 3) return `${names.length} people`;
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * What to tell a screen reader when people arrive or leave: "Ana joined the
 * board.", "Bo joined the board. Ana left the board." Null when there is
 * nothing to say.
 *
 * Only changes after this tab has joined count: the people already there
 * when it arrives are listed by the avatars, not announced. This person is
 * never announced, and neither is a change of name or colour.
 */
export function describePeopleChange(
  before: readonly Person[],
  after: readonly Person[],
): string | null {
  if (!before.some((person) => person.isSelf)) return null;

  const others = (people: readonly Person[]) =>
    new Map(
      people
        .filter((person) => !person.isSelf)
        .map((person) => [person.id, person.name]),
    );
  const was = others(before);
  const is = others(after);

  const joined = [...is].filter(([id]) => !was.has(id)).map(([, n]) => n);
  const left = [...was].filter(([id]) => !is.has(id)).map(([, n]) => n);

  const sentences: string[] = [];
  if (joined.length > 0)
    sentences.push(`${listPeople(joined)} joined the board.`);
  if (left.length > 0) sentences.push(`${listPeople(left)} left the board.`);
  return sentences.length > 0 ? sentences.join(" ") : null;
}
