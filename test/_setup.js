// Browser global shims so the card file can be imported under Node for tests.
// The card targets the browser; this only stubs what's needed at module top-level.
if (typeof globalThis.HTMLElement === "undefined") {
  globalThis.HTMLElement = class HTMLElement {};
}
if (typeof globalThis.customElements === "undefined") {
  globalThis.customElements = {
    get() { return undefined; },
    define() {},
  };
}
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}
