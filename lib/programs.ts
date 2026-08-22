import type { Program } from "./domain";

export function getNextProgramId<T extends { id: string }>(
  programs: T[],
  completedProgramId: string | null | undefined,
): string | undefined {
  if (programs.length === 0) return undefined;
  const completedIndex = programs.findIndex((program) => program.id === completedProgramId);
  if (completedIndex === -1) return programs[0].id;
  return programs[(completedIndex + 1) % programs.length].id;
}

export function removeProgram(
  programs: Program[],
  selectedProgramId: string,
  programId: string,
): { programs: Program[]; selectedProgramId: string } {
  const deletedIndex = programs.findIndex((program) => program.id === programId);
  if (deletedIndex === -1) return { programs, selectedProgramId };

  const nextPrograms = programs.filter((program) => program.id !== programId);
  const nextSelectedProgramId = selectedProgramId === programId
    ? nextPrograms[Math.min(deletedIndex, nextPrograms.length - 1)]?.id ?? ""
    : selectedProgramId;

  return { programs: nextPrograms, selectedProgramId: nextSelectedProgramId };
}
