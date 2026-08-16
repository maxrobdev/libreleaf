import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LibreLeaf — Open-Access Book Resolver",
    short_name: "LibreLeaf",
    description:
      "Resolve books across open catalogues and compare source-labelled download, read, borrow and preview routes.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ed",
    theme_color: "#274d3a",
    lang: "en-GB",
    categories: ["books", "education", "utilities"],
  };
}
