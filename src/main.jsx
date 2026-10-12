import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(<StrictMode><App /></StrictMode>);
// chargement réussi : on réarme le rechargement automatique après un futur déploiement
setTimeout(() => { try { sessionStorage.removeItem("ll.reloaded"); } catch { /* stockage indisponible */ } }, 10000);
