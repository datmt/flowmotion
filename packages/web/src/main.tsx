import "@flowmotion/player"; // registers <flow-player>
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";

const [, root, id] = location.pathname.split("/");
if (root === "render") import("./Render.tsx").then((m) => m.renderPage(id!)); // worker page: no React, no chrome
else createRoot(document.getElementById("root")!).render(<App />);
