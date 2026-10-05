import type { MessageSource } from "../types/chat";

export interface ParsedSourceBlock {
  name: string;
  tags?: string;
  classification?: string;
  citation?: string;
  page?: number;
  section?: string;
}

/**
 * Regex matching completed citation blocks:
 * 1. [source: ...] (e.g. [source: Filename.pdf, tags: HR, citation: "..."])
 * 2. [cite: ...] (e.g. [cite: Filename.pdf, tags: HR, citation: "..."])
 * 3. 【...】 (e.g. 【1†source】, 【2†Handbook.pdf】, 【Handbook.pdf】, 【source: ...】)
 */
const CITATION_BLOCK_RE = /(?:\[(?:source|cite):[\s\S]*?\]|【[\s\S]*?】)/gi;

/**
 * Regex matching incomplete trailing citation syntax at stream/content boundary:
 * - Trailing partial [source:... or [cite:... (down to just "[s", "[c", or "[")
 * - Trailing partial 【... (down to just "【")
 */
const INCOMPLETE_TRAILING_SOURCE_RE =
  /(?:\r?\n)*(?:\[(?:s(?:o(?:u(?:r(?:c(?:e)?)?)?)?)?|c(?:i(?:t(?:e)?)?)?)?(?::[^\n\]]*)?|【[^】\n]*)$/i;

/**
 * Parses all [source: ...], [cite: ...], and 【...】 citation blocks from text content.
 * Extracts structured MessageSource objects with title, snippets, tags, and classification.
 */
export function parseSources(content: string): MessageSource[] {
  if (!content) return [];
  const results: MessageSource[] = [];
  const seenKeys = new Set<string>();
  let index = 0;

  for (const m of content.matchAll(CITATION_BLOCK_RE)) {
    const block = m[0];

    if (block.startsWith("[")) {
      const nameMatch = /\[(?:source|cite):\s*([^,\]]+)/i.exec(block);
      const name = nameMatch?.[1]?.trim();
      if (!name || name.toLowerCase() === "basecamp") continue;

      const tags = /,\s*tags:\s*([^,\]]+)/i.exec(block)?.[1]?.trim();
      const classification = /,\s*classification:\s*([^,\]"]+?)(?:,|\])/i.exec(block)?.[1]?.trim();
      const citation =
        /,\s*citation:\s*"([\s\S]*?)"/i.exec(block)?.[1]?.trim() ??
        /,\s*citation:\s*([^,\]]+)/i.exec(block)?.[1]?.trim();
      const pageMatch = /,\s*page:\s*(\d+)/i.exec(block);
      const page = pageMatch && pageMatch[1] ? parseInt(pageMatch[1], 10) : undefined;
      const sectionRaw = /,\s*section:\s*([^,\]]+)/i.exec(block)?.[1]?.trim();
      const section = sectionRaw ? sectionRaw.replace(/^["'\s]+|["'\s]+$/g, "") : undefined;

      const dedupeKey = (name + (citation || "")).toLowerCase();
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      index += 1;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      results.push({
        id: `src_${index}_${slug}`,
        title: name,
        snippet: citation,
        page,
        section,
        metadata: {
          ...(tags ? { tags } : {}),
          ...(classification ? { classification } : {}),
          ...(citation ? { citation } : {}),
          ...(page !== undefined ? { page } : {}),
          ...(section ? { section } : {}),
        },
        type: "document",
      });
    } else if (block.startsWith("【")) {
      const inner = block.slice(1, -1).trim();
      if (!inner) continue;

      if (/^(?:source|cite):/i.test(inner)) {
        const nameMatch = /(?:source|cite):\s*([^,】]+)/i.exec(inner);
        const name = nameMatch?.[1]?.trim();
        if (!name || name.toLowerCase() === "basecamp") continue;

        const tags = /,\s*tags:\s*([^,】]+)/i.exec(inner)?.[1]?.trim();
        const classification = /,\s*classification:\s*([^,】"]+?)(?:,|】)/i
          .exec(inner)?.[1]
          ?.trim();
        const citation =
          /,\s*citation:\s*"([\s\S]*?)"/i.exec(inner)?.[1]?.trim() ??
          /,\s*citation:\s*([^,】]+)/i.exec(inner)?.[1]?.trim();

        const dedupeKey = (name + (citation || "")).toLowerCase();
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        index += 1;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        results.push({
          id: `src_${index}_${slug}`,
          title: name,
          snippet: citation,
          metadata: {
            ...(tags ? { tags } : {}),
            ...(classification ? { classification } : {}),
            ...(citation ? { citation } : {}),
          },
          type: "document",
        });
      } else {
        // Standard OpenAI citation format: 【1†source】, 【12†Handbook.pdf】, 【Handbook.pdf】, etc.
        const match = /^(?:(\d+(?::\d+)?)\s*†\s*)?([\s\S]*)$/.exec(inner);
        const sourceNum = match?.[1]?.trim();
        const titlePart = match?.[2]?.trim();

        let title: string;
        if (!titlePart && sourceNum) {
          title = `Source ${sourceNum}`;
        } else if (titlePart && titlePart.toLowerCase() === "source") {
          title = sourceNum ? `Source ${sourceNum}` : "Source";
        } else if (titlePart) {
          title = titlePart;
        } else {
          title = `Source ${index + 1}`;
        }

        if (title.toLowerCase() === "basecamp") continue;

        const dedupeKey = title.toLowerCase();
        if (seenKeys.has(dedupeKey)) continue;
        seenKeys.add(dedupeKey);

        index += 1;
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        results.push({
          id: `src_${index}_${slug}`,
          title,
          metadata: {
            ...(sourceNum ? { citationIndex: sourceNum } : {}),
          },
          type: "document",
        });
      }
    }
  }

  return results;
}

/**
 * Strips all [source: ...], [cite: ...], and 【...】 citation blocks from message content for clean rendering.
 * Also cleans up trailing partial citation blocks and cleans up extra whitespace.
 */
export function stripSources(content: string): string {
  if (!content) return "";
  return content
    .replace(CITATION_BLOCK_RE, "")
    .replace(INCOMPLETE_TRAILING_SOURCE_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Filter streaming delta chunks to suppress [source:...], [cite:...], and 【...】 blocks
 * in real time while collecting complete blocks for downstream citation rendering.
 */
export class StreamingSourceStripper {
  private buffer = "";
  private inBracketSource = false;
  private inFullwidthSource = false;
  private currentSourceContent = "";
  private collectedSourceBlocks: string[] = [];

  /**
   * Process an incoming stream delta chunk.
   * Returns only safe, visible content with citation blocks and partial citation syntax stripped.
   */
  process(delta: string): string {
    this.buffer += delta;
    let output = "";

    while (this.buffer.length > 0) {
      if (this.inFullwidthSource) {
        const closeIdx = this.buffer.indexOf("】");
        if (closeIdx !== -1) {
          this.currentSourceContent += this.buffer.slice(0, closeIdx + 1);
          this.collectedSourceBlocks.push(this.currentSourceContent);
          this.buffer = this.buffer.slice(closeIdx + 1);
          this.inFullwidthSource = false;
          this.currentSourceContent = "";
        } else {
          this.currentSourceContent += this.buffer;
          this.buffer = "";
        }
      } else if (this.inBracketSource) {
        const closeIdx = this.buffer.indexOf("]");
        if (closeIdx !== -1) {
          this.currentSourceContent += this.buffer.slice(0, closeIdx + 1);
          this.collectedSourceBlocks.push(this.currentSourceContent);
          this.buffer = this.buffer.slice(closeIdx + 1);
          this.inBracketSource = false;
          this.currentSourceContent = "";
        } else {
          this.currentSourceContent += this.buffer;
          this.buffer = "";
        }
      } else {
        // Find next occurrence of either 【 or [
        const fullwidthIdx = this.buffer.indexOf("【");
        const bracketIdx = this.buffer.indexOf("[");

        if (fullwidthIdx === -1 && bracketIdx === -1) {
          output += this.buffer;
          this.buffer = "";
          break;
        }

        // Fullwidth 【 comes first
        if (fullwidthIdx !== -1 && (bracketIdx === -1 || fullwidthIdx < bracketIdx)) {
          const nlMatch = this.buffer.slice(0, fullwidthIdx).match(/(?:\r?\n)+$/);
          const cutPoint = nlMatch ? fullwidthIdx - nlMatch[0].length : fullwidthIdx;
          output += this.buffer.slice(0, cutPoint);
          this.buffer = this.buffer.slice(fullwidthIdx + 1);
          this.inFullwidthSource = true;
          this.currentSourceContent = "【";
          continue;
        }

        // Regular bracket [ comes first
        if (bracketIdx !== -1) {
          const after = this.buffer.slice(bracketIdx + 1);
          const lowerAfter = after.toLowerCase();

          // Full match: [source:
          if (lowerAfter.startsWith("source:")) {
            const nlMatch = this.buffer.slice(0, bracketIdx).match(/(?:\r?\n)+$/);
            const cutPoint = nlMatch ? bracketIdx - nlMatch[0].length : bracketIdx;
            output += this.buffer.slice(0, cutPoint);
            this.buffer = this.buffer.slice(bracketIdx + 1 + 7);
            this.inBracketSource = true;
            this.currentSourceContent = "[source:";
            continue;
          }

          // Full match: [cite:
          if (lowerAfter.startsWith("cite:")) {
            const nlMatch = this.buffer.slice(0, bracketIdx).match(/(?:\r?\n)+$/);
            const cutPoint = nlMatch ? bracketIdx - nlMatch[0].length : bracketIdx;
            output += this.buffer.slice(0, cutPoint);
            this.buffer = this.buffer.slice(bracketIdx + 1 + 5);
            this.inBracketSource = true;
            this.currentSourceContent = "[cite:";
            continue;
          }

          // Partial potential prefix of "source:" or "cite:"
          const isPrefixOfSource = "source:".startsWith(lowerAfter);
          const isPrefixOfCite = "cite:".startsWith(lowerAfter);

          if (isPrefixOfSource || isPrefixOfCite) {
            const nlMatch = this.buffer.slice(0, bracketIdx).match(/(?:\r?\n)+$/);
            const cutPoint = nlMatch ? bracketIdx - nlMatch[0].length : bracketIdx;
            output += this.buffer.slice(0, cutPoint);
            this.buffer = this.buffer.slice(cutPoint);
            break;
          }

          // Normal bracket (not a citation tag, e.g. [1], [Link](url))
          output += this.buffer.slice(0, bracketIdx + 1);
          this.buffer = this.buffer.slice(bracketIdx + 1);
        }
      }
    }

    return output;
  }

  /**
   * Flushes any remaining buffer at the end of the stream.
   * Ensures unfinished/partial citation tags are suppressed from output and collected.
   */
  flush(): string {
    if (this.inFullwidthSource) {
      if (this.currentSourceContent || this.buffer) {
        const raw = `${this.currentSourceContent}${this.buffer}${
          this.buffer.endsWith("】") ? "" : "】"
        }`;
        this.collectedSourceBlocks.push(raw);
      }
      this.buffer = "";
      this.inFullwidthSource = false;
      this.currentSourceContent = "";
      return "";
    }

    if (this.inBracketSource) {
      if (this.currentSourceContent || this.buffer) {
        const raw = `${this.currentSourceContent}${this.buffer}${
          this.buffer.endsWith("]") ? "" : "]"
        }`;
        this.collectedSourceBlocks.push(raw);
      }
      this.buffer = "";
      this.inBracketSource = false;
      this.currentSourceContent = "";
      return "";
    }

    if (this.buffer) {
      const trimmed = this.buffer.trim();
      const lowerTrimmed = trimmed.toLowerCase();

      // If it started with [source: or [cite: or 【
      if (
        lowerTrimmed.startsWith("[source:") ||
        lowerTrimmed.startsWith("[cite:") ||
        trimmed.startsWith("【")
      ) {
        const isBracket = lowerTrimmed.startsWith("[");
        const closing = isBracket ? "]" : "】";
        this.collectedSourceBlocks.push(`${trimmed}${closing}`);
        this.buffer = "";
        return "";
      }

      // If it is an incomplete prefix like "[source", "[cite", "[s", "[c", "【", "["
      if (
        lowerTrimmed.startsWith("[s") ||
        lowerTrimmed.startsWith("[c") ||
        lowerTrimmed === "[" ||
        trimmed === "【"
      ) {
        this.buffer = "";
        return "";
      }

      const remaining = this.buffer;
      this.buffer = "";
      return remaining;
    }

    return "";
  }

  /**
   * Returns structured MessageSource objects parsed from all collected citation blocks.
   */
  getCollectedSources(): MessageSource[] {
    const raw = this.collectedSourceBlocks.join("\n");
    return parseSources(raw);
  }
}
