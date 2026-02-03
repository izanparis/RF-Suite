
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { ThemeProvider } from "next-themes";
  
  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <App />
    </ThemeProvider>
  );
  