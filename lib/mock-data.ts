import type { Exercise, StoredAppState } from "./domain";

export const exercises: Exercise[] = [
  { id: "machine-lateral-raise", name: "Отведение рук в стороны в тренажёре", muscleGroup: "Плечи", position: 1 },
  { id: "machine-shoulder-press", name: "Жим на плечи в тренажёре сидя", muscleGroup: "Плечи", position: 2 },
  { id: "hammer-curl", name: "Молотковые сгибания с гантелями", muscleGroup: "Бицепс", position: 3 },
  { id: "cable-biceps-curl", name: "Сгибание рук на нижнем блоке", muscleGroup: "Бицепс", position: 4 },
  { id: "preacher-curl", name: "Сгибание рук на скамье Скотта", muscleGroup: "Бицепс", position: 5 },
  { id: "seated-dip-machine", name: "Отжимания на брусьях в тренажёре сидя", muscleGroup: "Трицепс", position: 6 },
  { id: "hammer-chest-press", name: "Жим от груди в рычажном тренажёре", muscleGroup: "Грудь", position: 7 },
  { id: "bench-press", name: "Жим штанги лёжа", muscleGroup: "Грудь", position: 8 },
  { id: "incline-machine-press", name: "Жим от груди в наклонном тренажёре", muscleGroup: "Грудь", position: 9 },
  { id: "seated-cable-row", name: "Горизонтальная тяга блока сидя", muscleGroup: "Спина", position: 10 },
  { id: "lat-pulldown", name: "Тяга верхнего блока к груди", muscleGroup: "Спина", position: 11 },
  { id: "lever-row", name: "Горизонтальная тяга в рычажном тренажёре", muscleGroup: "Спина", position: 12 },
  { id: "barbell-wrist-curl", name: "Сгибание запястий со штангой", muscleGroup: "Предплечья", position: 13 },
  { id: "leg-press", name: "Жим ногами в тренажёре", muscleGroup: "Ноги", position: 14 },
];

export const BASE_PROGRAMS_VERSION = 1;

// Names retained only for displaying old prototype history after the base catalog changed.
export const legacyExerciseNames: Record<string, string> = {
  "incline-dumbbell": "Жим гантелей под углом",
  "cable-fly": "Сведение рук в кроссовере",
  "triceps-pushdown": "Разгибание рук на блоке",
  "overhead-extension": "Разгибание из-за головы",
  "dumbbell-curl": "Сгибание рук с гантелями",
};

export const initialState: StoredAppState = {
  profile: { firstName: "Роман" },
  selectedProgramId: "program-1",
  baseExercises: exercises,
  customExercises: [],
  baseProgramsVersion: BASE_PROGRAMS_VERSION,
  programs: [
    {
      id: "program-1",
      name: "Тренировка № 1",
      exerciseIds: [
        "lat-pulldown",
        "bench-press",
        "barbell-wrist-curl",
        "machine-shoulder-press",
        "cable-biceps-curl",
      ],
    },
    {
      id: "program-2",
      name: "Тренировка № 2",
      exerciseIds: [
        "incline-machine-press",
        "seated-dip-machine",
        "preacher-curl",
        "machine-shoulder-press",
        "lever-row",
        "leg-press",
      ],
    },
    {
      id: "program-3",
      name: "Тренировка № 3",
      exerciseIds: [
        "hammer-curl",
        "hammer-chest-press",
        "machine-lateral-raise",
        "seated-cable-row",
        "barbell-wrist-curl",
      ],
    },
  ],
  history: [],
};
