import React from "react";
import ReactDOM from "react-dom/client";
import App from "./pages/App";
import { ThemeProvider } from "./lib/theme";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
