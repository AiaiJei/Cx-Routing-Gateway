import { Route, Routes } from "react-router";
import { AppShell } from "./components/AppShell";
import { OverviewPage } from "./pages/OverviewPage";
import { UpstreamsPage } from "./pages/UpstreamsPage";
import { RoutesPage } from "./pages/RoutesPage";
import { LogsPage } from "./pages/LogsPage";
import { CredentialsPage } from "./pages/CredentialsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CodexPage } from "./pages/CodexPage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/upstreams" element={<UpstreamsPage />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/credentials" element={<CredentialsPage />} />
        <Route path="/codex" element={<CodexPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<h1 className="page-title">页面不存在</h1>} />
      </Routes>
    </AppShell>
  );
}
