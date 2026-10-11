import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors"; import helmet from "helmet"; import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs"; import jwt from "jsonwebtoken"; import { z } from "zod";
import { Prisma, PrismaClient, type Role } from "@prisma/client";
import { applyStock, StockConflictError } from "./stock.js";
import { calculateOrderTotal, createPurchaseOrderSchema, createSalesOrderSchema } from "./order-validation.js";
import { productInputSchema, productListQuerySchema, productUpdateSchema } from "./validation.js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 16) throw new Error("JWT_SECRET must be set (16+ chars)");

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
type AuthedReq = Request & { user: { id: string; role: Role } };
const me = (req: Request) => (req as AuthedReq).user;

const auth = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "") ?? "";
    const p = jwt.verify(token, JWT_SECRET) as { sub: string; role: Role };
    if (roles.length && !roles.includes(p.role)) throw new HttpError(403, "Not allowed for your role");
    (req as AuthedReq).user = { id: p.sub, role: p.role }; next();
  } catch (e) { next(e instanceof HttpError ? e : new HttpError(401, "Sign in required")); }
};
const sign = (u: { id: string; role: Role }) => jwt.sign({ sub: u.id, role: u.role }, JWT_SECRET, { expiresIn: "8h" });

export const app = express();
app.use(helmet(), cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }), express.json());
app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 30 }));
const api = express.Router(); app.use("/api", api);
api.get("/health", (_q, r) => r.json({ ok: true }));

const cred = z.object({ email: z.string().email(), password: z.string().min(8) });
api.post("/auth/register", wrap(async (req, res) => {
  const b = cred.extend({ name: z.string().min(1) }).parse(req.body);
  const first = (await prisma.user.count()) === 0; // first account becomes Admin; later users are created by admins (below)
  if (!first) throw new HttpError(403, "Registration is closed. Ask an admin to create your account.");
  const u = await prisma.user.create({ data: { email: b.email, name: b.name, passwordHash: await bcrypt.hash(b.password, 12), role: "ADMIN" } });
  res.status(201).json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role } });
}));
api.post("/auth/login", wrap(async (req, res) => {
  const b = cred.parse(req.body); const u = await prisma.user.findUnique({ where: { email: b.email } });
  if (!u || !(await bcrypt.compare(b.password, u.passwordHash))) throw new HttpError(401, "Wrong email or password");
  res.json({ token: sign(u), user: { id: u.id, name: u.name, role: u.role } });
}));
api.post("/users", auth("ADMIN"), wrap(async (req, res) => {
  const b = cred.extend({ name: z.string().min(1), role: z.enum(["ADMIN", "MANAGER", "STAFF"]) }).parse(req.body);
  const u = await prisma.user.create({ data: { email: b.email, name: b.name, role: b.role, passwordHash: await bcrypt.hash(b.password, 12) } });
  res.status(201).json({ id: u.id, email: u.email, role: u.role });
}));

api.get("/products", auth(), wrap(async (req, res) => {
  const { q, page, pageSize } = productListQuerySchema.parse(req.query);
  const where = q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { sku: { contains: q, mode: "insensitive" as const } }] } : {};
  const [items, total] = await Promise.all([prisma.product.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { name: "asc" }, include: { inventory: true } }), prisma.product.count({ where })]);
  res.json({ total, page, pageSize, items: items.map(p => ({ ...p, stock: p.inventory.reduce((s, i) => s + i.available, 0) })) });
}));
api.get("/products/:id", auth(), wrap(async (req, res) => {
  const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { category: true, inventory: { include: { warehouse: true } } } });
  if (!product) throw new HttpError(404, "Product not found");
  res.json({ ...product, stock: product.inventory.reduce((total, entry) => total + entry.available, 0) });
}));
api.post("/products", auth("ADMIN", "MANAGER"), wrap(async (req, res) => {
  const b = productInputSchema.parse(req.body);
  res.status(201).json(await prisma.product.create({ data: b }));
}));
api.patch("/products/:id", auth("ADMIN", "MANAGER"), wrap(async (req, res) => {
  const b = productUpdateSchema.parse(req.body);
  try {
    res.json(await prisma.product.update({ where: { id: req.params.id }, data: b }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new HttpError(404, "Product not found");
    }
    throw error;
  }
}));
api.delete("/products/:id", auth("ADMIN", "MANAGER"), wrap(async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new HttpError(404, "Product not found");
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new HttpError(409, "Product has inventory or history and cannot be deleted");
    }
    throw error;
  }
}));
api.get("/warehouses", auth(), wrap(async (_q, res) => res.json(await prisma.warehouse.findMany({ orderBy: { name: "asc" } }))));
api.post("/warehouses", auth("ADMIN", "MANAGER"), wrap(async (req, res) => {
  res.status(201).json(await prisma.warehouse.create({ data: z.object({ name: z.string().min(1), location: z.string().optional() }).parse(req.body) }));
}));
api.post("/suppliers", auth("ADMIN", "MANAGER"), wrap(async (req, res) => res.status(201).json(await prisma.supplier.create({ data: z.object({ name: z.string().min(1), email: z.string().email().optional() }).parse(req.body) }))));
api.get("/suppliers", auth("ADMIN", "MANAGER"), wrap(async (_q, res) => res.json(await prisma.supplier.findMany({ orderBy: { name: "asc" } }))));
api.post("/customers", auth("ADMIN", "MANAGER", "STAFF"), wrap(async (req, res) => res.status(201).json(await prisma.customer.create({ data: z.object({ name: z.string().min(1), email: z.string().email().optional() }).parse(req.body) }))));
api.get("/customers", auth(), wrap(async (_q, res) => res.json(await prisma.customer.findMany({ orderBy: { name: "asc" } }))));

api.post("/stock/adjust", auth("ADMIN", "MANAGER"), wrap(async (req, res) => {
  const b = z.object({ productId: z.string(), warehouseId: z.string(), delta: z.number().int().refine(n => n !== 0), reason: z.string().min(1) }).parse(req.body);
  await prisma.$transaction(tx => applyStock(tx, { ...b, type: "ADJUSTMENT", reference: b.reason, actorId: me(req).id }));
  res.json({ ok: true });
}));
api.get("/movements", auth(), wrap(async (_q, res) => res.json(await prisma.stockMovement.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { product: { select: { name: true, sku: true } } } }))));

api.post("/purchases", auth("ADMIN", "MANAGER"), wrap(async (req, res) => {
  const b = createPurchaseOrderSchema.parse(req.body);
  res.status(201).json(await prisma.purchaseOrder.create({ data: { supplierId: b.supplierId, warehouseId: b.warehouseId, total: calculateOrderTotal(b.items), items: { create: b.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unit })) } } }));
}));
api.get("/purchases", auth("ADMIN", "MANAGER"), wrap(async (_q, res) => res.json(await prisma.purchaseOrder.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { supplier: true, warehouse: true, items: { include: { product: { select: { name: true, sku: true } } } } } }))));
// Idempotent: the status flip ORDERED->RECEIVED only succeeds once; retries get 409 and change nothing.
api.post("/purchases/:id/receive", auth("ADMIN", "MANAGER"), wrap(async (req, res) => {
  await prisma.$transaction(async tx => {
    const flip = await tx.purchaseOrder.updateMany({ where: { id: req.params.id, status: "ORDERED" }, data: { status: "RECEIVED" } });
    if (flip.count === 0) throw new HttpError(409, "Order is not awaiting receipt");
    const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: req.params.id }, include: { items: true } });
    for (const i of po.items) await applyStock(tx, { productId: i.productId, warehouseId: po.warehouseId, delta: i.quantity, type: "PURCHASE_RECEIPT", reference: po.id, actorId: me(req).id });
  });
  res.json({ ok: true });
}));

api.post("/sales", auth(), wrap(async (req, res) => {
  const b = createSalesOrderSchema.parse(req.body);
  res.status(201).json(await prisma.salesOrder.create({ data: { customerId: b.customerId, warehouseId: b.warehouseId, total: calculateOrderTotal(b.items), items: { create: b.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unit })) } } }));
}));
api.get("/sales", auth(), wrap(async (_q, res) => res.json(await prisma.salesOrder.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { customer: true, warehouse: true, items: { include: { product: { select: { name: true, sku: true } } } } } }))));
// Completing deducts stock at once (v1 lifecycle). Any failure rolls back the status flip and every deduction.
api.post("/sales/:id/complete", auth(), wrap(async (req, res) => {
  await prisma.$transaction(async tx => {
    const flip = await tx.salesOrder.updateMany({ where: { id: req.params.id, status: "DRAFT" }, data: { status: "COMPLETED" } });
    if (flip.count === 0) throw new HttpError(409, "Order is not a draft");
    const so = await tx.salesOrder.findUniqueOrThrow({ where: { id: req.params.id }, include: { items: true } });
    for (const i of so.items) await applyStock(tx, { productId: i.productId, warehouseId: so.warehouseId, delta: -i.quantity, type: "SALE", reference: so.id, actorId: me(req).id });
  });
  res.json({ ok: true });
}));

api.get("/dashboard", auth(), wrap(async (_q, res) => {
  const products = await prisma.product.findMany({ include: { inventory: true } });
  const rows = products.map(p => ({ id: p.id, sku: p.sku, name: p.name, reorderLevel: p.reorderLevel, stock: p.inventory.reduce((s, i) => s + i.available, 0), value: Number(p.cost) * p.inventory.reduce((s, i) => s + i.available, 0) }));
  res.json({ productCount: rows.length, inventoryValue: rows.reduce((s, r) => s + r.value, 0), lowStock: rows.filter(r => r.stock <= r.reorderLevel) });
}));

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

app.use((e: unknown, _q: Request, res: Response, _n: NextFunction) => {
  if (e instanceof SyntaxError && "body" in e) {
    return res.status(400).json({ error: "Request body must contain valid JSON." });
  }
  if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
  if (e instanceof StockConflictError) return res.status(e.status).json({ error: e.message });
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return res.status(409).json({ error: "That value already exists" });
  console.error(e); res.status(500).json({ error: "Something went wrong" });
});

const invokedScript = process.argv[1];
const isDirectExecution = invokedScript !== undefined && pathToFileURL(resolve(invokedScript)).href === import.meta.url;
if (isDirectExecution) {
  app.listen(Number(process.env.PORT ?? 4000), () => console.log("API ready"));
}
