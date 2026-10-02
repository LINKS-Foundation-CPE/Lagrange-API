class CustomError<C extends string> extends Error {
  message: string;
  statusCode: number;
  code?: C;
  errors?: unknown;

  constructor({
    message,
    statusCode,
    code,
    errors,
  }: {
    message: string;
    statusCode: number;
    code?: C;
    errors?: unknown;
  }) {
    super();
    this.message = message;
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
  }
}

export default CustomError;
