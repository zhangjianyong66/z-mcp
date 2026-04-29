export class MinimaxApiError extends Error {
    statusCode;
    retryable;
    payload;
    constructor(message, statusCode, retryable, payload) {
        super(message);
        this.name = "MinimaxApiError";
        this.statusCode = statusCode;
        this.retryable = retryable;
        this.payload = payload;
    }
}
