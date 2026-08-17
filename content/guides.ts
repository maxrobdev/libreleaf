export type GuideSection = {
  heading: string;
  paragraphs?: string[];
  steps?: string[];
  bullets?: string[];
  note?: string;
};

export type GuideReference = {
  label: string;
  url: string;
};

export type Guide = {
  slug: string;
  title: string;
  description: string;
  category: "Devices" | "Rights" | "Research" | "Developers" | "Formats";
  author: string;
  published: string;
  updated: string;
  readingMinutes: number;
  sections: GuideSection[];
  references: GuideReference[];
  related: string[];
  action?: { label: string; href: string };
};

export const guides: Guide[] = [
  {
    slug: "read-free-books-on-phone",
    title: "How to read free lawful books on a phone",
    description: "Find a lawful edition, choose a phone-friendly format, and keep a readable local copy on Android or iPhone.",
    category: "Devices",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-16",
    readingMinutes: 4,
    sections: [
      {
        heading: "Start with the access route",
        paragraphs: [
          "Search by title and author, then inspect the source and access label before downloading. A public-domain download, an openly licensed copy, a library loan, and a preview are different permissions. LibreLeaf keeps those routes separate and shows the catalogue that supplied each record.",
          "Choose the rights context for where you are reading. A source may assess a book as public domain in the United States without making the same claim for the United Kingdom. If the route is a loan, use the library's own reader or app and follow its lending terms.",
        ],
      },
      {
        heading: "Pick a useful phone format",
        bullets: [
          "EPUB is usually the best first choice for novels and other flowing text because font size, margins, and line spacing can adapt to the screen.",
          "PDF preserves a fixed page and is useful for scans, diagrams, or citations, but small print can be awkward on a narrow display.",
          "A web reading link needs no import step and is useful for a quick check, although offline availability depends on the source.",
        ],
        paragraphs: [
          "Download only from the source-labelled offer. Avoid a generic download button whose destination, edition, or licence cannot be checked. Keep the source page bookmarked with the file so that you can verify the record later.",
        ],
      },
      {
        heading: "Open and keep the file",
        steps: [
          "Download the EPUB or PDF in your browser and find it in Downloads or Files.",
          "Open it with a reading app you trust. Google Play Books can accept uploaded EPUB and PDF files; Apple devices can open EPUB files in Books.",
          "Check the title page and table of contents before deleting the browser download. A record can describe the right work while the file is a different translation or edition.",
          "For another device, use the operating-system share sheet or LibreLeaf's local LibreSend tool. Local mode does not upload the book to LibreLeaf.",
        ],
        note: "Free access does not always mean redistribution is allowed. Retain the licence or source record and share its link unless the stated terms permit sharing the file.",
      },
    ],
    references: [
      { label: "Google Play Books upload guidance", url: "https://support.google.com/googleplay/answer/11012086?hl=en-GB" },
      { label: "Apple EPUB guidance", url: "https://support.apple.com/en-gb/118122" },
    ],
    related: ["open-epub-on-android", "open-epub-on-iphone-ipad", "ebook-formats-epub-pdf-mobi-web"],
    action: { label: "Search lawful book sources", href: "/search" },
  },
  {
    slug: "open-epub-on-android",
    title: "How to download and open an EPUB on Android",
    description: "Download a lawful EPUB, import it into an Android reader, and diagnose the common file and permissions problems.",
    category: "Devices",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-16",
    readingMinutes: 4,
    sections: [
      {
        heading: "Download the actual EPUB",
        paragraphs: [
          "Open the book's source-labelled offer and select EPUB. The browser should save a file ending in .epub. If it instead saves a web page, return to the catalogue record and use the format link rather than renaming the page; changing a filename does not convert its contents.",
          "Check the access label first. Public domain, open licence, library borrowing, and preview access have different conditions. On LibreLeaf, the source record and rights note remain visible beside the route so the decision is not based on the file extension alone.",
        ],
      },
      {
        heading: "Import it into a reader",
        steps: [
          "Open Files or your browser's Downloads list and tap the .epub file.",
          "Choose an installed EPUB reader. If Android shows no compatible app, install one from a source you trust before opening the file.",
          "For Google Play Books, enable PDF uploading if needed, then upload the EPUB from Files or Downloads. Uploaded books can sync to devices signed in to the same Google account.",
          "Open the book and check navigation, chapter order, and text size. Delete and download again if the file is incomplete rather than repeatedly importing the same broken copy.",
        ],
      },
      {
        heading: "Fix common Android failures",
        bullets: [
          "A .zip filename may be an EPUB package delivered with the wrong content type. Confirm the source's documented format before changing anything.",
          "A reader asking for an account may be offering cloud sync, not proving that the book itself needs an account. A local-only reader is an alternative for unprotected EPUBs.",
          "A DRM-protected library loan normally opens only in the service's supported app. LibreLeaf does not remove DRM or convert a loan into a permanent file.",
          "If storage permission was denied, use Android settings to allow the reader to open the selected file, or share the file directly from Files.",
        ],
        note: "The exact menu labels vary by Android version and device maker. The reliable path is the downloaded file's Open with or Share action.",
      },
    ],
    references: [
      { label: "Google Play Books file upload guidance", url: "https://support.google.com/googleplay/answer/11012086?hl=en-GB" },
      { label: "EPUB 3 specification", url: "https://www.w3.org/TR/epub-33/" },
    ],
    related: ["read-free-books-on-phone", "open-epub-on-iphone-ipad", "ebook-formats-epub-pdf-mobi-web"],
    action: { label: "Find an EPUB", href: "/search?format=EPUB" },
  },
  {
    slug: "open-epub-on-iphone-ipad",
    title: "How to download and open an EPUB on iPhone or iPad",
    description: "Save a lawful EPUB in Files, open it in Apple Books or another reader, and keep the source and edition clear.",
    category: "Devices",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-16",
    readingMinutes: 4,
    sections: [
      {
        heading: "Save the source file",
        paragraphs: [
          "Choose an EPUB offer on the source record, not a page that merely describes the book. Safari may show a download indicator while the file is being saved. When it finishes, open Downloads or the Files app and confirm that the filename ends in .epub.",
          "Before importing, note whether the offer is a public-domain file, an openly licensed edition, or a controlled loan. Apple Books can store a compatible EPUB, but the reading app does not decide whether the copy is lawful in your country.",
        ],
      },
      {
        heading: "Open it in Books",
        steps: [
          "In Files, locate the EPUB and tap it. A compatible EPUB may open directly in Books.",
          "If it opens a preview instead, use Share and select Books or another installed EPUB reader. Share-sheet order and labels can vary by iOS version.",
          "Wait for the import to finish, then check the cover, title, contents, and several chapter links.",
          "Keep the catalogue URL in a note or bookmark. It records the source, licence or rights assessment, and often the edition identifier.",
        ],
      },
      {
        heading: "Move it without uploading it here",
        paragraphs: [
          "LibreSend accepts a local EPUB and invokes the device share sheet when the browser supports file sharing. In local mode the file stays on your device. This is useful when the EPUB is already in Files and you want to choose Books, Mail, AirDrop, or another local destination.",
          "If Books rejects the file, download it again from the same verified route. Do not assume every file labelled EPUB is valid: malformed packages, incomplete downloads, and DRM-controlled loans can fail for different reasons. For a library loan, return to the lender's supported app rather than trying to alter the file.",
        ],
        note: "An EPUB can contain scripts or remote resources. Keep iOS and the reading app updated, and obtain files from identifiable catalogues or publishers.",
      },
    ],
    references: [
      { label: "Apple guidance for EPUB files", url: "https://support.apple.com/en-gb/118122" },
      { label: "Apple Books user guide", url: "https://support.apple.com/guide/iphone/read-books-iphc1e5c5b67/ios" },
    ],
    related: ["read-free-books-on-phone", "open-epub-on-android", "send-ebook-to-kindle"],
    action: { label: "Open LibreSend", href: "/send" },
  },
  {
    slug: "send-books-over-wifi-libresend",
    title: "How to send an ebook over Wi-Fi with LibreSend",
    description: "Run the first-party LibreSend Local app, choose one book in its localhost interface, and move it to a phone, Kobo or reader app without a cloud upload.",
    category: "Devices",
    author: "Max Robson",
    published: "2026-08-17",
    updated: "2026-08-17",
    readingMinutes: 5,
    sections: [
      {
        heading: "What LibreSend Local does",
        paragraphs: [
          "LibreSend Local is LibreLeaf's maintained device-transfer program. It runs on the computer that already has the EPUB, PDF or MOBI and opens a private control page at localhost. The page is the interface to the local program; it is not the public LibreLeaf website and it does not upload the selected book to LibreLeaf or another cloud service.",
          "After a file is selected, the program exposes only that file at a random address on the current Wi-Fi network. It also creates a one-book OPDS catalogue for compatible reading apps. The address expires after 15 minutes, there is no folder browser, and closing the program removes the temporary copy. This is intended for a home or other trusted network, not public Wi-Fi or an internet-facing server.",
        ],
      },
      {
        heading: "Start the local web interface",
        steps: [
          "Install Node.js 22.13 or newer from the official Node.js site if it is not already installed.",
          "Open Terminal on macOS or Linux, or Windows Terminal on Windows, and run: npx --yes github:maxrobdev/libreleaf",
          "LibreSend prints a private localhost address and normally opens it in the default browser. If the browser does not open, copy the printed address into a browser on that same computer.",
          "Choose one EPUB, PDF or MOBI, or drop it onto the selection area. Wait until the page displays a receiving address and an OPDS address.",
        ],
        note: "The first run downloads LibreSend's open-source package from its GitHub repository. The program then runs locally. Review the source and release history before running it if you administer the computer.",
      },
      {
        heading: "Receive the book",
        steps: [
          "Keep the computer and receiving device connected to the same trusted Wi-Fi. Do not use a guest network that prevents devices from seeing each other.",
          "For a phone or tablet, open the displayed address, download the file, then choose Apple Books, Kindle, KOReader or another installed reading app.",
          "For a Kobo, type the address into the Kobo browser and download the EPUB or PDF. Browser capability varies by model, so use Kobo's official USB process if the download is not accepted.",
          "For an OPDS-capable reading app, add the displayed OPDS address as a custom catalogue and download the single listed title.",
          "Use Remove book or Close LibreSend when finished. The receiving link also expires automatically after 15 minutes.",
        ],
      },
      {
        heading: "Security and troubleshooting",
        bullets: [
          "The localhost control page is bound to the computer only and includes a random control path. Other devices receive the book page, not the controls.",
          "The LAN transfer uses local HTTP and is not encrypted. Anyone controlling an untrusted network may observe traffic, so use a trusted network only.",
          "If the address does not open, check that both devices use the same Wi-Fi, disable client isolation or a guest network, and allow Node.js through the computer firewall for the local network only.",
          "MOBI is accepted by LibreSend for local movement, but Amazon's current Send to Kindle list does not include MOBI. Convert a lawful, unprotected file to EPUB when the destination requires it.",
          "For a permanent library rather than a 15-minute handoff, use an authenticated calibre Content server or LibreSend's separately documented encrypted self-hosted relay.",
        ],
      },
    ],
    references: [
      { label: "Node.js downloads", url: "https://nodejs.org/en/download" },
      { label: "Kobo USB transfer instructions", url: "https://help.kobo.com/hc/en-us/articles/360024775093-Add-non-protected-PDF-and-ePub-files-to-your-Kobo-eReader-using-your-computer" },
      { label: "calibre Content server", url: "https://manual.calibre-ebook.com/server.html" },
    ],
    related: ["read-free-books-on-phone", "send-ebook-to-kindle", "add-ebook-to-kobo"],
    action: { label: "Open LibreSend", href: "/send" },
  },
  {
    slug: "send-ebook-to-kindle",
    title: "How to send an ebook to Kindle",
    description: "Send an EPUB or PDF through the Kindle app, Amazon's web uploader or approved email, with a lightweight fallback page for older Kindle browsers.",
    category: "Devices",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-17",
    readingMinutes: 5,
    sections: [
      {
        heading: "Use a supported, lawful file",
        paragraphs: [
          "First download the ebook from a route that identifies its source and access terms. EPUB is normally the useful choice for reflowable books; PDF preserves a fixed page. A library loan protected for a particular app is not made transferable just because you can see a local file.",
          "Amazon's Send to Kindle service accepts several document formats and delivers them to the Kindle library associated with your Amazon account. Consult Amazon's current support page for the active format and size limits rather than relying on an old conversion list.",
        ],
      },
      {
        heading: "Send the document",
        steps: [
          "On iPhone or Android, open LibreSend's file route or the operating-system share sheet and choose the Kindle app. Confirm the title and add it to the Kindle library.",
          "On a computer, open Amazon's Send to Kindle page, sign in to the account used by the target Kindle and select the local EPUB or PDF. Amazon's current web limit is 200 MB.",
          "For email, send from an approved address to the Send to Kindle address shown for the device. Amazon currently allows up to 25 attachments totalling 50 MB.",
          "Connect the Kindle to Wi-Fi, sync it, and check the Library under documents as well as books.",
        ],
        note: "LibreSend passes the real file to the operating-system share sheet or opens Amazon's official uploader. It does not possess an undocumented Kindle upload API, and the final import remains under the reader's Amazon account.",
      },
      {
        heading: "Use the e-reader fallback page",
        paragraphs: [
          "The public /send page contains a small HTML fallback for older Kindle and Kobo browsers that do not run the full JavaScript interface. It keeps the official Kindle steps, the LibreSend Local command and the Kobo USB fallback readable without depending on modern modules or the site's web fonts.",
          "The fallback is an instruction page, not a hidden delivery channel. Opening a LibreSend Wi-Fi address in a Kindle browser is not treated as a supported Kindle import. Use the Kindle app, Amazon web uploader or approved email route for reliable library delivery.",
        ],
      },
      {
        heading: "When it does not appear",
        bullets: [
          "Confirm that the sending and receiving devices use the same Amazon account and that the Kindle is online.",
          "Look for an Amazon processing or rejection message. A malformed EPUB may need a fresh download or a standards check, not a filename change.",
          "For a personal, non-DRM file, USB transfer can be useful when the model and computer support it. Follow the current Amazon instructions for that Kindle generation.",
          "Do not use conversion tools to bypass DRM. Return controlled loans and purchased protected books to their supported delivery route.",
        ],
      },
    ],
    references: [
      { label: "Amazon Send to Kindle", url: "https://www.amazon.com/sendtokindle" },
      { label: "Amazon Kindle formats and methods", url: "https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA" },
      { label: "Amazon Send to Kindle email", url: "https://digprjsurvey.amazon.co.uk/csad/help/node/G7NECT4B4ZWHQ8WV" },
    ],
    related: ["send-books-over-wifi-libresend", "ebook-formats-epub-pdf-mobi-web", "add-ebook-to-kobo"],
    action: { label: "Prepare a local file with LibreSend", href: "/send" },
  },
  {
    slug: "add-ebook-to-kobo",
    title: "How to add an ebook to Kobo",
    description: "Transfer a non-protected EPUB or PDF to Kobo with LibreSend Local, supported cloud storage or the official USB fallback.",
    category: "Devices",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-17",
    readingMinutes: 5,
    sections: [
      {
        heading: "Check the file before transfer",
        paragraphs: [
          "Use an EPUB for adjustable text or a PDF when the page layout matters. Confirm that the offer is a download you may use, then retain the source record. Kobo's manual USB workflow is for non-protected EPUB and PDF files; a DRM-controlled loan normally requires the lender's supported process.",
          "Open the file on the computer first if possible. Check the title, author, table of contents, and a later chapter. This catches incomplete downloads before the device indexes them.",
        ],
      },
      {
        heading: "Try LibreSend Local on trusted Wi-Fi",
        steps: [
          "Run npx --yes github:maxrobdev/libreleaf on the computer and choose the EPUB or PDF in the localhost interface.",
          "Keep the computer and Kobo on the same trusted Wi-Fi, then type the displayed IP address into the Kobo browser.",
          "Choose Download this book. The receiving page has no JavaScript, uses direct attachment headers and supports byte-range requests for limited browsers.",
          "If the Kobo browser does not accept the download on that model or firmware, stop and use USB. LibreSend does not describe an unverified browser download as universal Kobo support.",
        ],
        note: "LibreSend's receiving interface is deliberately simpler than the public site. The full /send page also retains a readable HTML fallback when an e-reader browser cannot run JavaScript modules.",
      },
      {
        heading: "Use cloud storage or USB",
        paragraphs: [
          "Kobo documents Google Drive and Dropbox support for Forma, Sage, Elipsa, Elipsa 2E and Libra Colour. Link the service under More → Settings → Accounts, place the non-protected EPUB or PDF in the Kobo folder, then sync. Feature availability and required software versions remain controlled by Kobo.",
        ],
        steps: [
          "Connect the Kobo eReader to the computer with a data-capable USB cable and choose Connect on the reader if prompted.",
          "Open the mounted KOBOeReader drive in Finder or File Explorer.",
          "Copy the non-protected .epub or .pdf file to the drive. Do not disconnect while the copy is in progress.",
          "Eject the KOBOeReader drive safely, unplug it, and wait while the device imports the new content.",
          "Find the title under My Books and verify the reading layout.",
        ],
      },
      {
        heading: "Understand local sideloading",
        paragraphs: [
          "Kobo states that content added by this USB method is available on the eReader where it was imported and is not automatically added to other Kobo apps or devices. Keep your own backup and the source URL if you need to repeat the transfer.",
          "Some supported Kobo models also provide cloud-storage import routes. Those features vary by model and account, so use Kobo's current device help rather than assuming a cloud option is present. Calibre can organise and send compatible local books, but a direct USB copy is the simplest diagnostic path when a title fails to appear.",
        ],
        note: "If the Kobo is not mounted, try a known data cable and another USB port before changing the ebook. Some charging cables carry no data.",
      },
    ],
    references: [
      { label: "Kobo: add non-protected EPUB and PDF files", url: "https://help.kobo.com/hc/en-us/articles/360024775093-Add-non-protected-PDF-and-ePub-files-to-your-Kobo-eReader-using-your-computer" },
      { label: "Kobo Google Drive instructions", url: "https://help.kobo.com/hc/en-us/articles/15335985512983-Add-books-to-your-eReader-using-Google-Drive" },
      { label: "Kobo Dropbox instructions", url: "https://help.kobo.com/hc/en-us/articles/360033830114-Add-books-to-your-eReader-using-Dropbox" },
    ],
    related: ["send-books-over-wifi-libresend", "send-ebook-to-kindle", "use-calibre-open-books"],
    action: { label: "Search for an open edition", href: "/search" },
  },
  {
    slug: "use-calibre-open-books",
    title: "How to use Calibre with open books",
    description: "Import, inspect, convert, and transfer public-domain or openly licensed ebooks with Calibre without losing provenance.",
    category: "Devices",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-16",
    readingMinutes: 5,
    sections: [
      {
        heading: "Build a traceable library",
        paragraphs: [
          "Download Calibre from its official site, then use Add books to import an EPUB or PDF from a verified catalogue. Calibre copies imported books into its managed library, so keep the library folder under normal backup and let Calibre manage its internal filenames.",
          "Correct the title and author only after comparing them with the source record. Put the catalogue URL, licence, source identifier, and edition note into appropriate metadata or your own notes. A polished cover is not evidence that two files are the same translation or edition.",
        ],
      },
      {
        heading: "Read, convert, or send",
        steps: [
          "Select View to inspect the book and confirm its contents before changing it.",
          "Use Convert books only when the destination device needs a different format. Keep the original alongside the conversion.",
          "Review the converted table of contents, paragraph breaks, footnotes, and images. Automatic conversion can preserve words while damaging structure.",
          "Connect a supported e-reader and use Send to device, or save a copy to disk for a manual transfer workflow.",
        ],
      },
      {
        heading: "Know the limits",
        paragraphs: [
          "Calibre's documentation states that it does not support opening or converting DRM-protected files. Do not add plugins or follow instructions intended to defeat access controls. Use the bookseller or library application for protected purchases and loans.",
          "Conversion does not change copyright or licence terms. An open licence may require attribution, restrict commercial reuse, or require adaptations to use the same licence. Public-domain status can also differ by country. Store the evidence with the original file and review it before distributing a conversion.",
        ],
        bullets: [
          "Prefer EPUB-to-EPUB cleanup over PDF-to-EPUB conversion when a source EPUB exists.",
          "Use a separate Calibre library or a clear tag for research PDFs and scanned facsimiles.",
          "Back up metadata as well as book files; provenance is part of a maintainable collection.",
        ],
      },
    ],
    references: [
      { label: "Calibre user manual", url: "https://manual.calibre-ebook.com/gui.html" },
      { label: "Calibre conversion guide", url: "https://manual.calibre-ebook.com/conversion.html" },
    ],
    related: ["add-ebook-to-kobo", "send-ebook-to-kindle", "verify-book-source-licence-edition"],
    action: { label: "Browse reader tools", href: "/resources" },
  },
  {
    slug: "public-domain-uk-vs-us",
    title: "Public domain in the UK versus the US",
    description: "Why a US public-domain label does not automatically apply in the UK, and what evidence to check before downloading.",
    category: "Rights",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-16",
    readingMinutes: 6,
    sections: [
      {
        heading: "The same work can have different status",
        paragraphs: [
          "Copyright is territorial. A catalogue's public-domain assessment is normally made under the law it names, not as a worldwide permission. Project Gutenberg's source assessment is US-focused, so LibreLeaf labels its downloadable offers as source-assessed public domain in the United States rather than universally free.",
          "The work and the digital edition also need separate attention. A nineteenth-century novel may be out of copyright while a recent translation, introduction, illustrations, typography, or critical apparatus remains protected. Match the downloadable file to the record instead of deciding from the original author's date alone.",
        ],
      },
      {
        heading: "A practical UK check",
        paragraphs: [
          "GOV.UK gives the usual term for written, dramatic, musical, and artistic works as 70 years after the author's death, while the typographical arrangement of a published edition generally lasts 25 years from publication. Those are starting rules, not a complete clearance test.",
          "Exceptions and transitional rules matter, including anonymous works, collaborative authorship, Crown copyright, older unpublished works, and separately protected contributions. If the author, translator, or publication history is unclear, use the Intellectual Property Office's detailed duration guidance or seek legal advice before redistribution.",
        ],
      },
      {
        heading: "Why a US date is not enough",
        paragraphs: [
          "United States duration depends on when and how a work was created and published, authorship, and in some historical cases copyright formalities. The US Copyright Office publishes the statute and duration material; a single rolling-year slogan cannot safely replace that analysis for every work.",
          "For ordinary reading, prefer a route with an explicit licence valid for your use, a UK-specific rights statement, or a library loan. For republication, commercial use, translation, or a large corpus, record the evidence for each edition and obtain appropriate rights advice.",
        ],
        note: "LibreLeaf provides source and jurisdiction context, not a legal determination. Region selection changes the warning and applicability labels; it does not change the underlying law.",
      },
    ],
    references: [
      { label: "GOV.UK: how long copyright lasts", url: "https://www.gov.uk/copyright/how-long-copyright-lasts" },
      { label: "UK IPO detailed duration notice", url: "https://www.gov.uk/government/publications/copyright-notice-duration-of-copyright-term/copyright-notice-duration-of-copyright-term" },
      { label: "US Copyright Act, duration", url: "https://www.copyright.gov/title17/92chap3.html" },
    ],
    related: ["verify-book-source-licence-edition", "find-open-access-academic-books", "read-free-books-on-phone"],
    action: { label: "Search with a rights context", href: "/search?region=GB" },
  },
  {
    slug: "find-open-access-academic-books",
    title: "How to find open-access academic books",
    description: "Search reliable scholarly catalogues, read the licence, and distinguish a full open monograph from a preview or repository record.",
    category: "Research",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-16",
    readingMinutes: 5,
    sections: [
      {
        heading: "Search by subject and identifiers",
        paragraphs: [
          "Begin with a precise subject, title, author, DOI, or ISBN. The Directory of Open Access Books indexes peer-reviewed open-access books, while OAPEN hosts and disseminates open-access scholarly books. A university repository can also hold an authorised manuscript, but the record should identify the deposited version and its use terms.",
          "Use LibreLeaf's subject search to gather catalogue candidates, then open the source record. Search aggregation is a discovery step; the publisher, repository, or specialist index remains the evidence for the file and licence.",
        ],
      },
      {
        heading: "Confirm that access is actually open",
        bullets: [
          "Look for a full-book download, not only an abstract, table of contents, sample chapter, or time-limited library loan.",
          "Record the exact Creative Commons licence or other stated terms. CC BY, CC BY-NC, and CC BY-ND permit different kinds of reuse.",
          "Check the licence on the book or repository landing page as well as inside the file. If they conflict, contact the publisher or repository.",
          "Match title, contributors, edition, publication year, and identifier. A preprint, accepted manuscript, and version of record are not interchangeable citations.",
        ],
      },
      {
        heading: "Keep a reproducible research note",
        paragraphs: [
          "Save the landing-page URL, file URL, licence, access date, version, and persistent identifier. Cite the scholarly work according to your required style, and add the repository URL when it helps another reader retrieve the same open version.",
          "Open access is not the same as copyright-free. The author or publisher normally retains copyright and grants stated permissions. Text and data mining, classroom distribution, adaptation, and commercial reuse can require different checks. If a record says only 'free to read', do not infer a broad reuse licence.",
        ],
        note: "A disappearing file does not invalidate your citation, but it can make verification harder. Prefer DOI, Handle, ISBN, or another persistent record when one is available.",
      },
    ],
    references: [
      { label: "Directory of Open Access Books", url: "https://www.doabooks.org/en/doab" },
      { label: "OAPEN Library", url: "https://library.oapen.org/" },
      { label: "Creative Commons licence descriptions", url: "https://creativecommons.org/share-your-work/cclicenses/" },
    ],
    related: ["verify-book-source-licence-edition", "public-domain-uk-vs-us", "use-libreleaf-api"],
    action: { label: "Search academic books", href: "/search?by=subject&q=academic" },
  },
  {
    slug: "use-libreleaf-mcp",
    title: "How to use the LibreLeaf MCP server",
    description: "Connect an MCP-capable client to LibreLeaf's read-only tools and inspect the source, rights, and ranking data it returns.",
    category: "Developers",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-17",
    readingMinutes: 5,
    sections: [
      {
        heading: "What the endpoint provides",
        paragraphs: [
          "LibreLeaf exposes a remote, read-only Model Context Protocol endpoint at https://libreleaf-books.netlify.app/mcp. MCP is an open protocol for giving compatible AI clients structured tools and data sources. The client, not the book site, decides how tool results are presented in a conversation.",
          "The standard search and fetch tools return citation-ready work records. search_books supports focused catalogue queries, while resolve_access selects a canonical best match and returns every source-labelled offer with a ranking explanation. Results retain work IDs, source records, access type, and jurisdiction notes.",
        ],
      },
      {
        heading: "Connect and test",
        steps: [
          "In an MCP-capable client, add a remote Streamable HTTP server using the LibreLeaf /mcp URL. Client settings and workspace permissions vary, so use the current instructions for that client.",
          "List the available tools before calling one. This confirms that the endpoint and client agree on the live schemas.",
          "Try resolve_access with title Pride and Prejudice, author Jane Austen, and region GB. Review the selected match, why it ranked, and the applicability note on each offer.",
          "Use fetch with the returned stable LibreLeaf work ID when you need to refresh that canonical work rather than repeating an ambiguous text search.",
        ],
      },
      {
        heading: "Treat tool output as evidence, not clearance",
        paragraphs: [
          "MCP responses identify which upstream catalogue supplied a claim. They do not turn a US source assessment into a UK legal conclusion. Pass GB, US, or GLOBAL deliberately and keep the returned rights context with any recommended route.",
          "Before production use, test the endpoint with MCP Inspector, handle partial source failures, and show source links to the user. Do not automatically download every offered file or describe a borrow or preview route as a permanent download. OpenAI's current guidance also recommends reviewing MCP server trust and tool behaviour before connecting it to a model workflow.",
        ],
        note: "The endpoint does not require a LibreLeaf account. Availability of remote MCP connections in a particular client or managed workspace can depend on that product's current settings and administrator policy.",
      },
    ],
    references: [
      { label: "LibreLeaf MCP reference", url: "https://libreleaf-books.netlify.app/docs/mcp/" },
      { label: "OpenAI MCP guidance", url: "https://developers.openai.com/api/docs/guides/tools-connectors-mcp" },
      { label: "Model Context Protocol", url: "https://modelcontextprotocol.io/" },
    ],
    related: ["use-libreleaf-api", "verify-book-source-licence-edition", "public-domain-uk-vs-us"],
    action: { label: "Read the MCP documentation", href: "/docs/mcp" },
  },
  {
    slug: "use-libreleaf-api",
    title: "How to use the LibreLeaf public API",
    description: "Search and page LibreLeaf's read-only JSON API while preserving work identity, provenance, access types, and rights context.",
    category: "Developers",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-17",
    readingMinutes: 6,
    sections: [
      {
        heading: "Make a bounded search",
        paragraphs: [
          "Send a GET request to /api/v1/search with q for the query. The by parameter can select a broad query, title, author, or subject, and region accepts GB, US, or GLOBAL. Encode parameter values and keep the same q, by, and region for every page in one result sequence.",
          "For example, /api/v1/search?q=frankenstein&by=title&region=GB returns JSON containing books, source counts and status, a rights context, and an opaque nextCursor when more upstream pages may exist. Source timeouts or rate limits can produce useful partial results; inspect the source-status object instead of treating a smaller page as definitive exhaustion.",
        ],
      },
      {
        heading: "Page with the opaque cursor",
        steps: [
          "Read nextCursor from the response. If it is null, the participating sources are known to be exhausted for that query.",
          "If it is present, pass it unchanged as cursor on the next request with the original search parameters.",
          "Append new works by stable LibreLeaf ID rather than by array position. A later page can carry records from sources that advance independently.",
          "On a transient source failure, retain the returned cursor and retry with backoff. Do not decode or edit its internal state.",
        ],
      },
      {
        heading: "Render offers without changing their meaning",
        paragraphs: [
          "Each canonical book can contain several sourceRecords and offers. Display source, access type, format, details URL, and rights note together. A preview is not a download, a borrow route is not permanent ownership, and source-assessed public domain in the US is not a global determination.",
          "Use why and clusterConfidence to explain ranking or merging. Stable work IDs can support saved items and work permalinks. For Open Library works, the editions endpoint can retrieve edition-level records with its own pagination; do not silently substitute a different translation, abridgement, or publication just because the titles resemble each other.",
        ],
        note: "The service is read-only and aggregates upstream catalogues. Cache responsibly, identify your application where documented, and design for partial upstream availability.",
      },
    ],
    references: [
      { label: "LibreLeaf source code and route contract", url: "https://github.com/maxrobdev/libreleaf" },
      { label: "LibreLeaf source policy", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/SOURCE_POLICY.md" },
    ],
    related: ["use-libreleaf-mcp", "verify-book-source-licence-edition", "find-open-access-academic-books"],
    action: { label: "Open the API reference", href: "/docs/api" },
  },
  {
    slug: "ebook-formats-epub-pdf-mobi-web",
    title: "EPUB, PDF, MOBI, and web reading compared",
    description: "Choose an ebook format by layout, accessibility, device support, and access route rather than by filename alone.",
    category: "Formats",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-16",
    readingMinutes: 5,
    sections: [
      {
        heading: "EPUB for adaptable books",
        paragraphs: [
          "EPUB packages structured publication content, metadata, navigation, styles, and assets. In a well-made reflowable EPUB, the reader can change font size, line spacing, colour theme, and margins without zooming a fixed page. That usually makes it the first choice for novels and continuous prose.",
          "EPUB support still varies by app, especially for fixed-layout books, mathematics, audio, and scripting. Validate the file and test it in the actual reading app when accessibility or complex layout matters. The EPUB label alone does not guarantee good headings, alternative text, or navigation.",
        ],
      },
      {
        heading: "PDF for a fixed page",
        paragraphs: [
          "PDF preserves a designed page, so page numbers, diagrams, facsimiles, and print-oriented citations remain stable. It is often the honest format for a scanned historical edition or a textbook whose meaning depends on layout.",
          "That same fixed page can be difficult on a phone. Zooming and horizontal movement interrupt reading, and an image-only scan may have no selectable text or useful screen-reader structure. Prefer a source EPUB for ordinary prose rather than automatically converting a PDF and guessing its reading order.",
        ],
      },
      {
        heading: "MOBI and web routes",
        paragraphs: [
          "MOBI is a legacy Kindle-associated format. Keep an existing lawful MOBI when an older device needs it, but for current delivery follow the device provider's supported formats and conversion guidance. Renaming EPUB to MOBI does not convert the book.",
          "Web reading is the lowest-friction route: it can open immediately, expose source context, and avoid a local file. It may require connectivity and can change or disappear, so save the stable record URL for citation. Offline web support depends on the source and browser rather than on LibreLeaf's access label.",
        ],
        bullets: [
          "Choose EPUB for adaptable text and common reader controls.",
          "Choose PDF when exact pages or scans matter.",
          "Use MOBI only for a confirmed legacy workflow.",
          "Use the web route for immediate reading and easy provenance.",
        ],
      },
    ],
    references: [
      { label: "W3C EPUB 3.3 specification", url: "https://www.w3.org/TR/epub-33/" },
      { label: "EPUB accessibility specification", url: "https://www.w3.org/TR/epub-a11y-11/" },
      { label: "Amazon Send to Kindle", url: "https://www.amazon.com/sendtokindle" },
    ],
    related: ["read-free-books-on-phone", "send-ebook-to-kindle", "add-ebook-to-kobo"],
    action: { label: "Search by format", href: "/search" },
  },
  {
    slug: "verify-book-source-licence-edition",
    title: "How to verify a book's source, licence, and edition",
    description: "Check who supplied a file, what permission applies, and whether the author, translation, and edition match the book you need.",
    category: "Research",
    author: "Max Robson",
    published: "2026-08-16",
    updated: "2026-08-16",
    readingMinutes: 6,
    sections: [
      {
        heading: "Identify the source record",
        paragraphs: [
          "Start from a catalogue, publisher, library, repository, or author page that names the work and links to the file. Record its URL and identifier. A search result or direct file URL without a surrounding record is weaker evidence because it may omit access conditions and edition details.",
          "LibreLeaf preserves sourceRecords when it clusters catalogue results into a canonical work. Open each record rather than assuming that a merged card means identical files. Exact normalized title and primary author can support a strong match, but they do not prove that translations, annotations, or abridgements are the same.",
        ],
      },
      {
        heading: "Read the permission precisely",
        bullets: [
          "Public domain: note who assessed it and for which jurisdiction. Check separately protected translation, illustration, introduction, and edition material.",
          "Open licence: record the exact licence version and conditions, including attribution, share-alike, non-commercial, or no-derivatives restrictions.",
          "Library borrow: follow the loan period, account, app, and access-control rules. Do not present it as a permanent downloadable copy.",
          "Preview or free-to-read: do not infer permission to download, redistribute, adapt, or train a corpus from access alone.",
        ],
      },
      {
        heading: "Match the edition you will use",
        steps: [
          "Compare title, subtitle, author, translator, editor, publisher, year, language, and ISBN or another stable identifier.",
          "Open the file and inspect its title page, copyright or licence page, table of contents, and final pages. Do not rely only on external metadata.",
          "For quotations or page citations, confirm that pagination and text match the cited edition. EPUB locations and PDF page labels can differ from printed page numbers.",
          "Save a small provenance note with access date, record URL, file format, checksum if your workflow needs fixity, and the reason you believe the permission applies.",
        ],
        note: "When evidence conflicts, stop at the source record. Contact the publisher, repository, library, or rights holder rather than filling the gap with an assumption.",
      },
    ],
    references: [
      { label: "Creative Commons licence descriptions", url: "https://creativecommons.org/share-your-work/cclicenses/" },
      { label: "GOV.UK copyright guidance", url: "https://www.gov.uk/copyright" },
      { label: "LibreLeaf source policy", url: "https://github.com/maxrobdev/libreleaf/blob/main/docs/SOURCE_POLICY.md" },
    ],
    related: ["public-domain-uk-vs-us", "find-open-access-academic-books", "use-calibre-open-books"],
    action: { label: "Inspect search provenance", href: "/search" },
  },
];

export function getGuide(slug: string): Guide | undefined {
  return guides.find((guide) => guide.slug === slug);
}

export function guideWordCount(guide: Guide): number {
  const text = guide.sections.flatMap((section) => [
    section.heading,
    ...(section.paragraphs ?? []),
    ...(section.steps ?? []),
    ...(section.bullets ?? []),
    section.note ?? "",
  ]).join(" ");

  return text.trim().split(/\s+/).filter(Boolean).length;
}
