const API_URL = 'https://script.google.com/macros/s/AKfycbzVyMRnnAtxPGEzezy2Vjj07UmrHS7M-0id6KNi7QhGLbgxnfycMjBstyYFaPtn8SMr/exec'; 

let productData = [];
let logData = []; 
let originalState = {}; 
let isAdmin = false;
let currentUser = "Misafir"; 
let openCategories = new Set(); 
let draggedItem = null; 

window.onload = function() { fetchData(); };

// --- LOGIC ---
function loginToggle() {
    if (isAdmin) {
        isAdmin = false;
        currentUser = "Misafir";
        document.getElementById('adminControls').style.display = 'none';
        document.getElementById('loginText').innerText = "Giriş Yap";
        renderTable();
    } else {
        let pass = prompt("Sistem Şifresi:");
        if (pass === "nur27") {
            isAdmin = true;
            currentUser = "Yönetici"; 
            document.getElementById('adminControls').style.display = 'flex';
            document.getElementById('loginText').innerText = "Çıkış Yap";
            addLog("Yönetici girişi yapıldı.");
            renderTable();
        } else if (pass !== null) {
            alert("Hatalı Şifre!");
        }
    }
}

async function fetchData() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        if (data && data.products) {
            productData = data.products;
            logData = data.logs || [];
        } else if (Array.isArray(data)) {
            productData = data;
            logData = [];
        }
        productData.forEach(p => { if(!p.id) p.id = Date.now() + Math.random(); });
        storeOriginalState();
        const cats = [...new Set(productData.map(p => p.category))];
        cats.forEach(c => openCategories.add(c));
        renderTable();
    } catch (err) { console.error(err); }
    document.getElementById('loading').style.display = 'none';
}

function storeOriginalState() {
    originalState = {};
    productData.forEach(p => { originalState[p.id] = { ...p }; });
}

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
            if(log.action.includes("Eklendi") || log.action.includes("girişi")) actionClass = "badge-inc";
            if(log.action.includes("Silindi")) actionClass = "badge-dec";
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

function openSaveModal() {
    document.getElementById('saveNote').value = "";
    document.getElementById('saveModal').style.display = 'flex';
}
function closeSaveModal() { document.getElementById('saveModal').style.display = 'none'; }

function confirmSave() {
    const note = document.getElementById('saveNote').value.trim();
    closeSaveModal();
    let changesCount = 0;
    productData.forEach(p => {
        const old = originalState[p.id];
        if (!old) return;
        if (old.qty !== p.qty || old.price !== p.price || old.name !== p.name) { changesCount++; }
    });
    if (changesCount > 0) {
        let logMsg = `${changesCount} Üründe Güncelleme Yapıldı.`;
        if (note) logMsg += `|||${note}`;
        addLog(logMsg);
    } else if (note) { addLog(`Genel Not Eklendi|||${note}`); }
    saveToCloud();
}

async function saveToCloud() {
    const btn = document.getElementById('globalSaveBtn');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    try {
        const payload = { products: productData, logs: logData };
        await fetch(API_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
        alert("Başarıyla Kaydedildi!");
        storeOriginalState();
        btn.style.display = 'none';
    } catch(e) { alert("Hata oluştu."); }
    btn.innerHTML = original;
}

// --- EXCEL OKUMA (V38 KESİN ÇÖZÜM) ---
function processExcel(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        // ÖNEMLİ: defval:"" ile boş hücreleri "" olarak oku, kaydırmayı engelle
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }); 
        parseRowsMerge(rows);
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

function parseRowsMerge(rows) {
    let added = 0; let updated = 0;
    let currentCat = "GENEL LİSTE";
    const blacklist = ["ÜRÜN", "STOK", "FİYAT", "TOPLAM", "ADET", "HUMAY", "TABLOSU"];
    
    rows.forEach(row => {
        if(!row || row.length === 0) return;

        // DOSYA FORMATINA SADIK KAL: A=İsim, B=Stok, C=Fiyat
        // defval: "" sayesinde boşluklar yer tutar, veri kaymaz.
        let colA = (row[0] || "").toString().trim(); // A: İsim
        let colB = (row[1] || "").toString().trim(); // B: Stok
        let colC = (row[2] || "").toString().trim(); // C: Fiyat veya Kategori

        // 1. KATEGORİ Mİ? (A boş, C dolu ve yazı)
        // Senin dosyanda kategoriler C sütununda (row[2])
        if (colA === "" && colC !== "" && isNaN(cleanPrice(colC))) {
            if(!blacklist.some(w => colC.toUpperCase().includes(w))) {
                currentCat = colC.toUpperCase();
            }
            return; 
        }

        // 2. ÜRÜN MÜ? (A Dolu)
        if (colA !== "") {
            // Başlık satırıysa geç
            if (blacklist.some(w => colA.toUpperCase().includes(w))) return;

            let pName = colA;
            // Kesin atama:
            let pStock = cleanPrice(colB); // B sütunu kesin STOKTUR
            let pPrice = cleanPrice(colC); // C sütunu kesin FİYATTIR

            const existingIndex = productData.findIndex(p => p.name.trim().toLowerCase() === pName.toLowerCase());
            if (existingIndex > -1) {
                productData[existingIndex].price = pPrice || productData[existingIndex].price;
                productData[existingIndex].qty = pStock;
                updated++;
            } else {
                productData.push({ id: Date.now() + Math.random(), category: currentCat, name: pName, price: pPrice, qty: pStock });
                added++;
            }
        }
    });

    const allCats = [...new Set(productData.map(p => p.category))];
    allCats.forEach(c => openCategories.add(c));

    if(added > 0 || updated > 0) {
        addLog(`Excel Yüklendi: ${added} yeni, ${updated} güncellendi.`);
        alert(`${added} yeni, ${updated} güncellendi.`);
        document.getElementById('globalSaveBtn').style.display = 'flex';
        renderTable();
    }
}

// --- DİĞER FONKSİYONLAR ---
function renderTable() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";
    const term = document.getElementById('searchInput').value.toLowerCase();

    if (productData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">Liste Boş.</td></tr>`;
        calculateTotal(); return;
    }

    let displayList = productData;
    const grouped = {};
    productData.forEach(p => {
        if (p.name.toLowerCase().includes(term)) {
            const cat = (p.category || "DİĞER").trim().toUpperCase();
            if(!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(p);
        }
    });

    const readOnlyNamePrice = isAdmin ? '' : 'readonly';

    Object.keys(grouped).forEach((cat) => {
        const isOpen = openCategories.has(cat);
        const displayStyle = isOpen ? '' : 'none';
        const iconRotate = isOpen ? 'rotate(-180deg)' : 'rotate(0deg)';

        const trCat = document.createElement('tr');
        trCat.className = 'cat-row';
        trCat.onclick = () => toggleCategory(cat);
        trCat.innerHTML = `<td colspan="6">${cat} <i class="fa-solid fa-chevron-down cat-icon" style="transform:${iconRotate}"></i></td>`;
        tbody.appendChild(trCat);

        grouped[cat].forEach((item) => {
            const tr = document.createElement('tr');
            tr.style.display = displayStyle;
            tr.className = `item-row`;
            tr.setAttribute('draggable', isAdmin); 
            tr.dataset.id = item.id;
            
            if(isAdmin) {
                tr.addEventListener('dragstart', handleDragStart);
                tr.addEventListener('dragover', handleDragOver);
                tr.addEventListener('drop', handleDrop);
                tr.addEventListener('dragend', handleDragEnd);
            }

            const pVal = item.price === 0 ? '' : item.price;
            const qVal = item.qty === 0 ? '' : item.qty;
            const trashHTML = isAdmin ? `<td class="trash-cell" style="text-align:center;"><i class="fa-solid fa-trash" style="color:#ef4444; cursor:pointer;" onclick="deleteItem(${item.id}, '${item.name}')"></i></td>` : '<td></td>';
            const handleHTML = isAdmin ? `<i class="fa-solid fa-grip-lines drag-handle"></i>` : '';

            tr.innerHTML = `
                <td style="text-align:center;">${handleHTML}</td>
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
        });
    });
    calculateTotal();
}

function handleDragStart(e) { draggedItem = this; this.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function handleDrop(e) {
    e.stopPropagation();
    const targetRow = e.target.closest('tr.item-row');
    if (draggedItem !== targetRow && targetRow) {
        const draggedId = parseFloat(draggedItem.dataset.id);
        const targetId = parseFloat(targetRow.dataset.id);
        const fromIndex = productData.findIndex(p => p.id === draggedId);
        const toIndex = productData.findIndex(p => p.id === targetId);
        if(fromIndex > -1 && toIndex > -1) {
            const item = productData.splice(fromIndex, 1)[0];
            productData.splice(toIndex, 0, item);
            document.getElementById('globalSaveBtn').style.display = 'flex';
        }
    }
    return false;
}
function handleDragEnd(e) { this.classList.remove('dragging'); renderTable(); }
function toggleCategory(cat) { if (openCategories.has(cat)) openCategories.delete(cat); else openCategories.add(cat); renderTable(); }

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
    const list = productData.map(p=>({"KATEGORİ":p.category, "ÜRÜN":p.name, "FİYAT":p.price, "ADET":p.qty, "TOPLAM":p.price*p.qty}));
    const ws = XLSX.utils.json_to_sheet(list);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Liste");
    const logList = logData.map(l=>({"TARİH":l.date, "KULLANICI":l.user, "AÇIKLAMA":l.action}));
    const wsLog = XLSX.utils.json_to_sheet(logList);
    XLSX.utils.book_append_sheet(wb, wsLog, "Hareket Gecmisi");
    XLSX.writeFile(wb, "Focus_Medikal_Full.xlsx");
}

function resetAll() { 
    if(confirm("Tüm liste silinecek (Loglar KORUNACAK)?")) { 
        productData=[]; 
        addLog("Ürün listesi sıfırlandı."); 
        renderTable(); document.getElementById('globalSaveBtn').style.display='flex'; 
    } 
}
function deleteItem(id, name) { 
    if(confirm(`${name} silinecek?`)) { 
        productData = productData.filter(p=>p.id!==id); 
        addLog(`${name} ürünü silindi.`); 
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
        addLog(`${name} eklendi.`); 
        openCategories.add(cat);
        renderTable(); 
        closeModal();
        document.getElementById('newName').value = "";
        document.getElementById('newPrice').value = "";
        document.getElementById('newQty').value = "1";
        document.getElementById('globalSaveBtn').style.display='flex';
    } else { alert("Ürün adı giriniz."); }
}
