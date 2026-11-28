import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles/tokens.css";
import "./styles/app.css";
import "./styles/shell.css";
import "./styles/routes.css";
import "./styles/desktop2-routes.css";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
