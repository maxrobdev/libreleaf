import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LibreLeaf — Free & Open Book Search",
    short_name: "LibreLeaf",
    description:
      "Search public-domain books and borrowable Open Library editions from any device.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ed",
    theme_color: "#274d3a",
    lang: "en-GB",
    categories: ["books", "education", "utilities"],
  };
}
