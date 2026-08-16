type GutendexBook = {
  id: number;
  title: string;
  authors: { name: string }[];
  formats: Record<string, string>;
};

type OpenLibraryDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  ebook_access?: "public" | "borrowable" | "printdisabled" | "no_ebook";
};

const formatNames: Record<string, string> = {
  "application/epub+zip": "EPUB",
  "application/x-mobipocket-ebook": "MOBI",
  "text/html; charset=utf-8": "Read online",
  "text/plain; charset=utf-8": "Plain text",
  "application/pdf": "PDF",
};

function rankFormat([mime]: [string, string]) {
  const order = ["application/epub+zip", "application/pdf", "application/x-mobipocket-ebook", "text/html; charset=utf-8", "text/plain; charset=utf-8"];
  return order.indexOf(mime) === -1 ? 99 : order.indexOf(mime);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim().slice(0, 120) ?? "";
  const by = ["title", "author", "subject"].includes(params.get("by") ?? "") ? params.get("by")! : "q";

  const gutendexUrl = query ? `https://gutendex.com/books?search=${encodeURIComponent(query)}` : "https://gutendex.com/books?sort=popular";
  const librarySearch = query ? `${by}=${encodeURIComponent(query)}` : "q=classic&sort=rating";
  const openLibraryUrl = `https://openlibrary.org/search.json?${librarySearch}&limit=24&fields=key,title,author_name,first_publish_year,cover_i,ebook_access`;

  try {
    const [gutenbergResult, libraryResult] = await Promise.allSettled([
      fetch(gutendexUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12000) }).then((response) => {
        if (!response.ok) throw new Error("Project Gutenberg did not respond.");
        return response.json();
      }),
      fetch(openLibraryUrl, { headers: { Accept: "application/json", "User-Agent": "LeaflineBookFinder/1.0" }, signal: AbortSignal.timeout(12000) }).then((response) => {
        if (!response.ok) throw new Error("Open Library did not respond.");
        return response.json();
      }),
    ]);

    const gutenberg = gutenbergResult.status === "fulfilled" ? gutenbergResult.value.results as GutendexBook[] : [];
    const library = libraryResult.status === "fulfilled" ? libraryResult.value.docs as OpenLibraryDoc[] : [];

    if (!gutenberg.length && !library.length && gutenbergResult.status === "rejected" && libraryResult.status === "rejected") {
      throw new Error("Both catalogues are unavailable.");
    }

    const gutenbergBooks = gutenberg.slice(0, 24).map((book) => {
      const formats = Object.entries(book.formats)
        .filter(([mime, url]) => Boolean(formatNames[mime]) && !url.endsWith(".zip"))
        .sort((a, b) => rankFormat(a) - rankFormat(b))
        .map(([mime, url]) => ({ label: formatNames[mime], url }));
      return {
        id: `gutenberg-${book.id}`,
        title: book.title,
        authors: book.authors.map((author) => author.name),
        cover: book.formats["image/jpeg"],
        source: "Project Gutenberg" as const,
        access: "download" as const,
        formats,
        detailsUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
      };
    });

    const seen = new Set(gutenbergBooks.map((book) => book.title.toLocaleLowerCase()));
    const libraryBooks = library
      .filter((book) => !seen.has(book.title.toLocaleLowerCase()))
      .slice(0, 24)
      .map((book) => ({
        id: `openlibrary-${book.key}`,
        title: book.title,
        authors: book.author_name?.slice(0, 3) ?? [],
        year: book.first_publish_year,
        cover: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : undefined,
        source: "Open Library" as const,
        access: book.ebook_access === "borrowable" || book.ebook_access === "printdisabled" ? "borrow" as const : "preview" as const,
        formats: [],
        detailsUrl: `https://openlibrary.org${book.key}`,
      }));

    const books = [...gutenbergBooks, ...libraryBooks];
    return Response.json({
      query,
      books,
      counts: {
        total: books.length,
        download: books.filter((book) => book.access === "download").length,
        borrow: books.filter((book) => book.access === "borrow").length,
        preview: books.filter((book) => book.access === "preview").length,
      },
    }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return Response.json({ error: "Catalogues are temporarily unavailable." }, { status: 502 });
  }
}
