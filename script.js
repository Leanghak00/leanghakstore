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

let rawPrice = 0;
let finalPrice = 0;
let currentPlanName = "";
let timerInterval = null;
let currentKHQRData = "";
let selectedAuthType = "phone"; // Default: Phone

// Navigation Tab Switching
function switchTab(tab) {
    document.querySelectorAll('.tab-view').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${tab}`).classList.remove('hidden');
    document.getElementById(`tab-${tab}`).classList.add('active');

    if (tab === 'history') {
        renderOrderHistory();
    }
}

// Copy to Clipboard
function copyToClipboard(text, msg = "ចម្លងរួចរាល់!") {
    navigator.clipboard.writeText(text).then(() => {
        showToast(msg, true);
    });
}

// Check Auth & Handle Purchase
function checkAuthAndOpenCheckout(plan, price) {
    const user = JSON.parse(localStorage.getItem('store_user') || 'null');
    
    currentPlanName = plan;
    rawPrice = price;

    if (!user) {
        // បើមិនទាន់មាន Account ឱ្យលោតផ្ទាំងចុះឈ្មោះ/បង្កើត Account
        openAuthModal();
    } else {
        // បើមានរួចហើយ បើក Checkout តែម្តង
        openCheckout(plan, price);
    }
}

// Authentication Modal Logic
function openAuthModal() {
    const modal = document.getElementById('authModal');
    const content = document.getElementById('authContent');
    const user = JSON.parse(localStorage.getItem('store_user') || 'null');

    if (user) {
        document.getElementById('authName').value = user.name || '';
        if (user.type === 'email') {
            setAuthType('email');
            document.getElementById('authContactEmail').value = user.contact || '';
        } else {
            setAuthType('phone');
            document.getElementById('authContactPhone').value = user.contact || '';
        }
    }

    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
    }, 10);
}

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    const content = document.getElementById('authContent');

    content.classList.add('scale-95');
    modal.classList.add('opacity-0');
    setTimeout(() => { modal.classList.add('hidden'); }, 300);
}

function setAuthType(type) {
    selectedAuthType = type;
    const btnPhone = document.getElementById('btnTypePhone');
    const btnEmail = document.getElementById('btnTypeEmail');
    const inputPhone = document.getElementById('authContactPhone');
    const inputEmail = document.getElementById('authContactEmail');

    if (type === 'phone') {
        btnPhone.className = "py-2 text-xs font-bold rounded-xl border border-blue-600 bg-blue-50 text-blue-600";
        btnEmail.className = "py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-600";
        inputPhone.classList.remove('hidden');
        inputPhone.required = true;
        inputEmail.classList.add('hidden');
        inputEmail.required = false;
    } else {
        btnEmail.className = "py-2 text-xs font-bold rounded-xl border border-blue-600 bg-blue-50 text-blue-600";
        btnPhone.className = "py-2 text-xs font-bold rounded-xl border border-slate-200 bg-slate-50 text-slate-600";
        inputEmail.classList.remove('hidden');
        inputEmail.required = true;
        inputPhone.classList.add('hidden');
        inputPhone.required = false;
    }
}

function handleAuthSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('authName').value.trim();
    const contact = selectedAuthType === 'phone' 
        ? document.getElementById('authContactPhone').value.trim()
        : document.getElementById('authContactEmail').value.trim();

    const userData = {
        name: name,
        contact: contact,
        type: selectedAuthType
    };

    // Save to LocalStorage
    localStorage.setItem('store_user', JSON.stringify(userData));
    updateUserHeaderDisplay();
    closeAuthModal();

    showToast("🎉 ចុះឈ្មោះ/ភ្ជាប់គណនីជោគជ័យ!");

    // Continue Checkout if item was selected
    if (currentPlanName) {
        openCheckout(currentPlanName, rawPrice);
    }
}

function updateUserHeaderDisplay() {
    const user = JSON.parse(localStorage.getItem('store_user') || 'null');
    const headerInfo = document.getElementById('headerUserInfo');
    if (user) {
        headerInfo.innerText = `👤 ${user.name} (${user.contact})`;
    }
}

// KHQR Generator Algorithms
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
    const additionalData = formatTLV("62", billNumber);

    let rawKHQR = payloadFormat + poiMethod + merchantAccInfo + categoryCode + currency + amountStr + countryCode + merchantName + city + additionalData + "6304";
    const crc = calculateCRC16(rawKHQR);
    currentKHQRData = rawKHQR + crc;

    document.getElementById('qrCodeImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentKHQRData)}`;
    document.getElementById('abaDeepLink').href = `abamobile://qr?data=${encodeURIComponent(currentKHQRData)}`;
}

// LocalStorage Order History
function saveOrderToLocal(order) {
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');
    orders.unshift(order);
    localStorage.setItem('user_orders', JSON.stringify(orders));
}

function renderOrderHistory() {
    const historyList = document.getElementById('historyList');
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');

    if (orders.length === 0) {
        historyList.innerHTML = `
            <div class="text-center py-8 white-card rounded-2xl border border-slate-100">
                <i class="fa-solid fa-box-open text-slate-300 text-3xl mb-2"></i>
                <p class="text-xs font-bold text-slate-400">មិនទាន់មានប្រវត្តិទិញនៅឡើយទេ</p>
            </div>`;
        return;
    }

    historyList.innerHTML = orders.map(o => `
        <div class="white-card rounded-2xl p-3.5 border border-slate-100 space-y-2">
            <div class="flex justify-between items-center border-b border-slate-100 pb-2">
                <span class="font-extrabold text-xs text-slate-900">${o.plan}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-600 border border-amber-100">កំពុងពិនិត្យ (Pending)</span>
            </div>
            <div class="flex justify-between items-center text-[11px] text-slate-500">
                <span>ថ្ងៃខែ៖ ${o.date}</span>
                <span class="font-black text-blue-600">$${o.price.toFixed(2)}</span>
            </div>
            <div class="flex justify-between items-center text-[10px] bg-slate-50 p-2 rounded-lg font-mono text-slate-600">
                <span>Trans ID: ${o.transId}</span>
                <button onclick="copyToClipboard('${o.transId}', 'ចម្លង Trans ID រួចរាល់!')" class="text-blue-600 hover:underline">Copy</button>
            </div>
        </div>
    `).join('');
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

function openCheckout(plan, price) {
    const user = JSON.parse(localStorage.getItem('store_user') || '{}');
    
    finalPrice = price;
    document.getElementById('selectedPlanPrice').innerText = price.toFixed(2);
    document.getElementById('checkoutUserDisplay').innerText = `${user.name || 'N/A'} - ${user.contact || 'N/A'}`;
    document.getElementById('discountMsg').classList.add('hidden');
    document.getElementById('couponInput').value = "";
    
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

async function handleOrderSubmit(e) {
    e.preventDefault();

    const user = JSON.parse(localStorage.getItem('store_user') || '{}');
    const transId = document.getElementById('transId').value.trim();
    const slipInput = document.getElementById('slipFile');
    const btn = document.getElementById('btnSubmit');

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> កំពុងបញ្ជូន...`;

    const message = `<b>🛒 ការបញ្ជាទិញថ្មីពី LEANGHAK STORE</b>\n\n` +
                    `<b>👤 អតិថិជន:</b> ${user.name || 'N/A'}\n` +
                    `<b>📞 ទំនាក់ទំនង (${user.type || 'N/A'}):</b> ${user.contact || 'N/A'}\n` +
                    `<b>📦 ទំនិញ/សេវាកម្ម:</b> ${currentPlanName}\n` +
                    `<b>💵 តម្លៃទូទាត់:</b> $${finalPrice.toFixed(2)}\n` +
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

        saveOrderToLocal({
            plan: currentPlanName,
            price: finalPrice,
            transId: transId,
            date: new Date().toLocaleDateString('km-KH')
        });

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

// Page Load Setup
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('supportBtn').href = `https://t.me/${CONFIG.ADMIN_USERNAME.replace('https://t.me/', '')}`;
    document.getElementById('khqrAccName').innerText = CONFIG.MERCHANT_NAME;

    // Auto load user info if saved
    updateUserHeaderDisplay();
});
// ================= Admin Credentials & Config =================
const ADMIN_PASSWORD = "123"; // 🔑 ពាក្យសម្ងាត់សម្រាប់ចូល Admin (អាចដូរបានតាមចិត្ត)

// Handle Admin Login
function handleAdminLogin(e) {
    e.preventDefault();
    const pass = document.getElementById('adminPasswordInput').value;
    
    if (pass === ADMIN_PASSWORD) {
        sessionStorage.setItem('admin_logged_in', 'true');
        document.getElementById('adminLoginSection').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        renderAdminOrders();
    } else {
        alert('❌ ពាក្យសម្ងាត់មិនត្រឹមត្រូវទេ!');
    }
}

// Handle Admin Logout
function handleAdminLogout() {
    sessionStorage.removeItem('admin_logged_in');
    window.location.reload();
}

// Render Orders in Admin Panel
function renderAdminOrders() {
    const container = document.getElementById('adminOrderList');
    if (!container) return;

    // ទាញយកទិន្នន័យពី LocalStorage របស់ហាង
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <i class="fa-solid fa-inbox text-slate-300 text-4xl mb-2"></i>
                <p class="text-xs font-bold text-slate-400">មិនទាន់មានការបញ្ជាទិញនៅឡើយទេ</p>
            </div>
        `;
        return;
    }

    container.innerHTML = orders.map((o, index) => `
        <div class="border border-slate-200 rounded-2xl p-4 bg-slate-50 hover:bg-white transition-all space-y-3">
            <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-200 pb-2">
                <div>
                    <span class="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">#${orders.length - index}</span>
                    <span class="font-extrabold text-slate-900 text-sm ml-1">${o.plan}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">$${o.price.toFixed(2)}</span>
                    <select onchange="updateOrderStatus(${index}, this.value)" class="text-xs font-bold border rounded-lg px-2 py-1 bg-white focus:outline-none">
                        <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                        <option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>✅ Completed</option>
                        <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>❌ Cancelled</option>
                    </select>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                    <span class="text-slate-400 font-medium">អតិថិជន៖</span>
                    <span class="font-bold text-slate-800">${o.userName || 'N/A'}</span>
                </div>
                <div>
                    <span class="text-slate-400 font-medium">ទំនាក់ទំនង (${o.userType || 'N/A'})៖</span>
                    <span class="font-bold text-blue-600">${o.userContact || 'N/A'}</span>
                </div>
                <div>
                    <span class="text-slate-400 font-medium">កាលបរិច្ឆេទ៖</span>
                    <span class="font-semibold text-slate-700">${o.date}</span>
                </div>
                <div>
                    <span class="text-slate-400 font-medium">Transaction ID:</span>
                    <span class="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border">${o.transId}</span>
                </div>
            </div>

            <div class="flex justify-end pt-1">
                <button onclick="deleteSingleOrder(${index})" class="text-[11px] text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1">
                    <i class="fa-solid fa-trash"></i> លុបការបញ្ជាទិញនេះ
                </button>
            </div>
        </div>
    `).join('');
}

// Update Status (Pending / Completed / Cancelled)
function updateOrderStatus(index, newStatus) {
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');
    orders[index].status = newStatus;
    localStorage.setItem('user_orders', JSON.stringify(orders));
    renderAdminOrders();
}

// Delete Order
function deleteSingleOrder(index) {
    if (confirm('តើអ្នកប្រាកដថាលុបការបញ្ជាទិញនេះ?')) {
        let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');
        orders.splice(index, 1);
        localStorage.setItem('user_orders', JSON.stringify(orders));
        renderAdminOrders();
    }
}

// Clear All
function clearAllOrders() {
    if (confirm('តើអ្នកប្រាកដថាលុបទិន្នន័យបញ្ជាទិញទាំងអស់?')) {
        localStorage.removeItem('user_orders');
        renderAdminOrders();
    }
}

// កែប្រែអនុវត្តបន្ថែមក្នុង handleOrderSubmit ដើម្បីរក្សាទុកព័ត៌មានអតិថិជន និង Status ចូល LocalStorage
const originalHandleOrderSubmit = handleOrderSubmit;
handleOrderSubmit = async function(e) {
    e.preventDefault();
    const user = JSON.parse(localStorage.getItem('store_user') || '{}');
    const transId = document.getElementById('transId').value.trim();

    // បន្ថែម Order ចូល Storage ជាមួយព័ត៌មានលម្អិត
    let orders = JSON.parse(localStorage.getItem('user_orders') || '[]');
    orders.unshift({
        plan: currentPlanName,
        price: finalPrice,
        transId: transId,
        userName: user.name || 'N/A',
        userContact: user.contact || 'N/A',
        userType: user.type || 'N/A',
        status: 'Pending',
        date: new Date().toLocaleString('km-KH')
    });
    localStorage.setItem('user_orders', JSON.stringify(orders));

    // ដំណើរការផ្ញើសារចូល Telegram
    await originalHandleOrderSubmit(e);
};