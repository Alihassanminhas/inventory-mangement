import { describe, expect, it, vi } from "vitest";
import { applyStock } from "./stock.js";
import type { Prisma, MovementType } from "@prisma/client";

function createTransaction() {
  return {
    inventory: {
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ available: 7 }),
    },
    stockMovement: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as Prisma.TransactionClient;
}

describe("applyStock", () => {
  it("deducts only the requested product and warehouse and writes an audit movement", async () => {
    const tx = createTransaction();

    await applyStock(tx, {
      productId: "product-1",
      warehouseId: "warehouse-1",
      delta: -3,
      type: "SALE" as MovementType,
      reference: "sale-1",
      actorId: "user-1",
    });

    expect(tx.inventory.updateMany).toHaveBeenCalledWith({
      where: {
        productId: "product-1",
        warehouseId: "warehouse-1",
        available: { gte: 3 },
      },
      data: { available: { increment: -3 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: {
        productId: "product-1",
        warehouseId: "warehouse-1",
        type: "SALE",
        delta: -3,
        before: 10,
        after: 7,
        reference: "sale-1",
        actorId: "user-1",
      },
    });
  });

  it("does not create a movement when a deduction cannot be applied", async () => {
    const tx = createTransaction();
    vi.mocked(tx.inventory.updateMany).mockResolvedValue({ count: 0 });

    await expect(
      applyStock(tx, {
        productId: "product-1",
        warehouseId: "warehouse-1",
        delta: -20,
        type: "SALE" as MovementType,
        actorId: "user-1",
      }),
    ).rejects.toMatchObject({ status: 409, message: "Insufficient stock" });
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
