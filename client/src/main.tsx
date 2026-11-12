import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, getStoredThemeId } from "./theme/themes";
import { initAppPrefs } from "./utils/appPrefs";
import { preventStrayFileDrops } from "./hooks/useImageDrop";

applyTheme(getStoredThemeId());
initAppPrefs();
preventStrayFileDrops();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
