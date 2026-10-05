import {
  StreamingSourceStripper,
  parseSources,
  stripSources,
} from "./streaming-source-stripper";

describe("streaming-source-stripper", () => {
  describe("parseSources", () => {
    it("parses single source block with all metadata", () => {
      const text =
        'Here is the policy.\n\n[source: Handbook.pdf, tags: HR, classification: Internal, citation: "Remote work is allowed."]';
      const sources = parseSources(text);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: "src_1_handbook_pdf",
        title: "Handbook.pdf",
        snippet: "Remote work is allowed.",
        metadata: {
          tags: "HR",
          classification: "Internal",
          citation: "Remote work is allowed.",
        },
        type: "document",
      });
    });

    it("parses multiple source blocks and ignores basecamp", () => {
      const text = [
        "Some text.",
        '[source: basecamp, tags: internal, citation: "Skip this"]',
        '[source: Benefits.docx, tags: Medical, classification: Public, citation: "Dental covered 100%"]',
        '[source: Security.pdf, tags: IT, citation: "Use MFA"]',
      ].join("\n");

      const sources = parseSources(text);
      expect(sources).toHaveLength(2);
      expect(sources[0]!.title).toBe("Benefits.docx");
      expect(sources[1]!.title).toBe("Security.pdf");
      expect(sources[1]!.snippet).toBe("Use MFA");
    });

    it("returns empty array for text with no sources", () => {
      expect(parseSources("Just regular markdown content.")).toEqual([]);
    });
  });

  describe("stripSources", () => {
    it("removes completed source blocks and cleans up whitespace", () => {
      const text =
        'Here is the policy.\n\n[source: Handbook.pdf, tags: HR, citation: "Quote"]\n\nHope this helps!';
      expect(stripSources(text)).toBe("Here is the policy.\n\nHope this helps!");
    });

    it("removes trailing incomplete source block", () => {
      const text = "Partial answer here.\n\n[source: Incompl";
      expect(stripSources(text)).toBe("Partial answer here.");
    });
  });

  describe("StreamingSourceStripper state machine", () => {
    it("streams normal text without buffering delay", () => {
      const stripper = new StreamingSourceStripper();
      expect(stripper.process("Hello ")).toBe("Hello ");
      expect(stripper.process("world! ")).toBe("world! ");
      expect(stripper.flush()).toBe("");
      expect(stripper.getCollectedSources()).toEqual([]);
    });

    it("buffers partial [source: token across chunk boundaries and suppresses it", () => {
      const stripper = new StreamingSourceStripper();
      const chunk1 = stripper.process("The remote work policy is flexible. [");
      expect(chunk1).toBe("The remote work policy is flexible. ");

      const chunk2 = stripper.process("sou");
      expect(chunk2).toBe("");

      const chunk3 = stripper.process('rce: Policy.pdf, citation: "2 days WFH"]');
      expect(chunk3).toBe("");

      const flushed = stripper.flush();
      expect(flushed).toBe("");

      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.title).toBe("Policy.pdf");
      expect(sources[0]!.snippet).toBe("2 days WFH");
    });

    it("releases buffer if [ did not become [source:", () => {
      const stripper = new StreamingSourceStripper();
      const chunk1 = stripper.process("Look at this link: [");
      expect(chunk1).toBe("Look at this link: ");

      const chunk2 = stripper.process("Guide](https://example.com)");
      expect(chunk2).toBe("[Guide](https://example.com)");
      expect(stripper.flush()).toBe("");
      expect(stripper.getCollectedSources()).toEqual([]);
    });

    it("handles multiple streamed sources at the end of the text", () => {
      const stripper = new StreamingSourceStripper();
      const out1 = stripper.process("Here is the answer.\n\n[source: Doc1.pdf, citation: \"One\"]");
      expect(out1).toBe("Here is the answer.");

      const out2 = stripper.process('\n[source: Doc2.pdf, citation: "Two"]');
      expect(out2).toBe("");

      expect(stripper.flush()).toBe("");
      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(2);
      expect(sources[0]!.title).toBe("Doc1.pdf");
      expect(sources[1]!.title).toBe("Doc2.pdf");
    });
  });
});
