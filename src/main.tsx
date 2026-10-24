import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isMac } from "./lib/platform";

// Lets the stylesheet leave room for the Mac window buttons.
document.documentElement.dataset.platform ??= isMac ? "macos" : "other";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
