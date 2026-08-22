export function isDemoMode(
  nodeEnv: string | undefined,
  explicitDemoFlag: string | undefined,
): boolean {
  return nodeEnv !== "production" && explicitDemoFlag === "true";
}
