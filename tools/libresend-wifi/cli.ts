#!/usr/bin/env node
import { createLibreSendWifiBridge } from "./bridge.ts";

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npm run libresend:wifi -- "/path/to/book.epub"');
  process.exitCode = 1;
} else {
  try {
    const bridge = await createLibreSendWifiBridge({ filePath });
    console.log(`\nLibreSend Wi-Fi\n\n${bridge.fileName} · ${bridge.format}\n`);
    console.log("On the receiving device, open one of these addresses:\n");
    for (const address of bridge.addresses) console.log(`  ${address}`);
    console.log("\nOPDS-capable reader apps can add:\n");
    for (const address of bridge.opdsAddresses) console.log(`  ${address}`);
    console.log(`\nExpires ${new Date(bridge.expiresAt).toLocaleString("en-GB")}. Press Ctrl+C to stop sooner.`);
    console.log("The file stays on this computer and is served only over your current network.\n");
    const stop = async () => {
      await bridge.close();
      process.exit(0);
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  } catch (error) {
    console.error(error instanceof Error ? error.message : "LibreSend Wi-Fi could not start.");
    process.exitCode = 1;
  }
}
