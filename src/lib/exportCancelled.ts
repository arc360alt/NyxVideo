/** Thrown (instead of a generic Error) when an in-progress export is cancelled by the user, so callers can distinguish "cancelled" from a real failure. */
export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}
