import type { Workout } from "./domain";

export function hasSavedExerciseResult(
  exerciseId: string,
  history: Workout[],
  activeWorkout?: Workout,
): boolean {
  return history.some((workout) =>
    workout.results.some((result) => result.exerciseId === exerciseId),
  ) || Boolean(activeWorkout?.results.some((result) => result.exerciseId === exerciseId));
}
