/** Callback invoked for a processed item. */
export interface ProgressHandler {
  (
    stageGerund: string,
    completed: number | undefined,
    total: number | undefined,
  ): void;
}
