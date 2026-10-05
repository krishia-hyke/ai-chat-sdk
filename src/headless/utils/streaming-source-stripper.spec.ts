import { StreamingSourceStripper, parseSources, stripSources } from "./streaming-source-stripper";

describe("streaming-source-stripper", () => {
  describe("parseSources", () => {
    it("parses single [source: ...] block with all metadata", () => {
      const text =
        'Here is the policy.\n\n[source: Handbook.pdf, tags: HR, classification: Internal, citation: "Remote work is allowed.", page: 14, section: "Section 3.2"]';
      const sources = parseSources(text);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: "src_1_handbook_pdf",
        title: "Handbook.pdf",
        snippet: "Remote work is allowed.",
        page: 14,
        section: "Section 3.2",
        metadata: {
          tags: "HR",
          classification: "Internal",
          citation: "Remote work is allowed.",
          page: 14,
          section: "Section 3.2",
        },
        type: "document",
      });
    });

    it("parses [cite: ...] blocks with metadata", () => {
      const text =
        'According to compliance [cite: Security_Policy.docx, tags: Security, classification: Confidential, citation: "Rotate passwords every 90 days"]';
      const sources = parseSources(text);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: "src_1_security_policy_docx",
        title: "Security_Policy.docx",
        snippet: "Rotate passwords every 90 days",
        metadata: {
          tags: "Security",
          classification: "Confidential",
          citation: "Rotate passwords every 90 days",
        },
        type: "document",
      });
    });

    it("parses OpenAI style 【1†source】 and 【index†filename】 citations", () => {
      const text = "The sky is blue 【1†source】 and water is wet 【2†Chemistry_Basics.pdf】.";
      const sources = parseSources(text);

      expect(sources).toHaveLength(2);
      expect(sources[0]).toMatchObject({
        id: "src_1_source_1",
        title: "Source 1",
        metadata: {
          citationIndex: "1",
        },
        type: "document",
      });
      expect(sources[1]).toMatchObject({
        id: "src_2_chemistry_basics_pdf",
        title: "Chemistry_Basics.pdf",
        metadata: {
          citationIndex: "2",
        },
        type: "document",
      });
    });

    it("parses fullwidth bracket filename citations 【Handbook.pdf】", () => {
      const text = "Refer to the guidelines 【Employee_Handbook.pdf】 for details.";
      const sources = parseSources(text);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: "src_1_employee_handbook_pdf",
        title: "Employee_Handbook.pdf",
        type: "document",
      });
    });

    it("parses fullwidth bracket with source prefix 【source: Architecture.png, tags: Infra】", () => {
      const text = "See diagram 【source: Architecture.png, tags: Infra】.";
      const sources = parseSources(text);

      expect(sources).toHaveLength(1);
      expect(sources[0]).toMatchObject({
        id: "src_1_architecture_png",
        title: "Architecture.png",
        metadata: {
          tags: "Infra",
        },
        type: "document",
      });
    });

    it("deduplicates identical citations appearing multiple times in content", () => {
      const text = "First claim 【1†source】. Second claim 【1†source】. Third claim 【1†source】.";
      const sources = parseSources(text);

      expect(sources).toHaveLength(1);
      expect(sources[0]!.title).toBe("Source 1");
    });

    it("parses multiple mixed source syntaxes and ignores basecamp", () => {
      const text = [
        "Some text.",
        '[source: basecamp, tags: internal, citation: "Skip this"]',
        '[source: Benefits.docx, tags: Medical, classification: Public, citation: "Dental covered 100%"]',
        '[cite: Security.pdf, tags: IT, citation: "Use MFA"]',
        "【3†Compliance.pdf】",
        "【4†source】",
      ].join("\n");

      const sources = parseSources(text);
      expect(sources).toHaveLength(4);
      expect(sources[0]!.title).toBe("Benefits.docx");
      expect(sources[1]!.title).toBe("Security.pdf");
      expect(sources[2]!.title).toBe("Compliance.pdf");
      expect(sources[3]!.title).toBe("Source 4");
    });

    it("returns empty array for text with no sources", () => {
      expect(parseSources("Just regular markdown content.")).toEqual([]);
    });
  });

  describe("stripSources", () => {
    it("removes completed [source: ...] blocks and cleans up whitespace", () => {
      const text =
        'Here is the policy.\n\n[source: Handbook.pdf, tags: HR, citation: "Quote"]\n\nHope this helps!';
      expect(stripSources(text)).toBe("Here is the policy.\n\nHope this helps!");
    });

    it("removes completed [cite: ...] blocks", () => {
      const text = "Here is the policy [cite: Handbook.pdf, tags: HR] that applies to all.";
      expect(stripSources(text)).toBe("Here is the policy that applies to all.");
    });

    it("removes completed 【1†source】 and 【...】 citations", () => {
      const text = "The sky is blue 【1†source】 and water is wet 【Handbook.pdf】.";
      expect(stripSources(text)).toBe("The sky is blue and water is wet.");
    });

    it("removes mixed citations from a single text block", () => {
      const text = "Fact A [source: DocA.pdf], Fact B [cite: DocB.pdf], and Fact C 【1†source】.";
      expect(stripSources(text)).toBe("Fact A, Fact B, and Fact C.");
    });

    it("removes trailing incomplete [source: ... blocks", () => {
      const text = "Partial answer here.\n\n[source: Incompl";
      expect(stripSources(text)).toBe("Partial answer here.");
    });

    it("removes trailing incomplete [cite: ... blocks", () => {
      const text = "Partial answer here.\n\n[cite: Incompl";
      expect(stripSources(text)).toBe("Partial answer here.");
    });

    it("removes trailing incomplete 【... citations", () => {
      const text = "Partial answer here. 【1†source";
      expect(stripSources(text)).toBe("Partial answer here.");
    });

    it("removes trailing incomplete fullwidth bracket 【", () => {
      const text = "Partial answer here.\n\n【";
      expect(stripSources(text)).toBe("Partial answer here.");
    });

    it("removes trailing incomplete bracket [", () => {
      const text = "Partial answer here.\n\n[";
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

    it("buffers partial [cite: token across chunk boundaries and suppresses it", () => {
      const stripper = new StreamingSourceStripper();
      const chunk1 = stripper.process("Please consult the docs [");
      expect(chunk1).toBe("Please consult the docs ");

      const chunk2 = stripper.process("ci");
      expect(chunk2).toBe("");

      const chunk3 = stripper.process('te: Security.pdf, citation: "Follow MFA guidelines"]');
      expect(chunk3).toBe("");

      const chunk4 = stripper.process(" for setup.");
      expect(chunk4).toBe(" for setup.");

      expect(stripper.flush()).toBe("");

      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.title).toBe("Security.pdf");
      expect(sources[0]!.snippet).toBe("Follow MFA guidelines");
    });

    it("buffers and suppresses fullwidth 【1†source】 across chunk boundaries", () => {
      const stripper = new StreamingSourceStripper();
      const chunk1 = stripper.process("According to the report ");
      expect(chunk1).toBe("According to the report ");

      const chunk2 = stripper.process("【");
      expect(chunk2).toBe("");

      const chunk3 = stripper.process("1");
      expect(chunk3).toBe("");

      const chunk4 = stripper.process("†");
      expect(chunk4).toBe("");

      const chunk5 = stripper.process("source】");
      expect(chunk5).toBe("");

      const chunk6 = stripper.process(" revenue increased.");
      expect(chunk6).toBe(" revenue increased.");

      expect(stripper.flush()).toBe("");

      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.title).toBe("Source 1");
    });

    it("buffers and suppresses fullwidth 【Handbook.pdf】 citation chunk by chunk", () => {
      const stripper = new StreamingSourceStripper();
      expect(stripper.process("Refer to ")).toBe("Refer to ");
      expect(stripper.process("【Hand")).toBe("");
      expect(stripper.process("book.pdf】")).toBe("");
      expect(stripper.process(" immediately.")).toBe(" immediately.");

      expect(stripper.flush()).toBe("");
      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.title).toBe("Handbook.pdf");
    });

    it("releases buffer if [ did not become [source: or [cite:", () => {
      const stripper = new StreamingSourceStripper();
      const chunk1 = stripper.process("Look at this link: [");
      expect(chunk1).toBe("Look at this link: ");

      const chunk2 = stripper.process("Guide](https://example.com)");
      expect(chunk2).toBe("[Guide](https://example.com)");
      expect(stripper.flush()).toBe("");
      expect(stripper.getCollectedSources()).toEqual([]);
    });

    it("handles markdown reference numbers like [1] without stripping them as citations", () => {
      const stripper = new StreamingSourceStripper();
      expect(stripper.process("Refer to item [")).toBe("Refer to item ");
      expect(stripper.process("1]")).toBe("[1]");
      expect(stripper.flush()).toBe("");
      expect(stripper.getCollectedSources()).toEqual([]);
    });

    it("suppresses incomplete [source: ... at end of stream and parses available info on flush", () => {
      const stripper = new StreamingSourceStripper();
      const out1 = stripper.process("Here is the policy.\n\n[source: Draft_Policy.pdf");
      expect(out1).toBe("Here is the policy.");

      const flushed = stripper.flush();
      expect(flushed).toBe("");

      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.title).toBe("Draft_Policy.pdf");
    });

    it("suppresses incomplete [cite: ... at end of stream and parses available info on flush", () => {
      const stripper = new StreamingSourceStripper();
      const out1 = stripper.process("Here is the policy.\n\n[cite: Draft_Policy.pdf");
      expect(out1).toBe("Here is the policy.");

      const flushed = stripper.flush();
      expect(flushed).toBe("");

      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.title).toBe("Draft_Policy.pdf");
    });

    it("suppresses incomplete 【1†source at end of stream and parses available info on flush", () => {
      const stripper = new StreamingSourceStripper();
      const out1 = stripper.process("Here is the answer. 【1†source");
      expect(out1).toBe("Here is the answer. ");

      const flushed = stripper.flush();
      expect(flushed).toBe("");

      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(1);
      expect(sources[0]!.title).toBe("Source 1");
    });

    it("suppresses incomplete trailing [sou prefix at end of stream without leaking", () => {
      const stripper = new StreamingSourceStripper();
      const out1 = stripper.process("Here is the answer.\n\n[sou");
      expect(out1).toBe("Here is the answer.");

      const flushed = stripper.flush();
      expect(flushed).toBe("");
    });

    it("suppresses incomplete trailing [ci prefix at end of stream without leaking", () => {
      const stripper = new StreamingSourceStripper();
      const out1 = stripper.process("Here is the answer.\n\n[ci");
      expect(out1).toBe("Here is the answer.");

      const flushed = stripper.flush();
      expect(flushed).toBe("");
    });

    it("handles multiple mixed streamed sources at the end of the text", () => {
      const stripper = new StreamingSourceStripper();
      const out1 = stripper.process('Here is the answer.\n\n[source: Doc1.pdf, citation: "One"]');
      expect(out1).toBe("Here is the answer.");

      const out2 = stripper.process('\n[cite: Doc2.pdf, citation: "Two"]');
      expect(out2).toBe("");

      const out3 = stripper.process("\n【3†Doc3.pdf】");
      expect(out3).toBe("");

      expect(stripper.flush()).toBe("");
      const sources = stripper.getCollectedSources();
      expect(sources).toHaveLength(3);
      expect(sources[0]!.title).toBe("Doc1.pdf");
      expect(sources[1]!.title).toBe("Doc2.pdf");
      expect(sources[2]!.title).toBe("Doc3.pdf");
    });
  });
});
