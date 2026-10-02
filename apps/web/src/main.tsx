import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { hideBrokenImages } from "./brokenImages";
import { CrashBoundary } from "./crash";
import { initErrorReporting } from "./observability";
import { watchForNewVersion } from "./swUpdate";

initErrorReporting();
watchForNewVersion();
hideBrokenImages();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CrashBoundary>
      <App />
    </CrashBoundary>
  </StrictMode>
);
