// @vitest-environment jsdom
import { strToU8 } from "fflate";
import { expect, it } from "vitest";
import sample from "../../samples/pocket-sample.csv?raw";
import { parseImport } from "./importers";

it("reads the bundled sample Pocket export", () => {
  const { source, items } = parseImport("pocket-sample.csv", strToU8(sample));
  expect(source).toBe("Pocket");
  expect(items).toHaveLength(5);
  expect(items.filter((i) => i.archived)).toHaveLength(1);
});
