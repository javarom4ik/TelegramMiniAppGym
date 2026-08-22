export type AppAction =
  | { type: "select-program"; programId: string }
  | { type: "add-program" }
  | { type: "delete-program"; programId: string }
  | { type: "set-program-exercises"; programId: string; exerciseIds: string[] }
  | { type: "create-exercise"; name: string; muscleGroup: string; programId: string }
  | { type: "delete-exercise"; exerciseId: string }
  | { type: "start-workout"; programId: string }
  | { type: "save-result"; exerciseId: string; weight: number; reps: number }
  | { type: "finish-workout" }
  | { type: "cancel-workout" };

export const MUSCLE_GROUPS = [
  "Плечи",
  "Бицепс",
  "Трицепс",
  "Грудь",
  "Спина",
  "Предплечья",
  "Ноги",
  "Другое",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseAppAction(value: unknown): AppAction | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "add-program":
    case "finish-workout":
    case "cancel-workout":
      return { type: value.type };
    case "select-program":
    case "delete-program":
    case "start-workout":
      return typeof value.programId === "string"
        ? { type: value.type, programId: value.programId }
        : undefined;
    case "delete-exercise":
      return typeof value.exerciseId === "string"
        ? { type: value.type, exerciseId: value.exerciseId }
        : undefined;
    case "set-program-exercises":
      return typeof value.programId === "string"
        && Array.isArray(value.exerciseIds)
        && value.exerciseIds.every((id) => typeof id === "string")
        ? { type: value.type, programId: value.programId, exerciseIds: value.exerciseIds }
        : undefined;
    case "create-exercise":
      return typeof value.name === "string"
        && typeof value.muscleGroup === "string"
        && typeof value.programId === "string"
        ? {
            type: value.type,
            name: value.name,
            muscleGroup: value.muscleGroup,
            programId: value.programId,
          }
        : undefined;
    case "save-result":
      return typeof value.exerciseId === "string"
        && typeof value.weight === "number"
        && typeof value.reps === "number"
        ? {
            type: value.type,
            exerciseId: value.exerciseId,
            weight: value.weight,
            reps: value.reps,
          }
        : undefined;
    default:
      return undefined;
  }
}
