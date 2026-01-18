import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs
if (typeof global !== 'undefined') {
  (global as any).window = {
    ...(typeof window !== 'undefined' ? window : {}),
    __TAURI__: {
      invoke: vi.fn(),
      window: {
        getCurrent: vi.fn(),
      },
      app: {
        getVersion: vi.fn(() => Promise.resolve('0.1.0')),
      },
    },
  };
}

// Mock window.matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
