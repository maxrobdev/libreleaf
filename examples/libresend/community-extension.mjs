const counters = {
  stored: 0,
  received: 0,
  missed: 0,
  bytesStored: 0,
  bytesReceived: 0,
};

export default function createCommunityExtension(context) {
  return {
    id: "community-host",
    modules: [{
      id: "aggregate-events",
      version: "1.0.0",
      capabilities: ["aggregate-events"],
      authorize({ origin }) {
        return origin === null || context.allowedOrigins.includes(origin);
      },
      onEvent(event) {
        if (event.type === "transfer.stored") {
          counters.stored += 1;
          counters.bytesStored += event.bytes;
        } else if (event.type === "transfer.received") {
          counters.received += 1;
          counters.bytesReceived += event.bytes;
        } else {
          counters.missed += 1;
        }
        if ((counters.stored + counters.received + counters.missed) % 25 === 0) {
          process.stdout.write(`${JSON.stringify({ libresend: counters })}\n`);
        }
      },
    }],
    publicCapabilities: {
      profile: "community",
      metrics: "aggregate-only",
    },
    onReady({ storage, modules }) {
      process.stdout.write(`Community extension ready with ${storage} storage and ${modules.length} module(s).\n`);
    },
  };
}
