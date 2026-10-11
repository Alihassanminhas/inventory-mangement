import { Prisma } from "@prisma/client";
import { z } from "zod";
import { currencyAmountSchema } from "./validation.js";

export const orderItemsSchema = z
  .array(
    z.object({
      productId: z.string().trim().min(1),
      quantity: z.coerce.number().int().positive(),
      unit: currencyAmountSchema,
    }).strict(),
  )
  .min(1)
  .superRefine((items, context) => {
    const productIds = new Set<string>();
    items.forEach((item, index) => {
      if (productIds.has(item.productId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each product can only appear once in an order.",
          path: [index, "productId"],
        });
      }
      productIds.add(item.productId);
    });
  });

export const createSalesOrderSchema = z.object({
  customerId: z.string().trim().min(1).optional(),
  warehouseId: z.string().trim().min(1),
  items: orderItemsSchema,
}).strict();

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().trim().min(1),
  warehouseId: z.string().trim().min(1),
  items: orderItemsSchema,
}).strict();

export type OrderItemInput = z.infer<typeof orderItemsSchema>[number];

/** Uses decimal arithmetic so quantities and unit prices cannot accumulate binary-float rounding errors. */
export function calculateOrderTotal(items: readonly OrderItemInput[]): Prisma.Decimal {
  return items.reduce(
    (total, item) => total.plus(new Prisma.Decimal(item.unit).times(item.quantity)),
    new Prisma.Decimal(0),
  );
}
