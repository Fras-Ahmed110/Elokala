import {
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    ref,
    set,
    push,
    remove,
    onValue
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

import { auth, db } from "./firebase.js";

const $ = (id) => document.getElementById(id);
const STATUS_OPTIONS = ["pending", "shipped", "delivered", "cancelled"];
let products = [];
let orders = [];
let currentUser = null;

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
}[char]));

const formatMoney = (value) => `${Number(value || 0).toLocaleString("en-US")} EG`;

function showError(message) {
    $("loginErrorText").textContent = message;
    $("loginError").classList.add("show");
}

function hideError() {
    $("loginError").classList.remove("show");
}

function setLoginLoading(loading, label = "Signing in...") {
    $("loginBtn").disabled = loading;
    $("loginBtn").innerHTML = loading
        ? `<i class="fa-solid fa-circle-notch fa-spin"></i> ${escapeHtml(label)}`
        : '<i class="fa-solid fa-arrow-right-to-bracket"></i> Sign In';
}

function enterDashboard(user) {
    currentUser = user;
    $("loginScreen").classList.add("hidden");
    $("dashboard").classList.add("show");

    const initial = (user.displayName || user.email || "A").charAt(0).toUpperCase();
    for (const id of ["sidebarAvatar", "topbarAvatar"]) $(id).textContent = initial;
    const name = user.displayName || "Admin";
    for (const id of ["sidebarUserName", "topbarUserName"]) $(id).textContent = name;
    $("sidebarUserEmail").textContent = user.email || "";
    const settingsEmail = $("settingsEmail");
    if (settingsEmail) {
        settingsEmail.value = user.email || "";
        settingsEmail.readOnly = true;
    }
    renderDashboard();
}

async function verifyAdmin(user) {
    try {
        const tokenResult = await user.getIdTokenResult();
        return tokenResult.claims.admin === true;
    } catch (error) {
        return false;
    }
}

async function handleAuthenticatedUser(user) {
    const isAdmin = await verifyAdmin(user);
    if (!isAdmin) {
        currentUser = null;
        $("loginScreen").classList.remove("hidden");
        $("dashboard").classList.remove("show");
        showError("This account does not have dashboard access.");
        await signOut(auth);
        return;
    }
    enterDashboard(user);
}

$("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    hideError();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    if (!email || !password) return showError("Please fill in all fields.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Please enter a valid email address.");

    setLoginLoading(true);
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        const message = error.code === "auth/invalid-credential" || error.code === "auth/wrong-password"
            ? "Invalid email or password."
            : "Unable to sign in. Please try again.";
        showError(message);
        setLoginLoading(false);
    }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        handleAuthenticatedUser(user);
    } else {
        currentUser = null;
        $("loginScreen").classList.remove("hidden");
        $("dashboard").classList.remove("show");
        $("loginPassword").value = "";
        setLoginLoading(false);
    }
});

$("logoutBtn").addEventListener("click", async () => {
    await signOut(auth);
    location.reload();
});

onValue(ref(db, "products"), (snapshot) => {
    products = Object.entries(snapshot.val() || {}).map(([id, product]) => ({ id, ...product }));
    renderDashboard();
});

onValue(ref(db, "orders"), (snapshot) => {
    orders = Object.entries(snapshot.val() || {})
        .map(([id, order]) => ({ id, ...order }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderDashboard();
});

function stockLabel(stock) {
    if (!stock) return "Out of stock";
    return `${stock} in stock`;
}

function renderProductMini(product) {
    const stock = Number(product.stock || 0);
    const stockClass = stock === 0 ? "stock-out" : stock <= 5 ? "stock-low" : "stock-in";
    return `
        <div class="product-mini">
            <img class="product-mini-img" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">
            <div class="product-mini-body">
                <div class="product-mini-name">${escapeHtml(product.name)}</div>
                <div class="product-mini-cat">${escapeHtml(product.category)}</div>
                <div class="product-mini-bottom">
                    <span class="product-mini-price">${formatMoney(product.price)}</span>
                    <span class="product-mini-stock ${stockClass}">${escapeHtml(stockLabel(stock))}</span>
                </div>
                <div class="product-mini-actions">
                    <button type="button" class="product-action-btn" data-action="edit-product" data-id="${escapeHtml(product.id)}"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="product-action-btn danger" data-action="delete-product" data-id="${escapeHtml(product.id)}"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        </div>`;
}

function orderCustomer(order) {
    return order.customerName || order.phone || order.email || "Guest";
}

function orderProduct(order) {
    const first = order.items?.[0];
    return first ? `${first.name} × ${first.qty}` : order.items?.length ? `${order.items.length} items` : "—";
}

function safeStatus(status) {
    return STATUS_OPTIONS.includes(status) ? status : "pending";
}

async function updateOrderStatus(orderId, status) {
    await set(ref(db, `orders/${orderId}/status`), status);
}

function renderDashboard() {
    if (!currentUser) return;

    const revenue = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const customers = new Set(orders.map(orderCustomer));

    $("statOrders").textContent = orders.length;
    $("statRevenue").textContent = formatMoney(revenue);
    $("statProducts").textContent = products.length;
    $("statCustomers").textContent = customers.size;
    $("ordersBadge").textContent = orders.length;

    $("recentOrdersBody").innerHTML = orders.slice(0, 5).map((order) => `
        <tr>
            <td class="order-id">${escapeHtml(order.id)}</td>
            <td class="order-product">${escapeHtml(orderProduct(order))}</td>
            <td class="order-total">${formatMoney(order.total)}</td>
            <td><span class="status-badge status-${safeStatus(order.status)}">${safeStatus(order.status)}</span></td>
        </tr>`).join("") || `<tr><td colspan="4"><div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No orders yet</p></div></td></tr>`;

    $("overviewProducts").innerHTML = products.slice(0, 4).map(renderProductMini).join("") || `<p class="empty-state">No products yet.</p>`;
    $("allProducts").innerHTML = products.map(renderProductMini).join("") || `<p class="empty-state">No products yet.</p>`;
    renderAllOrders();
    renderCustomers();
}

function renderAllOrders() {
    const filter = $("orderFilter").value;
    const filtered = filter === "all" ? orders : orders.filter((order) => order.status === filter);

    $("allOrdersBody").innerHTML = filtered.map((order) => `
        <tr>
            <td class="order-id">${escapeHtml(order.id)}</td>
            <td class="order-product">${escapeHtml(orderProduct(order))}<br><small>${escapeHtml(orderCustomer(order))}</small></td>
            <td class="order-total">${formatMoney(order.total)}</td>
            <td>
                <select class="status-select" data-order-id="${escapeHtml(order.id)}" aria-label="Order status">
                    ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${safeStatus(order.status) === status ? "selected" : ""}>${status}</option>`).join("")}
                </select>
            </td>
            <td class="order-date">${order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}</td>
        </tr>`).join("") || `<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No orders found</p></div></td></tr>`;

    document.querySelectorAll(".status-select").forEach((select) => {
        select.addEventListener("change", async () => {
            try {
                await updateOrderStatus(select.dataset.orderId, select.value);
            } catch (error) {
                alert("Unable to update order status.");
                renderAllOrders();
            }
        });
    });
}

function renderCustomers() {
    const customersMap = {};
    orders.forEach((order) => {
        const key = orderCustomer(order);
        if (!customersMap[key]) customersMap[key] = { orders: 0, spent: 0, email: order.email || "—", phone: order.phone || "—" };
        customersMap[key].orders += 1;
        customersMap[key].spent += Number(order.total || 0);
    });

    const rows = Object.entries(customersMap).map(([name, data]) => `
        <tr>
            <td><strong>${escapeHtml(name)}</strong></td>
            <td class="order-product">${escapeHtml(data.email)}</td>
            <td class="order-product">${escapeHtml(data.phone)}</td>
            <td>${data.orders}</td>
            <td class="order-total">${formatMoney(data.spent)}</td>
        </tr>`).join("");

    $("customersBody").innerHTML = rows || `<tr><td colspan="5"><div class="empty-state"><i class="fa-solid fa-users"></i><p>No customers yet</p></div></td></tr>`;
}

$("orderFilter").addEventListener("change", renderAllOrders);

const sectionNames = {
    overview: "Overview",
    orders: "Orders",
    products: "Products",
    customers: "Customers",
    settings: "Settings"
};

function showSection(name) {
    document.querySelectorAll(".content > section").forEach((section) => section.style.display = "none");
    const target = $("section-" + name);
    if (target) target.style.display = "block";
    document.querySelectorAll(".sidebar-link").forEach((link) => link.classList.remove("active"));
    document.querySelectorAll(`.sidebar-link[data-section="${name}"]`).forEach((link) => link.classList.add("active"));
    $("topbarSection").textContent = sectionNames[name] || name;
    $("sidebar").classList.remove("open");
}

document.querySelectorAll(".sidebar-link[data-section]").forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        showSection(link.dataset.section);
    });
});

document.querySelectorAll("[data-goto]").forEach((element) => {
    element.addEventListener("click", (event) => {
        event.preventDefault();
        showSection(element.dataset.goto);
    });
});

$("menuToggle").addEventListener("click", () => $("sidebar").classList.toggle("open"));

$("globalSearch").addEventListener("input", (event) => {
    const query = event.target.value.toLowerCase().trim();
    document.querySelectorAll(".orders-table tbody tr").forEach((row) => {
        row.style.display = row.textContent.toLowerCase().includes(query) ? "" : "none";
    });
});

$("saveSettings").addEventListener("click", async () => {
    const button = $("saveSettings");
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
    try {
        await currentUser?.reload();
        await currentUser?.getIdToken(true);
        alert("Settings saved!");
    } catch (error) {
        alert("Unable to save settings.");
    } finally {
        button.disabled = false;
        button.innerHTML = original;
    }
});

// ==========================================
// PRODUCT MANAGEMENT
// ==========================================
const DEFAULT_PRODUCT_IMAGE = "https://www.kindpng.com/picc/m/44-448507_clothes-hanger-clip-art-hd-png-download.png";
const productForm = $("productForm");
const productIdInput = $("productId");
const productImageFile = $("productImageFile");
const productImageUrl = $("productImageUrl");
const productPreview = $("productFormPreview");
const productPreviewImg = $("productPreviewImg");

function resetProductForm() {
    productForm.reset();
    productIdInput.value = "";
    $("productFormTitle").textContent = "Add New Product";
    $("productCancelBtn").style.display = "none";
    productPreview.style.display = "none";
}

function fileToResizedDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const maxSize = 800;
                const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/jpeg", 0.82));
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

productImageFile.addEventListener("change", async () => {
    const file = productImageFile.files[0];
    if (!file) return;
    try {
        const dataUrl = await fileToResizedDataUrl(file);
        productPreviewImg.src = dataUrl;
        productPreview.style.display = "block";
        productImageUrl.value = "";
        productImageUrl.placeholder = "Using uploaded image";
        productImageUrl.dataset.uploaded = dataUrl;
    } catch (error) {
        alert("Unable to read that image.");
    }
});

productImageUrl.addEventListener("input", () => {
    delete productImageUrl.dataset.uploaded;
    productImageUrl.placeholder = "https://...";
    if (productImageUrl.value) productPreview.style.display = "none";
});

productForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = productIdInput.value;
    const name = $("productName").value.trim();
    const category = $("productCategory").value;
    const price = Number($("productPrice").value);
    const stock = Number($("productStock").value);
    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(stock) || stock < 0) {
        alert("Please fill all fields correctly.");
        return;
    }

    let image = productImageUrl.dataset.uploaded || productImageUrl.value.trim();
    if (!image && id) {
        const existing = products.find((p) => p.id === id);
        image = existing?.image || DEFAULT_PRODUCT_IMAGE;
    }
    if (!image) image = DEFAULT_PRODUCT_IMAGE;

    const data = {
        name,
        category,
        price,
        stock,
        image,
        active: true
    };

    const button = $("productSubmitBtn");
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
    try {
        if (id) {
            await set(ref(db, `products/${id}`), data);
        } else {
            await push(ref(db, "products"), data);
        }
        resetProductForm();
    } catch (error) {
        alert("Unable to save product. Make sure you are signed in as admin.");
    } finally {
        button.disabled = false;
        button.innerHTML = original;
    }
});

$("productCancelBtn").addEventListener("click", resetProductForm);

document.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const product = products.find((p) => p.id === id);
    if (!product) return;

    if (btn.dataset.action === "edit-product") {
        productIdInput.value = product.id;
        $("productName").value = product.name || "";
        $("productCategory").value = product.category || "Hoodies";
        $("productPrice").value = product.price ?? "";
        $("productStock").value = product.stock ?? "";
        productImageUrl.value = "";
        delete productImageUrl.dataset.uploaded;
        productImageFile.value = "";
        if (product.image && !product.image.startsWith("data:")) {
            productPreviewImg.src = product.image;
            productPreview.style.display = "block";
        } else {
            productPreview.style.display = "none";
        }
        $("productFormTitle").textContent = "Edit Product";
        $("productCancelBtn").style.display = "inline-flex";
        productForm.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (btn.dataset.action === "delete-product") {
        if (!confirm(`Delete "${product.name}"?`)) return;
        try {
            await remove(ref(db, `products/${id}`));
        } catch (error) {
            alert("Unable to delete product.");
        }
    }
});

renderDashboard();
