import type { Prisma, MovementType } from "@prisma/client";

export class StockConflictError extends Error {
  public readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "StockConflictError";
  }
}

export interface StockChange {
  productId: string;
  warehouseId: string;
  delta: number;
  type: MovementType;
  reference?: string;
  actorId: string;
}

/**
 * Changes one warehouse balance and appends its immutable movement in the
 * caller's Prisma transaction. Negative updates use a conditional write to
 * prevent concurrent sales from making stock negative.
 */
export async function applyStock(
  tx: Prisma.TransactionClient,
  change: StockChange,
): Promise<void> {
  if (!Number.isSafeInteger(change.delta) || change.delta === 0) {
    throw new TypeError("Stock change must be a non-zero whole number.");
  }

  const key = {
    productId_warehouseId: {
      productId: change.productId,
      warehouseId: change.warehouseId,
    },
  };

  await tx.inventory.upsert({
    where: key,
    create: {
      productId: change.productId,
      warehouseId: change.warehouseId,
      available: 0,
    },
    update: {},
  });

  if (change.delta < 0) {
    const result = await tx.inventory.updateMany({
      where: {
        productId: change.productId,
        warehouseId: change.warehouseId,
        available: { gte: -change.delta },
      },
      data: { available: { increment: change.delta } },
    });

    if (result.count === 0) {
      throw new StockConflictError("Insufficient stock");
    }
  } else {
    await tx.inventory.update({
      where: key,
      data: { available: { increment: change.delta } },
    });
  }

  const inventory = await tx.inventory.findUniqueOrThrow({ where: key });
  await tx.stockMovement.create({
    data: {
      productId: change.productId,
      warehouseId: change.warehouseId,
      type: change.type,
      delta: change.delta,
      before: inventory.available - change.delta,
      after: inventory.available,
      ...(change.reference === undefined ? {} : { reference: change.reference }),
      actorId: change.actorId,
    },
  });
}
