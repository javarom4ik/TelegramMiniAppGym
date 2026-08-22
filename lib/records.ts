import type {
  ExerciseReference,
  ExerciseResult,
  ResultReference,
  Workout,
} from "./domain";

export function compareResults(a: ExerciseResult, b: ExerciseResult): number {
  if (a.weight !== b.weight) return a.weight - b.weight;
  return a.reps - b.reps;
}

export function isPersonalBest(
  candidate: ExerciseResult,
  currentBest?: ExerciseResult,
): boolean {
  return !currentBest || compareResults(candidate, currentBest) > 0;
}

export function getExerciseReference(
  history: Workout[],
  exerciseId: string,
): ExerciseReference {
  const completed = history
    .filter((workout) => workout.status === "completed" && workout.finishedAt)
    .sort(
      (a, b) =>
        new Date(b.finishedAt!).getTime() - new Date(a.finishedAt!).getTime(),
    );

  const matching: ResultReference[] = completed.flatMap((workout) => {
    const result = workout.results.find((entry) => entry.exerciseId === exerciseId);
    return result
      ? [{ ...result, workoutId: workout.id, completedAt: workout.finishedAt! }]
      : [];
  });

  const best = matching.reduce<ResultReference | undefined>((winner, item) => {
    if (!winner || compareResults(item, winner) > 0) return item;
    return winner;
  }, undefined);

  return { previous: matching[0], best };
}

export function upsertResult(
  results: ExerciseResult[],
  next: ExerciseResult,
): ExerciseResult[] {
  const existing = results.findIndex((item) => item.exerciseId === next.exerciseId);
  if (existing === -1) return [...results, next];
  return results.map((item, index) => (index === existing ? next : item));
}

export function canFinishWorkout(workout?: Workout): boolean {
  return Boolean(workout && workout.results.length >= 1);
}

export function formatResult(result?: ExerciseResult): string {
  if (!result) return "—";
  return `${formatWeight(result.weight)} кг × ${result.reps}`;
}

export function formatWeight(weight: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(weight);
}

export function formatDuration(startedAt: string, endedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}
