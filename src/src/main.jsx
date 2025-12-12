import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./utils/uiDelayTester";
import App from "./App.jsx";
import { ClipboardProvider } from "./providers/ClipboardProvider.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ClipboardProvider>
      <App />
    </ClipboardProvider>
  </StrictMode>
);
