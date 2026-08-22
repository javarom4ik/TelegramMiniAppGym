import { describe, expect, it } from "vitest";
import type { Workout } from "./domain";
import { hasSavedExerciseResult } from "./exercises";

const workout: Workout = {
  id: "workout-1",
  programName: "Тренировка № 1",
  startedAt: "2026-08-22T10:00:00.000Z",
  finishedAt: "2026-08-22T11:00:00.000Z",
  status: "completed",
  results: [{ exerciseId: "custom-1", weight: 40, reps: 10 }],
};

describe("custom exercise deletion", () => {
  it("detects an exercise used in completed history", () => {
    expect(hasSavedExerciseResult("custom-1", [workout])).toBe(true);
  });

  it("allows deletion when the exercise has no recorded result", () => {
    expect(hasSavedExerciseResult("unused", [workout])).toBe(false);
  });
});
