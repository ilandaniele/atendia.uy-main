export class ExtendedError extends Error {
    constructor(message: string, public code: number) {
        super(message);
        this.name = "ExtendedError";
        this.code = code;
    }
}