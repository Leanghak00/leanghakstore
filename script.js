import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where,
    onSnapshot,
    setDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// FIREBASE CONFIGURATION
const firebaseConfig = {
    apiKey: "AIzaSyD_G4f_FfRZg7G0Fgf27CIW5D30uIy7Xmo",
    authDomain: "leanghakstore.firebaseapp.com",
    databaseURL: "https://leanghakstore-default-rtdb.firebaseio.com",
    projectId: "leanghakstore",
    storageBucket: "leanghakstore.firebasestorage.app",
    messagingSenderId: "422176510531",
    appId: "1:422176510531:web:01a7edf8c0466d1f43baf6",
    measurementId: "G-8E1WQQYXD6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

const CONFIG = {
    BOT_TOKEN: "8837070026:AAFxv2sCBu8dq-bzhzv81c9468ddeZv3cRE",
    ADMIN_CHAT_ID: "-5531983327",
    ADMIN_USERNAME: "hoeunleanghak",
    ACCOUNT_ID: "85515912925@abaa", 
    MERCHANT_NAME: "HOEUN LEANGHAK",
    CITY: "Phnom Penh"
};

const ADMIN_PASSWORD = "123";

let rawPrice = 0;
let finalPrice = 0;
let currentPlanName = "";
let timerInterval = null;
let currentKHQRString = "";
let currentUser = null;
let currentUserBalance = 0.00;
let selectedPaymentMethod = "khqr";
let unsubscribeUserDoc = null;
let unsubscribeOrders = null;

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

// Real-time Listener (Firebase Auth & Balance Sync)
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const profileArea = document.getElementById('userProfileArea');

    if (unsubscribeUserDoc) unsubscribeUserDoc();
    if (unsubscribeOrders) unsubscribeOrders();

    if (currentUser) {
        profileArea.innerHTML = `
            <div onclick="openProfileModal()" class="flex items-center gap-2 cursor-pointer hover:opacity-85">
                <div class="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">
                    ${(currentUser.displayName || currentUser.email).charAt(0).toUpperCase()}
                </div>
                <div class="text-left">
                    <p class="text-xs font-extrabold text-white leading-tight truncate max-w-[100px]">${currentUser.displayName || currentUser.email}</p>
                    <span class="text-[9px] text-emerald-400 font-bold">$<span id="headerBalance">0.00</span></span>
                </div>
            </div>
            <button onclick="handleLogout()" class="ml-2 text-xs text-rose-400 hover:text-rose-300 font-bold">
                <i class="fa-solid fa-right-from-bracket"></i>
            </button>
        `;

        // Real-time Balance listener
        const userRef = doc(db, "users", currentUser.uid);
        unsubscribeUserDoc = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                currentUserBalance = data.balance || 0.00;
                const headerBal = document.getElementById('headerBalance');
                const profBal = document.getElementById('userWalletBalance');
                const chkBal = document.getElementById('checkoutWalletBalance');
                
                if (headerBal) headerBal.innerText = currentUserBalance.toFixed(2);
                if (profBal) profBal.innerText = currentUserBalance.toFixed(2);
                if (chkBal) chkBal.innerText = currentUserBalance.toFixed(2);
            }
        });

        // Real-time Order Approval Notification
        const q = query(collection(db, "orders"), where("userEmail", "==", currentUser.email));
        unsubscribeOrders = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "modified") {
                    const orderData = change.doc.data();
                    if (orderData.status === "Completed") {
                        showToast(`🎉 Order "${orderData.plan}" ត្រូវបាន Approve រួចរាល់!`);
                    }
                }
            });
        });

    } else {
        profileArea.innerHTML = `
            <button onclick="openAuthModal('login')" class="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5">
                <i class="fa-solid fa-right-to-bracket"></i> ចូលប្រើប្រព័ន្ធ
            </button>
        `;
    }
});

// Dark/Light Mode Toggle
window.toggleDarkMode = function() {
    const isDark = document.documentElement.classList.toggle('dark');
    const icon = document.getElementById('themeIcon');
    icon.className = isDark ? "fa-solid fa-sun" : "fa-solid fa-moon";
};

// Search & Filter Bar Functions
window.filterProducts = function() {
    const queryStr = document.getElementById('searchInput').value.toLowerCase().trim();
    const items = document.querySelectorAll('.product-item');

    items.forEach(item => {
        const title = item.getAttribute('data-title') || '';
        if (title.includes(queryStr)) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
};

window.setCategory = function(cat) {
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.className = "cat-btn bg-white/10 text-slate-300 hover:bg-white/20 px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap";
    });
    document.getElementById(`cat-${cat}`).className = "cat-btn bg-blue-600 text-white px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap shadow-sm";

    const items = document.querySelectorAll('.product-item');
    items.forEach(item => {
        if (cat === 'all' || item.getAttribute('data-category') === cat) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
};

// Product Detail Modal
window.openProductDetail = function(title, price, device, warranty, login) {
    document.getElementById('detailTitle').innerText = title;
    document.getElementById('detailDevice').innerText = device;
    document.getElementById('detailWarranty').innerText = warranty;
    document.getElementById('detailLogin').innerText = login;
    document.getElementById('productDetailModal').classList.remove('hidden');
};

window.closeProductDetail = function() {
    document.getElementById('productDetailModal').classList.add('hidden');
};

// Payment Method Toggle (KHQR vs Wallet Balance)
window.togglePayMethodUI = function(method) {
    selectedPaymentMethod = method;
    const khqrContainer = document.getElementById('khqrContainer');
    const transIdSection = document.getElementById('transIdSection');
    const transIdInput = document.getElementById('transId');

    if (method === 'wallet') {
        khqrContainer.classList.add('hidden');
        transIdSection.classList.add('hidden');
        transIdInput.removeAttribute('required');
    } else {
        khqrContainer.classList.remove('hidden');
        transIdSection.classList.remove('hidden');
        transIdInput.setAttribute('required', 'true');
    }
};

window.openAuthModal = function(mode = 'login') {
    window.toggleAuthMode(mode);
    document.getElementById('authModal').classList.remove('hidden');
};

window.closeAuthModal = function() {
    document.getElementById('authModal').classList.add('hidden');
};

window.toggleAuthMode = function(mode) {
    if (mode === 'register') {
        document.getElementById('loginFormSection').classList.add('hidden');
        document.getElementById('registerFormSection').classList.remove('hidden');
    } else {
        document.getElementById('registerFormSection').classList.add('hidden');
        document.getElementById('loginFormSection').classList.remove('hidden');
    }
};

window.handleUserRegister = async function(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        
        await setDoc(doc(db, "users", userCredential.user.uid), {
            uid: userCredential.user.uid,
            name: name,
            email: email,
            balance: 0.00,
            createdAt: new Date().toISOString()
        });

        window.closeAuthModal();
        showToast("🎉 បង្កើតគណនីបានជោគជ័យ!");
    } catch (error) {
        showToast("មានបញ្ហា៖ " + error.message, false);
    }
};

window.handleUserLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        window.closeAuthModal();
        showToast("👋 ស្វាគមន៍ការត្រឡប់មកវិញ!");
    } catch (error) {
        showToast("អ៊ីមែល ឬ ពាក្យសម្ងាត់មិនត្រឹមត្រូវ!", false);
    }
};

window.handleGoogleAuth = async function() {
    const provider = new GoogleAuthProvider();
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                balance: 0.00,
                createdAt: new Date().toISOString()
            });
        }

        window.closeAuthModal();
        showToast("🎉 ចូលប្រើជាមួយ Google បានជោគជ័យ!");
    } catch (error) {
        showToast("មានបញ្ហា៖ " + error.message, false);
    }
};

window.handleLogout = async function() {
    await signOut(auth);
    showToast("បាន Logout រួចរាល់");
};

window.openProfileModal = function() {
    if (!currentUser) return;
    
    document.getElementById('profileNameInput').value = currentUser.displayName || "";
    document.getElementById('profileEmailInput').value = currentUser.email || "";
    
    document.getElementById('profileModal').classList.remove('hidden');
    loadUserSubscriptions();
};

window.closeProfileModal = function() {
    document.getElementById('profileModal').classList.add('hidden');
};

window.handleUpdateProfile = async function(e) {
    e.preventDefault();
    const newName = document.getElementById('profileNameInput').value.trim();

    try {
        await updateProfile(currentUser, { displayName: newName });
        
        const userRef = doc(db, "users", currentUser.uid);
        await updateDoc(userRef, { name: newName });

        showToast("🎉 បានកែប្រែឈ្មោះជោគជ័យ!");
        window.closeProfileModal();
    } catch (err) {
        showToast("មានបញ្ហា៖ " + err.message, false);
    }
};

async function loadUserSubscriptions() {
    const container = document.getElementById('userSubscriptionList');
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">កំពុងទាញយក...</p>`;

    try {
        const q = query(
            collection(db, "orders"), 
            where("userEmail", "==", currentUser.email)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = `<p class="text-xs text-slate-400 text-center py-3">អ្នកមិនទាន់មានកញ្ចប់សេវាកម្មទេ</p>`;
            return;
        }

        let html = '';
        querySnapshot.forEach((docSnap) => {
            const o = docSnap.data();
            if (o.status === 'Completed') {
                const orderDate = new Date(o.date);
                const daysToAdd = o.plan.includes('1 ឆ្នាំ') ? 365 : 30;
                
                const expiryDate = new Date(orderDate);
                expiryDate.setDate(expiryDate.getDate() + daysToAdd);
                
                const today = new Date();
                const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
                const isExpired = diffDays < 0;

                html += `
                    <div class="p-3 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-2xl space-y-1.5">
                        <div class="flex justify-between items-center text-xs font-bold">
                            <span>${o.plan}</span>
                            <span class="${isExpired ? 'text-rose-500' : 'text-emerald-500'} text-[11px]">
                                ${isExpired ? 'ផុតកំណត់ហើយ' : `សល់ ${diffDays} ថ្ងៃទៀត`}
                            </span>
                        </div>
                    </div>
                `;
            }
        });
        container.innerHTML = html || `<p class="text-xs text-slate-400 text-center py-3">មិនទាន់មានកញ្ចប់ Active</p>`;
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-500 text-center py-2">បរាជ័យក្នុងការទាញយកទិន្នន័យ</p>`;
    }
}

window.openCheckout = function(plan, price) {
    if (!currentUser) {
        showToast("សូមបង្កើតគណនី ឬ Login មុននឹងទិញ!", false);
        window.openAuthModal('login');
        return;
    }

    currentPlanName = plan;
    rawPrice = price;
    finalPrice = price;
    
    document.getElementById('selectedPlanPrice').innerText = price.toFixed(2);
    document.getElementById('discountMsg').classList.add('hidden');
    document.getElementById('couponInput').value = "";
    document.getElementById('contactInfo').value = currentUser.email;

    togglePayMethodUI('khqr');
    generateOfficialKHQR(finalPrice);
    startTimer(180);

    const sheet = document.getElementById('checkoutSheet');
    const content = document.getElementById('sheetContent');
    
    sheet.classList.remove('hidden');
    setTimeout(() => {
        sheet.classList.remove('opacity-0');
        content.classList.remove('translate-y-full');
    }, 10);
};

window.closeCheckout = function() {
    clearInterval(timerInterval);
    const sheet = document.getElementById('checkoutSheet');
    const content = document.getElementById('sheetContent');
    
    content.classList.add('translate-y-full');
    sheet.classList.add('opacity-0');
    setTimeout(() => { sheet.classList.add('hidden'); }, 300);
};

window.applyDiscount = function() {
    const coupon = document.getElementById('couponInput').value.trim().toUpperCase();
    const msg = document.getElementById('discountMsg');
    
    if (coupon === "LEANGHAK" || coupon === "AIPRO") {
        finalPrice = Math.max(0, rawPrice - 0.50);
        document.getElementById('selectedPlanPrice').innerText = finalPrice.toFixed(2);
        generateOfficialKHQR(finalPrice);

        msg.innerText = "✓ ទទួលបានការបញ្ចុះតម្លៃ $0.50 ជោគជ័យ!";
        msg.className = "text-[11px] mt-1 text-emerald-500 font-bold block";
    } else {
        msg.innerText = "✕ កូដមិនត្រឹមត្រូវ!";
        msg.className = "text-[11px] mt-1 text-rose-500 font-bold block";
    }
};

// Handle Order Logic (Auto-Delivery + Pay with Balance)
window.handleOrderSubmit = async function(e) {
    e.preventDefault();

    const contact = document.getElementById('contactInfo').value.trim();
    const transId = document.getElementById('transId').value.trim();
    const btn = document.getElementById('btnSubmit');

    // ពិនិត្យ Balance បើសិនជ្រើសរើស "Pay with Balance"
    if (selectedPaymentMethod === 'wallet') {
        if (currentUserBalance < finalPrice) {
            showToast("❌ លុយក្នុង Wallet មិនគ្រប់គ្រាន់ទេ! សូម Top Up បន្ថែម", false);
            return;
        }
    }

    btn.disabled = true;
    btn.innerHTML = `កំពុងដំណើរការ...`;

    try {
        let deliveredStockData = null;
        let isAutoCompleted = false;

        // ឆែកមើល Stock សិន (Auto-Delivery System)
        const stockQuery = query(collection(db, "stocks"), where("planName", "==", currentPlanName));
        const stockSnapshot = await getDocs(stockQuery);

        if (!stockSnapshot.empty) {
            const stockDoc = stockSnapshot.docs[0];
            deliveredStockData = stockDoc.data().accountDetails;
            await deleteDoc(doc(db, "stocks", stockDoc.id));
            isAutoCompleted = true;
        }

        // កាត់ Balance ភ្លាមៗបើជ្រើសរើស Pay with Balance
        if (selectedPaymentMethod === 'wallet') {
            const userRef = doc(db, "users", currentUser.uid);
            await updateDoc(userRef, {
                balance: currentUserBalance - finalPrice
            });
            isAutoCompleted = true;
        }

        const newOrderData = {
            orderId: "ORD-" + Date.now(),
            userEmail: currentUser.email,
            userName: currentUser.displayName || currentUser.email,
            plan: currentPlanName,
            price: finalPrice,
            contact: contact,
            transId: selectedPaymentMethod === 'wallet' ? 'WALLET-PAYMENT' : transId,
            payMethod: selectedPaymentMethod,
            status: isAutoCompleted ? 'Completed' : 'Pending',
            deliveredData: deliveredStockData || null,
            date: new Date().toISOString()
        };

        await addDoc(collection(db, "orders"), newOrderData);

        // ផ្ញើ Telegram Alert
        const message = `🛒 ការបញ្ជាទិញថ្មីពី LEANGHAK STORE\n\n` +
                        `👤 អតិថិជន: ${newOrderData.userName}\n` +
                        `📦 ទំនិញ: ${currentPlanName}\n` +
                        `💵 តម្លៃ: $${finalPrice.toFixed(2)}\n` +
                        `💳 វិធីទូទាត់: ${selectedPaymentMethod.toUpperCase()}\n` +
                        `📞 ទំនាក់ទំនង: ${contact}\n` +
                        `🤖 Auto-Delivered: ${deliveredStockData ? 'YES' : 'NO'}\n` +
                        `🧾 Trans ID: ${newOrderData.transId}`;

        fetch(`https://api.telegram.org/bot${CONFIG.BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CONFIG.ADMIN_CHAT_ID, text: message })
        }).catch(err => console.log("Telegram API notice:", err));

        if (deliveredStockData) {
            showToast("🎉 ទិញបានជោគជ័យ! អាខោនត្រូវបានផ្ញើជូនក្នុងប្រវត្តិបញ្ជាទិញ");
        } else {
            showToast("🎉 បញ្ជូនការបញ្ជាទិញជោគជ័យ!");
        }

        window.closeCheckout();

    } catch (err) {
        showToast("មានបញ្ហា៖ " + err.message, false);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `បញ្ជូនការបញ្ជាទិញ`;
    }
};

window.openHistoryModal = async function() {
    if (!currentUser) {
        showToast("សូម Login ដើម្បីមើលប្រវត្តិ!", false);
        window.openAuthModal('login');
        return;
    }

    const modal = document.getElementById('historyModal');
    const container = document.getElementById('customerOrderList');
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">កំពុងទាញយក...</p>`;
    modal.classList.remove('hidden');

    try {
        const q = query(collection(db, "orders"), where("userEmail", "==", currentUser.email));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            container.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">គ្មានប្រវត្តិបញ្ជាទិញទេ</p>`;
            return;
        }

        let html = '';
        querySnapshot.forEach((docSnap) => {
            const o = docSnap.data();
            html += `
                <div class="p-3 bg-slate-50 dark:bg-slate-800 border dark:border-slate-700 rounded-2xl space-y-1.5">
                    <div class="flex justify-between items-center text-xs font-bold">
                        <span>${o.plan}</span>
                        <span class="text-blue-500">$${o.price.toFixed(2)}</span>
                    </div>
                    <div class="flex justify-between items-center text-[10px] text-slate-500">
                        <span>${new Date(o.date).toLocaleDateString('km-KH')}</span>
                        <span class="px-2 py-0.5 rounded-full font-bold ${
                            o.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }">${o.status}</span>
                    </div>
                    ${o.deliveredData ? `
                        <div class="mt-2 p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-[11px] font-mono text-emerald-600 dark:text-emerald-400 select-text">
                            <strong>🔑 Account Stock:</strong><br>${o.deliveredData.replace(/\n/g, '<br>')}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-500 text-center py-4">បរាជ័យក្នុងការទាញយក</p>`;
    }
};

window.closeHistoryModal = function() {
    document.getElementById('historyModal').classList.add('hidden');
};

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('supportBtn').href = `https://t.me/${CONFIG.ADMIN_USERNAME.replace('https://t.me/', '')}`;
    document.getElementById('khqrAccName').innerText = CONFIG.MERCHANT_NAME;
});

window.openAdminModal = function() {
    document.getElementById('adminModal').classList.remove('hidden');
};

window.closeAdminModal = function() {
    document.getElementById('adminModal').classList.add('hidden');
};

window.handleAdminLogin = function(e) {
    e.preventDefault();
    const pass = document.getElementById('adminPasswordInput').value;
    
    if (pass === ADMIN_PASSWORD) {
        document.getElementById('adminLoginSection').classList.add('hidden');
        document.getElementById('adminDashboard').classList.remove('hidden');
        renderAdminOrders();
        renderAdminUsers();
        renderAdminStock();
    } else {
        alert('❌ ពាក្យសម្ងាត់ Admin មិនត្រឹមត្រូវទេ!');
    }
};

window.switchAdminTab = function(tab) {
    const sections = ['orders', 'users', 'stock'];
    sections.forEach(s => {
        document.getElementById(`admin${s.charAt(0).toUpperCase() + s.slice(1)}Section`).classList.add('hidden');
        document.getElementById(`tab${s.charAt(0).toUpperCase() + s.slice(1)}Btn`).className = "px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl font-bold";
    });

    document.getElementById(`admin${tab.charAt(0).toUpperCase() + tab.slice(1)}Section`).classList.remove('hidden');
    document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}Btn`).className = "px-3 py-1.5 bg-blue-600 text-white rounded-xl font-bold";
};

async function renderAdminOrders() {
    const container = document.getElementById('adminOrderList');
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">កំពុងទាញយក...</p>`;

    try {
        const querySnapshot = await getDocs(collection(db, "orders"));
        if (querySnapshot.empty) {
            container.innerHTML = `<p class="text-xs font-bold text-slate-400 text-center py-6">មិនទាន់មាន Order ទេ</p>`;
            return;
        }

        let html = '';
        querySnapshot.forEach((docSnap) => {
            const o = docSnap.data();
            const docId = docSnap.id;
            html += `
                <div class="border dark:border-slate-700 rounded-2xl p-3 bg-slate-50 dark:bg-slate-800 space-y-2 text-xs">
                    <div class="flex justify-between items-center border-b dark:border-slate-700 pb-1.5">
                        <span class="font-extrabold">${o.plan}</span>
                        <span class="font-black text-emerald-500">$${o.price.toFixed(2)}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 space-y-0.5">
                        <div>👤 ឈ្មោះ៖ <b>${o.userName || 'N/A'}</b></div>
                        <div>📞 ទំនាក់ទំនង៖ <b>${o.contact}</b></div>
                        <div>💳 វិធីសាស្ត្រ៖ <b class="uppercase">${o.payMethod || 'KHQR'}</b></div>
                        <div>🧾 Trans ID: <b class="font-mono text-blue-400">${o.transId}</b></div>
                    </div>
                    <div class="flex justify-between items-center pt-1.5 border-t dark:border-slate-700">
                        <select onchange="updateOrderStatus('${docId}', this.value)" class="text-xs font-bold border rounded-lg px-2 py-1 bg-white dark:bg-slate-900">
                            <option value="Pending" ${o.status === 'Pending' ? 'selected' : ''}>⏳ Pending</option>
                            <option value="Completed" ${o.status === 'Completed' ? 'selected' : ''}>✅ Completed</option>
                            <option value="Cancelled" ${o.status === 'Cancelled' ? 'selected' : ''}>❌ Cancelled</option>
                        </select>
                        <button onclick="deleteSingleOrder('${docId}')" class="text-[11px] text-rose-500 font-bold">
                            <i class="fa-solid fa-trash"></i> លុប
                        </button>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-500 text-center py-4">បរាជ័យក្នុងការទាញយក Orders</p>`;
    }
}

async function renderAdminUsers() {
    const container = document.getElementById('adminUserList');
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">កំពុងទាញយក...</p>`;

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        if (querySnapshot.empty) {
            container.innerHTML = `<p class="text-xs font-bold text-slate-400 text-center py-6">មិនទាន់មានអតិថិជនទេ</p>`;
            return;
        }

        let html = '';
        querySnapshot.forEach((docSnap) => {
            const u = docSnap.data();
            const docId = docSnap.id;
            html += `
                <div class="border dark:border-slate-700 rounded-xl p-2.5 bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-xs">
                    <div>
                        <p class="font-bold">${u.name}</p>
                        <p class="text-[11px] text-slate-400">${u.email}</p>
                        <p class="text-[11px] text-emerald-500 font-bold">Balance: $${(u.balance || 0).toFixed(2)}</p>
                    </div>
                    <button onclick="topUpUserWallet('${docId}', ${u.balance || 0})" class="px-2.5 py-1 bg-blue-600 text-white font-bold rounded-lg text-[10px]">
                        + Top Up
                    </button>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-500 text-center py-4">បរាជ័យក្នុងការទាញយក Users</p>`;
    }
}

window.topUpUserWallet = async function(userId, currentBal) {
    const amountStr = prompt("បញ្ចូលចំនួនទឹកប្រាក់ Top Up (USD) ឧទាហរណ៍ 10:");
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
        alert("ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ!");
        return;
    }

    try {
        const userRef = doc(db, "users", userId);
        await updateDoc(userRef, { balance: currentBal + amount });
        showToast("🎉 បញ្ចូល Balance ជោគជ័យ!");
        renderAdminUsers();
    } catch (err) {
        showToast("បរាជ័យ៖ " + err.message, false);
    }
};

window.handleAddStock = async function(e) {
    e.preventDefault();
    const planName = document.getElementById('stockPlanName').value.trim();
    const details = document.getElementById('stockData').value.trim();

    try {
        await addDoc(collection(db, "stocks"), {
            planName: planName,
            accountDetails: details,
            createdAt: new Date().toISOString()
        });

        document.getElementById('stockData').value = "";
        showToast("🎉 បន្ថែម Stock ជោគជ័យ!");
        renderAdminStock();
    } catch (err) {
        showToast("បរាជ័យ៖ " + err.message, false);
    }
};

async function renderAdminStock() {
    const container = document.getElementById('adminStockList');
    container.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">កំពុងទាញយក Stock...</p>`;

    try {
        const querySnapshot = await getDocs(collection(db, "stocks"));
        if (querySnapshot.empty) {
            container.innerHTML = `<p class="text-xs text-slate-400 text-center py-2">គ្មាន Stock កំពុងទំនេរទេ</p>`;
            return;
        }

        let html = '';
        querySnapshot.forEach((docSnap) => {
            const s = docSnap.data();
            const docId = docSnap.id;
            html += `
                <div class="border dark:border-slate-700 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 flex justify-between items-center text-xs">
                    <div>
                        <p class="font-bold text-blue-400">${s.planName}</p>
                        <p class="text-[10px] font-mono text-slate-400 truncate max-w-[200px]">${s.accountDetails}</p>
                    </div>
                    <button onclick="deleteStockItem('${docId}')" class="text-rose-500 font-bold text-[11px]"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-500 text-center py-2">បរាជ័យក្នុងការទាញយក Stock</p>`;
    }
}

window.deleteStockItem = async function(docId) {
    if (confirm('លុប Stock នេះ?')) {
        await deleteDoc(doc(db, "stocks", docId));
        renderAdminStock();
        showToast("បានលុប Stock រួចរាល់");
    }
};

window.updateOrderStatus = async function(docId, newStatus) {
    try {
        const orderRef = doc(db, "orders", docId);
        await updateDoc(orderRef, { status: newStatus });
        showToast("បានអាប់ដេតស្ថានភាព Order ជោគជ័យ");
    } catch (err) {
        showToast("មានបញ្ហាក្នុងការអាប់ដេត", false);
    }
};

window.deleteSingleOrder = async function(docId) {
    if (confirm('តើអ្នកប្រាកដថាលុប Order នេះ?')) {
        try {
            await deleteDoc(doc(db, "orders", docId));
            renderAdminOrders();
            showToast("លុប Order បានជោគជ័យ");
        } catch (err) {
            showToast("បរាជ័យក្នុងការលុប", false);
        }
    }
};
