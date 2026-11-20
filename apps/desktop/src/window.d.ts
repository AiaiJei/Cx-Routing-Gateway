export {};

declare global {
  interface Window {
    desktopControls?: {
      minimize: () => void;
      toggleMaximize: () => Promise<boolean>;
      close: () => void;
      getWorkspace: () => Promise<unknown>;
      getStatus: () => Promise<{ state: string; failure?: unknown }>;
      testUpstream: (id: string) => Promise<unknown>;
      testRoute: (routeId: string, prompt: string) => Promise<import("./domain/types").RouteTestResult>;
      createClientKey: (name: string, scope?: string[]) => Promise<unknown>;
      rotateClientKey: (id: string) => Promise<unknown>;
      revokeClientKey: (id: string) => Promise<unknown>;
      createUpstream: (input: { name: string; baseUrl: string; apiKey?: string; allowPrivateNetwork?: boolean }) => Promise<unknown>;
      deleteUpstream: (id: string) => Promise<unknown>;
      saveModelRoutes: (selection: import("./domain/types").ModelRouteSelection) => Promise<unknown>;
      createRoute: (input: { alias: string; inboundProtocol: string; outboundProtocol: string; upstreamId: string; modelId: string }) => Promise<unknown>;
      deleteRoute: (id: string) => Promise<unknown>;
      updateRoute: (id: string, input: { alias?: string; inboundProtocol?: string; outboundProtocol?: string; upstreamId?: string; modelId?: string; enabled?: boolean }) => Promise<unknown>;
      updateSettings: (input: { usageRetentionCount: number }) => Promise<unknown>;
      getUpdateTokenStatus?: () => Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
      saveUpdateToken?: (token: string) => Promise<{ configured: boolean }>;
      removeUpdateToken?: () => Promise<{ configured: boolean }>;
      checkUpdate: () => Promise<{ configured: boolean; available: boolean; tokenInvalid?: boolean; version?: string; releaseUrl?: string; installer?: { name: string; sha256: string } }>;
      installUpdate: () => Promise<{ configured: boolean; installed: boolean; tokenInvalid?: boolean; version?: string }>;
    };
  }
}
