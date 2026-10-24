import * as httpStatusText from "./httpStatusText.ts";

// An error that knows which HTTP response it should become.
// Throw it (or pass it to next()) anywhere; errorHandler turns it into JSON.
// data carries details for the client, e.g. one entry per invalid field.
export class AppError extends Error {
  statusCode: number;
  statusText: httpStatusText.StatusText;
  data: unknown;

  constructor(message: string, statusCode: number, data: unknown = null) {
    super(message);
    this.statusCode = statusCode;
    this.statusText =
      statusCode < 500 ? httpStatusText.FAIL : httpStatusText.ERROR;
    this.data = data;
  }
}
