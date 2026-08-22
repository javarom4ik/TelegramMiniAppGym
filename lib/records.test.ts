import { describe, expect, it } from "vitest";
import { canFinishWorkout, formatDuration, getExerciseReference, isPersonalBest, upsertResult } from "./records";
import type { Workout } from "./domain";

const history: Workout[] = [
  {
    id: "newer",
    programName: "A",
    startedAt: "2026-08-20T10:00:00.000Z",
    finishedAt: "2026-08-20T11:00:00.000Z",
    status: "completed",
    results: [{ exerciseId: "bench", weight: 95, reps: 8 }],
  },
  {
    id: "older",
    programName: "A",
    startedAt: "2026-08-10T10:00:00.000Z",
    finishedAt: "2026-08-10T11:00:00.000Z",
    status: "completed",
    results: [{ exerciseId: "bench", weight: 100, reps: 5 }],
  },
];

describe("exercise records", () => {
  it("keeps the latest matching result separately from the all-time best", () => {
    const reference = getExerciseReference(history, "bench");
    expect(reference.previous).toMatchObject({ workoutId: "newer", weight: 95, reps: 8 });
    expect(reference.best).toMatchObject({ workoutId: "older", weight: 100, reps: 5 });
  });

  it("uses reps as the tie-breaker for the same maximum weight", () => {
    expect(isPersonalBest({ exerciseId: "bench", weight: 100, reps: 6 }, { exerciseId: "bench", weight: 100, reps: 5 })).toBe(true);
    expect(isPersonalBest({ exerciseId: "bench", weight: 97.5, reps: 12 }, { exerciseId: "bench", weight: 100, reps: 5 })).toBe(false);
  });

  it("stores only one maximum result per exercise in a workout", () => {
    const result = upsertResult(
      [{ exerciseId: "bench", weight: 95, reps: 8 }],
      { exerciseId: "bench", weight: 100, reps: 5 },
    );
    expect(result).toEqual([{ exerciseId: "bench", weight: 100, reps: 5 }]);
  });

  it("formats a duration independently of background timers", () => {
    expect(formatDuration("2026-08-22T10:00:00.000Z", "2026-08-22T11:02:03.000Z")).toBe("01:02:03");
  });

  it("allows finishing after at least one exercise result", () => {
    expect(canFinishWorkout({
      id: "active",
      programName: "Тренировка № 1",
      startedAt: "2026-08-22T10:00:00.000Z",
      status: "active",
      results: [],
    })).toBe(false);
    expect(canFinishWorkout({
      id: "active",
      programName: "Тренировка № 1",
      startedAt: "2026-08-22T10:00:00.000Z",
      status: "active",
      results: [{ exerciseId: "bench", weight: 100, reps: 5 }],
    })).toBe(true);
  });
});
