import { stripSubjectPrefixes } from "./utils.js";

export interface ForwardedData {
  isForwarded: boolean;
  originalFrom: string;
  originalSubject: string;
  innerBody: string;
}

export function parseForwardedEmail(subject: string, body: string): ForwardedData {
  const subjectForwarded = /^(Fwd?:|FW:|TR:|R\u00e9f?:|\[Fwd\]|\[FW\])/i.test(subject.trim());

  const FWD_MARKER =
    /-{3,}\s*(Forwarded\s+(?:message|mail)|Begin\s+forwarded\s+message|Original\s+Message|Message\s+transf\u00e9r\u00e9)\s*-{0,3}/i;

  const bodyHasMarker = FWD_MARKER.test(body);
  const quotedFrom    = /^>+\s*From:/im.test(body);

  if (!subjectForwarded && !bodyHasMarker && !quotedFrom) {
    return { isForwarded: false, originalFrom: "", originalSubject: "", innerBody: body };
  }

  // Extract body below the forward marker
  let innerBody = body;
  const markerMatch = body.match(FWD_MARKER);
  if (markerMatch?.index !== undefined) {
    innerBody = body.slice(markerMatch.index);
  } else if (quotedFrom) {
    innerBody = body.replace(/^>+\s?/gm, "");
  }

  const originalFrom    = extractField(innerBody, ["From", "De", "Von"]);
  const originalSubject = extractField(innerBody, ["Subject", "Objet", "Betreff"]);

  return {
    isForwarded: true,
    originalFrom: extractEmail(originalFrom),
    originalSubject: originalSubject
      ? stripSubjectPrefixes(originalSubject)
      : stripSubjectPrefixes(subject),
    innerBody,
  };
}

function extractField(text: string, names: string[]): string {
  for (const name of names) {
    const m = text.match(new RegExp(`^${name}\\s*:\\s*([^\\n\\r]+)`, "im"));
    if (m) return m[1].trim();
  }
  return "";
}

export function extractEmail(raw: string): string {
  if (!raw) return "";
  const angle = raw.match(/<([^>@\s]+@[^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const plain = raw.match(/([^\s,<>"'()\[\]]+@[^\s,<>"'()\[\]]+\.[a-z]{2,})/i);
  return plain ? plain[1].trim().toLowerCase() : "";
}
