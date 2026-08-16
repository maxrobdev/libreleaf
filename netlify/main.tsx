import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import { SiteNav } from "../app/components/SiteNav";
import AboutLibreLeaf from "../components/AboutLibreLeaf";
import ListsPage from "../components/ListsPage";
import { ResourcesDirectory } from "../components/ResourcesDirectory";
import "../app/globals.css";
import "./netlify.css";

function Route() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  if (path === "/about") return <><SiteNav active="about" /><AboutLibreLeaf /></>;
  if (path === "/lists") return <><SiteNav active="lists" /><ListsPage /></>;
  if (path === "/resources") {
    return (
      <main>
        <SiteNav active="resources" />
        <header className="netlify-page-hero"><p>OTHER TOOLS &amp; RESOURCES</p><h1>Read, manage<br />and borrow books.</h1><span>Open-source software, open catalogues and official UK library routes.</span></header>
        <ResourcesDirectory />
      </main>
    );
  }
  return <Home />;
}

const root = document.getElementById("root");
if (!root) throw new Error("LibreLeaf could not find its application root.");

createRoot(root).render(<StrictMode><Route /></StrictMode>);
