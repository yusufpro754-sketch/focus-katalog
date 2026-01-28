const API_URL = 'https://script.google.com/macros/s/AKfycbzVyMRnnAtxPGEzezy2Vjj07UmrHS7M-0id6KNi7QhGLbgxnfycMjBstyYFaPtn8SMr/exec'; 

let productData = [];
let customerData = []; // Müşteriler için yeni dizi
let logData = []; 
let originalState = {}; 
let isAdmin = false;
let currentUser = "Misafir"; 
let openCategories = new Set(); 
let activeTab = 'stock'; // Aktif sekme (stock veya customers)
let currentCustId = null; // Düzenlenen müşteri ID'si
let draggedItemId = null;
let draggedItemIndex = -1;

window.onload = function() { fetchData(); };

// --- GİRİŞ / ÇIKIŞ ---
function loginToggle() {
    if (isAdmin) {
        isAdmin = false;
        currentUser = "Misafir";
        document.getElementById('adminControls').style.display = 'none';
        document.getElementById('dragHint').style.display = 'none';
        document.getElementById('loginText').innerText = "Giriş Yap";
        // Yetki gitti, görünümü güncelle
        refreshCurrentView();
    } else {
        let pass = prompt("Sistem Şifresi:");
        if (pass === "nur27") {
            isAdmin = true;
            currentUser = "Yönetici"; 
            document.getElementById('loginText').innerText = "Çıkış Yap";
            addLog("Yönetici girişi yapıldı.");
            // Yetki geldi, görünümü güncelle
            refreshCurrentView();
        } else if (pass !== null) {
            alert("Hatalı Şifre!");
        }
    }
}

// --- SEKME YÖNETİMİ ---
function switchTab(tabName) {
    activeTab = tabName;
    
    // Buton stilleri
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // İçerik gizle/göster
    document.getElementById('stockView').style.display = tabName === 'stock' ? 'block' : 'none';
    document.getElementById('customerView').style.display = tabName === 'customers' ? 'block' : 'none';

    refreshCurrentView();
}

function refreshCurrentView() {
    if(activeTab === 'stock') {
        document.getElementById('stockControls').style.display = isAdmin ? 'flex' : 'none';
        document.getElementById('customerControls').style.display = 'none';
        document.getElementById('dragHint').style.display = isAdmin ? 'block' : 'none';
        renderTable();
    } else {
        document.getElementById('stockControls').style.display = 'none';
        document.getElementById('customerControls').style.display = isAdmin ? 'flex' : 'none';
        document.getElementById('dragHint').style.display = 'none';
        renderCustomers();
    }
}

// --- VERİ ÇEKME ---
async function fetchData() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        
        // Veri yapısı kontrolü
        if (data && data.products) {
            productData = data.products;
            customerData = data.customers || []; // Müşterileri çek
            logData = data.logs || [];
        } else if (Array.isArray(data)) {
            // Eski format desteği
            productData = data;
            customerData = [];
            logData = [];
        }

        productData.forEach(p => { if(!p.id) p.id = Date.now() + Math.random(); });
        customerData.forEach(c => { if(!c.id) c.id = Date.now() + Math.random(); });

        storeOriginalState();
        const cats = [...new Set(productData.map(p => p.category))];
        cats.forEach(c => openCategories.add(c));
        
        refreshCurrentView(); // İlk açılışta sayfayı render et
    } catch (err) { console.error(err); }
    document.getElementById('loading').style.display = 'none';
}

function storeOriginalState() {
    originalState = {};
    productData.forEach(p => { originalState[p.id] = { ...p }; });
}

// --- LOG ---
function addLog(action) {
    const date = new Date().toLocaleString('tr-TR');
    const logEntry = { id: Date.now(), date: date, user: currentUser, action: action };
    logData.unshift(logEntry);
    if(logData.length > 5000) logData.pop(); 
}

function editLogDesc(index) {
    const currentDesc = logData[index].action;
    const note = prompt("Bu işleme eklenecek notu yazın:");
    if(note && note.trim() !== "") {
        const timestamp = new Date().toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});
        logData[index].action = currentDesc + `|||${note} (${timestamp})`;
        saveToCloud();
        openLogModal();
    }
}

function openLogModal() {
    const tbody = document.getElementById('logTableBody');
    tbody.innerHTML = "";
    if(logData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">Henüz kayıt yok.</td></tr>`;
    } else {
        logData.forEach((log, index) => {
            let actionClass = "badge-info";
            if(log.action.includes("Eklendi") || log.action.includes("artırıldı")) actionClass = "badge-inc";
            if(log.action.includes("Silindi") || log.action.includes("azaltıldı")) actionClass = "badge-dec";
            let parts = log.action.split('|||');
            let mainText = parts[0];
            let noteText = "";
            if(parts.length > 1) {
                for(let i=1; i<parts.length; i++) {
                    noteText += `<span class="log-note"><i class="fa-solid fa-comment-dots"></i> ${parts[i]}</span>`;
                }
            }
            const editBtn = isAdmin ? `<i class="fa-solid fa-pen-to-square" style="cursor:pointer; color:#94a3b8;" onclick="editLogDesc(${index})"></i>` : '';
            const row = `<tr><td style="padding:10px;">${log.date}</td><td style="padding:10px;"><span class="badge badge-admin">${log.user}</span></td><td style="padding:10px;"><span class="${actionClass}" style="padding:2px 5px; border-radius:3px;">${mainText}</span>${noteText}</td><td style="text-align:center;">${editBtn}</td></tr>`;
            tbody.innerHTML += row;
        });
    }
    document.getElementById('logModal').style.display = 'flex';
}
function closeLogModal() { document.getElementById('logModal').style.display = 'none'; }

// --- KAYDETME ---
function openSaveModal() {
    document.getElementById('saveNote').value = "";
    document.getElementById('saveModal').style.display = 'flex';
}
function closeSaveModal() { document.getElementById('saveModal').style.display = 'none'; }

function confirmSave() {
    const note = document.getElementById('saveNote').value.trim();
    closeSaveModal();
    let changesLog = [];
    productData.forEach(p => {
        const old = originalState[p.id];
        if (!old) return;
        if (p.qty !== old.qty) {
            const diff = p.qty - old.qty;
            const direction = diff > 0 ? "artırıldı" : "azaltıldı";
            changesLog.push(`${p.name} stoğu ${Math.abs(diff)} adet ${direction} (Yeni: ${p.qty})`);
        }
        if (p.price !== old.price) {
            changesLog.push(`${p.name} fiyatı ${old.price} -> ${p.price} ₺ olarak güncellendi`);
        }
        if (p.name !== old.name) {
            changesLog.push(`${old.name} ismi "${p.name}" olarak değiştirildi`);
        }
        if (p.category !== old.category) {
            changesLog.push(`${p.name}, "${old.category}" kategorisinden "${p.category}" kategorisine taşındı`);
        }
    });

    if (changesLog.length > 0) {
        let finalLogStr = changesLog.length > 10 ? `${changesLog.length} üründe güncelleme yapıldı.` : changesLog.join(', ');
        if (note) finalLogStr += ` |||${note}`;
        addLog(finalLogStr);
    } else if (note) { addLog(`Genel Not Eklendi|||${note}`); }
    
    // Müşterilerdeki değişiklikler anlık kaydedildiği için loga eklemeye gerek yok,
    // ancak buluta hepsini gönderiyoruz.
    saveToCloud();
}

async function saveToCloud() {
    const btn = document.getElementById('globalSaveBtn');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
        // Müşterileri de pakete ekle
        const payload = { 
            products: productData, 
            customers: customerData,
            logs: logData 
        };
        await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        alert("Başarıyla Kaydedildi!");
        storeOriginalState();
        btn.style.display = 'none';
    } catch(e) { alert("Hata oluştu."); }
    btn.innerHTML = original;
}

// --- MÜŞTERİ YÖNETİMİ (CRM) ---
function renderCustomers() {
    const container = document.getElementById('customerList');
    container.innerHTML = "";
    
    const term = document.getElementById('searchInput').value.toLowerCase();
    
    // Filtreleme
    const filtered = customerData.filter(c => 
        (c.name && c.name.toLowerCase().includes(term)) || 
        (c.device && c.device.toLowerCase().includes(term))
    );

    if (filtered.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:#94a3b8; margin-top:20px;">Müşteri bulunamadı.</p>`;
        return;
    }

    filtered.forEach(c => {
        // Durum Rengi Belirle
        let statusClass = "status-gorusuluyor";
        if(c.status === "Teklif Verildi") statusClass = "status-teklif";
        if(c.status === "Kapora Alındı") statusClass = "status-kapora";
        if(c.status === "Teslim Edildi") statusClass = "status-teslim";
        if(c.status === "İptal") statusClass = "status-iptal";

        const card = document.createElement('div');
        card.className = "customer-card";
        card.onclick = () => openCustomerModal(c.id);
        
        card.innerHTML = `
            <div class="cust-header">
                <div>
                    <div class="cust-name">${c.name}</div>
                    <span class="cust-device">${c.device || 'Cihaz Belirtilmedi'}</span>
                </div>
                <span class="cust-status ${statusClass}">${c.status}</span>
            </div>
            <div style="font-size:0.85rem; color:#64748b;">
                <i class="fa-solid fa-phone"></i> ${c.phone || '-'}
            </div>
            
            <div class="cust-actions" onclick="event.stopPropagation()">
                <a href="tel:${c.phone}" class="action-btn"><i class="fa-solid fa-phone"></i> Ara</a>
                <a href="https://wa.me/90${c.phone ? c.phone.replace(/^0/,'').replace(/\s/g,'') : ''}" target="_blank" class="action-btn whatsapp"><i class="fa-brands fa-whatsapp"></i> Yaz</a>
            </div>
        `;
        container.appendChild(card);
    });
}

function openCustomerModal(id = null) {
    currentCustId = id;
    const modal = document.getElementById('customerModal');
    
    if (id) {
        // DÜZENLEME MODU
        const c = customerData.find(x => x.id === id);
        document.getElementById('custModalTitle').innerText = "Müşteri Düzenle";
        document.getElementById('custName').value = c.name;
        document.getElementById('custPhone').value = c.phone;
        document.getElementById('custDevice').value = c.device;
        document.getElementById('custPaymentType').value = c.paymentType;
        document.getElementById('custStatus').value = c.status;
        document.getElementById('custTotal').value = c.totalAmount || "";
        document.getElementById('custPaid').value = c.paidAmount || "";
        document.getElementById('custNotes').value = c.notes || "";
        document.getElementById('btnDeleteCust').style.display = 'block';
        updateRestAmount();
    } else {
        // YENİ EKLEME MODU
        document.getElementById('custModalTitle').innerText = "Yeni Müşteri Ekle";
        // Formu temizle
        document.getElementById('custName').value = "";
        document.getElementById('custPhone').value = "";
        document.getElementById('custDevice').value = "";
        document.getElementById('custPaymentType').value = "Peşin";
        document.getElementById('custStatus').value = "Görüşülüyor";
        document.getElementById('custTotal').value = "";
        document.getElementById('custPaid').value = "";
        document.getElementById('custRest').value = "";
        document.getElementById('custNotes').value = "";
        document.getElementById('btnDeleteCust').style.display = 'none';
    }
    
    // Tutar değiştikçe kalanı hesapla
    document.getElementById('custTotal').oninput = updateRestAmount;
    document.getElementById('custPaid').oninput = updateRestAmount;

    modal.style.display = 'flex';
}

function updateRestAmount() {
    const total = parseFloat(document.getElementById('custTotal').value) || 0;
    const paid = parseFloat(document.getElementById('custPaid').value) || 0;
    document.getElementById('custRest').value = total - paid;
}

function closeCustomerModal() {
    document.getElementById('customerModal').style.display = 'none';
}

function saveCustomer() {
    const name = document.getElementById('custName').value;
    if (!name) { alert("İsim giriniz."); return; }

    const newCust = {
        id: currentCustId || Date.now() + Math.random(),
        name: name,
        phone: document.getElementById('custPhone').value,
        device: document.getElementById('custDevice').value,
        paymentType: document.getElementById('custPaymentType').value,
        status: document.getElementById('custStatus').value,
        totalAmount: parseFloat(document.getElementById('custTotal').value) || 0,
        paidAmount: parseFloat(document.getElementById('custPaid').value) || 0,
        notes: document.getElementById('custNotes').value,
        dateAdded: new Date().toLocaleDateString('tr-TR')
    };

    if (currentCustId) {
        // Güncelleme
        const index = customerData.findIndex(x => x.id === currentCustId);
        customerData[index] = newCust;
        addLog(`Müşteri Güncellendi: ${name} (${newCust.status})`);
    } else {
        // Yeni Ekleme
        customerData.push(newCust);
        addLog(`Yeni Müşteri Eklendi: ${name}`);
    }

    closeCustomerModal();
    renderCustomers();
    document.getElementById('globalSaveBtn').style.display = 'flex'; // Kaydet butonunu aktif et
}

function deleteCustomer() {
    if(confirm("Bu müşteri kaydını silmek istediğinize emin misiniz?")) {
        const c = customerData.find(x => x.id === currentCustId);
        customerData = customerData.filter(x => x.id !== currentCustId);
        addLog(`Müşteri Silindi: ${c.name}`);
        closeCustomerModal();
        renderCustomers();
        document.getElementById('globalSaveBtn').style.display = 'flex';
    }
}

// --- ARAMA YÖNLENDİRİCİ ---
function handleSearch() {
    if (activeTab === 'stock') {
        renderTable();
    } else {
        renderCustomers();
    }
}

// --- EXCEL OKUMA VE DİĞER STOK FONKSİYONLARI ---
// (Buradaki kodlar V44 ile aynı, sadece processExcel ve renderTable korunuyor)

function processExcel(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }); 
        let map = detectColumns(rows);
        parseRowsSmart(rows, map);
    };
    reader.readAsArrayBuffer(file);
    input.value = "";
}

function cleanPrice(str) {
    if(typeof str === 'number') return str;
    if(!str) return 0;
    let clean = str.toString().replace(/[^0-9.,]/g, '');
    if(clean.includes(',') && clean.includes('.')) { clean = clean.replace(/\./g, '').replace(',', '.'); }
    else if(clean.includes(',')) { clean = clean.replace(',', '.'); }
    else if(clean.includes('.') && clean.split('.')[1].length === 3) { clean = clean.replace(/\./g, ''); }
    return parseFloat(clean) || 0;
}

function detectColumns(rows) {
    let map = { name: 0, stock: 1, price: 2, category: -1, isStructured: false };
    for(let i=0; i<Math.min(rows.length, 10); i++) {
        const row = rows[i].map(x => String(x).toUpperCase().trim());
        if (row.includes("ÜRÜN") && (row.includes("FİYAT") || row.includes("ADET"))) {
            map.isStructured = true;
            map.name = row.indexOf("ÜRÜN");
            if (row.includes("ADET")) map.stock = row.indexOf("ADET");
            else if (row.includes("STOK")) map.stock = row.indexOf("STOK");
            if (row.includes("FİYAT")) map.price = row.indexOf("FİYAT");
            if (row.includes("KATEGORİ")) map.category = row.indexOf("KATEGORİ");
            break;
        }
    }
    return map;
}

function parseRowsSmart(rows, map) {
    let addedNames = [];
    let updatedNames = [];
    let currentCat = "GENEL LİSTE";
    const blacklist = ["ÜRÜN", "STOK", "FİYAT", "TOPLAM", "ADET", "HUMAY", "TABLOSU"];

    rows.forEach(row => {
        if(!row || row.length === 0) return;
        let pName = "", pStock = 0, pPrice = 0, pCat = "";

        if (map.isStructured) {
            let rawName = (row[map.name] || "").toString().trim();
            if (rawName === "" || blacklist.some(w => rawName.toUpperCase().includes(w))) return;
            pName = rawName;
            pStock = cleanPrice(row[map.stock]);
            pPrice = cleanPrice(row[map.price]);
            if (map.category > -1 && row[map.category]) {
                let catVal = row[map.category].toString().trim();
                if (catVal !== "") currentCat = catVal.toUpperCase();
            }
            pCat = currentCat;
        } else {
            let colA = (row[0] || "").toString().trim(); 
            let colB = (row[1] || "").toString().trim(); 
            let colC = (row[2] || "").toString().trim(); 
            if (colA === "" && colC !== "" && isNaN(cleanPrice(colC))) {
                if(!blacklist.some(w => colC.toUpperCase().includes(w))) {
                    currentCat = colC.toUpperCase();
                }
                return; 
            }
            if (colA !== "") {
                if (blacklist.some(w => colA.toUpperCase().includes(w))) return;
                pName = colA;
                pStock = cleanPrice(colB);
                pPrice = cleanPrice(colC);
                pCat = currentCat;
            } else { return; }
        }

        const existingIndex = productData.findIndex(p => p.name.trim().toLowerCase() === pName.toLowerCase());
        if (existingIndex > -1) {
            let oldItem = productData[existingIndex];
            if (oldItem.price !== pPrice || oldItem.qty !== pStock) {
                productData[existingIndex].price = pPrice;
                productData[existingIndex].qty = pStock;
                updatedNames.push(pName);
            }
        } else {
            productData.push({ id: Date.now() + Math.random(), category: pCat, name: pName, price: pPrice, qty: pStock });
            addedNames.push(pName);
        }
    });

    const allCats = [...new Set(productData.map(p => p.category))];
    allCats.forEach(c => openCategories.add(c));

    if(addedNames.length > 0 || updatedNames.length > 0) {
        addLog(`Excel İşlemi: ${addedNames.length} yeni ürün, ${updatedNames.length} güncelleme.`);
        alert(`İşlem Tamam!\n${addedNames.length} yeni, ${updatedNames.length} güncellendi.`);
        document.getElementById('globalSaveBtn').style.display = 'flex';
        renderTable();
    }
}

// --- KATEGORİ YÖNETİMİ ---
function editCategoryName(oldCatName) {
    if (!isAdmin) { alert("Yetkisiz işlem."); return; }
    const newName = prompt("Kategori ismini düzenle (Silmek için kutuyu boş bırakıp Tamam'a basın):", oldCatName);
    if (newName === null) return; 

    if (newName.trim() === "") {
        if (confirm(`"${oldCatName}" kategorisi silinsin mi? \nÜrünler "GENEL LİSTE"ye taşınacak.`)) {
            let count = 0;
            productData.forEach(p => { if (p.category === oldCatName) { p.category = "GENEL LİSTE"; count++; } });
            openCategories.delete(oldCatName);
            if(!openCategories.has("GENEL LİSTE")) openCategories.add("GENEL LİSTE");
            addLog(`Kategori Silindi: ${oldCatName} (${count} ürün taşındı)`);
            renderTable();
            document.getElementById('globalSaveBtn').style.display = 'flex';
        }
    } 
    else if (newName !== oldCatName) {
        const finalName = newName.trim().toUpperCase();
        let count = 0;
        productData.forEach(p => { if (p.category === oldCatName) { p.category = finalName; count++; } });
        if(openCategories.has(oldCatName)) { openCategories.delete(oldCatName); openCategories.add(finalName); }
        if (count > 0) { addLog(`Kategori Değişti: ${oldCatName} -> ${finalName}`); renderTable(); document.getElementById('globalSaveBtn').style.display = 'flex'; }
    }
}

function toggleCategory(cat) { 
    if (openCategories.has(cat)) openCategories.delete(cat); 
    else openCategories.add(cat); 
    renderTable(); 
}

// --- RENDER TABLE ---
function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";
    const term = document.getElementById('searchInput').value.toLowerCase();

    if (productData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">Liste Boş.</td></tr>`;
        calculateTotal(); return;
    }

    let displayData = productData;
    if (term) {
        displayData = productData.filter(p => p.name.toLowerCase().includes(term));
    }

    const readOnlyNamePrice = isAdmin ? '' : 'readonly';
    let globalIndex = 1;
    let lastCategory = null;

    displayData.forEach((item, index) => {
        if (item.category !== lastCategory) {
            lastCategory = item.category;
            const isOpen = openCategories.has(lastCategory) || term.length > 0;
            const iconRotate = isOpen ? 'rotate(-180deg)' : 'rotate(0deg)';

            const trCat = document.createElement('tr');
            trCat.className = 'cat-row';
            if (isAdmin) {
                trCat.addEventListener('dragover', handleDragOver);
                trCat.addEventListener('dragleave', handleDragLeave);
                trCat.addEventListener('drop', handleDrop);
            }
            
            trCat.innerHTML = `
                <td colspan="6">
                    <div class="cat-actions" onclick="toggleCategory('${lastCategory}')" style="flex-grow:1; display:flex; align-items:center; justify-content:space-between;">
                        <span>${lastCategory}</span>
                        <i class="fa-solid fa-chevron-down cat-icon" style="transform:${iconRotate}"></i>
                    </div>
                    ${isAdmin ? `<button class="cat-edit-btn" onclick="event.stopPropagation(); editCategoryName('${lastCategory}')"><i class="fa-solid fa-pen"></i></button>` : ''}
                </td>
            `;
            tbody.appendChild(trCat);
        }

        const isVisible = openCategories.has(item.category) || term.length > 0;
        
        if (isVisible) {
            const tr = document.createElement('tr');
            tr.className = `item-row`;
            tr.dataset.id = item.id;
            tr.dataset.idx = index;
            
            if(isAdmin && !term) { 
                tr.setAttribute('draggable', true);
                tr.addEventListener('dragstart', handleDragStart);
                tr.addEventListener('dragover', handleDragOver);
                tr.addEventListener('dragleave', handleDragLeave);
                tr.addEventListener('drop', handleDrop);
                tr.addEventListener('dragend', handleDragEnd);
            }

            const pVal = item.price === 0 ? '' : item.price;
            const qVal = item.qty === 0 ? '' : item.qty;
            const trashHTML = isAdmin ? `<td class="trash-cell" style="text-align:center;"><i class="fa-solid fa-trash" style="color:#ef4444; cursor:pointer;" onclick="deleteItem(${item.id}, '${item.name}')"></i></td>` : '<td></td>';

            tr.innerHTML = `
                <td class="index-cell">${globalIndex++}</td>
                <td data-label="Ürün">
                    <input type="text" class="input-clean" value="${item.name}" ${readOnlyNamePrice} oninput="updateData(${item.id}, 'name', this.value)">
                </td>
                <td data-label="Fiyat">
                    <div class="price-wrapper">
                        <input type="number" class="input-clean price-input" placeholder="0" value="${pVal}" ${readOnlyNamePrice} oninput="updateData(${item.id}, 'price', this.value)">
                        <span class="currency">₺</span>
                    </div>
                </td>
                <td data-label="Adet">
                    <div class="qty-wrapper">
                        <button class="qty-btn" onclick="updateQty(${item.id}, -1)">-</button>
                        <input type="number" class="qty-val" placeholder="0" value="${qVal}" oninput="updateQtyManual(${item.id}, this.value)" onfocus="this.select()">
                        <button class="qty-btn" onclick="updateQty(${item.id}, 1)">+</button>
                    </div>
                </td>
                <td data-label="Toplam" style="text-align:right; font-weight:bold; color:var(--primary);" id="total-${item.id}">${(item.price * item.qty).toLocaleString('tr-TR', {minimumFractionDigits:2})} ₺</td>
                ${trashHTML}
            `;
            tbody.appendChild(tr);
        }
    });
    calculateTotal();
}

function updateData(id, field, value) {
    if (!isAdmin && (field === 'name' || field === 'price')) return;
    const item = productData.find(p => p.id === id);
    if (!item) return;
    if (field === 'price') item[field] = parseFloat(value) || 0;
    else if (field === 'name') item[field] = value;
    if (field === 'price') {
        document.getElementById(`total-${id}`).innerText = (item.price * item.qty).toLocaleString('tr-TR', {minimumFractionDigits:2}) + ' ₺';
        calculateTotal();
    }
    document.getElementById('globalSaveBtn').style.display = 'flex';
}

function updateQty(id, delta) {
    const item = productData.find(p => p.id === id);
    if (!item) return;
    let newVal = (item.qty || 0) + delta;
    if (newVal < 0) newVal = 0;
    item.qty = newVal;
    renderTable(); 
    document.getElementById('globalSaveBtn').style.display = 'flex';
}

function updateQtyManual(id, value) {
    const item = productData.find(p => p.id === id);
    if (!item) return;
    let v = parseInt(value);
    if (isNaN(v) || v < 0) v = 0;
    item.qty = v;
    document.getElementById(`total-${id}`).innerText = (item.price * item.qty).toLocaleString('tr-TR', {minimumFractionDigits:2}) + ' ₺';
    calculateTotal();
    document.getElementById('globalSaveBtn').style.display = 'flex';
}

function calculateTotal() {
    const total = productData.reduce((sum, p) => sum + (p.price * p.qty), 0);
    document.getElementById('grandTotal').innerText = total.toLocaleString('tr-TR', {minimumFractionDigits:2}) + ' ₺';
}

function exportToExcel() {
    // ÜRÜNLER
    const list = productData.map(p=>({
        "KATEGORİ": p.category, 
        "ÜRÜN": p.name, 
        "FİYAT": p.price, 
        "ADET": p.qty, 
        "TOPLAM": p.price * p.qty
    }));
    
    // MÜŞTERİLER
    const custList = customerData.map(c=>({
        "AD SOYAD": c.name,
        "TELEFON": c.phone,
        "CİHAZ": c.device,
        "DURUM": c.status,
        "TOPLAM TUTAR": c.totalAmount,
        "ALINAN": c.paidAmount,
        "KALAN": c.totalAmount - c.paidAmount,
        "NOTLAR": c.notes
    }));

    const ws = XLSX.utils.json_to_sheet(list);
    const wsCust = XLSX.utils.json_to_sheet(custList);
    const wb = XLSX.utils.book_new(); 
    
    XLSX.utils.book_append_sheet(wb, ws, "Stok Listesi");
    XLSX.utils.book_append_sheet(wb, wsCust, "Müşteriler");
    
    const logList = logData.map(l=>({"TARİH":l.date, "KULLANICI":l.user, "AÇIKLAMA":l.action}));
    const wsLog = XLSX.utils.json_to_sheet(logList);
    XLSX.utils.book_append_sheet(wb, wsLog, "Hareket Gecmisi");
    
    XLSX.writeFile(wb, "Focus_Medikal_Full_Data.xlsx");
}

function resetAll() { 
    if(confirm("Tüm STOK listesi silinecek (Müşteriler kalacak)?")) { 
        productData=[]; 
        addLog("Ürün listesi sıfırlandı."); 
        renderTable(); document.getElementById('globalSaveBtn').style.display='flex'; 
    } 
}
function deleteItem(id, name) { 
    if(confirm(`${name} silinecek?`)) { 
        productData = productData.filter(p=>p.id!==id); 
        addLog(`${name} silindi.`); 
        renderTable(); document.getElementById('globalSaveBtn').style.display='flex'; 
    } 
}

function openModal() {
    const sel = document.getElementById('newCat');
    const cats = [...new Set(productData.map(p=>p.category))];
    sel.innerHTML = `<option>GENEL LİSTE</option>` + cats.map(c=>`<option>${c}</option>`).join('') + `<option value="NEW">+ YENİ</option>`;
    document.getElementById('addModal').style.display = 'flex';
}
function checkNewCat(s) { document.getElementById('newCatText').style.display = s.value==='NEW'?'block':'none'; }
function closeModal() { document.getElementById('addModal').style.display='none'; }

function addNewProduct() {
    const selectVal = document.getElementById('newCat').value;
    const inputVal = document.getElementById('newCatText').value;
    let cat = (selectVal === 'NEW' ? inputVal : selectVal).trim().toUpperCase();
    if(!cat) cat = "GENEL LİSTE";
    const name = document.getElementById('newName').value;
    const price = parseFloat(document.getElementById('newPrice').value) || 0;
    const qty = parseInt(document.getElementById('newQty').value) || 1;
    if(name) {
        productData.push({ id:Date.now(), category: cat, name:name, price:price, qty:qty });
        addLog(`${name} manuel olarak eklendi.`); 
        openCategories.add(cat);
        renderTable(); 
        closeModal();
        document.getElementById('newName').value = "";
        document.getElementById('newPrice').value = "";
        document.getElementById('newQty').value = "1";
        document.getElementById('globalSaveBtn').style.display='flex';
    } else { alert("Ürün adı giriniz."); }
}

// SÜRÜKLE BIRAK FONKSİYONLARI (V44)
function handleDragStart(e) {
    if (!isAdmin) return;
    draggedItemId = parseFloat(e.target.dataset.id);
    draggedItemIndex = parseInt(e.target.dataset.idx);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('tr').forEach(row => {
        row.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    if (!isAdmin) return;
    const targetRow = e.target.closest('tr');
    if (!targetRow || targetRow.classList.contains('dragging')) return;

    if (targetRow.classList.contains('item-row')) {
        const rect = targetRow.getBoundingClientRect();
        const offset = e.clientY - rect.top;
        targetRow.classList.remove('drag-over-top', 'drag-over-bottom');
        if (offset < rect.height / 2) {
            targetRow.classList.add('drag-over-top');
        } else {
            targetRow.classList.add('drag-over-bottom');
        }
    } else if (targetRow.classList.contains('cat-row')) {
        targetRow.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const targetRow = e.target.closest('tr');
    if (targetRow) {
        targetRow.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAdmin || !draggedItemId) return;

    const targetRow = e.target.closest('tr');
    if (!targetRow) return;

    const draggedItem = productData.find(p => p.id === draggedItemId);
    const draggedIndex = productData.indexOf(draggedItem);

    if (targetRow.classList.contains('cat-row')) {
        const newCategory = targetRow.querySelector('.cat-actions span').innerText;
        if (draggedItem.category !== newCategory) {
            draggedItem.category = newCategory;
            productData.splice(draggedIndex, 1);
            const firstInCatIndex = productData.findIndex(p => p.category === newCategory);
            if(firstInCatIndex > -1) {
                productData.splice(firstInCatIndex, 0, draggedItem);
            } else {
                productData.push(draggedItem);
            }
            if(!openCategories.has(newCategory)) openCategories.add(newCategory);
        }
    } 
    else if (targetRow.classList.contains('item-row')) {
        const targetId = parseFloat(targetRow.dataset.id);
        const targetItem = productData.find(p => p.id === targetId);
        
        if (draggedItem && targetItem && draggedItem !== targetItem) {
            if (draggedItem.category !== targetItem.category) {
                draggedItem.category = targetItem.category;
            }
            productData.splice(draggedIndex, 1);
            const newTargetIndex = productData.indexOf(targetItem);
            
            if (targetRow.classList.contains('drag-over-bottom')) {
                productData.splice(newTargetIndex + 1, 0, draggedItem);
            } else {
                productData.splice(newTargetIndex, 0, draggedItem);
            }
        }
    }

    handleDragEnd({ target: document.querySelector('.dragging') });
    document.getElementById('globalSaveBtn').style.display = 'flex';
    renderTable();
}
