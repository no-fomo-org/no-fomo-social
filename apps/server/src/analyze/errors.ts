import type { AnalyzeErrorCode } from "@no-fomo/core";

export class AnalyzeError extends Error {
  constructor(readonly code: AnalyzeErrorCode, message?: string) {
    super(message ?? code);
  }
}
