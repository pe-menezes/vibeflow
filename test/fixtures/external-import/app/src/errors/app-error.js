// Errors the app raises on purpose carry a code next to the message, so
// callers can branch on the code and screens can pick the text to show.
export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function isAppError(error) {
  return error instanceof AppError;
}

export function toMessage(error) {
  return isAppError(error) ? error.message : 'Something went wrong';
}
