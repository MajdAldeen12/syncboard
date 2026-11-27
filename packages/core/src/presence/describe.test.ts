import { describe, expect, it } from "vitest";
import {
  describeActivity,
  describePeopleChange,
  type Activity,
  type Person,
  type PresenceUser,
} from "./index";

const ANA: PresenceUser = { id: "u-ana", name: "Ana", color: "#dc2626" };
const BO: PresenceUser = { id: "u-bo", name: "Bo", color: "#15803d" };
const CY: PresenceUser = { id: "u-cy", name: "Cy", color: "#7c3aed" };
const DEE: PresenceUser = { id: "u-dee", name: "Dee", color: "#0369a1" };

const editing = (user: PresenceUser): Activity => ({ user, doing: "editing" });
const moving = (user: PresenceUser): Activity => ({ user, doing: "dragging" });

describe("describeActivity", () => {
  it("says nothing when nobody is doing anything", () => {
    expect(describeActivity([])).toBe("");
  });

  it("names one person and what they are doing", () => {
    expect(describeActivity([editing(ANA)])).toBe("Ana is editing");
    expect(describeActivity([moving(ANA)])).toBe("Ana is moving this");
  });

  it("names two people doing the same thing", () => {
    expect(describeActivity([editing(ANA), editing(BO)])).toBe(
      "Ana and Bo are editing",
    );
    expect(describeActivity([moving(ANA), moving(BO)])).toBe(
      "Ana and Bo are moving this",
    );
  });

  it("counts the rest when more than two do the same thing", () => {
    expect(describeActivity([editing(ANA), editing(BO), editing(CY)])).toBe(
      "Ana and 2 others are editing",
    );
  });

  it("says what each group is doing when they differ, first comer first", () => {
    expect(describeActivity([moving(ANA), editing(BO)])).toBe(
      "Ana is moving this, Bo is editing",
    );
    expect(
      describeActivity([editing(ANA), moving(BO), editing(CY), editing(DEE)]),
    ).toBe("Ana and 2 others are editing, Bo is moving this");
  });

  it("counts a person once, however many of their tabs are at it", () => {
    expect(describeActivity([editing(ANA), editing(ANA)])).toBe(
      "Ana is editing",
    );
    expect(describeActivity([editing(ANA), editing(ANA), editing(BO)])).toBe(
      "Ana and Bo are editing",
    );
  });
});

const person = (user: PresenceUser, isSelf = false): Person => ({
  ...user,
  isSelf,
});
const ME = person({ id: "u-me", name: "Me", color: "#2563eb" }, true);

describe("describePeopleChange", () => {
  it("says nothing about the people already there when this tab joins", () => {
    expect(describePeopleChange([], [ME, person(ANA), person(BO)])).toBeNull();
  });

  it("says nothing when nobody came or went", () => {
    const now = [ME, person(ANA)];
    expect(describePeopleChange(now, [ME, person(ANA)])).toBeNull();
  });

  it("names someone who joins", () => {
    expect(describePeopleChange([ME], [ME, person(ANA)])).toBe(
      "Ana joined the board.",
    );
  });

  it("names someone who leaves", () => {
    expect(describePeopleChange([ME, person(ANA)], [ME])).toBe(
      "Ana left the board.",
    );
  });

  it("names a few people at once and counts many", () => {
    expect(describePeopleChange([ME], [ME, person(ANA), person(BO)])).toBe(
      "Ana and Bo joined the board.",
    );
    expect(
      describePeopleChange([ME], [ME, person(ANA), person(BO), person(CY)]),
    ).toBe("Ana, Bo and Cy joined the board.");
    expect(
      describePeopleChange(
        [ME],
        [ME, person(ANA), person(BO), person(CY), person(DEE)],
      ),
    ).toBe("4 people joined the board.");
  });

  it("says who joined and who left in one go", () => {
    expect(describePeopleChange([ME, person(ANA)], [ME, person(BO)])).toBe(
      "Bo joined the board. Ana left the board.",
    );
  });

  it("never announces this person", () => {
    const other = { ...ME, id: "u-me-2" };
    expect(describePeopleChange([ME], [other])).toBeNull();
  });

  it("ignores a change of name or colour", () => {
    expect(
      describePeopleChange(
        [ME, person(ANA)],
        [ME, person({ ...ANA, name: "Ana B" })],
      ),
    ).toBeNull();
  });
});
