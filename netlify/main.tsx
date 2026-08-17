import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import { SiteNav } from "../app/components/SiteNav";
import AboutLibreLeaf from "../components/AboutLibreLeaf";
import { Briefleaf } from "../components/Briefleaf";
import { Developers } from "../components/Developers";
import { GuideArticle, GuidesHub } from "../components/Guides";
import ListsPage from "../components/ListsPage";
import { LeafSend } from "../components/LeafSend";
import { ResourcesDirectory } from "../components/ResourcesDirectory";
import SearchResultsPage from "../components/SearchResultsPage";
import { getGuide } from "../content/guides";
import "../app/globals.css";
import "./netlify.css";

function Route() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  if (path === "/about") return <><SiteNav active="about" /><AboutLibreLeaf /></>;
  if (path === "/lists") return <><SiteNav active="lists" /><ListsPage /></>;
  if (path === "/brief") return <><SiteNav active="brief" /><Briefleaf /></>;
  if (path === "/send") return <LeafSend />;
  if (path === "/guides") return <><SiteNav active="guides" /><GuidesHub /></>;
  if (path.startsWith("/guides/")) {
    const guide = getGuide(path.slice("/guides/".length));
    return guide ? <><SiteNav active="guides" /><GuideArticle guide={guide} /></> : <><SiteNav active="guides" /><main className="status-card"><strong>Guide not found.</strong><p><a href="/guides">Open all guides</a></p></main></>;
  }
  if (path === "/developers") return <><SiteNav active="developers" /><Developers /></>;
  if (path === "/search") return <SearchResultsPage />;
  if (path === "/resources") {
    return (
      <main>
        <SiteNav active="resources" />
        <header className="netlify-page-hero"><p>DIRECTORY</p><h1>Book tools.</h1><span>Software, catalogues and libraries.</span></header>
        <ResourcesDirectory />
      </main>
    );
  }
  return <Home />;
}

const root = document.getElementById("root");
if (!root) throw new Error("LibreLeaf could not find its application root.");

createRoot(root).render(<StrictMode><Route /></StrictMode>);
