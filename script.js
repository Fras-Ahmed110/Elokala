import {
    onAuthStateChanged,
    signInAnonymously,
    signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
    ref,
    set,
    onValue
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

import { auth, db } from "./firebase.js";

const WHATSAPP_NUMBER = "201069771131";
const DEFAULT_IMAGE = "https://www.kindpng.com/picc/m/44-448507_clothes-hanger-clip-art-hd-png-download.png";
const $ = (id) => document.getElementById(id);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
}[char]));

let cart = JSON.parse(localStorage.getItem("elokalaCart") || "[]");
let deliveryInfo = { phone: "", email: "", address: "" };
let products = [];
let currentUser = null;

function saveCart() {
    localStorage.setItem("elokalaCart", JSON.stringify(cart));
}

function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const element = $("cart-count");
    if (element) element.textContent = count;
}

function getCartTotal() {
    return cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function showNotification(message) {
    const notification = document.createElement("div");
    notification.textContent = message;
    Object.assign(notification.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        background: "green",
        color: "#fff",
        padding: "10px 15px",
        borderRadius: "5px",
        zIndex: "9999"
    });
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
}

function categoryKey(category) {
    return String(category || "").trim().toLowerCase();
}

function categoryContainer(category) {
    const key = categoryKey(category);
    if (key.includes("hoodie")) return $("hoodies");
    if (key.includes("shirt") || key.includes("tee")) return $("tshirts");
    if (key.includes("jacket") || key.includes("coat") || key.includes("vest")) return $("jackets");
    return null;
}

function getOrCreateGrid(container) {
    if (!container) return null;
    let grid = container.querySelector(".projects-grid");
    if (!grid) {
        grid = document.createElement("div");
        grid.className = "projects-grid";
        container.appendChild(grid);
    }
    return grid;
}

function renderProducts() {
    const visibleProducts = products.filter((product) => product.active !== false);
    document.querySelectorAll("#hoodies, #tshirts, #jackets").forEach((container) => {
        container.classList.remove("has-products");
        container.style.display = "none";
        const grid = getOrCreateGrid(container);
        if (grid) grid.innerHTML = "";
    });

    visibleProducts.forEach((product) => {
        const container = categoryContainer(product.category);
        if (!container) return;
        const stock = Number(product.stock ?? 1);
        if (stock <= 0) return;
        const grid = getOrCreateGrid(container);
        if (!grid) return;
        container.classList.add("has-products");
        container.style.display = "block";

        const card = document.createElement("article");
        card.className = "project-card";
        card.innerHTML = `
            <div class="project-thumbnail">
                <img alt="${escapeHtml(product.name)}" src="${escapeHtml(product.image || DEFAULT_IMAGE)}" />
            </div>
            <div class="project-content">
                <h3 class="project-label">${escapeHtml(product.name)}</h3>
                <p class="project-description">${escapeHtml(product.description || product.category || "Clothing")}</p>
                <p class="project-description"><strong>${Number(product.price || 0).toLocaleString("en-US")} EG</strong></p>
                <button class="project-link buy-now" type="button" data-id="${escapeHtml(product.id)}">BUY NOW <i class="fas fa-dollar-sign"></i></button>
                <button class="project-link add-to-cart" type="button" data-id="${escapeHtml(product.id)}">Add To Cart <i class="fas fa-shopping-cart"></i></button>
            </div>`;
        grid.appendChild(card);
    });

    bindProductButtons();
}

function bindProductButtons() {
    document.querySelectorAll(".add-to-cart[data-id]").forEach((button) => {
        button.onclick = () => {
            const product = products.find((item) => item.id === button.dataset.id);
            if (!product) return;
            const existing = cart.find((item) => item.id === product.id);
            if (existing) existing.qty += 1;
            else cart.push({ id: product.id, name: product.name, price: Number(product.price || 0), image: product.image || DEFAULT_IMAGE, qty: 1 });
            saveCart();
            updateCartCount();
            showNotification(`${product.name} added to cart`);
        };
    });

    document.querySelectorAll(".buy-now[data-id]").forEach((button) => {
        button.onclick = () => {
            const product = products.find((item) => item.id === button.dataset.id);
            if (!product) return;
            cart = [{ id: product.id, name: product.name, price: Number(product.price || 0), image: product.image || DEFAULT_IMAGE, qty: 1 }];
            saveCart();
            updateCartCount();
            openCheckout();
        };
    });
}

onValue(ref(db, "products"), (snapshot) => {
    products = Object.entries(snapshot.val() || {}).map(([id, product]) => ({ id, ...product }));
    renderProducts();
});

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (!user) {
        try {
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Anonymous sign-in failed", error);
        }
        return;
    }

    const guestLinks = $("guestLinks");
    const userLinks = $("userLinks");
    if (guestLinks) guestLinks.style.display = "none";
    if (userLinks) userLinks.style.display = "flex";
    const navUserName = $("navUserName");
    if (navUserName) navUserName.textContent = user.displayName || "User";
});

function openModal(id) {
    $(id).classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeModal(id) {
    $(id).classList.remove("active");
    document.body.style.overflow = "";
}

function closeAllModals() {
    ["cartOverlay", "checkoutOverlay", "confirmOverlay", "successOverlay"].forEach(closeModal);
}

function renderCart() {
    if (cart.length === 0) {
        $("cartItemsContainer").innerHTML = `<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><p>Your cart is empty</p></div>`;
        $("cartFooter").style.display = "none";
        return;
    }

    $("cartItemsContainer").innerHTML = cart.map((item, index) => `
        <div class="cart-item">
            <img class="cart-item-img" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">
            <div class="cart-item-info">
                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                <div class="cart-item-price">${Number(item.price || 0).toLocaleString("en-US")} EG</div>
            </div>
            <div class="cart-item-qty">
                <button class="qty-btn" data-action="dec" data-index="${index}"><i class="fa-solid fa-minus"></i></button>
                <span class="qty-value">${item.qty}</span>
                <button class="qty-btn" data-action="inc" data-index="${index}"><i class="fa-solid fa-plus"></i></button>
            </div>
            <button class="cart-item-remove" data-action="remove" data-index="${index}" aria-label="Remove"><i class="fa-solid fa-trash"></i></button>
        </div>`).join("");

    $("cartFooter").style.display = "block";
    $("cartTotal").textContent = `${getCartTotal().toLocaleString("en-US")} EG`;

    document.querySelectorAll("[data-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const index = Number(button.dataset.index);
            const action = button.dataset.action;
            if (action === "inc") cart[index].qty += 1;
            if (action === "dec") {
                cart[index].qty -= 1;
                if (cart[index].qty <= 0) cart.splice(index, 1);
            }
            if (action === "remove") cart.splice(index, 1);
            saveCart();
            updateCartCount();
            renderCart();
        });
    });
}

function openCheckout() {
    closeModal("cartOverlay");
    $("phoneInput").value = deliveryInfo.phone;
    $("emailInput").value = deliveryInfo.email;
    $("addressInput").value = deliveryInfo.address;
    openModal("checkoutOverlay");
    setTimeout(() => $("phoneInput").focus(), 200);
}

function renderConfirm() {
    $("confirmItems").innerHTML = cart.map((item) => `
        <div class="order-summary-item">
            <span>${escapeHtml(item.name)} × ${item.qty}</span>
            <span>${(Number(item.price || 0) * Number(item.qty || 0)).toLocaleString("en-US")} EG</span>
        </div>`).join("");
    $("confirmTotal").textContent = `${getCartTotal().toLocaleString("en-US")} EG`;
    $("confirmPhone").textContent = deliveryInfo.phone || "—";
    $("confirmEmail").textContent = deliveryInfo.email || "—";
    $("confirmAddress").textContent = deliveryInfo.address || "—";
}

async function submitOrder() {
    if (cart.length === 0) return;
    if (!auth.currentUser) await signInAnonymously(auth);
    if (!auth.currentUser) throw new Error("Authentication is required");

    const orderId = `ELK-${Date.now().toString().slice(-8)}`;
    const order = {
        id: orderId,
        items: cart.map((item) => ({ ...item })),
        total: getCartTotal(),
        phone: deliveryInfo.phone,
        email: deliveryInfo.email,
        address: deliveryInfo.address,
        customerName: auth.currentUser.displayName || "Guest",
        status: "pending",
        createdAt: Date.now()
    };

    const safeOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, "_");
    await set(ref(db, `orders/${safeOrderId}`), order);

    const message = [
        "🛍️ *New Order - Elokala*",
        "",
        `📋 *Order ID:* ${orderId}`,
        "",
        "📦 *Products:*",
        ...cart.map((item) => `• ${item.name} × ${item.qty} = ${Number(item.price || 0) * Number(item.qty || 0)} EG`),
        "",
        `💰 *Total:* ${getCartTotal()} EG`,
        "",
        `📞 *Phone:* ${deliveryInfo.phone}`,
        `📧 *Email:* ${deliveryInfo.email}`,
        `📍 *Address:* ${deliveryInfo.address}`,
        "",
        "Thank you! 🙏"
    ].join("\n");

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank");
    cart = [];
    saveCart();
    updateCartCount();
    $("orderRef").textContent = `Order #${orderId}`;
    closeModal("confirmOverlay");
    openModal("successOverlay");
}

function initEvents() {
    const navToggle = $("navToggle");
    const navLinks = document.querySelector(".nav-links");
    if (navToggle && navLinks) {
        navToggle.addEventListener("click", () => {
            navLinks.classList.toggle("active");
            const icon = navToggle.querySelector("i");
            icon.classList.toggle("fa-bars");
            icon.classList.toggle("fa-xmark");
        });
    }

    $("cartBtn").addEventListener("click", () => { renderCart(); openModal("cartOverlay"); });
    $("cartClose").addEventListener("click", () => closeModal("cartOverlay"));
    $("checkoutBtn").addEventListener("click", openCheckout);
    $("checkoutClose").addEventListener("click", () => closeModal("checkoutOverlay"));
    $("backToCart").addEventListener("click", () => { closeModal("checkoutOverlay"); renderCart(); openModal("cartOverlay"); });

    $("detailsForm").addEventListener("submit", (event) => {
        event.preventDefault();
        deliveryInfo = {
            phone: $("phoneInput").value.trim(),
            email: $("emailInput").value.trim(),
            address: $("addressInput").value.trim()
        };
        if (!deliveryInfo.phone || !deliveryInfo.email || !deliveryInfo.address) return;
        closeModal("checkoutOverlay");
        renderConfirm();
        openModal("confirmOverlay");
    });

    $("confirmClose").addEventListener("click", () => closeModal("confirmOverlay"));
    $("backToDetails").addEventListener("click", () => { closeModal("confirmOverlay"); openCheckout(); });
    $("placeOrderBtn").addEventListener("click", async () => {
        $("placeOrderBtn").disabled = true;
        try {
            await submitOrder();
        } catch (error) {
            alert("Unable to save order. Please try again.");
        } finally {
            $("placeOrderBtn").disabled = false;
        }
    });
    $("successClose").addEventListener("click", () => { closeModal("successOverlay"); renderCart(); });

    ["cartOverlay", "checkoutOverlay", "confirmOverlay", "successOverlay"].forEach((id) => {
        $(id).addEventListener("click", (event) => {
            if (event.target === $(id)) closeModal(id);
        });
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeAllModals();
    });

    const logoutHome = $("logoutHome");
    if (logoutHome) {
        logoutHome.addEventListener("click", async (event) => {
            event.preventDefault();
            await signOut(auth);
            localStorage.removeItem("elokalaCart");
            location.reload();
        });
    }

    const discountForm = document.querySelector(".discount-form");
    if (discountForm) {
        discountForm.addEventListener("submit", (event) => {
            event.preventDefault();
            const input = discountForm.querySelector("input");
            alert(`Thanks! Your discount request was received for ${input.value}`);
            discountForm.reset();
        });
    }
}

initEvents();
updateCartCount();
renderCart();

// Hidden admin shortcut: typing 2005 anywhere opens the dashboard login
let typedDigits = "";
document.addEventListener("keydown", (event) => {
    const tag = event.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (/^[0-9]$/.test(event.key)) {
        typedDigits = (typedDigits + event.key).slice(-4);
        if (typedDigits === "2005") {
            window.location.href = "dashboard.html";
        }
    } else {
        typedDigits = "";
    }
});
