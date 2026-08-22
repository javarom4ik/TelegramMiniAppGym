export type Exercise = {
  id: string;
  name: string;
  muscleGroup: string;
  position: number;
};

export type ExerciseResult = {
  exerciseId: string;
  weight: number;
  reps: number;
};

export type Program = {
  id: string;
  name: string;
  exerciseIds: string[];
};

export type ResultReference = ExerciseResult & {
  workoutId: string;
  completedAt: string;
};

export type WorkoutStatus = "active" | "completed" | "cancelled";

export type Workout = {
  id: string;
  programName: string;
  exerciseIds?: string[];
  startedAt: string;
  finishedAt?: string;
  status: WorkoutStatus;
  results: ExerciseResult[];
};

export type ExerciseReference = {
  best?: ResultReference;
  previous?: ResultReference;
};

export type UserProfile = {
  firstName: string;
  username?: string;
};

export type StoredAppState = {
  profile: UserProfile;
  activeWorkout?: Workout;
  history: Workout[];
  programs: Program[];
  selectedProgramId: string;
  baseExercises: Exercise[];
  customExercises: Exercise[];
  baseProgramsVersion: number;
};
