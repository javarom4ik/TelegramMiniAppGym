import { describe, expect, it } from "vitest";
import { parseAppAction } from "./app-actions";

describe("parseAppAction", () => {
  it("accepts known actions with the expected fields", () => {
    expect(parseAppAction({ type: "finish-workout" })).toEqual({ type: "finish-workout" });
    expect(parseAppAction({
      type: "save-result",
      exerciseId: "exercise-id",
      weight: 87.5,
      reps: 8,
    })).toEqual({
      type: "save-result",
      exerciseId: "exercise-id",
      weight: 87.5,
      reps: 8,
    });
  });

  it("rejects unknown or malformed actions", () => {
    expect(parseAppAction({ type: "drop-database" })).toBeUndefined();
    expect(parseAppAction({ type: "set-program-exercises", programId: "id", exerciseIds: "all" })).toBeUndefined();
    expect(parseAppAction(null)).toBeUndefined();
  });
});
