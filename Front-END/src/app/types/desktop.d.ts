export {};

declare global {
  interface Window {
    rfDesktop?: {
      platform: string;
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
      onBackendExit: (callback: (payload: { code: number | null }) => void) => void;
    };
  }
}
