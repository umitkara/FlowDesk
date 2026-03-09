/** Reports an error with context for debugging. */
export function reportError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[FlowDesk] ${context}:`, error);
  } else {
    console.warn(`[FlowDesk] ${context}:`, String(error));
  }
}
