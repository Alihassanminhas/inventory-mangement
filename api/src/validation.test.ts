import { describe, expect, it } from "vitest";
import { productInputSchema, productListQuerySchema } from "./validation.js";

describe("product request validation", () => {
  it("trims product identity fields and supplies safe defaults", () => {
    expect(
      productInputSchema.parse({ sku: "  SKU-1 ", name: " Widget ", price: "2.50" }),
    ).toEqual({ sku: "SKU-1", name: "Widget", price: 2.5, cost: 0, reorderLevel: 10 });
  });

  it("rejects invalid money and fractional reorder levels", () => {
    expect(() => productInputSchema.parse({ sku: "A", name: "A", price: -1 })).toThrow();
    expect(() => productInputSchema.parse({ sku: "A", name: "A", price: 1.123 })).toThrow();
    expect(
      () =>
        productInputSchema.parse({ sku: "A", name: "A", price: 1, reorderLevel: 1.5 }),
    ).toThrow();
  });

  it("normalizes pagination defaults and rejects malformed or excessive page numbers", () => {
    expect(productListQuerySchema.parse({})).toEqual({ q: "", page: 1, pageSize: 20 });
    expect(productListQuerySchema.parse({ q: " Bolt ", page: "2", pageSize: "50" })).toEqual({
      q: "Bolt",
      page: 2,
      pageSize: 50,
    });
    expect(() => productListQuerySchema.parse({ page: "NaN" })).toThrow();
    expect(() => productListQuerySchema.parse({ page: "10001" })).toThrow();
    expect(() => productListQuerySchema.parse({ pageSize: "201" })).toThrow();
  });
});
