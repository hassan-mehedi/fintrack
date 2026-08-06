export class NotFoundError extends Error {
    constructor(message = "Not found") {
        super(message);
        this.name = "NotFoundError";
    }
}

export class ValidationError extends Error {
    constructor(message = "Invalid request") {
        super(message);
        this.name = "ValidationError";
    }
}
