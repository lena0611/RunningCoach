declare module 'fit-file-parser' {
  export default class FitParser {
    constructor(options?: Record<string, unknown>)
    parse(buffer: ArrayBuffer, callback: (error: unknown, data: unknown) => void): void
  }
}
