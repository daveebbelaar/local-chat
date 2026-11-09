import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// macOS draws its window buttons inside the window; the layout leaves room for them.
if (navigator.userAgent.includes("Mac")) document.documentElement.classList.add("mac");

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
