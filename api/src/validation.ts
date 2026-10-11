import { z } from "zod";

export const currencyAmountSchema = z
  .coerce.number()
  .finite()
  .min(0)
  .max(999_999_999.99)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7, {
    message: "Amount can have at most two decimal places.",
  });

const productFields = {
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  price: currencyAmountSchema,
  cost: currencyAmountSchema.default(0),
  reorderLevel: z.coerce.number().int().min(0).max(2_147_483_647).default(10),
  categoryId: z.string().trim().min(1).optional(),
};

export const productInputSchema = z.object(productFields).strict();

export const productUpdateSchema = z
  .object(productFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one product field must be provided.",
  });

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
