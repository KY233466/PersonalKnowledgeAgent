import React from "react";
import ReactDOM from "react-dom/client";
import Popup from "./Popup/Popup.tsx";
import "./Popup/Popup.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);