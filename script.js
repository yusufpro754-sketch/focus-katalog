const API_URL = 'https://script.google.com/macros/s/AKfycbzVyMRnnAtxPGEzezy2Vjj07UmrHS7M-0id6KNi7QhGLbgxnfycMjBstyYFaPtn8SMr/exec'; 
const ENCRYPTED_PASS = "MzU4MDM0"; 

let productData = [];
let customerData = [];
let logData = []; 
let originalState = {}; 
let isAdmin = false;
let currentUser = "Yönetici"; 
let openCategories = new Set(); 
let activeTab = 'stock';
let currentCustId = null;
let draggedItemId = null;
let draggedItemIndex = -1;

window.onload = function() { fetchData(); };

// --- GİRİŞ SİSTEMİ ---
function verifyLogin() {
    const input = document.getElementById('loginPassword').value;
    const errorMsg = document.getElementById('loginError');
    if (btoa(input) === ENCRYPTED_PASS) {
        isAdmin = true;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        addLog("Sisteme giriş yapıldı.");
        refreshCurrentView();
    } else {
        errorMsg.style.display = 'block';
        document.getElementById('loginPassword').value = "";
    }
}
function logout() { location.reload(); }

// --- SEKME YÖNETİMİ ---
function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.getElementById('stockView').style.display = tabName === 'stock' ? 'block' : 'none';
    document.getElementById('customerView').style.display = tabName === 'customers' ? 'block' : 'none';
    refreshCurrentView();
}

function refreshCurrentView() {
    if(activeTab === 'stock') {
        document.getElementById('stockControls').style.display = 'flex';
        document.getElementById('customerControls').style.display = 'none';
        renderTable();
    } else {
        document.getElementById('stockControls').style.display = 'none';
        document.getElementById('customerControls').style.display = 'flex';
        renderCustomers();
    }
}

// --- VERİ ÇEKME ---
async function fetchData() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        if (data) {
            productData = data.products || [];
            customerData = data.customers || [];
            logData = data.logs || [];
        }
        productData.forEach(p => { if(!p.id) p.id = Date.now() + Math.random(); });
        customerData.forEach(c => { if(!c.id) c.id = Date.now() + Math.random(); });
        storeOriginalState();
        const cats = [...new Set(productData.map(p => p.category))];
        cats.forEach(c => openCategories.add(c));
        document.getElementById('loading').style.display = 'none';
    } catch (err) { console.error(err); document.getElementById('loading').style.display = 'none'; }
}

function storeOriginalState() {
    originalState = {};
    productData.forEach(p => { originalState[p.id] = { ...p }; });
}

// --- LOG FONKSİYONLARI VE DÜZENLEME ---
function addLog(action) {
    const date = new Date().toLocaleString('tr-TR');
    logData.unshift({ id: Date.now(), date: date, user: currentUser, action: action, note: "" });
    if(logData.length > 5000) logData.pop(); 
}

// Log Açıklaması Düzenleme (Yeni Özellik)
function editLogDesc(index) {
    const currentNote = logData[index].note || "";
    const newNote = prompt("Bu işleme bir açıklama ekleyin:", currentNote);
    
    if (newNote !== null) {
        logData[index].note = newNote;
        saveToCloud(); // Anlık kaydet
        openLogModal(); // Listeyi yenile
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
            
            // Eğer not varsa göster
            const noteHtml = log.note ? `<span class="log-extra-note"><i class="fa-solid fa-pen-nib"></i> ${log.note}</span>` : '';

            const row = `<tr>
                <td style="padding:10px;">${log.date}</td>
                <td style="padding:10px;"><span class="badge badge-admin">${log.user}</span></td>
                <td style="padding:10px;">
                    <span class="${actionClass}" style="padding:2px 5px; border-radius:3px;">${log.action}</span>
                    ${noteHtml}
                </td>
                <td style="text-align:center;">
                    <button class="log-edit-btn" onclick="editLogDesc(${index})"><i class="fa-solid fa-pen-to-square"></i></button>
                </td>
            </tr>`;
            tbody.innerHTML += row;
        });
    }
    document.getElementById('logModal').style.display = 'flex';
}
function closeLogModal() { document.getElementById('logModal').style.display = 'none'; }

// --- KAYDETME ---
async function saveToCloud() {
    const btn = document.getElementById('globalSaveBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
        const payload = { products: productData, customers: customerData, logs: logData };
        await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        alert("Kaydedildi!");
        storeOriginalState();
        btn.style.display = 'none';
    } catch(e) { alert("Hata!"); }
    btn.innerHTML = originalText;
}

function openSaveModal() { document.getElementById('saveNote').value=""; document.getElementById('saveModal').style.display='flex'; }
function closeSaveModal() { document.getElementById('saveModal').style.display='none'; }

function confirmSave() {
    const note = document.getElementById('saveNote').value.trim();
    closeSaveModal();
    let changesLog = [];
    productData.forEach(p => {
        const old = originalState[p.id];
        if (!old) return;
        if (p.qty !== old.qty) changesLog.push(`${p.name} stoğu ${p.qty} oldu`);
        if (p.price !== old.price) changesLog.push(`${p.name} fiyatı ${p.price} oldu`);
    });
    if (changesLog.length > 0) {
        let logStr = changesLog.length > 5 ? `${changesLog.length} ürün güncellendi` : changesLog.join(', ');
        if(note) logStr += ` (${note})`;
        addLog(logStr);
    } else if (note) { addLog(`Not: ${note}`); }
    saveToCloud();
}

// --- TABLO RENDER (SABİT NUMARALANDIRMA) ---
function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";
    const term = document.getElementById('searchInput').value.toLowerCase();

    if (productData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">Liste Boş.</td></tr>`;
        calculateTotal(); return;
    }

    let displayData = productData;
    if (term) displayData = productData.filter(p => p.name.toLowerCase().includes(term));

    let lastCategory = null;

    displayData.forEach((item) => {
        // ÜRÜNÜN GLOBAL SIRASI (Veritabanındaki gerçek sırası)
        // Bu sayede filtreleme veya kategori kapatma olsa bile sıra numarası sabit kalır.
        const globalIndex = productData.indexOf(item) + 1;

        if (item.category !== lastCategory) {
            lastCategory = item.category;
            const isOpen = openCategories.has(lastCategory) || term.length > 0;
            const iconRotate = isOpen ? 'rotate(-180deg)' : 'rotate(0deg)';

            const trCat = document.createElement('tr');
            trCat.className = 'cat-row';
            trCat.addEventListener('dragover', handleDragOver);
            trCat.addEventListener('dragleave', handleDragLeave);
            trCat.addEventListener('drop', handleDrop);
            
            trCat.innerHTML = `
                <td colspan="6">
                    <div class="cat-actions" onclick="toggleCategory('${lastCategory}')" style="flex-grow:1; display:flex; align-items:center; justify-content:space-between;">
                        <span>${lastCategory}</span>
                        <i class="fa-solid fa-chevron-down cat-icon" style="transform:${iconRotate}"></i>
                    </div>
                    <button class="cat-edit-btn" onclick="event.stopPropagation(); editCategoryName('${lastCategory}')"><i class="fa-solid fa-pen"></i></button>
                </td>
            `;
            tbody.appendChild(trCat);
        }

        const isVisible = openCategories.has(item.category) || term.length > 0;
        if (isVisible) {
            const tr = document.createElement('tr');
            tr.className = `item-row`;
            tr.dataset.id = item.id;
            
            if(!term) {
                tr.setAttribute('draggable', true);
                tr.addEventListener('dragstart', handleDragStart);
                tr.addEventListener('dragover', handleDragOver);
                tr.addEventListener('dragleave', handleDragLeave);
                tr.addEventListener('drop', handleDrop);
                tr.addEventListener('dragend', handleDragEnd);
            }

            const pVal = item.price === 0 ? '' : item.price;
            const qVal = item.qty === 0 ? '' : item.qty;
            const trashHTML = `<td class="trash-cell" style="text-align:center;"><i class="fa-solid fa-trash" style="color:#ef4444; cursor:pointer;" onclick="deleteItem(${item.id}, '${item.name}')"></i></td>`;

            tr.innerHTML = `
                <td class="index-cell">${globalIndex}</td>
                <td data-label="Ürün"><input type="text" class="input-clean" value="${item.name}" oninput="updateData(${item.id}, 'name', this.value)"></td>
                <td data-label="Fiyat">
                    <div class="price-wrapper">
                        <input type="number" class="input-clean price-input" placeholder="0" value="${pVal}" oninput="updateData(${item.id}, 'price', this.value)">
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

// ... (MÜŞTERİ, EXCEL, SÜRÜKLE BIRAK FONKSİYONLARI AYNEN DEVAM) ...
// (Aşağıdaki yardımcı fonksiyonlar standarttır)

function updateData(id, field, value) {
    const item = productData.find(p => p.id === id);
    if (!item) return;
    if (field === 'price') item[field] = parseFloat(value) || 0;
    else item[field] = value;
    if (field === 'price') document.getElementById(`total-${id}`).innerText = (item.price * item.qty).toLocaleString('tr-TR', {minimumFractionDigits:2}) + ' ₺';
    calculateTotal();
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
    item.qty = parseInt(value) || 0;
    document.getElementById(`total-${id}`).innerText = (item.price * item.qty).toLocaleString('tr-TR', {minimumFractionDigits:2}) + ' ₺';
    calculateTotal();
    document.getElementById('globalSaveBtn').style.display = 'flex';
}

function calculateTotal() {
    const total = productData.reduce((sum, p) => sum + (p.price * p.qty), 0);
    document.getElementById('grandTotal').innerText = total.toLocaleString('tr-TR', {minimumFractionDigits:2}) + ' ₺';
}

function toggleCategory(cat) { 
    if (openCategories.has(cat)) openCategories.delete(cat); else openCategories.add(cat); 
    renderTable(); 
}

function editCategoryName(oldCatName) {
    const newName = prompt("Kategori adı (Silmek için boş bırakın):", oldCatName);
    if (newName === null) return;
    if (newName.trim() === "") {
        if(confirm(`"${oldCatName}" silinsin mi? Ürünler GENEL LİSTE'ye geçer.`)) {
            productData.forEach(p => { if(p.category===oldCatName) p.category="GENEL LİSTE"; });
            openCategories.delete(oldCatName);
            openCategories.add("GENEL LİSTE");
            addLog("Kategori Silindi: " + oldCatName);
            renderTable();
            document.getElementById('globalSaveBtn').style.display='flex';
        }
    } else if (newName !== oldCatName) {
        productData.forEach(p => { if(p.category===oldCatName) p.category=newName.trim().toUpperCase(); });
        openCategories.delete(oldCatName);
        openCategories.add(newName.trim().toUpperCase());
        addLog("Kategori Değişti: " + oldCatName);
        renderTable();
        document.getElementById('globalSaveBtn').style.display='flex';
    }
}

function deleteItem(id, name) { 
    if(confirm(`${name} silinecek?`)) { 
        productData = productData.filter(p=>p.id!==id); 
        addLog(`${name} silindi.`); 
        renderTable(); 
        document.getElementById('globalSaveBtn').style.display='flex'; 
    } 
}

function resetAll() {
    if(confirm("Tüm stok listesi silinecek?")) {
        productData = [];
        addLog("Stok sıfırlandı.");
        renderTable();
        document.getElementById('globalSaveBtn').style.display='flex';
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
    const sel = document.getElementById('newCat').value;
    const inp = document.getElementById('newCatText').value;
    let cat = (sel==='NEW'?inp:sel).trim().toUpperCase();
    if(!cat) cat="GENEL LİSTE";
    const name = document.getElementById('newName').value;
    if(!name) { alert("Ürün adı girin"); return; }
    productData.push({
        id: Date.now(), category: cat, name: name, 
        price: parseFloat(document.getElementById('newPrice').value)||0,
        qty: parseInt(document.getElementById('newQty').value)||1
    });
    addLog(name + " eklendi.");
    openCategories.add(cat);
    closeModal();
    renderTable();
    document.getElementById('globalSaveBtn').style.display='flex';
}

// CRM Fonksiyonları
function renderCustomers() {
    const container = document.getElementById('customerList');
    container.innerHTML = "";
    const term = document.getElementById('searchInput').value.toLowerCase();
    const filtered = customerData.filter(c => (c.name && c.name.toLowerCase().includes(term)) || (c.device && c.device.toLowerCase().includes(term)));
    if (filtered.length === 0) { container.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#94a3b8; margin-top:20px;">Kayıt bulunamadı.</p>`; return; }
    filtered.forEach(c => {
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
                <div><div class="cust-name">${c.name}</div><span class="cust-device">${c.device || ''}</span></div>
                <span class="cust-status ${statusClass}">${c.status}</span>
            </div>
            <div style="font-size:0.85rem; color:#64748b; margin-bottom:10px;"><i class="fa-solid fa-phone"></i> ${c.phone || '-'}</div>
            <div style="font-size:0.8rem; background:#f1f5f9; padding:5px; border-radius:4px;"><b>Kalan:</b> ${(c.totalAmount - c.paidAmount).toLocaleString('tr-TR')} ₺</div>
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
        document.getElementById('custModalTitle').innerText = "Yeni Müşteri Ekle";
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
    document.getElementById('custTotal').oninput = updateRestAmount;
    document.getElementById('custPaid').oninput = updateRestAmount;
    modal.style.display = 'flex';
}
function updateRestAmount() { document.getElementById('custRest').value = (parseFloat(document.getElementById('custTotal').value)||0) - (parseFloat(document.getElementById('custPaid').value)||0); }
function closeCustomerModal() { document.getElementById('customerModal').style.display = 'none'; }
function saveCustomer() {
    const name = document.getElementById('custName').value;
    if (!name) { alert("İsim giriniz."); return; }
    const newCust = {
        id: currentCustId || Date.now(), name: name, phone: document.getElementById('custPhone').value,
        device: document.getElementById('custDevice').value, paymentType: document.getElementById('custPaymentType').value,
        status: document.getElementById('custStatus').value, totalAmount: parseFloat(document.getElementById('custTotal').value) || 0,
        paidAmount: parseFloat(document.getElementById('custPaid').value) || 0, notes: document.getElementById('custNotes').value,
        dateAdded: new Date().toLocaleDateString('tr-TR')
    };
    if (currentCustId) customerData[customerData.findIndex(x => x.id === currentCustId)] = newCust;
    else customerData.push(newCust);
    closeCustomerModal(); renderCustomers(); document.getElementById('globalSaveBtn').style.display = 'flex';
}
function deleteCustomer() { if(confirm("Silmek istediğinize emin misiniz?")) { customerData = customerData.filter(x => x.id !== currentCustId); closeCustomerModal(); renderCustomers(); document.getElementById('globalSaveBtn').style.display = 'flex'; } }
function handleSearch() { if (activeTab === 'stock') renderTable(); else renderCustomers(); }

function handleDragStart(e) { draggedItemId=parseFloat(e.target.dataset.id); e.target.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; }
function handleDragEnd(e) { e.target.classList.remove('dragging'); document.querySelectorAll('tr').forEach(r=>r.classList.remove('drag-over-top','drag-over-bottom','drag-over')); }
function handleDragOver(e) { e.preventDefault(); const tr=e.target.closest('tr'); if(tr && !tr.classList.contains('dragging')) {
    if(tr.classList.contains('item-row')) {
        const off=e.clientY-tr.getBoundingClientRect().top;
        tr.classList.remove('drag-over-top','drag-over-bottom');
        tr.classList.add(off<tr.offsetHeight/2?'drag-over-top':'drag-over-bottom');
    } else if(tr.classList.contains('cat-row')) tr.classList.add('drag-over');
}}
function handleDragLeave(e) { const tr=e.target.closest('tr'); if(tr) tr.classList.remove('drag-over-top','drag-over-bottom','drag-over'); }
function handleDrop(e) {
    e.preventDefault(); e.stopPropagation();
    if(!draggedItemId) return;
    const target=e.target.closest('tr');
    if(!target) return;
    const item=productData.find(p=>p.id===draggedItemId);
    const idx=productData.indexOf(item);
    
    if(target.classList.contains('cat-row')) {
        const newCat=target.querySelector('.cat-actions span').innerText;
        if(item.category!==newCat) {
            item.category=newCat;
            productData.splice(idx,1);
            const firstIdx=productData.findIndex(p=>p.category===newCat);
            if(firstIdx>-1) productData.splice(firstIdx,0,item); else productData.push(item);
            openCategories.add(newCat);
        }
    } else if(target.classList.contains('item-row')) {
        const tId=parseFloat(target.dataset.id);
        const tItem=productData.find(p=>p.id===tId);
        if(item!==tItem) {
            if(item.category!==tItem.category) item.category=tItem.category;
            productData.splice(idx,1);
            const newIdx=productData.indexOf(tItem);
            productData.splice(target.classList.contains('drag-over-bottom')?newIdx+1:newIdx,0,item);
        }
    }
    handleDragEnd({target:document.querySelector('.dragging')});
    renderTable();
    document.getElementById('globalSaveBtn').style.display='flex';
}

function processExcel(input) {
    const file=input.files[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=function(e){
        const rows=XLSX.utils.sheet_to_json(XLSX.read(e.target.result,{type:'array'}).Sheets[XLSX.read(e.target.result,{type:'array'}).SheetNames[0]],{header:1,defval:""});
        parseRowsSmart(rows, detectColumns(rows));
    };
    reader.readAsArrayBuffer(file);
    input.value="";
}
function detectColumns(rows) {
    let map={name:0,stock:1,price:2,category:-1,isStructured:false};
    for(let i=0;i<Math.min(rows.length,10);i++){
        const r=rows[i].map(x=>String(x).toUpperCase().trim());
        if(r.includes("ÜRÜN")&&(r.includes("FİYAT")||r.includes("ADET"))){
            map.isStructured=true; map.name=r.indexOf("ÜRÜN");
            if(r.includes("ADET"))map.stock=r.indexOf("ADET"); else if(r.includes("STOK"))map.stock=r.indexOf("STOK");
            if(r.includes("FİYAT"))map.price=r.indexOf("FİYAT"); if(r.includes("KATEGORİ"))map.category=r.indexOf("KATEGORİ");
            break;
        }
    } return map;
}
function parseRowsSmart(rows,map) {
    let added=0; let updated=0; let curCat="GENEL LİSTE";
    rows.forEach(r=>{
        if(!r||r.length===0)return;
        let name="",stock=0,price=0,cat="";
        if(map.isStructured) {
            name=(r[map.name]||"").toString().trim();
            if(!name||["ÜRÜN","STOK","FİYAT"].some(w=>name.toUpperCase().includes(w)))return;
            stock=cleanPrice(r[map.stock]); price=cleanPrice(r[map.price]);
            if(map.category>-1&&r[map.category]) { let c=r[map.category].toString().trim(); if(c)curCat=c.toUpperCase(); }
            cat=curCat;
        } else {
            let a=(r[0]||"").toString().trim(), b=(r[1]||"").toString().trim(), c=(r[2]||"").toString().trim();
            if(!a&&c&&isNaN(cleanPrice(c))){ if(!["TOPLAM","TABLOSU"].some(w=>c.toUpperCase().includes(w)))curCat=c.toUpperCase(); return; }
            if(!a||["ÜRÜN","STOK"].some(w=>a.toUpperCase().includes(w)))return;
            name=a; stock=cleanPrice(b); price=cleanPrice(c); cat=curCat;
        }
        const ex=productData.find(p=>p.name.trim().toLowerCase()===name.toLowerCase());
        if(ex) { if(ex.price!==price||ex.qty!==stock){ ex.price=price; ex.qty=stock; updated++; } }
        else { productData.push({id:Date.now()+Math.random(),category:cat,name:name,price:price,qty:stock}); added++; }
    });
    [...new Set(productData.map(p=>p.category))].forEach(c=>openCategories.add(c));
    if(added>0||updated>0) { addLog(`Excel: ${added} yeni, ${updated} güncel`); alert("Tamamlandı."); document.getElementById('globalSaveBtn').style.display='flex'; renderTable(); }
}
function cleanPrice(s){if(typeof s==='number')return s; if(!s)return 0; let c=s.toString().replace(/[^0-9.,]/g,''); if(c.includes(',')&&c.includes('.'))c=c.replace(/\./g,'').replace(',','.'); else if(c.includes(','))c=c.replace(',','.'); else if(c.includes('.')&&c.split('.')[1].length===3)c=c.replace(/\./g,''); return parseFloat(c)||0;}

function exportToExcel() {
    const list=productData.map(p=>({"KATEGORİ":p.category,"ÜRÜN":p.name,"FİYAT":p.price,"ADET":p.qty,"TOPLAM":p.price*p.qty}));
    const cust=customerData.map(c=>({"AD SOYAD":c.name,"TELEFON":c.phone,"CİHAZ":c.device,"DURUM":c.status,"TOPLAM":c.totalAmount,"ALINAN":c.paidAmount,"KALAN":c.totalAmount-c.paidAmount,"NOT":c.notes}));
    const logs=logData.map(l=>({"TARİH":l.date,"KULLANICI":l.user,"AÇIKLAMA":l.action,"NOT":l.note||""}));
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(list),"Stok Listesi");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(cust),"Müşteriler");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(logs),"Loglar");
    XLSX.writeFile(wb,"Focus_Medikal_Full_Data.xlsx");
}
