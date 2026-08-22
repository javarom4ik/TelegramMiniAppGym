import { describe, expect, it } from "vitest";
import { exercises, initialState } from "./mock-data";

const muscleGroupOrder = ["Плечи", "Бицепс", "Трицепс", "Грудь", "Спина", "Предплечья", "Ноги"];

describe("base exercise catalog", () => {
  it("contains the agreed exercises without duplicate ids", () => {
    expect(exercises).toHaveLength(14);
    expect(new Set(exercises.map((exercise) => exercise.id)).size).toBe(exercises.length);
    expect(exercises.map((exercise) => exercise.name)).toEqual(expect.arrayContaining([
      "Горизонтальная тяга в рычажном тренажёре",
      "Сгибание рук на скамье Скотта",
      "Отжимания на брусьях в тренажёре сидя",
      "Жим от груди в наклонном тренажёре",
      "Сгибание рук на нижнем блоке",
      "Жим на плечи в тренажёре сидя",
    ]));
  });

  it("is sorted by the agreed muscle-group order", () => {
    const groupRanks = exercises.map((exercise) => muscleGroupOrder.indexOf(exercise.muscleGroup));
    expect(groupRanks).toEqual([...groupRanks].sort((left, right) => left - right));
  });

  it("provides three filled starter programs", () => {
    expect(initialState.programs).toHaveLength(3);
    expect(initialState.programs.map((program) => program.exerciseIds.length)).toEqual([5, 6, 5]);
    expect(initialState.programs[0].exerciseIds).toEqual([
      "lat-pulldown",
      "bench-press",
      "barbell-wrist-curl",
      "machine-shoulder-press",
      "cable-biceps-curl",
    ]);
  });
});
