"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppAction } from "@/lib/app-actions";
import { MUSCLE_GROUPS } from "@/lib/app-actions";
import { AppApiError, initializeTelegramApp, requestAppState } from "@/lib/client/telegram-app";
import type { Exercise, ExerciseResult, Program, StoredAppState, Workout } from "@/lib/domain";
import { hasSavedExerciseResult } from "@/lib/exercises";
import { exercises, initialState, legacyExerciseNames } from "@/lib/mock-data";
import { removeProgram } from "@/lib/programs";
import { isDemoMode } from "@/lib/runtime-mode";
import {
  canFinishWorkout,
  formatDuration,
  formatResult,
  getExerciseReference,
  isPersonalBest,
  upsertResult,
} from "@/lib/records";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  DumbbellIcon,
  HistoryIcon,
  PlusIcon,
  ProgramIcon,
  TrashIcon,
} from "./icons";

const STORAGE_KEY = "gym-tracker-prototype-v1";
const DEMO_MODE = isDemoMode(process.env.NODE_ENV, process.env.NEXT_PUBLIC_DEMO_MODE);
const MUSCLE_GROUP_ORDER = new Map<string, number>(MUSCLE_GROUPS.map((group, index) => [group, index]));
type Tab = "workout" | "history" | "program";
type Draft = { weight: string; reps: string };

function sortExercisesByMuscleGroup(items: Exercise[]): Exercise[] {
  return [...items].sort((left, right) => {
    const groupDifference = (MUSCLE_GROUP_ORDER.get(left.muscleGroup) ?? MUSCLE_GROUPS.length)
      - (MUSCLE_GROUP_ORDER.get(right.muscleGroup) ?? MUSCLE_GROUPS.length);
    return groupDifference || left.position - right.position;
  });
}

function cloneInitialState(): StoredAppState {
  return JSON.parse(JSON.stringify(initialState)) as StoredAppState;
}

type LegacyStoredState = Omit<StoredAppState, "profile" | "baseExercises" | "customExercises" | "baseProgramsVersion" | "programs"> & {
  profile?: StoredAppState["profile"];
  baseExercises?: Exercise[];
  customExercises?: Exercise[];
  baseProgramsVersion?: number;
  programs?: Program[];
  programExerciseIds?: string[];
};

function normalizeStoredState(state: LegacyStoredState): StoredAppState {
  const normalizeWorkout = (workout: Workout): Workout => ({
    ...workout,
    programName: workout.programName === "Грудь + трицепс" ? "Тренировка № 1" : workout.programName,
  });
  const baseExercises = Array.isArray(state.baseExercises) ? state.baseExercises : exercises;
  const customExercises = Array.isArray(state.customExercises) ? state.customExercises : [];
  const validExerciseIds = new Set(
    [...baseExercises, ...customExercises].map((exercise) => exercise.id),
  );
  const storedPrograms: Program[] = Array.isArray(state.programs)
    ? state.programs.map((program) => ({
        ...program,
        name: program.name === "Грудь + трицепс" ? "Тренировка № 1" : program.name,
        exerciseIds: program.exerciseIds.filter((exerciseId) => validExerciseIds.has(exerciseId)),
      }))
    : [{
        id: "program-1",
        name: "Тренировка № 1",
        exerciseIds: (state.programExerciseIds ?? initialState.programs[0].exerciseIds)
          .filter((exerciseId) => validExerciseIds.has(exerciseId)),
      }];
  const baseProgramNames = new Set(initialState.programs.map((program) => program.name));
  const baseProgramIds = new Set(initialState.programs.map((program) => program.id));
  const programs = state.baseProgramsVersion === initialState.baseProgramsVersion
    ? storedPrograms
    : [
        ...initialState.programs.map((template) => {
          const existing = storedPrograms.find(
            (program) => program.id === template.id || program.name === template.name,
          );
          return { ...template, id: existing?.id ?? template.id };
        }),
        ...storedPrograms.filter(
          (program) => !baseProgramIds.has(program.id) && !baseProgramNames.has(program.name),
        ),
      ];
  const selectedProgramId = programs.some((program) => program.id === state.selectedProgramId)
    ? state.selectedProgramId
    : programs[0]?.id ?? "";
  const selectedProgram = programs.find((program) => program.id === selectedProgramId);
  return {
    profile: state.profile ?? initialState.profile,
    activeWorkout: state.activeWorkout
      ? {
          ...normalizeWorkout(state.activeWorkout),
          exerciseIds: (state.activeWorkout.exerciseIds ?? [...(selectedProgram?.exerciseIds ?? [])])
            .filter((exerciseId) => validExerciseIds.has(exerciseId)),
        }
      : undefined,
    history: state.history.map(normalizeWorkout),
    programs,
    selectedProgramId,
    baseExercises,
    customExercises,
    baseProgramsVersion: initialState.baseProgramsVersion,
  };
}

function exerciseNameById(catalogExercises: Exercise[], exerciseId: string): string {
  return catalogExercises.find((exercise) => exercise.id === exerciseId)?.name
    ?? legacyExerciseNames[exerciseId]
    ?? "Удалённое упражнение";
}

function exerciseCountLabel(count: number): string {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  const form = lastTwoDigits >= 11 && lastTwoDigits <= 14
    ? "упражнений"
    : lastDigit === 1
      ? "упражнение"
      : lastDigit >= 2 && lastDigit <= 4
        ? "упражнения"
        : "упражнений";
  return `${count} ${form}`;
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(new Date(date));
}

function parseWeight(value: string): number {
  return Number(value.replace(",", "."));
}

export function WorkoutApp() {
  const [state, setState] = useState<StoredAppState>(cloneInitialState);
  const [tab, setTab] = useState<Tab>("workout");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const initDataRef = useRef("");
  const syncingRef = useRef(false);
  const [, setClock] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!DEMO_MODE) {
        try {
          initDataRef.current = initializeTelegramApp();
          const remoteState = await requestAppState(initDataRef.current);
          if (!cancelled) setState(normalizeStoredState(remoteState));
        } catch (error) {
          if (!cancelled) {
            setLoadError(error instanceof Error ? error.message : "Не удалось загрузить дневник.");
          }
        } finally {
          if (!cancelled) setHydrated(true);
        }
        return;
      }

      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as LegacyStoredState;
          setState(normalizeStoredState(parsed));
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }
      setHydrated(true);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!DEMO_MODE || !hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  async function runRemoteAction(action: AppAction): Promise<string | undefined> {
    if (DEMO_MODE) return undefined;
    if (syncingRef.current) return "Дождитесь завершения предыдущего действия.";
    syncingRef.current = true;
    setSyncing(true);
    setActionError(undefined);
    try {
      const remoteState = await requestAppState(initDataRef.current, action);
      setState(normalizeStoredState(remoteState));
      return undefined;
    } catch (error) {
      const message = error instanceof AppApiError ? error.message : "Не удалось сохранить изменения.";
      setActionError(message);
      return message;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!state.activeWorkout) return;
    const timer = window.setInterval(() => setClock((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [state.activeWorkout]);

  const selectedProgram = state.programs.find((program) => program.id === state.selectedProgramId)
    ?? state.programs[0];

  const allExercises = useMemo(
    () => [...state.baseExercises, ...state.customExercises],
    [state.baseExercises, state.customExercises],
  );

  const selectedProgramExercises = useMemo(
    () =>
      (selectedProgram?.exerciseIds ?? [])
        .map((id) => allExercises.find((exercise) => exercise.id === id))
        .filter((exercise): exercise is Exercise => Boolean(exercise)),
    [allExercises, selectedProgram],
  );

  const activeWorkoutExercises = useMemo(
    () =>
      (state.activeWorkout?.exerciseIds ?? selectedProgram?.exerciseIds ?? [])
        .map((id) => allExercises.find((exercise) => exercise.id === id))
        .filter((exercise): exercise is Exercise => Boolean(exercise)),
    [allExercises, selectedProgram, state.activeWorkout],
  );

  function startWorkout() {
    if (!selectedProgram || selectedProgram.exerciseIds.length === 0) {
      setTab("program");
      return;
    }
    if (!DEMO_MODE) {
      void (async () => {
        const error = await runRemoteAction({ type: "start-workout", programId: selectedProgram.id });
        if (!error) {
          setDrafts({});
          setTab("workout");
        }
      })();
      return;
    }
    const activeWorkout: Workout = {
      id: crypto.randomUUID(),
      programName: selectedProgram.name,
      exerciseIds: [...selectedProgram.exerciseIds],
      startedAt: new Date().toISOString(),
      status: "active",
      results: [],
    };
    setDrafts({});
    setState((current) => ({ ...current, activeWorkout }));
    setTab("workout");
  }

  function finishWorkout() {
    if (!state.activeWorkout || !canFinishWorkout(state.activeWorkout)) return;
    if (!DEMO_MODE) {
      void (async () => {
        const error = await runRemoteAction({ type: "finish-workout" });
        if (!error) {
          setDrafts({});
          setTab("history");
        }
      })();
      return;
    }
    const completed: Workout = {
      ...state.activeWorkout,
      status: "completed",
      finishedAt: new Date().toISOString(),
    };
    setState((current) => ({
      ...current,
      activeWorkout: undefined,
      history: [completed, ...current.history],
    }));
    setDrafts({});
    setTab("history");
  }

  function cancelWorkout() {
    if (!state.activeWorkout) return;
    if (!window.confirm("Отменить текущую тренировку? Введённые результаты не сохранятся.")) return;
    if (!DEMO_MODE) {
      void (async () => {
        const error = await runRemoteAction({ type: "cancel-workout" });
        if (!error) setDrafts({});
      })();
      return;
    }
    setState((current) => ({ ...current, activeWorkout: undefined }));
    setDrafts({});
  }

  function saveResult(exerciseId: string) {
    const draft = drafts[exerciseId];
    if (!draft) return;
    const weight = parseWeight(draft.weight);
    const reps = Number(draft.reps);
    if (!Number.isFinite(weight) || weight <= 0 || !Number.isInteger(reps) || reps <= 0) return;

    const next: ExerciseResult = { exerciseId, weight, reps };
    if (!DEMO_MODE) {
      void runRemoteAction({ type: "save-result", exerciseId, weight, reps });
      return;
    }
    setState((current) => {
      if (!current.activeWorkout) return current;
      return {
        ...current,
        activeWorkout: {
          ...current.activeWorkout,
          results: upsertResult(current.activeWorkout.results, next),
        },
      };
    });
  }

  function copyPrevious(exerciseId: string) {
    const previous = getExerciseReference(state.history, exerciseId).previous;
    if (!previous) return;
    setDrafts((current) => ({
      ...current,
      [exerciseId]: { weight: String(previous.weight), reps: String(previous.reps) },
    }));
  }

  function moveExercise(index: number, direction: -1 | 1) {
    if (!selectedProgram) return;
    const target = index + direction;
    if (target < 0 || target >= selectedProgram.exerciseIds.length) return;
    const reorderedExerciseIds = [...selectedProgram.exerciseIds];
    [reorderedExerciseIds[index], reorderedExerciseIds[target]] = [reorderedExerciseIds[target], reorderedExerciseIds[index]];
    if (!DEMO_MODE) {
      void runRemoteAction({
        type: "set-program-exercises",
        programId: selectedProgram.id,
        exerciseIds: reorderedExerciseIds,
      });
      return;
    }
    setState((current) => {
      const currentProgram = current.programs.find((program) => program.id === current.selectedProgramId);
      if (!currentProgram) return current;
      const next = [...currentProgram.exerciseIds];
      [next[index], next[target]] = [next[target], next[index]];
      return {
        ...current,
        programs: current.programs.map((program) =>
          program.id === currentProgram.id ? { ...program, exerciseIds: next } : program,
        ),
      };
    });
  }

  function selectProgram(programId: string) {
    if (!DEMO_MODE) {
      void runRemoteAction({ type: "select-program", programId });
      return;
    }
    setState((current) => ({ ...current, selectedProgramId: programId }));
  }

  function addProgram() {
    if (!DEMO_MODE) {
      void runRemoteAction({ type: "add-program" });
      return;
    }
    setState((current) => {
      const highestNumber = current.programs.reduce((highest, program) => {
        const match = program.name.match(/№\s*(\d+)/);
        return Math.max(highest, match ? Number(match[1]) : 0);
      }, 0);
      const program: Program = {
        id: crypto.randomUUID(),
        name: `Тренировка № ${highestNumber + 1}`,
        exerciseIds: [],
      };
      return {
        ...current,
        programs: [...current.programs, program],
        selectedProgramId: program.id,
      };
    });
  }

  function deleteProgram(programId: string) {
    if (!DEMO_MODE) {
      void runRemoteAction({ type: "delete-program", programId });
      return;
    }
    setState((current) => {
      const next = removeProgram(current.programs, current.selectedProgramId, programId);
      return { ...current, ...next };
    });
  }

  function addExerciseToProgram(exerciseId: string) {
    if (!selectedProgram) return;
    if (!DEMO_MODE) {
      void runRemoteAction({
        type: "set-program-exercises",
        programId: selectedProgram.id,
        exerciseIds: [...selectedProgram.exerciseIds, exerciseId],
      });
      return;
    }
    setState((current) => ({
      ...current,
      programs: current.programs.map((program) =>
        program.id === current.selectedProgramId && !program.exerciseIds.includes(exerciseId)
          ? { ...program, exerciseIds: [...program.exerciseIds, exerciseId] }
          : program,
      ),
    }));
  }

  function removeExerciseFromProgram(exerciseId: string) {
    if (!selectedProgram) return;
    if (!DEMO_MODE) {
      void runRemoteAction({
        type: "set-program-exercises",
        programId: selectedProgram.id,
        exerciseIds: selectedProgram.exerciseIds.filter((id) => id !== exerciseId),
      });
      return;
    }
    setState((current) => ({
      ...current,
      programs: current.programs.map((program) =>
        program.id === current.selectedProgramId
          ? { ...program, exerciseIds: program.exerciseIds.filter((id) => id !== exerciseId) }
          : program,
      ),
    }));
  }

  async function createExercise(name: string, muscleGroup: string): Promise<string | undefined> {
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2) return "Введите название упражнения.";
    if (allExercises.some((exercise) => exercise.name.toLocaleLowerCase("ru-RU") === normalizedName.toLocaleLowerCase("ru-RU"))) {
      return "Упражнение с таким названием уже существует.";
    }
    if (!selectedProgram) return "Сначала добавьте тренировку.";
    if (!DEMO_MODE) {
      return runRemoteAction({
        type: "create-exercise",
        name: normalizedName,
        muscleGroup,
        programId: selectedProgram.id,
      });
    }

    const exercise: Exercise = {
      id: crypto.randomUUID(),
      name: normalizedName,
      muscleGroup,
      position: allExercises.length + 1,
    };
    setState((current) => ({
      ...current,
      customExercises: [...current.customExercises, exercise],
      programs: current.programs.map((program) =>
        program.id === current.selectedProgramId
          ? { ...program, exerciseIds: [...program.exerciseIds, exercise.id] }
          : program,
      ),
    }));
    return undefined;
  }

  async function deleteCustomExercise(exerciseId: string): Promise<string | undefined> {
    if (!state.customExercises.some((exercise) => exercise.id === exerciseId)) {
      return "Базовые упражнения нельзя удалить.";
    }
    if (hasSavedExerciseResult(exerciseId, state.history, state.activeWorkout)) {
      return "Нельзя удалить упражнение с сохранённым результатом.";
    }
    if (!DEMO_MODE) return runRemoteAction({ type: "delete-exercise", exerciseId });

    setState((current) => ({
      ...current,
      customExercises: current.customExercises.filter((exercise) => exercise.id !== exerciseId),
      programs: current.programs.map((program) => ({
        ...program,
        exerciseIds: program.exerciseIds.filter((id) => id !== exerciseId),
      })),
      activeWorkout: current.activeWorkout
        ? {
            ...current.activeWorkout,
            exerciseIds: current.activeWorkout.exerciseIds?.filter((id) => id !== exerciseId),
          }
        : undefined,
    }));
    setDrafts((current) => {
      const next = { ...current };
      delete next[exerciseId];
      return next;
    });
    return undefined;
  }

  if (!DEMO_MODE && !hydrated) {
    return <AppStatus title="Загружаю дневник" description="Получаю программы и историю тренировок." />;
  }

  if (!DEMO_MODE && loadError) {
    return <AppStatus title="Дневник недоступен" description={loadError} />;
  }

  return (
    <main className={`app-shell ${syncing ? "syncing" : ""}`} aria-busy={syncing}>
      <header className="topbar">
        <div>
          <p className="brand-kicker">Личный журнал</p>
        </div>
        <div className="avatar" aria-label={`Пользователь ${state.profile.firstName}`}>
          {state.profile.firstName.slice(0, 1).toLocaleUpperCase("ru-RU")}
        </div>
      </header>

      {syncing && <div className="sync-indicator" role="status">Сохраняю…</div>}
      {actionError && (
        <div className="action-error" role="alert">
          <span>{actionError}</span>
          <button onClick={() => setActionError(undefined)} aria-label="Закрыть сообщение">×</button>
        </div>
      )}

      <div className="page-content">
        {tab === "workout" && (
          state.activeWorkout ? (
            <ActiveWorkout
              workout={state.activeWorkout}
              history={state.history}
              exercises={activeWorkoutExercises}
              drafts={drafts}
              setDrafts={setDrafts}
              onCopyPrevious={copyPrevious}
              onSave={saveResult}
              onFinish={finishWorkout}
              onCancel={cancelWorkout}
            />
          ) : (
            <WorkoutHome
              history={state.history}
              firstName={state.profile.firstName}
              programs={state.programs}
              program={selectedProgram}
              catalogExercises={allExercises}
              onSelectProgram={selectProgram}
              onStart={startWorkout}
              onOpenProgram={() => setTab("program")}
            />
          )
        )}

        {tab === "history" && <HistoryView history={state.history} catalogExercises={allExercises} />}

        {tab === "program" && (
          <ProgramView
            programs={state.programs}
            selectedProgram={selectedProgram}
            plannedExercises={selectedProgramExercises}
            catalogExercises={allExercises}
            customExercises={state.customExercises}
            onSelectProgram={selectProgram}
            onAddProgram={addProgram}
            onDeleteProgram={deleteProgram}
            onAddExercise={addExerciseToProgram}
            onRemoveExercise={removeExerciseFromProgram}
            onCreateExercise={createExercise}
            onDeleteCustomExercise={deleteCustomExercise}
            onMove={moveExercise}
          />
        )}
      </div>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <NavButton active={tab === "workout"} label="Тренировка" onClick={() => setTab("workout")}>
          <DumbbellIcon />
        </NavButton>
        <NavButton active={tab === "history"} label="История" onClick={() => setTab("history")}>
          <HistoryIcon />
        </NavButton>
        <NavButton active={tab === "program"} label="Программа" onClick={() => setTab("program")}>
          <ProgramIcon />
        </NavButton>
      </nav>
    </main>
  );
}

function AppStatus({ title, description }: { title: string; description: string }) {
  return (
    <main className="app-shell app-status-shell">
      <div className="app-status-card" role="status">
        <p className="eyebrow">Личный журнал</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </main>
  );
}

function WorkoutHome({
  history,
  firstName,
  programs,
  program,
  catalogExercises,
  onSelectProgram,
  onStart,
  onOpenProgram,
}: {
  history: Workout[];
  firstName: string;
  programs: Program[];
  program?: Program;
  catalogExercises: Exercise[];
  onSelectProgram: (programId: string) => void;
  onStart: () => void;
  onOpenProgram: () => void;
}) {
  const [programPickerOpen, setProgramPickerOpen] = useState(false);
  const last = history.find((workout) => workout.status === "completed");
  const exerciseCount = program?.exerciseIds.length ?? 0;
  return (
    <section className="screen enter">
      <div className="welcome">
        <p>Привет, {firstName}</p>
      </div>

      <article className="start-card">
        <div className="start-copy">
          <p className="eyebrow light">Выбранная тренировка</p>
          <h1>{program?.name ?? "Новая программа"}</h1>
          <p>{exerciseCountLabel(exerciseCount)}</p>
        </div>
        <div className="start-actions">
          <button className="primary-button" onClick={exerciseCount > 0 ? onStart : onOpenProgram}>
            {exerciseCount > 0 ? "Начать тренировку" : "Добавить упражнения"}
          </button>
          <button
            className="choose-program-button"
            onClick={() => setProgramPickerOpen((open) => !open)}
            aria-expanded={programPickerOpen}
            aria-controls="home-program-picker"
          >
            Выбрать тренировку
          </button>
        </div>
      </article>

      {programPickerOpen && (
        <div className="home-program-picker enter" id="home-program-picker" aria-label="Выбор тренировки">
          <p className="eyebrow">Доступные тренировки</p>
          {programs.length > 0 ? programs.map((item) => {
            const selected = item.id === program?.id;
            return (
              <button
                key={item.id}
                className={selected ? "active" : ""}
                onClick={() => {
                  onSelectProgram(item.id);
                  setProgramPickerOpen(false);
                }}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>{exerciseCountLabel(item.exerciseIds.length)}</small>
                </span>
                {selected && <CheckIcon />}
              </button>
            );
          }) : (
            <button onClick={onOpenProgram}>
              <span>
                <strong>Добавить тренировку</strong>
                <small>Программ пока нет</small>
              </span>
              <PlusIcon />
            </button>
          )}
        </div>
      )}

      <div className="section-heading">
        <div>
          <p className="eyebrow">Последняя запись</p>
          <h2>{last ? dateLabel(last.finishedAt!) : "Пока пусто"}</h2>
        </div>
        {last && (
          <div className="last-workout-meta">
            <span className="exercise-count-chip">{exerciseCountLabel(last.results.length)}</span>
            <span className="duration-chip">
              <span>Время</span>
              {formatDuration(last.startedAt, last.finishedAt)}
            </span>
          </div>
        )}
      </div>

      {last ? (
        <div className="last-results">
          {last.results.slice(0, 3).map((result) => {
            return (
              <div className="result-row" key={result.exerciseId}>
                <span>{exerciseNameById(catalogExercises, result.exerciseId)}</span>
                <strong>{formatResult(result)}</strong>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">Начните тренировку — первый результат появится здесь.</p>
      )}
    </section>
  );
}

function ActiveWorkout({
  workout,
  history,
  exercises: plannedExercises,
  drafts,
  setDrafts,
  onCopyPrevious,
  onSave,
  onFinish,
  onCancel,
}: {
  workout: Workout;
  history: Workout[];
  exercises: Exercise[];
  drafts: Record<string, Draft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, Draft>>>;
  onCopyPrevious: (exerciseId: string) => void;
  onSave: (exerciseId: string) => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const canFinish = canFinishWorkout(workout);
  return (
    <section className="screen enter active-screen">
      <article className="timer-card">
        <div className="timer-dial">
          <div>
            <span>Время</span>
            <strong>{formatDuration(workout.startedAt)}</strong>
          </div>
        </div>
        <div className="timer-meta">
          <p className="eyebrow light">Тренировка идёт</p>
          <h1>{workout.programName}</h1>
          <p>{workout.results.length} из {plannedExercises.length} результатов записано</p>
          <button className="text-button light" onClick={onCancel}>Отменить</button>
        </div>
      </article>

      <div className="section-heading compact-heading">
        <div>
          <p className="eyebrow">Рабочие максимумы</p>
          <h2>Упражнения</h2>
        </div>
      </div>

      <div className="exercise-list">
        {plannedExercises.map((exercise, index) => {
          const reference = getExerciseReference(history, exercise.id);
          const saved = workout.results.find((result) => result.exerciseId === exercise.id);
          const draft = drafts[exercise.id] ?? {
            weight: saved ? String(saved.weight) : "",
            reps: saved ? String(saved.reps) : "",
          };
          const newBest = saved && isPersonalBest(saved, reference.best);
          const validDraft = parseWeight(draft.weight) > 0 && Number(draft.reps) > 0;

          return (
            <article className={`exercise-card ${saved ? "saved" : ""}`} key={exercise.id}>
              <header className="exercise-title">
                <span className="exercise-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p>{exercise.muscleGroup}</p>
                  <h3>{exercise.name}</h3>
                </div>
                {saved && <span className="saved-mark"><CheckIcon /></span>}
              </header>

              <div className="reference-grid">
                <div>
                  <span>Лучшее</span>
                  <strong>{formatResult(reference.best)}</strong>
                </div>
                <button type="button" onClick={() => onCopyPrevious(exercise.id)} disabled={!reference.previous}>
                  <span>Прошлый раз</span>
                  <strong>{formatResult(reference.previous)}</strong>
                </button>
              </div>

              <div className="entry-row">
                <label>
                  <span>Вес</span>
                  <div><input
                    inputMode="decimal"
                    value={draft.weight}
                    placeholder="0"
                    aria-label={`Вес: ${exercise.name}`}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [exercise.id]: { ...draft, weight: event.target.value },
                    }))}
                  /><em>кг</em></div>
                </label>
                <span className="multiply">×</span>
                <label>
                  <span>Повторы</span>
                  <div><input
                    inputMode="numeric"
                    value={draft.reps}
                    placeholder="0"
                    aria-label={`Повторения: ${exercise.name}`}
                    onChange={(event) => setDrafts((current) => ({
                      ...current,
                      [exercise.id]: { ...draft, reps: event.target.value.replace(/\D/g, "") },
                    }))}
                  /><em>раз</em></div>
                </label>
                <button
                  className="save-button"
                  onClick={() => onSave(exercise.id)}
                  disabled={!validDraft}
                  aria-label={`Сохранить: ${exercise.name}`}
                >
                  <CheckIcon />
                </button>
              </div>
              {newBest && <p className="personal-best">Новый рекорд</p>}
            </article>
          );
        })}
      </div>

      <p className="finish-hint">Для завершения достаточно сохранить результат одного упражнения.</p>
      <button className="finish-button" disabled={!canFinish} onClick={onFinish}>
        Завершить тренировку
      </button>
    </section>
  );
}

function HistoryView({
  history,
  catalogExercises,
}: {
  history: Workout[];
  catalogExercises: Exercise[];
}) {
  return (
    <section className="screen enter">
      <div className="screen-title">
        <p className="eyebrow">Все записи</p>
        <h1>История</h1>
        <p>Максимальный вес и повторы каждой тренировки.</p>
      </div>
      <div className="history-list">
        {history.map((workout) => (
          <details className="history-card" key={workout.id}>
            <summary>
              <div>
                <strong>{workout.programName}</strong>
                <span>{dateLabel(workout.finishedAt!)} · {formatDuration(workout.startedAt, workout.finishedAt)}</span>
              </div>
              <span>{workout.results.length}</span>
            </summary>
            <div className="history-results">
              {workout.results.map((result) => (
                <div key={result.exerciseId}>
                  <span>{exerciseNameById(catalogExercises, result.exerciseId)}</span>
                  <strong>{formatResult(result)}</strong>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ProgramView({
  programs,
  selectedProgram,
  plannedExercises,
  catalogExercises,
  customExercises,
  onSelectProgram,
  onAddProgram,
  onDeleteProgram,
  onAddExercise,
  onRemoveExercise,
  onCreateExercise,
  onDeleteCustomExercise,
  onMove,
}: {
  programs: Program[];
  selectedProgram?: Program;
  plannedExercises: Exercise[];
  catalogExercises: Exercise[];
  customExercises: Exercise[];
  onSelectProgram: (programId: string) => void;
  onAddProgram: () => void;
  onDeleteProgram: (programId: string) => void;
  onAddExercise: (exerciseId: string) => void;
  onRemoveExercise: (exerciseId: string) => void;
  onCreateExercise: (name: string, muscleGroup: string) => Promise<string | undefined>;
  onDeleteCustomExercise: (exerciseId: string) => Promise<string | undefined>;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [exerciseName, setExerciseName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState<string>(MUSCLE_GROUPS[0]);
  const [createError, setCreateError] = useState<string>();
  const [catalogError, setCatalogError] = useState<string>();
  const customExerciseIds = new Set(customExercises.map((exercise) => exercise.id));
  const sortedCustomExercises = sortExercisesByMuscleGroup(customExercises);
  const availableBaseExercises = sortExercisesByMuscleGroup(
    catalogExercises.filter(
      (exercise) =>
        !customExerciseIds.has(exercise.id)
        && !selectedProgram?.exerciseIds.includes(exercise.id),
    ),
  );

  async function submitExercise(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = await onCreateExercise(exerciseName, muscleGroup);
    setCreateError(error);
    if (error) return;
    setExerciseName("");
    setMuscleGroup(MUSCLE_GROUPS[0]);
    setCreateOpen(false);
  }

  async function deleteExercise(exercise: Exercise) {
    if (!window.confirm(`Удалить «${exercise.name}» из каталога и всех программ?`)) return;
    const error = await onDeleteCustomExercise(exercise.id);
    setCatalogError(error);
  }

  function deleteSelectedProgram() {
    if (!selectedProgram) return;
    if (!window.confirm(`Удалить «${selectedProgram.name}»? Сохранённая история тренировок останется.`)) return;
    onDeleteProgram(selectedProgram.id);
    setCatalogOpen(false);
    setCreateOpen(false);
  }

  return (
    <section className="screen enter">
      <div className="program-picker" aria-label="Выбор программы">
        {programs.map((program) => (
          <button
            key={program.id}
            className={program.id === selectedProgram?.id ? "active" : ""}
            onClick={() => onSelectProgram(program.id)}
          >
            {program.name}
          </button>
        ))}
        <button className="add-program-chip" onClick={onAddProgram}>
          <PlusIcon />
          Добавить программу
        </button>
      </div>

      <div className="screen-title">
        <p className="eyebrow">Выбранная программа</p>
        <h1>{selectedProgram?.name ?? "Нет тренировок"}</h1>
        <p>{selectedProgram
          ? "Выберите упражнения и расставьте их в удобном порядке."
          : "Добавьте тренировку, чтобы собрать для неё программу."}</p>
      </div>

      {selectedProgram ? (
        <>
      <button className="delete-program-button" onClick={deleteSelectedProgram}>
        <TrashIcon />
        Удалить тренировку
      </button>

      {plannedExercises.length > 0 ? (
        <div className="program-list">
          {plannedExercises.map((exercise, index) => (
            <article key={exercise.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{exercise.name}</strong>
                <small>{exercise.muscleGroup}</small>
              </div>
              <div className="program-actions">
                <div className="order-controls">
                  <button disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={`Поднять: ${exercise.name}`}><ArrowUpIcon /></button>
                  <button disabled={index === plannedExercises.length - 1} onClick={() => onMove(index, 1)} aria-label={`Опустить: ${exercise.name}`}><ArrowDownIcon /></button>
                </div>
                <button className="remove-exercise" onClick={() => onRemoveExercise(exercise.id)} aria-label={`Удалить из программы: ${exercise.name}`}><TrashIcon /></button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-program">В этой программе пока нет упражнений.</p>
      )}

      <button className="add-exercise-button" onClick={() => setCatalogOpen((open) => !open)}>
        <PlusIcon />
        {catalogOpen ? "Закрыть каталог" : "Добавить упражнение"}
      </button>

      {catalogOpen && (
        <div className="exercise-catalog enter">
          <div>
            <p className="eyebrow">Состав программы</p>
            <h2>Каталог упражнений</h2>
          </div>

          <button
            className="create-exercise-toggle"
            onClick={() => {
              setCreateOpen((open) => !open);
              setCreateError(undefined);
            }}
          >
            <span>
              <strong>Создать упражнение</strong>
              <small>Название и категория</small>
            </span>
            <PlusIcon />
          </button>

          {createOpen && (
            <form className="create-exercise-form enter" onSubmit={submitExercise}>
              <label>
                <span>Название</span>
                <input
                  value={exerciseName}
                  onChange={(event) => {
                    setExerciseName(event.target.value);
                    setCreateError(undefined);
                  }}
                  placeholder="Например, тяга Т-грифа"
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <label>
                <span>Категория</span>
                <select value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)}>
                  {MUSCLE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </label>
              {createError && <p role="alert">{createError}</p>}
              <button type="submit" disabled={exerciseName.trim().length < 2}>Создать и добавить</button>
            </form>
          )}

          {catalogError && <p className="catalog-error" role="alert">{catalogError}</p>}

          {sortedCustomExercises.length > 0 && (
            <div className="catalog-section">
              <p className="catalog-section-title">Мои упражнения</p>
              {sortedCustomExercises.map((exercise) => {
                const alreadyAdded = Boolean(selectedProgram?.exerciseIds.includes(exercise.id));
                return (
                  <div className="catalog-row" key={exercise.id}>
                    <span className="catalog-row-copy">
                      <strong>{exercise.name}</strong>
                      <small>{exercise.muscleGroup}</small>
                    </span>
                    <div className="catalog-actions">
                      <button
                        className="catalog-add"
                        disabled={alreadyAdded}
                        onClick={() => {
                          onAddExercise(exercise.id);
                          setCatalogError(undefined);
                        }}
                        aria-label={alreadyAdded ? `Уже добавлено: ${exercise.name}` : `Добавить в программу: ${exercise.name}`}
                      >
                        {alreadyAdded ? <CheckIcon /> : <PlusIcon />}
                      </button>
                      <button
                        className="catalog-delete"
                        onClick={() => void deleteExercise(exercise)}
                        aria-label={`Удалить из каталога: ${exercise.name}`}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="catalog-section">
            <p className="catalog-section-title">Базовые упражнения</p>
            {availableBaseExercises.length > 0 ? availableBaseExercises.map((exercise) => (
              <div className="catalog-row" key={exercise.id}>
                <span className="catalog-row-copy">
                  <strong>{exercise.name}</strong>
                  <small>{exercise.muscleGroup}</small>
                </span>
                <button
                  className="catalog-add"
                  onClick={() => onAddExercise(exercise.id)}
                  aria-label={`Добавить в программу: ${exercise.name}`}
                >
                  <PlusIcon />
                </button>
              </div>
            )) : (
              <p className="catalog-empty">Все базовые упражнения уже добавлены.</p>
            )}
          </div>
        </div>
      )}

      <p className="program-note">Незаполненное упражнение не попадёт в результат тренировки.</p>
        </>
      ) : (
        <p className="empty-program">Все тренировки удалены. Нажмите «Добавить программу», чтобы создать новую.</p>
      )}
    </section>
  );
}

function NavButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={active ? "active" : ""}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? "page" : undefined}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
