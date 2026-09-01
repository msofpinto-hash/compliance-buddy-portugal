import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Plataforma em modo claro apenas: remove qualquer tema escuro persistido
document.documentElement.classList.remove("dark");
document.documentElement.style.colorScheme = "light";
try {
  localStorage.setItem("theme", "light");
} catch {
  /* ignore */
}

createRoot(document.getElementById("root")!).render(<App />);

