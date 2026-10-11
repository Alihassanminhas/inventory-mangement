import { describe, expect, it } from "vitest";
import { calculateOrderTotal, createSalesOrderSchema, orderItemsSchema } from "./order-validation.js";

describe("order validation and totals", () => {
  it("accepts non-empty whole-unit lines and calculates currency totals exactly", () => {
    const items = orderItemsSchema.parse([
      { productId: "part-a", quantity: 3, unit: "0.10" },
      { productId: "part-b", quantity: 2, unit: "4.25" },
    ]);

    expect(calculateOrderTotal(items).toFixed(2)).toBe("8.80");
  });

  it("rejects fractional quantities, invalid prices, duplicate products, and empty orders", () => {
    expect(() => orderItemsSchema.parse([{ productId: "p1", quantity: 1.5, unit: 1 }])).toThrow();
    expect(() => orderItemsSchema.parse([{ productId: "p1", quantity: 1, unit: "Infinity" }])).toThrow();
    expect(() => orderItemsSchema.parse([{ productId: "p1", quantity: 1, unit: 1.001 }])).toThrow();
    expect(() => orderItemsSchema.parse([
      { productId: "p1", quantity: 1, unit: 1 },
      { productId: "p1", quantity: 1, unit: 1 },
    ])).toThrow(/only appear once/);
    expect(() => orderItemsSchema.parse([])).toThrow();
  });

  it("requires a warehouse and order lines for a sales order", () => {
    expect(() => createSalesOrderSchema.parse({ items: [] })).toThrow();
    expect(createSalesOrderSchema.parse({
      warehouseId: "warehouse-1",
      customerId: "customer-1",
      items: [{ productId: "part-a", quantity: 1, unit: "3.20" }],
    })).toEqual({
      warehouseId: "warehouse-1",
      customerId: "customer-1",
      items: [{ productId: "part-a", quantity: 1, unit: 3.2 }],
    });
  });
});
