import test from "node:test";
import assert from "node:assert/strict";
import { buildTravelBlogVoiceBlock } from "../src/lib/ai-blog-voice.ts";

test("blog voice encourages anchored curiosities and forbids photo invention", () => {
  const block = buildTravelBlogVoiceBlock();
  assert.match(block, /BLOG/i);
  assert.match(block, /curiosidad/i);
  assert.match(block, /historia/i);
  assert.match(block, /PROHIBIDO inventar lo que SE VE/i);
  assert.match(block, /Ancla cada curiosidad/i);
});
