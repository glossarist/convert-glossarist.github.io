// This is required, since crypto is globally available in Node 18
// but somehow TS typings are missing it.
declare const crypto: {
  randomUUID: () => string
}
