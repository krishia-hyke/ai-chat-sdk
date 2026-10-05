import type { MessageSource } from "../types/chat";

export interface ParsedSourceBlock {
  name: string;
  tags?: string;
  classification?: string;
  citation?: string;
}

const SOURCE_BLOCK_RE = /\[source:[^\]]*\]/gi;
const INCOMPLETE_TRAILING_SOURCE_RE =
  /(?:\r?\n)*\[s?(?:o(?:u(?:r(?:c(?:e)?)?)?)?)?(?::[^\n\]]*)?$/i;

/**
 * Parses all [source: ...] citation blocks from text content.
 * Supports syntax: [source: Filename.pdf, tags: HR, classification: Internal, citation: "Quote here"]
 */
export function parseSources(content: string): MessageSource[] {
  if (!content) return [];
  const results: MessageSource[] = [];
  let index = 0;

  for (const m of content.matchAll(SOURCE_BLOCK_RE)) {
    const block = m[0];
    const nameMatch = /\[source:\s*([^,\]]+)/i.exec(block);
    const name = nameMatch?.[1]?.trim();
    if (!name || name.toLowerCase() === "basecamp") continue;

    const tags = /,\s*tags:\s*([^,\]]+)/i.exec(block)?.[1]?.trim();
    const classification = /,\s*classification:\s*([^,\]"]+?)(?:,|\])/i.exec(block)?.[1]?.trim();
    const citation =
      /,\s*citation:\s*"([\s\S]*?)"/i.exec(block)?.[1]?.trim() ??
      /,\s*citation:\s*([^,\]]+)/i.exec(block)?.[1]?.trim();

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
  }

  return results;
}

/**
 * Strips all [source: ...] citation blocks from message content for clean rendering.
 * Also cleans up trailing partial source blocks and extra newlines.
 */
export function stripSources(content: string): string {
  if (!content) return "";
  return content
    .replace(SOURCE_BLOCK_RE, "")
    .replace(INCOMPLETE_TRAILING_SOURCE_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Filter streaming delta chunks to suppress [source: ... ] blocks in real time
 * while collecting the complete source blocks for downstream citation rendering.
 */
export class StreamingSourceStripper {
  private buffer = "";
  private inSource = false;
  private currentSourceContent = "";
  private collectedSourceBlocks: string[] = [];

  /**
   * Process an incoming stream delta chunk.
   * Returns only safe, visible content with source blocks and partial source brackets stripped.
   */
  process(delta: string): string {
    this.buffer += delta;
    let output = "";

    while (this.buffer.length > 0) {
      if (!this.inSource) {
        const lower = this.buffer.toLowerCase();
        const sourceIndex = lower.indexOf("[source:");

        if (sourceIndex !== -1) {
          output += this.buffer.slice(0, sourceIndex).replace(/\n+$/, "");
          this.buffer = this.buffer.slice(sourceIndex + 8);
          this.inSource = true;
          this.currentSourceContent = "";
        } else {
          // Check for partial trailing [source: pattern
          const match = lower.match(/(?:\r?\n)*\[s?(?:o(?:u(?:r(?:c(?:e)?)?)?)?)?$/);
          if (match && match.index !== undefined) {
            output += this.buffer.slice(0, match.index);
            this.buffer = this.buffer.slice(match.index);
            break;
          } else {
            output += this.buffer;
            this.buffer = "";
          }
        }
      } else {
        const closeIndex = this.buffer.indexOf("]");
        if (closeIndex !== -1) {
          this.currentSourceContent += this.buffer.slice(0, closeIndex);
          const fullBlock = `[source:${this.currentSourceContent}]`;
          this.collectedSourceBlocks.push(fullBlock);
          this.buffer = this.buffer.slice(closeIndex + 1);
          this.inSource = false;
          this.currentSourceContent = "";
        } else {
          this.currentSourceContent += this.buffer;
          this.buffer = "";
        }
      }
    }

    return output;
  }

  /**
   * Flushes any remaining buffer at the end of the stream.
   */
  flush(): string {
    if (this.inSource) {
      if (this.currentSourceContent || this.buffer) {
        this.collectedSourceBlocks.push(`[source:${this.currentSourceContent}${this.buffer}]`);
      }
      this.buffer = "";
      this.inSource = false;
      this.currentSourceContent = "";
      return "";
    }
    const lower = this.buffer.toLowerCase();
    if (lower.includes("[source:")) {
      const idx = lower.indexOf("[source:");
      const remaining = this.buffer.slice(0, idx).replace(/\n+$/, "");
      const sourcePart = this.buffer.slice(idx);
      this.collectedSourceBlocks.push(sourcePart);
      this.buffer = "";
      return remaining;
    }
    const remaining = this.buffer;
    this.buffer = "";
    return remaining;
  }

  /**
   * Returns structured MessageSource objects parsed from all collected source blocks.
   */
  getCollectedSources(): MessageSource[] {
    const raw = this.collectedSourceBlocks.join("\n");
    return parseSources(raw);
  }
}
