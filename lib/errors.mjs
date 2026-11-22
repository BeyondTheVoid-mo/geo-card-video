export class CopyError extends Error {
  constructor(message) {
    super(message);
    this.name = "CopyError";
    this.expose = true;
  }
}
