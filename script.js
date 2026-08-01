// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

// Global Configuration
const CONFIG = {
    BOT_TOKEN: "8837070026:AAFxv2sCBu8dq-bzhzv81c9468ddeZv3cRE",
    ADMIN_CHAT_ID: "-5531983327",
    ADMIN_USERNAME: "hoeunleanghak",
    ACCOUNT_ID: "85515912925@abaa", 
    MERCHANT_NAME: "HOEUN LEANGHAK",
    CITY: "Phnom Penh"
};

const ADMIN_PASSWORD = "123"; // 🔑 Password Admin

let rawPrice = 0;
let finalPrice = 0;
let currentPlanName = "";
let timerInterval = null;
let currentKHQRString = "";
let currentUser = null; // Store Logged In User State

// CRC16 Calculation & TLV Format
function calculateCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTLV(tag, value) {
    const len = value.length.toString().padStart(2, '0');
    return `${tag}${len}${value}`;
}

function generateOfficialKHQR(amount) {
    const globalID = formatTLV("00", "kh.gov.nbc.bakong");
    const accountID = formatTLV("01", CONFIG.ACCOUNT_ID);
    const merchantAccInfo = formatTLV("29", globalID + accountID);

    const payloadFormat = formatTLV("00", "01");
    const poiMethod = formatTLV("01", "12");
    const categoryCode = formatTLV("52", "5999");
    const currency = formatTLV("53", "840");
    const amountStr = formatTLV("54", amount.toFixed(2));
    const countryCode = formatTLV("58", "KH");
    const merchantName = formatTLV("59", CONFIG.MERCHANT_NAME);
    const city = formatTLV("60", CONFIG.CITY);

    const billNumber = formatTLV("01", "INV" + Math.floor(1000 + Math.random() * 9000));
    const storeLabel = formatTLV("03", "Leanghak Store");
    const additionalData = formatTLV("62", billNumber + storeLabel);

    let rawKHQR = payloadFormat + poiMethod + merchantAccInfo + categoryCode + currency + amountStr + countryCode + merchantName + city + additionalData + "6304";
    const crc = calculateCRC16(rawKHQR);
    currentKHQRString = rawKHQR + crc;

    document.getElementById('qrCodeImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentKHQRString)}`;
    document.getElementById('abaDeepLink').href = `abamobilebank://qr?code=${encodeURIComponent(currentKHQRString)}`;
}

function startTimer(durationInSeconds) {
    clearInterval(timerInterval);
    let timer = durationInSeconds;
    const timerDisplay = document.getElementById('timerText');

    timerInterval = setInterval(() => {
        const minutes = Math.floor(timer / 60);
        const seconds = timer % 60;
        timerDisplay.innerText = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        if (--timer < 0) {
            clearInterval(timerInterval);
            timerDisplay.innerText = "Expired";
        }
    }, 1000);
}

function showToast(msg, isSuccess = true) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    const toastIcon = document.getElementById('toastIcon');

    toastMsg.innerText = msg;
    toastIcon.className = isSuccess ? "fa-solid fa-circle-check text-emerald-400 text-sm" : "fa-solid fa-circle-xmark text-rose-400 text-sm";
    
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ================= 👤 USER AUTHENTICATION SYSTEM =================

function checkUserLoginState() {
    const loggedUser = JSON.parse(localStorage.getItem('current_user') || 'null');
    currentUser = loggedUser;
    const profileArea = document.getElementById('userProfileArea');

    if (currentUser) {
        profileArea.innerHTML = `
            <div class="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                ${currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div class="text-left">
                <p class="text-xs font-extrabold text-white leading-tight">${currentUser.name}</p>
                <button onclick="handleLogout()" class="text-[10px] text-rose-400 hover:underline font-bold">Logout</button>
            </div>
        `;
    } else {
        profileArea.innerHTML = `
            <button onclick="openAuthModal('login')" class="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5">
                <i class="fa-solid fa-right-to-bracket"></i> ចូលប្រើ / បង្កើត Account
            </button>
        `;
    }
}

function openAuthModal(mode = 'login') {
    toggleAuthMode(mode);
    document.getElementById('authModal').classList.remove('hidden');
}

function closeAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
}

function toggleAuthMode(mode) {
    if (mode === 'register') {
        document.getElementById('loginFormSection').classList.add('hidden');
        document.getElementById('registerFormSection').classList.remove('hidden');
    } else {
        document.getElementById('registerFormSection').classList.add('hidden');
        document.getElementById('loginFormSection').classList.remove('hidden');
    }
}

function handleUserRegister(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const password = document.getElementById('regPassword').value;

    let users = JSON.parse(localStorage.getItem('store_users') || '[]');
    
    if (users.find(u => u.phone === phone)) {
        showToast("លេខទូរស័ព្ទនេះមានគណនីរួចហើយ!", false);
        return;
    }

    const newUser = { name, phone, password, id: Date.now() };
    users.push(newUser);
    localStorage.setItem('store_users', JSON.stringify(users));
    
    // Auto Login after register
    localStorage.setItem('current_user', JSON.stringify(newUser));
    checkUserLoginState();
    closeAuthModal();
    showToast("🎉 បង្កើតគណនីបានជោគជ័យ!");
}

function handleUserLogin(e) {
    e.preventDefault();
    const phone = document.getElementById('loginPhone').value.trim();
    const password = document.getElementById('loginPassword').value;

    let users = JSON.parse(localStorage.getItem('store_users') || '[]');
    const user = users.find(u => u.phone === phone && u.password === password);

    if (user) {
        localStorage.setItem('current_user', JSON.stringify(user));
        checkUserLoginState();
        closeAuthModal();
        showToast("👋 ស្វាគមន៍ការត្រឡប់មកវិញ!");
    } else {
        showToast("លេខទូរស័ព្ទ ឬ ពាក្យសម្ងាត់មិនត្រឹមត្រូវ!", false);
    }
}

function handleLogout() {
    localStorage.removeItem('current_user');
    checkUserLoginState();
    showToast("បាន Logout រួចរាល់");
}

// Open Checkout Sheet
function openCheckout(plan, price) {
    if (!currentUser) {
        showToast("សូមបង្កើតគណនី ឬ Login មុននឹងទិញ!", false);
        openAuthModal('login');
        return;
    }

    currentPlanName = plan;
    rawPrice = price;
    finalPrice = price;
    
    document.getElementById('selectedPlanPrice').innerText = price.toFixed(2);
    document.getElementById('discountMsg').classList.add('hidden');
    document.getElementById('couponInput').value = "";
    document.getElementById('contactInfo').value = `${currentUser.name} (${currentUser.phone})`;

    generateOfficialKHQR(finalPrice);
    startTimer(180);

    const sheet = document.getElementById('checkoutSheet');
    const content = document.getElementById('sheetContent');
    
    sheet.classList.remove('hidden');
    setTimeout(() => {
        sheet.classList.remove('opacity-0');
        content.classList.remove('translate-y-full');
    }, 10);

    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
}

function closeCheckout() {
    clearInterval(timerInterval);
    const sheet = document.getElementById('checkoutSheet');
    const content = document.getElementById('sheetContent');
    
    content.classList.add('translate-y-full');
    sheet.classList.add('opacity-0');
    setTimeout(() => { sheet.classList.add('hidden'); }, 300);
}

function applyDiscount() {
    const coupon = document.getElementById('couponInput').value.trim().toUpperCase();
    const msg = document.getElementById('discountMsg');
    
    if (coupon === "LEANGHAK" || coupon === "AIPRO") {
        finalPrice = Math.max(0, rawPrice - 0.50);
        document.getElementById('selectedPlanPrice').innerText = finalPrice.toFixed(2);
        generateOfficialKHQR(finalPrice);

        msg.innerText = "✓ ទទួលបានការបញ្ចុះតម្លៃ $0.50 ជោគជ័យ!";
        msg.className = "text-[11px] mt-1 text-emerald-600 font-bold block";
    } else {
        msg.innerText = "✕ កូដមិនត្រឹមត្រូវ ពិនិត្យឡើងវិញ!";
        msg.className = "text-[11px] mt-1 text-rose-500 font-bold block";
    }
}

function previewSlip(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('uploadPlaceholder').classList.add('hidden');
        document.getElementById('uploadPreview').classList.remove('hidden');
        document.getElementById('fileName').innerText = file.name;
    }
}

// 🛒 Handle Order Submit
async function handleOrderSubmit(e) {
    e.preventDefault();

    const contact = document.getElementById('contactInfo').value.trim();
    const transId = document.getElementById('transId').value.trim();
    const slipInput = document.getElementById('slipFile');
    const btn = document.getElementById('btnSubmit');

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> កំពុងបញ្ជូន...`;

    // 1. Save locally for Admin & Customer History
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');
    orders.unshift({
        id: "ORD-" + Date.now(),
        userPhone: currentUser.phone,
        userName: currentUser.name,
        plan: currentPlanName,
        price: finalPrice,
        contact: contact,
        transId: transId,
        status: 'Pending',
        date: new Date().toLocaleString('km-KH')
    });
    localStorage.setItem('user_orders', JSON.stringify(orders));

    // 2. Telegram Bot Payload
    const message = `<b>🛒 ការបញ្ជាទិញថ្មីពី LEANGHAK STORE</b>\n\n` +
                    `<b>👤 អតិថិជន:</b> ${currentUser.name}\n` +
                    `<b>📦 ទំនិញ:</b> ${currentPlanName}\n` +
                    `<b>💵 តម្លៃ:</b> $${finalPrice.toFixed(2)}\n` +
                    `<b>📞 ទំនាក់ទំនង:</b> ${contact}\n` +
                    `<b>🧾 Trans ID:</b> <code>${transId}</code>`;

    try {
        if (slipInput.files && slipInput.files[0]) {
            const formData = new FormData();
            formData.append('chat_id', CONFIG.ADMIN_CHAT_ID);
            formData.append('caption', message);
            formData.append('parse_mode', 'HTML');
            formData.append('photo', slipInput.files[0]);

            await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });
        } else {
            await fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CONFIG.ADMIN_CHAT_ID,
                    text: message,
                    parse_mode: 'HTML'
                })
            });
        }

        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
        showToast("🎉 បញ្ជូនការបញ្ជាទិញជោគជ័យ!");
        closeCheckout();

    } catch (err) {
        if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred('error');
        showToast("មានបញ្ហាក្នុងការផ្ញើ៖ " + err.message, false);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>បញ្ជូនការបញ្ជាទិញ</span> <i class="fa-solid fa-paper-plane text-xs"></i>`;
    }
}

// 📜 Customer Order History
function openHistoryModal() {
    if (!currentUser) {
        showToast("សូម Login ដើម្បីមើលប្រវត្តិបញ្ជាទិញ!", false);
        openAuthModal('login');
        return;
    }

    const modal = document.getElementById('historyModal');
    const container = document.getElementById('customerOrderList');
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');

    // Filter order only for logged in user
    let userOrders = orders.filter(o => o.userPhone === currentUser.phone);

    if (userOrders.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">គ្មានប្រវត្តិបញ្ជាទិញនៅឡើយទេ</p>`;
    } else {
        container.innerHTML = userOrders.map(o => `
            <div class="p-3 bg-slate-50 border rounded-2xl space-y-1">
                <div class="flex justify-between items-center text-xs font-bold">
                    <span class="text-slate-800">${o.plan}</span>
                    <span class="text-blue-600">$${o.price.toFixed(2)}</span>
                </div>
                <div class="flex justify-between items-center text-[10px] text-slate-500">
                    <span>${o.date}</span>
                    <span class="px-2 py-0.5 rounded-full font-bold ${
                        o.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                        o.status === 'Cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                    }">${o.status}</span>
                </div>
            </div>
        `).join('');
    }
    modal.classList.remove('hidden');
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.add('hidden');
}

// ================= 🔑 ADMIN CONTROL SYSTEM =================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('supportBtn').href = `https://t.me/${CONFIG.ADMIN_USERNAME.replace('https://t.me/', '')}`;
    document.getElementById('khqrAccName').innerText = CONFIG.MERCHANT_NAME;

    checkUserLoginState();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === 'true') {
        openAdminModal();
    }
});

function openAdminModal() {
    document.getElementById('adminModal').classList.remove('hidden');
}

function closeAdminModal() {
    document.getElementById('adminModal').classList.add('hidden');
}

function handleAdminLogin(e) {
    e.preventDefault();
    const pass = document.getElementById('adminPasswordInput').value;
    
    if (pass === ADMIN_PASSWORD) {
        document.getElementById('adminLoginSection').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        renderAdminOrders();
        renderAdminUsers();
    } else {
        alert('❌ ពាក្យសម្ងាត់ Admin មិនត្រឹមត្រូវទេ!');
    }
}

function switchAdminTab(tab) {
    if (tab === 'orders') {
        document.getElementById('adminOrdersSection').classList.remove('hidden');
        document.getElementById('adminUsersSection').classList.add('hidden');
        document.getElementById('tabOrdersBtn').className = "flex-1 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold";
        document.getElementById('tabUsersBtn').className = "flex-1 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold";
    } else {
        document.getElementById('adminOrdersSection').classList.add('hidden');
        document.getElementById('adminUsersSection').classList.remove('hidden');
        document.getElementById('tabOrdersBtn').className = "flex-1 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold";
        document.getElementById('tabUsersBtn').className = "flex-1 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold";
    }
}

function renderAdminOrders() {
    const container = document.getElementById('adminOrderList');
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');

    if (orders.length === 0) {
        container.innerHTML = `<p class="text-xs font-bold text-slate-400 text-center py-6">មិនទាន់មាន Order ទេ</p>`;
        return;
    }

    container.innerHTML = orders.map((o, index) => `
        <div class="border border-slate-200 rounded-2xl p-3 bg-slate-50 space-y-2">
            <div class="flex justify-between items-center border-b border-slate-200 pb-1.5">
                <span class="font-extrabold text-xs text-slate-900">${o.plan}</span>
                <span class="text-xs font-black text-emerald-600">$${o.price.toFixed(2)}</span>
            </div>
            <div class="text-[11px] text-slate-600 space-y-0.5">
                <div>👤 ឈ្មោះ៖ <b>${o.userName || 'N/A'}</b></div>
                <div>📞 ទំនាក់ទំនង៖ <b>${o.contact}</b></div>
                <div>🧾 Trans ID: <b class="font-mono text-slate-800">${o.transId}</b></div>
                <div class="text-[10px] text-slate-400">🕒 ថ្ងៃខែ៖ ${o.date}</div>
            </div>
            <div class="flex justify-between items-center pt-1.5 border-t border-slate-200">
                <select onchange="updateOrderStatus(${index}, this.value)" class="text-xs font-bold border rounded-lg px-2 py-1 bg-white focus:outline-none">
                    <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                    <option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>✅ Completed</option>
                    <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>❌ Cancelled</option>
                </select>
                <button onclick="deleteSingleOrder(${index})" class="text-[11px] text-rose-500 hover:underline font-bold">
                    <i class="fa-solid fa-trash"></i> លុប
                </button>
            </div>
        </div>
    `).join('');
}

function renderAdminUsers() {
    const container = document.getElementById('adminUserList');
    let users = JSON.parse(localStorage.getItem('store_users') || '[]');

    if (users.length === 0) {
        container.innerHTML = `<p class="text-xs font-bold text-slate-400 text-center py-6">មិនទាន់មានអតិថិជនចុះឈ្មោះទេ</p>`;
        return;
    }

    container.innerHTML = users.map(u => `
        <div class="border border-slate-200 rounded-xl p-2.5 bg-slate-50 flex items-center justify-between">
            <div>
                <p class="text-xs font-bold text-slate-800">${u.name}</p>
                <p class="text-[11px] text-slate-500"><i class="fa-solid fa-phone text-[9px] mr-1"></i>${u.phone}</p>
            </div>
            <span class="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">Customer</span>
        </div>
    `).join('');
}

function updateOrderStatus(index, newStatus) {
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');
    orders[index].status = newStatus;
    localStorage.setItem('user_orders', JSON.stringify(orders));
    renderAdminOrders();
}

function deleteSingleOrder(index) {
    if (confirm('តើអ្នកប្រាកដថាលុប Order នេះ?')) {
        let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');
        orders.splice(index, 1);
        localStorage.setItem('user_orders', JSON.stringify(orders));
        renderAdminOrders();
    }
}

function clearAllOrders() {
    if (confirm('តើអ្នកប្រាកដថាលុប Order ទាំងអស់?')) {
        localStorage.removeItem('user_orders');
        renderAdminOrders();
    }
}
