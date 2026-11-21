import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./components/chatExtras.css";
import "./mobile.css";
import { applyTheme, getStoredThemeId } from "./theme/themes";
import { initAppPrefs } from "./utils/appPrefs";
import { preventStrayFileDrops } from "./hooks/useImageDrop";
import { registerServiceWorker } from "./native/push";
import { captureInstallPrompt } from "./native/install";
import { startCursor } from "./cursors/cursorStore";
import "./cursors/cursors.css";

applyTheme(getStoredThemeId());
startCursor();
initAppPrefs();
preventStrayFileDrops();
registerServiceWorker();
captureInstallPrompt();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
