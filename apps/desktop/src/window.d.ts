export {};

declare global {
  interface Window {
    desktopControls?: {
      minimize: () => void;
      toggleMaximize: () => Promise<boolean>;
      close: () => void;
    };
  }
}
