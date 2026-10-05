const HASHTAG = /(?<![\p{L}\p{N}_&#/])#([\p{L}\p{N}_]+)/gu;
const MENTION = /(?<![\p{L}\p{N}_.@])@([A-Za-z0-9_.]{1,30})/gu;

const unique = (values: string[]) => [...new Set(values)];

export function extractHashtags(text: string | null): string[] {
  if (!text) return [];
  return unique([...text.matchAll(HASHTAG)].map((m) => m[1]!.toLowerCase()));
}

export function extractMentions(text: string | null): string[] {
  if (!text) return [];
  return unique(
    [...text.matchAll(MENTION)].map((m) => m[1]!.replace(/\.+$/, "").toLowerCase()).filter(Boolean),
  );
}
