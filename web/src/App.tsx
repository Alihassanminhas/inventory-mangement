import { useCallback, useEffect, useState, type FormEvent } from "react";

interface Product {
  id: string;
  sku: string;
  name: string;
  price: string;
  cost: string;
  reorderLevel: number;
  stock: number;
}

interface BusinessPartner {
  id: string;
  name: string;
}

interface OrderLine {
  id: string;
  productId: string;
  quantity: number;
  unit: number;
}

interface OrderView {
  id: string;
  status: string;
  total: string;
  createdAt: string;
  warehouse: { name: string };
  supplier?: BusinessPartner;
  customer?: BusinessPartner | null;
  items: Array<{ quantity: number; product: { name: string; sku: string } }>;
}

interface ProductList {
  total: number;
  items: Product[];
}

interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

interface StockMovement {
  id: string;
  createdAt: string;
  type: string;
  delta: number;
  before: number;
  after: number;
  product: { name: string; sku: string };
}

interface DashboardData {
  productCount: number;
  inventoryValue: number;
  lowStock: Array<Pick<Product, "id" | "sku" | "name" | "stock" | "reorderLevel">>;
}

interface AuthResponse {
  token: string;
  user: { id: string; name: string; role: string };
}

let token = sessionStorage.getItem("token") ?? "";

async function call<T>(
  path: string,
  body?: unknown,
  method?: "POST" | "PATCH" | "DELETE",
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload !== null && "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed. Please try again.";
    throw new Error(errorMessage);
  }
  return payload as T;
}

function formValues(event: FormEvent<HTMLFormElement>): Record<string, string> {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await call<T>(path));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load data.");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, load };
}

function Login({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    const values = formValues(event);
    setError("");
    setBusy(true);
    try {
      const response = await call<AuthResponse>(`/auth/${mode}`, values);
      token = response.token;
      sessionStorage.setItem("token", token);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <form className="glass center login-card" onSubmit={submit} style={{ flexDirection: "column" }}>
        <h1>Stockroom</h1>
        {mode === "register" && <input name="name" placeholder="Your name" aria-label="Your name" required />}
        <input name="email" type="email" placeholder="Email" aria-label="Email" autoComplete="email" required />
        <input name="password" type="password" placeholder="Password (8+ characters)" aria-label="Password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required />
        {error && <div className="err" role="alert">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create admin account"}</button>
        <button type="button" disabled={busy} onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "First time? Set up the workspace" : "Back to sign in"}
        </button>
      </form>
    </main>
  );
}

function Dashboard() {
  const { data, error, loading, load } = useLoad<DashboardData>("/dashboard");
  if (error) return <div className="glass err" role="alert">{error} <button onClick={() => void load()}>Retry</button></div>;
  if (loading || !data) return <p className="mute" role="status">Loading dashboard…</p>;

  return <>
    <h1>Dashboard</h1>
    <p className="mute">Here’s what’s happening with your inventory today.</p>
    <div className="row">
      <section className="glass"><div className="mute">Products</div><div className="stat">{data.productCount.toLocaleString()}</div></section>
      <section className="glass"><div className="mute">Inventory value at cost</div><div className="stat">${data.inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></section>
    </div>
    <section className="glass overflow"><h2>Low stock</h2>
      {data.lowStock.length === 0 ? <p className="mute">Nothing is running low.</p> :
        <table><thead><tr><th>SKU</th><th>Product</th><th>In stock</th><th>Reorder at</th></tr></thead>
          <tbody>{data.lowStock.map((product) => <tr key={product.id}><td>{product.sku}</td><td>{product.name}</td><td className="low">{product.stock}</td><td>{product.reorderLevel}</td></tr>)}</tbody></table>}
    </section>
  </>;
}

function Products() {
  const [query, setQuery] = useState("");
  const { data, error, load, loading } = useLoad<ProductList>(`/products?q=${encodeURIComponent(query)}`);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const values = formValues(event);
    const editingProduct = form.dataset.editing === "true" ? editing : null;
    setBusy(true);
    setMessage("");
    const body = {
      ...values,
      price: Number(values.price),
      cost: Number(values.cost || 0),
      reorderLevel: Number(values.reorderLevel || 10),
    };

    try {
      if (editingProduct) {
        await call<Product>(`/products/${editingProduct.id}`, body, "PATCH");
        setEditing(null);
        setMessage("Product updated.");
      } else {
        await call<Product>("/products", body);
        form.reset();
        setMessage("Product added.");
      }
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save product.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name}? Products with stock history cannot be deleted.`)) return;
    setBusy(true);
    setMessage("");
    try {
      await call<void>(`/products/${product.id}`, undefined, "DELETE");
      setMessage("Product deleted.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to delete product.");
    } finally {
      setBusy(false);
    }
  };

  return <section className="glass overflow">
    <h1>Products</h1>
    <label>Search products <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or SKU" /></label>
    <form onSubmit={save} data-editing={editing ? "true" : "false"}>
      {editing && <h2>Edit {editing.name}</h2>}
      <input name="sku" aria-label="SKU" placeholder="SKU" defaultValue={editing?.sku ?? ""} required />
      <input name="name" aria-label="Product name" placeholder="Name" defaultValue={editing?.name ?? ""} required />
      <input name="price" aria-label="Price" type="number" min="0" step="0.01" placeholder="Price" defaultValue={editing?.price ?? ""} required />
      <input name="cost" aria-label="Cost" type="number" min="0" step="0.01" placeholder="Cost" defaultValue={editing?.cost ?? ""} />
      <input name="reorderLevel" aria-label="Reorder level" type="number" min="0" step="1" placeholder="Reorder at" defaultValue={editing?.reorderLevel ?? 10} />
      <button className="primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add product"}</button>
      {editing && <button type="button" disabled={busy} onClick={() => setEditing(null)}>Cancel edit</button>}
    </form>
    {message && <p role="status" className={message.includes("Unable") || message.includes("cannot") ? "err" : "mute"}>{message}</p>}
    {error && <p className="err" role="alert">{error} <button onClick={() => void load()}>Retry</button></p>}
    {loading && <p className="mute" role="status">Loading products…</p>}
    {!loading && data?.items.length === 0 && <p className="mute">No products found.</p>}
    {data && data.items.length > 0 && <table><thead><tr><th>SKU</th><th>Name</th><th>Price</th><th>In stock</th><th>Actions</th></tr></thead>
      <tbody>{data.items.map((product) => <tr key={product.id}><td>{product.sku}</td><td>{product.name}</td><td>{product.price}</td>
        <td className={product.stock <= product.reorderLevel ? "low" : ""}>{product.stock}</td>
        <td><button type="button" disabled={busy} onClick={() => setEditing(product)}>Edit</button> <button type="button" disabled={busy} aria-label={`Delete ${product.name}`} onClick={() => void remove(product)}>Delete</button></td></tr>)}</tbody></table>}
    {data && <p className="mute" aria-live="polite">{data.total} product{data.total === 1 ? "" : "s"}</p>}
  </section>;
}

function Stock() {
  const products = useLoad<ProductList>("/products");
  const warehouses = useLoad<Warehouse[]>("/warehouses");
  const movements = useLoad<StockMovement[]>("/movements");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const addWarehouse = async (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const values = formValues(event);
    setBusy(true);
    setMessage("");
    try { await call<Warehouse>("/warehouses", values); form.reset(); setMessage("Warehouse created."); await warehouses.load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to create warehouse."); }
    finally { setBusy(false); }
  };

  const adjustStock = async (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const values = formValues(event);
    setBusy(true);
    setMessage("");
    try {
      await call<{ ok: true }>("/stock/adjust", { ...values, delta: Number(values.delta) });
      form.reset();
      setMessage("Stock updated.");
      await Promise.all([movements.load(), products.load()]);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to update stock."); }
    finally { setBusy(false); }
  };

  return <>
    <section className="glass" style={{ marginBottom: 16 }}><h1>Inventory</h1><h2>Warehouses</h2>
      <form onSubmit={addWarehouse}><input name="name" aria-label="Warehouse name" placeholder="Warehouse name" required /><input name="location" aria-label="Warehouse location" placeholder="Location" /><button disabled={busy}>Add warehouse</button></form>
      {warehouses.error && <p role="alert" className="err">{warehouses.error}</p>}
      {warehouses.loading ? <p role="status" className="mute">Loading warehouses…</p> : <ul>{warehouses.data?.map((warehouse) => <li key={warehouse.id}>{warehouse.name}{warehouse.location ? ` · ${warehouse.location}` : ""}</li>)}</ul>}
      <h2>Adjust stock</h2>
      <form onSubmit={adjustStock}>
        <select name="productId" required aria-label="Product"><option value="">Select a product</option>{products.data?.items.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select>
        <select name="warehouseId" required aria-label="Warehouse"><option value="">Select a warehouse</option>{warehouses.data?.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
        <input name="delta" type="number" step="1" placeholder="+10 or -3" aria-label="Stock change in whole units" required />
        <input name="reason" placeholder="Reason" aria-label="Reason for adjustment" required />
        <button className="primary" disabled={busy}>{busy ? "Updating…" : "Apply adjustment"}</button>
      </form>
      {message && <p role="status" className={message === "Stock updated." || message === "Warehouse created." ? "mute" : "err"}>{message}</p>}
    </section>
    <section className="glass overflow"><h2>Recent movements</h2>
      {movements.loading && <p className="mute" role="status">Loading movements…</p>}
      {movements.error && <p className="err" role="alert">{movements.error} <button onClick={() => void movements.load()}>Retry</button></p>}
      {!movements.loading && !movements.error && !movements.data?.length && <p className="mute">No stock movements yet.</p>}
      {!!movements.data?.length && <table><thead><tr><th>When</th><th>Product</th><th>Type</th><th>Change</th><th>Before → after</th></tr></thead>
        <tbody>{movements.data.map((movement) => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleString()}</td><td>{movement.product.name}</td><td>{movement.type}</td><td>{movement.delta}</td><td>{movement.before} → {movement.after}</td></tr>)}</tbody></table>}
    </section>
  </>;
}

function Orders({ kind }: { kind: "sales" | "purchases" }) {
  const productData = useLoad<ProductList>("/products");
  const warehouseData = useLoad<Warehouse[]>("/warehouses");
  const partnerData = useLoad<BusinessPartner[]>(kind === "purchases" ? "/suppliers" : "/customers");
  const orderData = useLoad<OrderView[]>(`/${kind}`);
  const [lines, setLines] = useState<OrderLine[]>([{ id: crypto.randomUUID(), productId: "", quantity: 1, unit: 0 }]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const updateLine = (lineId: string, patch: Partial<OrderLine>) => {
    setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...patch } : line));
  };

  const addLine = () => setLines((current) => [...current, { id: crypto.randomUUID(), productId: "", quantity: 1, unit: 0 }]);

  const createOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = formValues(event);
    setBusy(true);
    setMessage("");
    try {
      const items = lines.map(({ productId, quantity, unit }) => ({ productId, quantity: Number(quantity), unit: Number(unit) }));
      const body = kind === "purchases"
        ? { supplierId: values.partnerId, warehouseId: values.warehouseId, items }
        : { ...(values.partnerId ? { customerId: values.partnerId } : {}), warehouseId: values.warehouseId, items };
      const created = await call<OrderView>(`/${kind}`, body);
      if (kind === "sales") {
        try {
          await call<{ ok: true }>(`/sales/${created.id}/complete`, {}, "POST");
          setMessage("Sale confirmed and inventory updated.");
        } catch (cause) {
          setMessage(`Draft sale ${created.id} was saved, but confirmation failed: ${cause instanceof Error ? cause.message : "request failed"}`);
        }
      } else {
        setMessage("Purchase order created. Receive it when the stock arrives.");
      }
      setLines([{ id: crypto.randomUUID(), productId: "", quantity: 1, unit: 0 }]);
      await orderData.load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to create order.");
    } finally {
      setBusy(false);
    }
  };

  const receiveOrder = async (orderId: string) => {
    setBusy(true);
    setMessage("");
    try {
      await call<{ ok: true }>(`/purchases/${orderId}/receive`, {}, "POST");
      setMessage("Purchase received and inventory updated.");
      await orderData.load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to receive purchase.");
    } finally {
      setBusy(false);
    }
  };

  const title = kind === "sales" ? "Sales orders" : "Purchase orders";
  const error = productData.error || warehouseData.error || partnerData.error || orderData.error;

  return <>
    <section className="glass" style={{ marginBottom: 16 }}>
      <h1>{title}</h1>
      <form onSubmit={createOrder}>
        {kind === "purchases" && <select name="partnerId" aria-label="Supplier" required defaultValue=""><option value="" disabled>Select supplier</option>{partnerData.data?.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select>}
        {kind === "sales" && <select name="partnerId" aria-label="Customer" defaultValue=""><option value="">Walk-in customer</option>{partnerData.data?.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select>}
        <select name="warehouseId" aria-label="Warehouse" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouseData.data?.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>
        <div className="order-lines" aria-label="Order items">
          {lines.map((line) => <div className="order-line" key={line.id}>
            <select aria-label="Order product" required value={line.productId} onChange={(event) => {
              const product = productData.data?.items.find((item) => item.id === event.target.value);
              updateLine(line.id, { productId: event.target.value, unit: Number(kind === "sales" ? product?.price ?? 0 : product?.cost ?? 0) });
            }}><option value="" disabled>Select product</option>{productData.data?.items.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select>
            <input type="number" aria-label="Quantity" min="1" step="1" required value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })} />
            <input type="number" aria-label={kind === "sales" ? "Unit price" : "Unit cost"} min="0" step="0.01" required value={line.unit} onChange={(event) => updateLine(line.id, { unit: Number(event.target.value) })} />
            <button type="button" aria-label="Remove order line" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>Remove</button>
          </div>)}
          <button type="button" onClick={addLine}>Add product line</button>
        </div>
        <button className="primary" disabled={busy || productData.loading || warehouseData.loading || partnerData.loading}>{busy ? "Saving…" : kind === "sales" ? "Save and confirm sale" : "Create purchase order"}</button>
      </form>
      {message && <p role="status" className={message.includes("failed") || message.includes("Unable") ? "err" : "mute"}>{message}</p>}
      {error && <p role="alert" className="err">{error}</p>}
    </section>
    <section className="glass overflow"><h2>Recent {kind === "sales" ? "sales" : "purchases"}</h2>
      {orderData.loading && <p role="status" className="mute">Loading orders…</p>}
      {!orderData.loading && orderData.data?.length === 0 && <p className="mute">No orders yet.</p>}
      {!!orderData.data?.length && <table><thead><tr><th>Created</th><th>Reference</th><th>Partner</th><th>Warehouse</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>{orderData.data.map((order) => <tr key={order.id}><td>{new Date(order.createdAt).toLocaleDateString()}</td><td>{order.id.slice(-8)}</td><td>{order.supplier?.name ?? order.customer?.name ?? "Walk-in"}</td><td>{order.warehouse.name}</td><td>{order.items.map((item) => `${item.product.sku} × ${item.quantity}`).join(", ")}</td><td>{order.total}</td><td>{order.status}</td>
          <td>{kind === "purchases" && order.status === "ORDERED" && <button disabled={busy} onClick={() => void receiveOrder(order.id)}>Receive stock</button>}</td></tr>)}</tbody></table>}
    </section>
  </>;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(token));
  const [tab, setTab] = useState<"dashboard" | "products" | "stock" | "sales" | "purchases">("dashboard");
  if (!authenticated) return <Login onDone={() => setAuthenticated(true)} />;

  const pages = {
    dashboard: <Dashboard />,
    products: <Products />,
    stock: <Stock />,
    sales: <Orders kind="sales" />,
    purchases: <Orders kind="purchases" />,
  };

  return <div className="shell">
    <nav className="glass" aria-label="Main navigation">
      <h2>Stockroom</h2>
      {(["dashboard", "products", "stock", "sales", "purchases"] as const).map((page) =>
        <button key={page} className={tab === page ? "on" : ""} aria-current={tab === page ? "page" : undefined} onClick={() => setTab(page)}>
          {page[0]?.toUpperCase()}{page.slice(1)}
        </button>)}
      <button onClick={() => { token = ""; sessionStorage.removeItem("token"); setAuthenticated(false); }}>Sign out</button>
    </nav>
    <main>{pages[tab]}</main>
  </div>;
}
