import type { Program } from "./domain";

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
