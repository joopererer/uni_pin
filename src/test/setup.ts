import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs
global.window = {
  ...global.window,
  __TAURI__: {
    invoke: vi.fn(),
    window: {
      getCurrent: vi.fn(),
    },
    app: {
      getVersion: vi.fn(() => Promise.resolve('0.1.0')),
    },
  },
} as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
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
