import test from "node:test";
import assert from "node:assert/strict";
import { parseDuckDuckGoHtml } from "../src/providers/ddg.js";

test("parseDuckDuckGoHtml extracts lite results and removes duplicates", () => {
  const html = `
    <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Alpha</a>
    <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Alpha Duplicate</a>
    <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fb">Bravo</a>
  `;

  const results = parseDuckDuckGoHtml(html, 10);

  assert.deepEqual(results, [
    {
      title: "Alpha",
      url: "https://example.com/a",
      snippet: "",
      provider: "ddg"
    },
    {
      title: "Bravo",
      url: "https://example.com/b",
      snippet: "",
      provider: "ddg"
    }
  ]);
});

test("parseDuckDuckGoHtml strips DDG tracking params from decoded target URLs", () => {
  const html = `
    <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fopenai.com%2F&amp;rut=c408576787b670a8">Official site</a>
  `;

  const results = parseDuckDuckGoHtml(html, 10);

  assert.deepEqual(results, [
    {
      title: "Official site",
      url: "https://openai.com/",
      snippet: "",
      provider: "ddg"
    }
  ]);
});
