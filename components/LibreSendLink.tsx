"use client";

import { useState } from "react";
import { handoffLink, type LinkHandoffResult } from "../lib/libresend/core";

type LibreSendLinkProps = {
  title: string;
  url: string;
  className?: string;
  label?: string;
};

function resultLabel(result: LinkHandoffResult, fallback: string) {
  if (result === "shared") return "Sent";
  if (result === "copied") return "Copied";
  if (result === "cancelled") return fallback;
  return "Copy failed";
}

export function LibreSendLink({ title, url, className, label = "Send" }: LibreSendLinkProps) {
  const [text, setText] = useState(label);

  async function send() {
    const result = await handoffLink(navigator, { title, url });
    setText(resultLabel(result, label));
    if (result !== "cancelled") window.setTimeout(() => setText(label), 1800);
  }

  return (
    <button className={className} type="button" onClick={() => void send()} aria-label={`Send link for ${title}`}>
      {text}
    </button>
  );
}
