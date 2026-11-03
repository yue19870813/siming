import "@testing-library/jest-dom/vitest";

class ResizeObserverMock implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

// React Flow reads the viewport zoom when dynamic handles are refreshed.
Object.defineProperty(window, "DOMMatrixReadOnly", {
  value: class {
    readonly m22: number;
    constructor(transform: string) {
      const matrix = transform.match(/^matrix\((.*)\)$/)?.[1].split(",");
      this.m22 = matrix ? Number(matrix[3]) : 1;
    }
  },
});
