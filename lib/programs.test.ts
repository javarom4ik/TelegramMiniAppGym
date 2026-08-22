import { describe, expect, it } from "vitest";
import type { Program } from "./domain";
import { getNextProgramId, removeProgram } from "./programs";

const programs: Program[] = [
  { id: "one", name: "Тренировка № 1", exerciseIds: [] },
  { id: "two", name: "Тренировка № 2", exerciseIds: [] },
];

describe("removeProgram", () => {
  it("selects the neighbouring program after deleting the selected one", () => {
    expect(removeProgram(programs, "one", "one")).toEqual({
      programs: [programs[1]],
      selectedProgramId: "two",
    });
  });

  it("allows deleting the last program", () => {
    expect(removeProgram([programs[0]], "one", "one")).toEqual({
      programs: [],
      selectedProgramId: "",
    });
  });
});

describe("getNextProgramId", () => {
  it("selects the program after the completed one", () => {
    expect(getNextProgramId(programs, "one")).toBe("two");
  });

  it("continues from the last program to the first one", () => {
    expect(getNextProgramId(programs, "two")).toBe("one");
  });

  it("handles an empty or changed program list", () => {
    expect(getNextProgramId([], "one")).toBeUndefined();
    expect(getNextProgramId(programs, "deleted")).toBe("one");
  });
});
