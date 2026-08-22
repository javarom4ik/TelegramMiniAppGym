import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppAction } from "@/lib/app-actions";
import { MUSCLE_GROUPS } from "@/lib/app-actions";
import { getDb } from "@/lib/db";
import {
  exercises,
  programExercises,
  programs,
  users,
  workoutExercises,
  workoutResults,
  workouts,
} from "@/lib/db/schema";
import type { StoredAppState, Workout } from "@/lib/domain";
import {
  BASE_PROGRAMS_VERSION,
  exercises as baseExerciseTemplates,
  initialState,
} from "@/lib/mock-data";
import { getNextProgramId } from "@/lib/programs";
import type { TelegramUser } from "@/lib/telegram/validate-init-data";

type Db = ReturnType<typeof getDb>;
type UserRow = typeof users.$inferSelect;

export class AppServiceError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function assertUuid(value: string, label: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppServiceError(`Некорректный идентификатор: ${label}.`);
  }
}

async function ensureUser(db: Db, telegramUser: TelegramUser): Promise<UserRow> {
  const [user] = await db
    .insert(users)
    .values({
      telegramId: telegramUser.id,
      firstName: telegramUser.first_name,
      username: telegramUser.username ?? null,
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        firstName: telegramUser.first_name,
        username: telegramUser.username ?? null,
      },
    })
    .returning();

  if (user.baseProgramsVersion >= BASE_PROGRAMS_VERSION) return user;
  await seedBaseData(db, user);
  const [seededUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return seededUser;
}

async function seedBaseData(db: Db, user: UserRow): Promise<void> {
  const existingExercises = await db.select().from(exercises).where(eq(exercises.ownerId, user.id));
  const exerciseIdByTemplateId = new Map<string, string>();

  for (const template of baseExerciseTemplates) {
    const existing = existingExercises.find((item) => item.name === template.name);
    const [row] = existing
      ? await db
          .update(exercises)
          .set({
            muscleGroup: template.muscleGroup,
            position: template.position,
            isCustom: false,
          })
          .where(and(eq(exercises.id, existing.id), eq(exercises.ownerId, user.id)))
          .returning()
      : await db
          .insert(exercises)
          .values({
            ownerId: user.id,
            name: template.name,
            muscleGroup: template.muscleGroup,
            position: template.position,
            isCustom: false,
          })
          .returning();
    exerciseIdByTemplateId.set(template.id, row.id);
  }

  const existingPrograms = await db.select().from(programs).where(eq(programs.ownerId, user.id));
  const seededProgramIds: string[] = [];

  for (const [position, template] of initialState.programs.entries()) {
    const existing = existingPrograms.find((item) => item.name === template.name);
    const [program] = existing
      ? await db
          .update(programs)
          .set({ position })
          .where(and(eq(programs.id, existing.id), eq(programs.ownerId, user.id)))
          .returning()
      : await db
          .insert(programs)
          .values({ ownerId: user.id, name: template.name, position })
          .returning();

    seededProgramIds.push(program.id);
    const rows = template.exerciseIds.map((templateExerciseId, exercisePosition) => {
      const exerciseId = exerciseIdByTemplateId.get(templateExerciseId);
      if (!exerciseId) throw new Error(`Missing seeded exercise: ${templateExerciseId}`);
      return { programId: program.id, exerciseId, position: exercisePosition };
    });
    await db.batch([
      db.delete(programExercises).where(eq(programExercises.programId, program.id)),
      db.insert(programExercises).values(rows),
    ]);
  }

  const selectedProgramStillExists = user.selectedProgramId
    && existingPrograms.some((program) => program.id === user.selectedProgramId);
  await db
    .update(users)
    .set({
      baseProgramsVersion: BASE_PROGRAMS_VERSION,
      selectedProgramId: selectedProgramStillExists ? user.selectedProgramId : seededProgramIds[0] ?? null,
    })
    .where(eq(users.id, user.id));
}

export async function getAuthenticatedAppState(telegramUser: TelegramUser): Promise<StoredAppState> {
  const db = getDb();
  const user = await ensureUser(db, telegramUser);
  return readAppState(db, user.id);
}

export async function performAuthenticatedAction(
  telegramUser: TelegramUser,
  action: AppAction,
): Promise<StoredAppState> {
  const db = getDb();
  const user = await ensureUser(db, telegramUser);
  await performAction(db, user, action);
  return readAppState(db, user.id);
}

async function readAppState(db: Db, userId: string): Promise<StoredAppState> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AppServiceError("Пользователь не найден.", 404);

  const [exerciseRows, programRows, programExerciseRows, workoutRows, resultRows, activeExerciseRows] = await Promise.all([
    db.select().from(exercises).where(eq(exercises.ownerId, userId)).orderBy(asc(exercises.position), asc(exercises.name)),
    db.select().from(programs).where(eq(programs.ownerId, userId)).orderBy(asc(programs.position), asc(programs.createdAt)),
    db
      .select({ programId: programExercises.programId, exerciseId: programExercises.exerciseId, position: programExercises.position })
      .from(programExercises)
      .innerJoin(programs, eq(programExercises.programId, programs.id))
      .where(eq(programs.ownerId, userId))
      .orderBy(asc(programExercises.position)),
    db
      .select()
      .from(workouts)
      .where(and(eq(workouts.userId, userId), inArray(workouts.status, ["active", "completed"])))
      .orderBy(desc(workouts.startedAt)),
    db
      .select({
        workoutId: workoutResults.workoutId,
        exerciseId: workoutResults.exerciseId,
        weight: workoutResults.weight,
        reps: workoutResults.reps,
      })
      .from(workoutResults)
      .innerJoin(workouts, eq(workoutResults.workoutId, workouts.id))
      .where(eq(workouts.userId, userId)),
    db
      .select({ workoutId: workoutExercises.workoutId, exerciseId: workoutExercises.exerciseId, position: workoutExercises.position })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workoutExercises.workoutId, workouts.id))
      .where(and(eq(workouts.userId, userId), eq(workouts.status, "active")))
      .orderBy(asc(workoutExercises.position)),
  ]);

  const mappedExercises = exerciseRows.map((exercise) => ({
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup,
    position: exercise.position,
  }));
  const mappedWorkouts: Workout[] = workoutRows.map((workout) => ({
    id: workout.id,
    programName: workout.programName,
    exerciseIds: workout.status === "active"
      ? activeExerciseRows.filter((item) => item.workoutId === workout.id).map((item) => item.exerciseId)
      : undefined,
    startedAt: workout.startedAt.toISOString(),
    finishedAt: workout.finishedAt?.toISOString(),
    status: workout.status,
    results: resultRows
      .filter((result) => result.workoutId === workout.id)
      .map((result) => ({ exerciseId: result.exerciseId, weight: result.weight, reps: result.reps })),
  }));
  const mappedPrograms = programRows.map((program) => ({
    id: program.id,
    name: program.name,
    exerciseIds: programExerciseRows
      .filter((item) => item.programId === program.id)
      .map((item) => item.exerciseId),
  }));
  const selectedProgramId = mappedPrograms.some((program) => program.id === user.selectedProgramId)
    ? user.selectedProgramId!
    : mappedPrograms[0]?.id ?? "";

  return {
    profile: {
      firstName: user.firstName,
      username: user.username ?? undefined,
    },
    activeWorkout: mappedWorkouts.find((workout) => workout.status === "active"),
    history: mappedWorkouts.filter((workout) => workout.status === "completed"),
    programs: mappedPrograms,
    selectedProgramId,
    baseExercises: mappedExercises.filter((_, index) => !exerciseRows[index].isCustom),
    customExercises: mappedExercises.filter((_, index) => exerciseRows[index].isCustom),
    baseProgramsVersion: user.baseProgramsVersion,
  };
}

async function performAction(db: Db, user: UserRow, action: AppAction): Promise<void> {
  switch (action.type) {
    case "select-program": {
      await requireProgram(db, user.id, action.programId);
      await db.update(users).set({ selectedProgramId: action.programId }).where(eq(users.id, user.id));
      return;
    }
    case "add-program": {
      const ownedPrograms = await db.select().from(programs).where(eq(programs.ownerId, user.id));
      const highestNumber = ownedPrograms.reduce((highest, program) => {
        const match = program.name.match(/№\s*(\d+)/);
        return Math.max(highest, match ? Number(match[1]) : 0);
      }, 0);
      const highestPosition = ownedPrograms.reduce((highest, program) => Math.max(highest, program.position), -1);
      const programId = randomUUID();
      await db.batch([
        db.insert(programs).values({
          id: programId,
          ownerId: user.id,
          name: `Тренировка № ${highestNumber + 1}`,
          position: highestPosition + 1,
        }),
        db.update(users).set({ selectedProgramId: programId }).where(eq(users.id, user.id)),
      ]);
      return;
    }
    case "delete-program": {
      const ownedPrograms = await db.select().from(programs).where(eq(programs.ownerId, user.id)).orderBy(asc(programs.position));
      const deletedIndex = ownedPrograms.findIndex((program) => program.id === action.programId);
      if (deletedIndex === -1) throw new AppServiceError("Тренировка не найдена.", 404);
      const remaining = ownedPrograms.filter((program) => program.id !== action.programId);
      if (user.selectedProgramId === action.programId) {
        const nextId = remaining[Math.min(deletedIndex, remaining.length - 1)]?.id ?? null;
        await db.batch([
          db.delete(programs).where(and(eq(programs.id, action.programId), eq(programs.ownerId, user.id))),
          db.update(users).set({ selectedProgramId: nextId }).where(eq(users.id, user.id)),
        ]);
      } else {
        await db.delete(programs).where(and(eq(programs.id, action.programId), eq(programs.ownerId, user.id)));
      }
      return;
    }
    case "set-program-exercises": {
      await requireProgram(db, user.id, action.programId);
      const uniqueExerciseIds = [...new Set(action.exerciseIds)];
      if (uniqueExerciseIds.length !== action.exerciseIds.length) {
        throw new AppServiceError("Упражнение не может повторяться в одной тренировке.");
      }
      if (uniqueExerciseIds.length > 0) {
        uniqueExerciseIds.forEach((id) => assertUuid(id, "exerciseId"));
        const ownedExercises = await db
          .select({ id: exercises.id })
          .from(exercises)
          .where(and(eq(exercises.ownerId, user.id), inArray(exercises.id, uniqueExerciseIds)));
        if (ownedExercises.length !== uniqueExerciseIds.length) {
          throw new AppServiceError("Одно из упражнений не найдено.", 404);
        }
      }
      if (uniqueExerciseIds.length > 0) {
        await db.batch([
          db.delete(programExercises).where(eq(programExercises.programId, action.programId)),
          db.insert(programExercises).values(
            uniqueExerciseIds.map((exerciseId, position) => ({ programId: action.programId, exerciseId, position })),
          ),
        ]);
      } else {
        await db.delete(programExercises).where(eq(programExercises.programId, action.programId));
      }
      return;
    }
    case "create-exercise": {
      await requireProgram(db, user.id, action.programId);
      const name = action.name.trim().replace(/\s+/g, " ");
      if (name.length < 2 || name.length > 120) throw new AppServiceError("Введите название упражнения.");
      if (!(MUSCLE_GROUPS as readonly string[]).includes(action.muscleGroup)) {
        throw new AppServiceError("Выберите корректную категорию.");
      }
      const ownerExercises = await db.select().from(exercises).where(eq(exercises.ownerId, user.id));
      if (ownerExercises.some((exercise) => exercise.name.toLocaleLowerCase("ru-RU") === name.toLocaleLowerCase("ru-RU"))) {
        throw new AppServiceError("Упражнение с таким названием уже существует.", 409);
      }
      const nextPosition = ownerExercises.reduce((highest, exercise) => Math.max(highest, exercise.position), -1) + 1;
      const exerciseId = randomUUID();
      const [{ maxPosition }] = await db
        .select({ maxPosition: sql<number>`coalesce(max(${programExercises.position}), -1)` })
        .from(programExercises)
        .where(eq(programExercises.programId, action.programId));
      await db.batch([
        db.insert(exercises).values({
          id: exerciseId,
          ownerId: user.id,
          name,
          muscleGroup: action.muscleGroup,
          position: nextPosition,
          isCustom: true,
        }),
        db.insert(programExercises).values({
          programId: action.programId,
          exerciseId,
          position: Number(maxPosition) + 1,
        }),
      ]);
      return;
    }
    case "delete-exercise": {
      assertUuid(action.exerciseId, "exerciseId");
      const [exercise] = await db
        .select()
        .from(exercises)
        .where(and(eq(exercises.id, action.exerciseId), eq(exercises.ownerId, user.id)))
        .limit(1);
      if (!exercise) throw new AppServiceError("Упражнение не найдено.", 404);
      if (!exercise.isCustom) throw new AppServiceError("Базовые упражнения нельзя удалить.");
      const [savedResult] = await db
        .select({ id: workoutResults.id })
        .from(workoutResults)
        .where(eq(workoutResults.exerciseId, exercise.id))
        .limit(1);
      if (savedResult) throw new AppServiceError("Нельзя удалить упражнение с сохранённым результатом.", 409);
      await db.batch([
        db.delete(workoutExercises).where(eq(workoutExercises.exerciseId, exercise.id)),
        db.delete(exercises).where(and(eq(exercises.id, exercise.id), eq(exercises.ownerId, user.id))),
      ]);
      return;
    }
    case "start-workout": {
      const program = await requireProgram(db, user.id, action.programId);
      const planned = await db
        .select()
        .from(programExercises)
        .where(eq(programExercises.programId, program.id))
        .orderBy(asc(programExercises.position));
      if (planned.length === 0) throw new AppServiceError("Добавьте хотя бы одно упражнение.");
      const [active] = await db
        .select({ id: workouts.id })
        .from(workouts)
        .where(and(eq(workouts.userId, user.id), eq(workouts.status, "active")))
        .limit(1);
      if (active) throw new AppServiceError("Тренировка уже запущена.", 409);
      const workoutId = randomUUID();
      await db.batch([
        db.insert(workouts).values({
          id: workoutId,
          userId: user.id,
          programId: program.id,
          programName: program.name,
          status: "active",
        }),
        db.insert(workoutExercises).values(
          planned.map((item) => ({ workoutId, exerciseId: item.exerciseId, position: item.position })),
        ),
      ]);
      return;
    }
    case "save-result": {
      assertUuid(action.exerciseId, "exerciseId");
      if (!Number.isFinite(action.weight) || action.weight <= 0 || action.weight > 99_999) {
        throw new AppServiceError("Укажите корректный вес.");
      }
      if (!Number.isInteger(action.reps) || action.reps <= 0 || action.reps > 10_000) {
        throw new AppServiceError("Укажите корректное количество повторений.");
      }
      const active = await requireActiveWorkout(db, user.id);
      const [planned] = await db
        .select({ exerciseId: workoutExercises.exerciseId })
        .from(workoutExercises)
        .where(and(eq(workoutExercises.workoutId, active.id), eq(workoutExercises.exerciseId, action.exerciseId)))
        .limit(1);
      if (!planned) throw new AppServiceError("Упражнение не входит в текущую тренировку.");
      await db
        .insert(workoutResults)
        .values({ workoutId: active.id, exerciseId: action.exerciseId, weight: action.weight, reps: action.reps })
        .onConflictDoUpdate({
          target: [workoutResults.workoutId, workoutResults.exerciseId],
          set: { weight: action.weight, reps: action.reps, updatedAt: new Date() },
        });
      return;
    }
    case "finish-workout": {
      const active = await requireActiveWorkout(db, user.id);
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(workoutResults)
        .where(eq(workoutResults.workoutId, active.id));
      if (Number(count) < 1) throw new AppServiceError("Сохраните результат хотя бы одного упражнения.");
      const ownedPrograms = await db
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.ownerId, user.id))
        .orderBy(asc(programs.position), asc(programs.createdAt));
      const nextProgramId = getNextProgramId(
        ownedPrograms,
        active.programId ?? user.selectedProgramId,
      );
      const completeWorkout = db
        .update(workouts)
        .set({ status: "completed", finishedAt: new Date() })
        .where(and(eq(workouts.id, active.id), eq(workouts.userId, user.id)));

      if (nextProgramId) {
        await db.batch([
          completeWorkout,
          db.update(users).set({ selectedProgramId: nextProgramId }).where(eq(users.id, user.id)),
        ]);
      } else {
        await completeWorkout;
      }
      return;
    }
    case "cancel-workout": {
      const active = await requireActiveWorkout(db, user.id);
      await db.delete(workouts).where(and(eq(workouts.id, active.id), eq(workouts.userId, user.id)));
      return;
    }
  }
}

async function requireProgram(db: Db, userId: string, programId: string) {
  assertUuid(programId, "programId");
  const [program] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, programId), eq(programs.ownerId, userId)))
    .limit(1);
  if (!program) throw new AppServiceError("Тренировка не найдена.", 404);
  return program;
}

async function requireActiveWorkout(db: Db, userId: string) {
  const [active] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.userId, userId), eq(workouts.status, "active")))
    .limit(1);
  if (!active) throw new AppServiceError("Активная тренировка не найдена.", 404);
  return active;
}
