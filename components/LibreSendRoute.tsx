import type { ReaderFileFormat } from "../lib/libresend/core";
import styles from "./LibreSend.module.css";

const SEND_TO_KINDLE_URL = "https://www.amazon.co.uk/sendtokindle";
const SEND_TO_KINDLE_HELP_URL = "https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA";
const SEND_TO_KINDLE_EMAIL_URL = "https://digprjsurvey.amazon.co.uk/csad/help/node/G7NECT4B4ZWHQ8WV";
const KOBO_GOOGLE_DRIVE_HELP_URL = "https://help.kobo.com/hc/en-us/articles/15335985512983-Add-books-to-your-eReader-using-Google-Drive";
const KOBO_DROPBOX_HELP_URL = "https://help.kobo.com/hc/en-us/articles/360033830114-Add-books-to-your-eReader-using-Dropbox";
const KOBO_USB_HELP_URL = "https://help.kobo.com/hc/en-us/articles/360024775093-Add-non-protected-PDF-and-ePub-files-to-your-Kobo-eReader-using-your-computer";
const APPLE_BOOKS_HELP_URL = "https://support.apple.com/en-gb/guide/iphone/iphab2193d5/ios";
const APPLE_BOOKS_ICLOUD_URL = "https://support.apple.com/en-gb/guide/icloud/mm3941ae3362/icloud";
const CALIBRE_SERVER_URL = "https://manual.calibre-ebook.com/server.html";
const WIFI_DOCS_URL = "https://github.com/maxrobdev/libreleaf/blob/main/docs/LIBRESEND.md#libresend-local";

export type LibreSendDestination = "phone" | "kindle" | "kobo" | "wifi";

export const LIBRESEND_DESTINATIONS: Array<{ id: LibreSendDestination; label: string; detail: string; mark: string }> = [
  { id: "phone", label: "Phone or tablet", detail: "Open in a reading app", mark: "PH" },
  { id: "kindle", label: "Kindle", detail: "App, web or email", mark: "K" },
  { id: "kobo", label: "Kobo", detail: "Cloud, Wi-Fi or USB", mark: "KO" },
  { id: "wifi", label: "Same Wi-Fi", detail: "No cloud account", mark: "LAN" },
];

type LibreSendRouteProps = {
  destination: LibreSendDestination;
  fileName: string;
  format: ReaderFileFormat;
  localUrl: string;
  canShare: boolean;
  busy: boolean;
  onShare(): void;
};

function LocalSave({ localUrl, fileName }: { localUrl: string; fileName: string }) {
  return <a className={styles.routeSecondary} href={localUrl} download={fileName}>Save file <span aria-hidden="true">↓</span></a>;
}

function ShareButton({ label, busy, onShare }: { label: string; busy: boolean; onShare(): void }) {
  return (
    <button className={styles.routePrimary} type="button" disabled={busy} onClick={onShare}>
      {busy ? "Opening…" : label}<span aria-hidden="true">↗</span>
    </button>
  );
}

export function LibreSendRoute({ destination, fileName, format, localUrl, canShare, busy, onShare }: LibreSendRouteProps) {
  const officialEreaderFormat = format === "EPUB" || format === "PDF";

  if (destination === "phone") {
    return (
      <section className={styles.routePlan} aria-labelledby="delivery-route-title">
        <div className={styles.routeHeading}><span>03</span><div><p>BEST ROUTE</p><h2 id="delivery-route-title">Open it on this device</h2></div></div>
        <p className={styles.routeLead}>{canShare ? "LibreSend can pass the real file to your system share sheet. Choose the reading app there." : "This browser cannot share files directly, so save the file and open it from Downloads or Files."}</p>
        <div className={styles.routeActions}>
          {canShare ? <ShareButton label="Open share sheet" busy={busy} onShare={onShare} /> : null}
          <LocalSave localUrl={localUrl} fileName={fileName} />
        </div>
        <div className={styles.instructionGrid}>
          <article><h3>iPhone or iPad</h3><ol><li>Tap Open share sheet.</li><li>Choose Books, Kindle or another installed reader.</li><li>If the app is missing, tap More or save to Files first.</li></ol><a href={APPLE_BOOKS_HELP_URL} target="_blank" rel="noreferrer">Apple Books instructions ↗</a></article>
          <article><h3>Android</h3><ol><li>Tap Open share sheet.</li><li>Choose Kindle, KOReader or your EPUB/PDF reader.</li><li>Or save the file, open Downloads, then choose Open with.</li></ol></article>
        </div>
        <details className={styles.routeNote}><summary>Sync Apple Books</summary><p>Turn on iCloud Drive and Books in iCloud settings if you want an imported book to appear on your other Apple devices.</p><a href={APPLE_BOOKS_ICLOUD_URL} target="_blank" rel="noreferrer">Apple iCloud instructions ↗</a></details>
      </section>
    );
  }

  if (destination === "kindle") {
    return (
      <section className={styles.routePlan} aria-labelledby="delivery-route-title">
        <div className={styles.routeHeading}><span>03</span><div><p>BEST ROUTE</p><h2 id="delivery-route-title">Send to Kindle</h2></div></div>
        {officialEreaderFormat ? <p className={styles.routeLead}>On a phone, use the share sheet and choose Kindle. On a computer, use Amazon&apos;s official uploader. Amazon accepts EPUB and PDF files up to 200 MB on the web.</p> : <p className={styles.routeWarning}>Amazon&apos;s current Send to Kindle list does not include MOBI. Convert this file to EPUB first, or keep a local copy.</p>}
        <div className={styles.routeActions}>
          {officialEreaderFormat && canShare ? <ShareButton label="Open share sheet" busy={busy} onShare={onShare} /> : null}
          {officialEreaderFormat ? <a className={styles.routePrimary} href={SEND_TO_KINDLE_URL} target="_blank" rel="noreferrer">Open Send to Kindle <span aria-hidden="true">↗</span></a> : null}
          <LocalSave localUrl={localUrl} fileName={fileName} />
        </div>
        <div className={styles.instructionGrid}>
          <article><h3>Kindle app</h3><ol><li>Open the share sheet.</li><li>Choose Kindle.</li><li>Confirm the title and add it to your library.</li><li>Sync the Kindle or Kindle app.</li></ol></article>
          <article><h3>Amazon website</h3><ol><li>Open Send to Kindle and sign in.</li><li>Select this same local file.</li><li>Leave Add to your library on.</li><li>Upload, then sync your Kindle.</li></ol><p>Websites cannot pass a selected file into another website, so Amazon will ask you to select it again.</p></article>
        </div>
        <details className={styles.routeNote}><summary>Send by email</summary><p>Amazon accepts up to 25 attachments totalling 50 MB. Send from an approved address to the Send to Kindle email shown for your device.</p><a href={SEND_TO_KINDLE_EMAIL_URL} target="_blank" rel="noreferrer">Amazon email instructions ↗</a></details>
        <a className={styles.sourceLink} href={SEND_TO_KINDLE_HELP_URL} target="_blank" rel="noreferrer">Amazon formats and delivery methods ↗</a>
      </section>
    );
  }

  if (destination === "kobo") {
    return (
      <section className={styles.routePlan} aria-labelledby="delivery-route-title">
        <div className={styles.routeHeading}><span>03</span><div><p>BEST ROUTE</p><h2 id="delivery-route-title">Add it to Kobo</h2></div></div>
        {officialEreaderFormat ? <p className={styles.routeLead}>Use Google Drive or Dropbox on supported Kobo models. For every Kobo model, USB remains the official fallback.</p> : <p className={styles.routeWarning}>Kobo&apos;s official sideloading guides cover non-protected EPUB and PDF files, not MOBI. Convert this file to EPUB first.</p>}
        <div className={styles.routeActions}>
          {officialEreaderFormat && canShare ? <ShareButton label="Share to a cloud app" busy={busy} onShare={onShare} /> : null}
          <LocalSave localUrl={localUrl} fileName={fileName} />
        </div>
        <div className={styles.instructionGrid}>
          <article><h3>Google Drive or Dropbox</h3><ol><li>On Kobo, open More → Settings → Accounts.</li><li>Link Google Drive or Dropbox.</li><li>On this device, put the EPUB/PDF in the Kobo folder.</li><li>Sync Kobo, then open My Books or the cloud section.</li></ol><p>Official cloud support: Forma, Sage, Elipsa, Elipsa 2E and Libra Colour.</p><div className={styles.miniLinks}><a href={KOBO_GOOGLE_DRIVE_HELP_URL} target="_blank" rel="noreferrer">Google Drive guide ↗</a><a href={KOBO_DROPBOX_HELP_URL} target="_blank" rel="noreferrer">Dropbox guide ↗</a></div></article>
          <article><h3>Any Kobo by USB</h3><ol><li>Save the EPUB or PDF.</li><li>Connect Kobo and tap Connect.</li><li>Copy the file to KOBOeReader.</li><li>Eject it and open My Books.</li></ol><a href={KOBO_USB_HELP_URL} target="_blank" rel="noreferrer">Kobo USB guide ↗</a></article>
        </div>
        <details className={styles.routeNote}><summary>No cloud account: same Wi-Fi</summary><p>LibreSend Local can expose one file from your computer at a random, expiring local address. It also provides an OPDS feed for compatible reader apps. E-reader browser support varies, so USB remains the fallback.</p><a href={WIFI_DOCS_URL} target="_blank" rel="noreferrer">LibreSend Local setup ↗</a></details>
      </section>
    );
  }

  const commandFile = fileName.replace(/["\\]/g, "_");
  return (
    <section className={styles.routePlan} aria-labelledby="delivery-route-title">
      <div className={styles.routeHeading}><span>03</span><div><p>SELF-HOSTED</p><h2 id="delivery-route-title">Send over the same Wi-Fi</h2></div></div>
      <p className={styles.routeLead}>LibreSend Local is a first-party program with its own localhost web interface. It serves one book directly from your computer, creates a random address, expires after 15 minutes, lists no other files and uploads nothing to LibreLeaf.</p>
      <LocalSave localUrl={localUrl} fileName={fileName} />
      <div className={styles.commandBlock} aria-label="LibreSend Wi-Fi commands">
        <code>npx --yes github:maxrobdev/libreleaf</code>
      </div>
      <ol className={styles.wifiSteps}><li>Run the command on the computer that has the file. LibreSend opens a private localhost page.</li><li>Choose <strong>{commandFile}</strong> again in that local page. A public website cannot silently hand a file to a local program.</li><li>Keep both devices on the same trusted Wi-Fi.</li><li>Open the displayed address in the receiving device, or add its OPDS address to a compatible app.</li><li>Download the book, then close LibreSend.</li></ol>
      <p className={styles.routeWarning}>Local HTTP is not encrypted. Use this only on a network you trust. For a permanent library, use calibre&apos;s authenticated Content server instead.</p>
      <div className={styles.miniLinks}><a href="/guides/send-books-over-wifi-libresend">LibreSend Local user guide</a><a href={WIFI_DOCS_URL} target="_blank" rel="noreferrer">Source and technical instructions ↗</a><a href={CALIBRE_SERVER_URL} target="_blank" rel="noreferrer">calibre Content server ↗</a></div>
    </section>
  );
}
