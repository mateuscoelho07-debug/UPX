// Erro com status HTTP, devolvido como { error } pela API
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
