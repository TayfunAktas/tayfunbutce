/**
 * TAYFUN BÜTÇE - Mobil PWA Altyapısı Veri Yönetim Çekirdeği
 */

// Servis Önbellek Kaydı
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.error(err));
    });
}

// LocalStorage Veri Depolama Yapısı Nesnesi
const DB = {
    get(key, defaultVal) {
        return JSON.parse(localStorage.getItem('tb_' + key)) || defaultVal;
    },
    set(key, val) {
        localStorage.setItem('tb_' + key, JSON.stringify(val));
    }
};

// Uygulama Durum Yönetimi (State)
let state = {
    targetGoal: DB.get('targetGoal', 1000000),
    categories: DB.get('categories', {
        income: ['Maaş', 'Ek Gelir', 'Prim'],
        expense: ['Mutfak', 'Kira', 'Fatura', 'Giyim'],
        invest: ['Borsa', 'Altın', 'Fon', 'Döviz']
    }),
    transactions: DB.get('transactions', []), // Tekil Serbest İşlemler
    kasaAdjustments: DB.get('kasaAdjustments', []), // Doğrudan Kasa Giriş/Çıkış Hareketleri
    installments: DB.get('installments', []), // Taksit Planları Kontratları
    fixedContracts: DB.get('fixedContracts', []), // Sabit Taahhüt Giderleri Sözleşmeleri
    activePage: 'dashboard',
    selectedMonth: new Date().getMonth() + 1,
    selectedYear: new Date().getFullYear(),
    activeTxTab: 'income'
};

// Türk Lirası Para Format Motoru (Standart: 1.000.000,00 TL)
function formatTL(amount) {
    const isNegative = amount < 0;
    const absVal = Math.abs(amount);
    const formatted = new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(absVal);
    return (isNegative ? '-' : '') + formatted + ' TL';
}

// Tarih Dönüşüm Yardımcısı
function parseDate(isoString) {
    return new Date(isoString);
}

// Sayfa Yönlendirme Kontrolörü (SPA Routing)
function navigateTo(pageId) {
    state.activePage = pageId;
    document.querySelectorAll('.app-page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
    
    const targetPage = document.getElementById('page-' + pageId);
    if(targetPage) targetPage.classList.add('active');

    document.querySelectorAll(`[data-target="${pageId}"]`).forEach(el => el.classList.add('active'));
    
    // Geçiş yapıldığında ilgili sayfa içeriğini sıfırdan hesapla/bas
    renderApp();
}

// Proje İçi Tarih Seçim Dinamiklerini Yükle
function initYearsSelector() {
    const yearSel = document.getElementById('global-year-select');
    yearSel.innerHTML = '';
    for(let y = 2026; y <= 2050; y++) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        yearSel.appendChild(opt);
    }
    document.getElementById('global-month-select').value = state.selectedMonth;
    yearSel.value = state.selectedYear;
}

// ANALİTİK HESAPLAMA MOTORU (DASHBOARD VE DİĞER DETAYLAR İÇİN)
function computeFinancials() {
    const targetM = state.selectedMonth;
    const targetY = state.selectedYear;

    // Dinamik Projeksiyon Filtreleri Fonksiyonu (Seçili Ay İçin Veri Hesaplama)
    function getMonthData(m, y) {
        let inc = 0, exp = 0, inv = 0;
        let incItems = [], expItems = [];

        // 1. Serbest İşlemler
        state.transactions.forEach(t => {
            const d = parseDate(t.date);
            if(d.getMonth() + 1 === m && d.getFullYear() === y) {
                if(t.type === 'income') { inc += t.amount; incItems.push(t); }
                else if(t.type === 'expense') { exp += t.amount; expItems.push(t); }
                else if(t.type === 'invest') { inv += t.amount; }
            }
        });

        // 2. Sabit Taahhüt Giderleri Entegrasyon Algoritması
        state.fixedContracts.forEach(c => {
            // Kontrat ayı hesaplama formülü
            let startTotalMonths = (c.startY * 12) + c.startM;
            let currentTotalMonths = (y * 12) + m;
            let diff = currentTotalMonths - startTotalMonths;

            if(diff >= 0 && diff < c.duration) {
                let currentAmount = c.amount;
                // Değişiklik checkbox koşulu kontrolü
                if(c.modified && c.modTotalMonths && currentTotalMonths >= c.modTotalMonths && currentTotalMonths < (c.modTotalMonths + c.modDuration)) {
                    currentAmount = c.newAmount;
                }
                if(c.type === 'expense') exp += currentAmount;
                if(c.type === 'invest') inv += currentAmount;
            }
        });

        // 3. Taksitlendirme Modülü Matematik Planlama Hesaplaması
        state.installments.forEach(ins => {
            ins.schedule.forEach(sch => {
                if(sch.m === m && sch.y === y) {
                    exp += sch.amount; // Taksit borçları gider tablosuna yansır
                }
            });
        });

        return { income: inc, expense: exp, investment: inv, incItems, expItems };
    }

    // Aktif ayın verileri
    const currentMonthData = getMonthData(targetM, targetY);

    // Kasa Toplam Geçmiş Akümülasyonu (Tüm Tarihler Dahil Kasa Bakiyesi)
    let totalCashFromBeginning = 0;
    state.transactions.forEach(t => {
        if(t.type === 'income') totalCashFromBeginning += t.amount;
        else totalCashFromBeginning -= t.amount; // Giderler ve yatırımlar kasadan nakit azaltır
    });
    state.fixedContracts.forEach(c => {
        let startTotal = (c.startY * 12) + c.startM;
        let curTotal = (targetY * 12) + targetM;
        // Seçili aya kadar ödenenleri biriktir
        for(let totalM = startTotal; totalM <= curTotal; totalM++) {
            let mIndex = totalM % 12 === 0 ? 12 : totalM % 12;
            let yIndex = Math.floor((totalM - mIndex) / 12);
            let diff = totalM - startTotal;
            if(diff >= 0 && diff < c.duration) {
                let amt = c.amount;
                if(c.modified && c.modTotalMonths && totalM >= c.modTotalMonths && totalM < (c.modTotalMonths + c.modDuration)) amt = c.newAmount;
                totalCashFromBeginning -= amt;
            }
        }
    });
    state.installments.forEach(ins => {
        ins.schedule.forEach(sch => {
            let sTotal = (sch.y * 12) + sch.m;
            let cTotal = (targetY * 12) + targetM;
            if(sTotal <= cTotal) totalCashFromBeginning -= sch.amount;
        });
    });
    // Kasa manuel düzeltmeleri logları dahil et
    state.kasaAdjustments.forEach(adj => {
        if(adj.type === 'giris') totalCashFromBeginning += adj.amount;
        else totalCashFromBeginning -= adj.amount;
    });

    // Geçen ayın verileri (Değişim hesapları için)
    let prevM = targetM - 1, prevY = targetY;
    if(prevM === 0) { prevM = 12; prevY--; }
    const prevMonthData = getMonthData(prevM, prevY);

    // Seçili Yılın Başı (Ocak) İtibariyle Kümülâtif YTD Ortalama Hesaplama Alanı
    let ytdCount = 0;
    let ytdSumIncome = 0, ytdSumExpense = 0, ytdSumInvest = 0;
    for(let m = 1; m <= targetM; m++) {
        ytdCount++;
        const d = getMonthData(m, targetY);
        ytdSumIncome += d.income;
        ytdSumExpense += d.expense;
        ytdSumInvest += d.investment;
    }
    const avgIncome = ytdCount > 0 ? (ytdSumIncome / ytdCount) : 0;
    const avgExpense = ytdCount > 0 ? (ytdSumExpense / ytdCount) : 0;
    const avgInvest = ytdCount > 0 ? (ytdSumInvest / ytdCount) : 0;

    return {
        currentMonthData, prevMonthData, totalCashFromBeginning,
        avgIncome, avgExpense, avgInvest, ytdSumIncome, ytdSumExpense, ytdSumInvest
    };
}

// ANA RENDER MOTORU
function renderApp() {
    const metrics = computeFinancials();
    const cmd = metrics.currentMonthData;
    const pmd = metrics.prevMonthData;

    // --- ELEMENT GÜNCELLEMELERİ (ANA SAYFA - DASHBOARD) ---
    if(state.activePage === 'dashboard') {
        const netMonthBal = cmd.income - cmd.expense - cmd.investment;
        document.getElementById('dash-net-balance').innerText = formatTL(netMonthBal);
        
        // Önceki aya göre kasa değişimi
        const prevNetMonthBal = pmd.income - pmd.expense - pmd.investment;
        const absDiff = netMonthBal - prevNetMonthBal;
        let ratioDiff = 0;
        if(prevNetMonthBal !== 0) ratioDiff = (absDiff / Math.abs(prevNetMonthBal)) * 100;
        
        const changeBadge = document.getElementById('dash-balance-change');
        if(absDiff < 0) {
            changeBadge.className = "balance-change-badge text-red";
            changeBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-down"></i> ${formatTL(absDiff)} (-%${Math.abs(ratioDiff).toFixed(1)})`;
        } else {
            changeBadge.className = "balance-change-badge text-green";
            changeBadge.innerHTML = `<i class="fa-solid fa-arrow-trend-up"></i> +${formatTL(absDiff)} (+%${ratioDiff.toFixed(1)})`;
        }

        // Hedef Çubuk Grafik Hesaplama Çarkı
        const goalTotal = state.targetGoal;
        const currentProgress = metrics.totalCashFromBeginning;
        const remainingGoal = goalTotal - currentProgress;
        let progressPercent = goalTotal > 0 ? (currentProgress / goalTotal) * 100 : 0;
        if(progressPercent < 0) progressPercent = 0;
        if(progressPercent > 100) progressPercent = 100;

        document.getElementById('goal-bar-fill').style.width = progressPercent.toFixed(1) + '%';
        document.getElementById('goal-percent').innerText = `%${progressPercent.toFixed(1)}`;
        document.getElementById('goal-remaining').innerText = formatTL(remainingGoal);

        // Kart Verileri
        document.getElementById('dash-total-income').innerText = formatTL(cmd.income);
        document.getElementById('dash-total-expense').innerText = formatTL(cmd.expense);
        document.getElementById('dash-total-invest').innerText = formatTL(cmd.investment);
        
        const investRatio = cmd.income > 0 ? (cmd.investment / cmd.income) * 100 : 0;
        document.getElementById('dash-invest-ratio').innerText = `%${investRatio.toFixed(1)} Yönlendi`;

        // YTD Ortalamalar
        document.getElementById('avg-income').innerText = formatTL(metrics.avgIncome);
        document.getElementById('avg-expense').innerText = formatTL(metrics.avgExpense);
        document.getElementById('avg-invest').innerText = formatTL(metrics.avgInvest);
        
        const avgInvRatio = metrics.avgIncome > 0 ? (metrics.avgInvest / metrics.avgIncome) * 100 : 0;
        document.getElementById('avg-invest-ratio').innerText = `%${avgInvRatio.toFixed(1)}`;

        // En fazla gelir/gider kalem tespiti
        let peakIncName = "-", peakIncVal = 0;
        cmd.incItems.forEach(i => { if(i.amount > peakIncVal) { peakIncVal = i.amount; peakIncName = i.desc; } });
        let peakExpName = "-", peakExpVal = 0;
        cmd.expItems.forEach(i => { if(i.amount > peakExpVal) { peakExpVal = i.amount; peakExpName = i.desc; } });
        
        document.getElementById('peak-income-item').innerText = peakIncName + ` (${formatTL(peakIncVal)})`;
        document.getElementById('peak-expense-item').innerText = peakExpName + ` (${formatTL(peakExpVal)})`;

        // Geçen aya kıyasla trend okları değişimleri
        function getTrendMarkup(curr, prev, invert = false) {
            const diff = curr - prev;
            if(diff === 0) return `<span>Değişim Yok (0,00 TL)</span>`;
            const isUp = diff > 0;
            let isGood = isUp;
            if(invert) isGood = !isUp; // Gider kalemlerinde artış kötüdür, renk tersine döner
            const clr = isGood ? 'text-green' : 'text-red';
            return `<strong class="${clr}">${isUp ? '↑ Artış':'↓ Azalış'} (${formatTL(diff)})</strong>`;
        }
        document.getElementById('trend-income').innerHTML = getTrendMarkup(cmd.income, pmd.income);
        document.getElementById('trend-expense').innerHTML = getTrendMarkup(cmd.expense, pmd.expense, true);
        document.getElementById('trend-invest').innerHTML = getTrendMarkup(cmd.investment, pmd.investment);

        // Kümülâtif Kartı Verileri
        document.getElementById('cum-income').innerText = formatTL(metrics.ytdSumIncome);
        document.getElementById('cum-expense').innerText = formatTL(metrics.ytdSumExpense);
        document.getElementById('cum-invest').innerText = formatTL(metrics.ytdSumInvest);
        const cumRatio = metrics.ytdSumIncome > 0 ? (metrics.ytdSumInvest / metrics.ytdSumIncome) * 100 : 0;
        document.getElementById('cum-invest-ratio').innerText = `%${cumRatio.toFixed(1)}`;
    }

    // --- İŞLEMLER SAYFASI RENDER MODÜLÜ ---
    if(state.activePage === 'transactions') {
        const netMonthAmount = cmd.income - cmd.expense - cmd.investment;
        const txNetEl = document.getElementById('tx-month-net-amount');
        txNetEl.innerText = formatTL(netMonthAmount);
        txNetEl.className = netMonthAmount < 0 ? 'text-red' : 'text-green';

        // İşlemleri render et
        renderTransactionList();
    }

    // --- KASA SAYFASI RENDER MODÜLÜ ---
    if(state.activePage === 'kasa') {
        const vaultCashEl = document.getElementById('kasa-total-cash');
        vaultCashEl.innerText = formatTL(metrics.totalCashFromBeginning);
        vaultCashEl.className = metrics.totalCashFromBeginning < 0 ? 'text-red' : 'text-green';

        // Log kayıt listesini filtrele
        const logContainer = document.getElementById('kasa-logs-list');
        logContainer.innerHTML = '';
        
        const monthlyAdjustments = state.kasaAdjustments.filter(a => {
            const d = parseDate(a.date);
            return (d.getMonth() + 1 === state.selectedMonth && d.getFullYear() === state.selectedYear);
        });

        if(monthlyAdjustments.length === 0) {
            logContainer.innerHTML = `<li>Bu ay için henüz kasa giriş/çıkış hareketi girilmemiştir.</li>`;
        } else {
            monthlyAdjustments.forEach(a => {
                const li = document.createElement('li');
                const dStr = parseDate(a.date).toLocaleDateString('tr-TR');
                li.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> <strong>${dStr}</strong> tarihinde <strong>${formatTL(a.amount)}</strong> tutarında kasaya <strong>${a.type === 'giris' ? 'giriş':'çıkış'}</strong> olmuştur.`;
                logContainer.appendChild(li);
            });
        }
    }

    // --- TAKSİTLENDİRME SAYFASI RENDER MODÜLÜ ---
    if(state.activePage === 'installments') {
        renderInstallmentsPageList();
    }

    // --- SABİT GİDER SAYFASI RENDER MODÜLÜ ---
    if(state.activePage === 'fixed-expenses') {
        renderFixedContractsPageList();
    }

    // --- AYARLAR SAYFASI RENDER MODÜLÜ ---
    if(state.activePage === 'settings') {
        document.getElementById('settings-goal-input').value = state.targetGoal;
        renderSettingsCategories();
    }
}

// İŞLEMLER LİSTESİ AGREGASYON VE AKORDEON YAPISI TASARIMI
function renderTransactionList() {
    const listContainer = document.getElementById('tx-lists-container');
    listContainer.innerHTML = '';

    const tab = state.activeTxTab; // 'income', 'expense' veya 'invest'
    const m = state.selectedMonth;
    const y = state.selectedYear;

    // Sabit Giderleri En Üste Eklemek İçin Yapı (Sadece Gider Sekmesindeyken)
    if(tab === 'expense') {
        let activeFixedContracts = state.fixedContracts.filter(c => c.type === 'expense');
        let currentMonthFixedTotal = 0;
        let subFixedItemsHTML = '';

        activeFixedContracts.forEach(c => {
            let startTotalMonths = (c.startY * 12) + c.startM;
            let currentTotalMonths = (y * 12) + m;
            let diff = currentTotalMonths - startTotalMonths;

            if(diff >= 0 && diff < c.duration) {
                let amt = c.amount;
                if(c.modified && c.modTotalMonths && currentTotalMonths >= c.modTotalMonths && currentTotalMonths < (c.modTotalMonths + c.modDuration)) {
                    amt = c.newAmount;
                }
                currentMonthFixedTotal += amt;
                subFixedItemsHTML += `
                    <div style="display:flex; justify-content:space-between; font-size:12px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <span>${c.name} (Taahhütlü)</span>
                        <strong>${formatTL(amt)}</strong>
                    </div>
                `;
            }
        });

        if(currentMonthFixedTotal > 0) {
            const fixedCard = document.createElement('div');
            fixedCard.className = 'nested-accordion-card';
            fixedCard.innerHTML = `
                <div class="accordion-header" onclick="this.nextElementSibling.classList.toggle('open')">
                    <h4><i class="fa-solid fa-thumbtack text-red"></i> Sabit Giderler (Toplam Kart)</h4>
                    <span class="row-amount text-red">${formatTL(currentMonthFixedTotal)}</span>
                </div>
                <div class="accordion-body">
                    ${subFixedItemsHTML}
                </div>
            `;
            listContainer.appendChild(fixedCard);
        }
    }

    // Aynı İsimdeki Taksitleri Tek Parça Toplama ve Katlama Mantığı (Sadece Gider Sekmesinde)
    let currentMonthInstallmentRows = [];
    if(tab === 'expense') {
        state.installments.forEach(ins => {
            ins.schedule.forEach(sch => {
                if(sch.m === m && sch.y === y) {
                    currentMonthInstallmentRows.push({ desc: ins.desc, amount: sch.amount, info: `Taksit ${sch.index}/${ins.count}` });
                }
            });
        });
    }

    // Serbest Serbest İşlemleri Filtreleme
    let currentMonthTx = state.transactions.filter(t => {
        const d = parseDate(t.date);
        return (t.type === tab && d.getMonth() + 1 === m && d.getFullYear() === y);
    });

    // Taksitleri ve Normal İşlemleri Ortak Bir Havuzda İsme Göre Gruplama Algoritması
    let combinedItems = [];
    currentMonthTx.forEach(t => combinedItems.push({ id: t.id, desc: t.desc, amount: t.amount, isTx: true, date: parseDate(t.date).toLocaleDateString('tr-TR') }));
    currentMonthInstallmentRows.forEach(i => combinedItems.push({ desc: i.desc, amount: i.amount, isTx: false, info: i.info }));

    // İsme Göre Sözlük Tipi Gruplama
    let groups = {};
    combinedItems.forEach(item => {
        if(!groups[item.desc]) groups[item.desc] = [];
        groups[item.desc].push(item);
    });

    // Grupları Ekrana Kart Olarak Basma Döngüsü
    Object.keys(groups).forEach(descKey => {
        const itemArray = groups[descKey];
        const groupTotalSum = itemArray.reduce((acc, curr) => acc + curr.amount, 0);

        // Eğer aynı isimde birden fazla işlem var ise akordeon kart yap
        if(itemArray.length > 1) {
            const accCard = document.createElement('div');
            accCard.className = 'nested-accordion-card';
            let subRowsHTML = '';
            
            itemArray.forEach(sub => {
                subRowsHTML += `
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
                        <div>
                            <span>${sub.isTx ? 'Serbest İşlem' : sub.info}</span>
                            <small style="display:block; color:var(--text-secondary);">${sub.isTx ? sub.date : ''}</small>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <strong>${formatTL(sub.amount)}</strong>
                            ${sub.isTx ? `<button class="icon-action-btn" onclick="deleteTransaction(${sub.id})"><i class="fa-solid fa-trash"></i></button>` : ''}
                        </div>
                    </div>
                `;
            });

            accCard.innerHTML = `
                <div class="accordion-header" onclick="this.nextElementSibling.classList.toggle('open')">
                    <h4><i class="fa-solid fa-folder-open"></i> ${descKey} (${itemArray.length} İşlem)</h4>
                    <span class="row-amount">${formatTL(groupTotalSum)}</span>
                </div>
                <div class="accordion-body">
                    ${subRowsHTML}
                </div>
            `;
            listContainer.appendChild(accCard);
        } else {
            // Tek bir işlem var ise standart satır kartı oluştur
            const singleItem = itemArray[0];
            const rowCard = document.createElement('div');
            rowCard.className = 'item-row-card';
            
            const colorClass = tab === 'income' ? 'text-green' : (tab === 'expense' ? 'text-primary' : 'text-primary');

            rowCard.innerHTML = `
                <div class="row-details">
                    <h5>${singleItem.desc}</h5>
                    <span>${singleItem.isTx ? 'Serbest Kayıt • ' + singleItem.date : 'Planlı • ' + singleItem.info}</span>
                </div>
                <div class="row-actions">
                    <strong class="row-amount ${colorClass}">${formatTL(singleItem.amount)}</strong>
                    ${singleItem.isTx ? `
                        <button class="icon-action-btn" onclick="editTransaction(${singleItem.id})"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="icon-action-btn" onclick="deleteTransaction(${singleItem.id})"><i class="fa-solid fa-trash"></i></button>
                    ` : ''}
                </div>
            `;
            listContainer.appendChild(rowCard);
        }
    });

    if(Object.keys(groups).length === 0 && tab !== 'expense') {
        listContainer.innerHTML = `<p style="text-align:center; color:var(--text-secondary); margin-top:20px;">Bu ay için kayıt bulunmamaktadır.</p>`;
    }
}

// TAKSİTLENDİRME SAYFASI YÖNETİMİ
function renderInstallmentsPageList() {
    const container = document.getElementById('installment-month-list');
    container.innerHTML = '';
    
    const m = state.selectedMonth;
    const y = state.selectedYear;

    const monthlyIns = state.installments.filter(ins => {
        return ins.schedule.some(sch => sch.m === m && sch.y === y);
    });

    if(monthlyIns.length === 0) {
        container.innerHTML = `<p style="font-size:13px; color:var(--text-secondary);">Bu aya ait ödemesi bulunan planlı taksit sözleşmesi yoktur.</p>`;
        return;
    }

    monthlyIns.forEach(ins => {
        const schItem = ins.schedule.find(sch => sch.m === m && sch.y === y);
        const card = document.createElement('div');
        card.className = 'item-row-card';
        card.innerHTML = `
            <div class="row-details">
                <h5>${ins.desc}</h5>
                <span>Plan Tipi: ${ins.type === 'cc' ? 'Kredi Kartı':'Kredi/Avans'} • Taksit: ${schItem.index}/${ins.count}</span>
            </div>
            <div class="row-actions">
                <strong class="row-amount text-red">${formatTL(schItem.amount)}</strong>
                <button class="icon-action-btn" onclick="deleteInstallmentPlan(${ins.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(card);
    });
}

// SABİT GİDER/YATIRIM SÖZLEŞMELERİ LİSTELEME MODÜLÜ
function renderFixedContractsPageList() {
    const container = document.getElementById('fixed-contracts-list');
    container.innerHTML = '';

    if(state.fixedContracts.length === 0) {
        container.innerHTML = `<p style="font-size:13px; color:var(--text-secondary);">Kayıtlı sabit taahhüt planı bulunmamaktadır.</p>`;
        return;
    }

    state.fixedContracts.forEach(c => {
        const card = document.createElement('div');
        card.className = 'item-row-card';
        card.innerHTML = `
            <div class="row-details">
                <h5>${c.name}</h5>
                <span>Tür: ${c.type === 'expense' ? 'Sabit Gider':'BES/Yatırım'} • Başlangıç: ${c.startM}/${c.startY} • Süre: ${c.duration} Ay</span>
                ${c.modified ? `<small style="display:block; color:var(--accent-color);">Gelecek Modifikasyonu: ${c.newAmount} TL (${c.modMonth}/${c.modYear} itibariyle)</small>` : ''}
            </div>
            <div class="row-actions">
                <strong class="row-amount">${formatTL(c.amount)}</strong>
                <button class="icon-action-btn" onclick="editFixedContract(${c.id})"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="icon-action-btn" onclick="deleteFixedContract(${c.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(card);
    });
}

// AYARLAR KATEGORİ LİSTELEME MOTORU
function renderSettingsCategories() {
    const type = document.getElementById('settings-cat-type').value;
    const list = document.getElementById('settings-categories-render-list');
    list.innerHTML = '';

    state.categories[type].forEach((cat, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${cat}</span>
            <button class="icon-action-btn" onclick="deleteCategory('${type}', ${index})"><i class="fa-solid fa-circle-xmark"></i></button>
        `;
        list.appendChild(li);
    });
}

// VERİ EKLEME/SİLME AKTI EYLEMLERİ ÇEKİRDEĞİ
window.deleteTransaction = function(id) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    DB.set('transactions', state.transactions);
    renderApp();
};

window.editTransaction = function(id) {
    const t = state.transactions.find(tx => tx.id === id);
    if(!t) return;
    document.getElementById('tx-edit-id').value = t.id;
    document.getElementById('tx-date').value = t.date.split('T')[0];
    document.getElementById('tx-desc').value = t.desc;
    document.getElementById('tx-amount').value = t.amount;
    
    // Kategorileri yükle ve seç
    populateTxModalCategories(t.type);
    document.getElementById('tx-category-select').value = t.desc;
    
    document.getElementById('modal-transaction').style.display = 'flex';
};

window.deleteInstallmentPlan = function(id) {
    state.installments = state.installments.filter(i => i.id !== id);
    DB.set('installments', state.installments);
    renderApp();
};

window.deleteFixedContract = function(id) {
    state.fixedContracts = state.fixedContracts.filter(c => c.id !== id);
    DB.set('fixedContracts', state.fixedContracts);
    renderApp();
};

window.editFixedContract = function(id) {
    const c = state.fixedContracts.find(item => item.id === id);
    if(!c) return;
    document.getElementById('fixed-edit-id').value = c.id;
    document.getElementById('fixed-type').value = c.type;
    document.getElementById('fixed-name').value = c.name;
    document.getElementById('fixed-amount').value = c.amount;
    document.getElementById('fixed-start-month').value = c.startM;
    document.getElementById('fixed-start-year').value = c.startY;
    document.getElementById('fixed-duration').value = c.duration;
    
    document.getElementById('fixed-edit-modification-zone').style.display = 'block';
    document.getElementById('fixed-checkbox-modify').checked = c.modified || false;
    
    if(c.modified) {
        document.getElementById('fixed-modification-subform').style.display = 'block';
        document.getElementById('fixed-new-amount').value = c.newAmount;
        document.getElementById('fixed-mod-month').value = c.modMonth;
        document.getElementById('fixed-mod-year').value = c.modYear;
        document.getElementById('fixed-mod-duration').value = c.modDuration;
    } else {
        document.getElementById('fixed-modification-subform').style.display = 'none';
    }
    
    document.getElementById('modal-fixed').style.display = 'flex';
};

window.deleteCategory = function(type, index) {
    state.categories[type].splice(index, 1);
    DB.set('categories', state.categories);
    renderSettingsCategories();
};

function populateTxModalCategories(type) {
    const select = document.getElementById('tx-category-select');
    select.innerHTML = '';
    state.categories[type].forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        select.appendChild(opt);
    });
}

// OLAY DİNLEYİCİLERİ (EVENT LISTENERS) BAĞLAMA ÇARKSI
document.addEventListener('DOMContentLoaded', () => {
    initYearsSelector();

    // Global Tarih Seçim Değişiklik Tetikleyicileri
    document.getElementById('global-month-select').addEventListener('change', (e) => {
        state.selectedMonth = parseInt(e.target.value);
        renderApp();
    });
    document.getElementById('global-year-select').addEventListener('change', (e) => {
        state.selectedYear = parseInt(e.target.value);
        renderApp();
    });

    // Menü ve Sidebar Kontrolleri
    document.getElementById('open-sidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('sidebar-overlay').style.display = 'block';
    });
    const closeSidebar = () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').style.display = 'none';
    };
    document.getElementById('close-sidebar').addEventListener('click', closeSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // Navigasyon Yönlendirme Bağlamaları
    document.querySelectorAll('[data-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            closeSidebar();
            navigateTo(target);
        });
    });

    // İşlemler Sekme Buton Değişimi
    document.querySelectorAll('.tx-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tx-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeTxTab = btn.getAttribute('data-tab');
            renderTransactionList();
        });
    });

    // Modal Kapatma Ortak Kuralı
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById(btn.getAttribute('data-close')).style.display = 'none';
        });
    });

    // İŞLEM EKLEME MODAL TETİKLEME
    document.getElementById('btn-open-tx-modal').addEventListener('click', () => {
        document.getElementById('tx-edit-id').value = '';
        document.getElementById('form-transaction').reset();
        populateTxModalCategories(state.activeTxTab);
        document.getElementById('tx-modal-title').innerText = "Yeni " + (state.activeTxTab==='income'?'Gelir':(state.activeTxTab==='expense'?'Gider':'Yatırım')) + " Kaydı";
        document.getElementById('modal-transaction').style.display = 'flex';
    });

    // İŞLEM KAYDETME POST FORMU
    document.getElementById('form-transaction').addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('tx-edit-id').value;
        const amt = parseFloat(document.getElementById('tx-amount').value);
        const dVal = document.getElementById('tx-date').value;
        const descVal = document.getElementById('tx-category-select').value;
        const customNote = document.getElementById('tx-desc').value;

        if(editId) {
            // Düzenleme mantığı
            state.transactions = state.transactions.map(t => {
                if(t.id == editId) {
                    t.amount = amt; t.date = new Date(dVal).toISOString(); t.desc = descVal;
                }
                return t;
            });
        } else {
            // Sıfırdan ekleme mantığı
            state.transactions.push({
                id: Date.now(),
                type: state.activeTxTab,
                desc: descVal + ` (${customNote})`,
                amount: amt,
                date: new Date(dVal).toISOString()
            });
        }
        DB.set('transactions', state.transactions);
        document.getElementById('modal-transaction').style.display = 'none';
        renderApp();
    });

    // KASA MODAL BUTONLARI TETİKLEYİCİSİ
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const act = btn.getAttribute('data-action');
            document.getElementById('kasa-action-type').value = act;
            document.getElementById('kasa-modal-title').innerText = act === 'giris' ? 'Kasaya Doğrudan Nakit Girişi' : 'Kasadan Doğrudan Nakit Çıkışı';
            document.getElementById('form-kasa-action').reset();
            document.getElementById('modal-kasa-action').style.display = 'flex';
        });
    });

    // KASA FORM KAYDI
    document.getElementById('form-kasa-action').addEventListener('submit', (e) => {
        e.preventDefault();
        const type = document.getElementById('kasa-action-type').value;
        const amt = parseFloat(document.getElementById('kasa-action-amount').value);
        const dt = document.getElementById('kasa-action-date').value;

        state.kasaAdjustments.push({
            id: Date.now(), type, amount: amt, date: new Date(dt).toISOString()
        });
        DB.set('kasaAdjustments', state.kasaAdjustments);
        document.getElementById('modal-kasa-action').style.display = 'none';
        renderApp();
    });

    // TAKSİT MODAL AÇILIŞI
    document.getElementById('btn-open-ins-modal').addEventListener('click', () => {
        document.getElementById('form-installment').reset();
        document.getElementById('modal-installment').style.display = 'flex';
    });
    document.getElementById('ins-type').addEventListener('change', (e) => {
        if(e.target.value === 'cc') {
            document.getElementById('group-ins-statement-day').style.display = 'block';
            document.getElementById('group-ins-first-date').style.display = 'none';
        } else {
            document.getElementById('group-ins-statement-day').style.display = 'none';
            document.getElementById('group-ins-first-date').style.display = 'block';
        }
    });

    // TAKSİT ÖTELEME HESAPLAMA MOTORU VE FORM POSTU
    document.getElementById('form-installment').addEventListener('submit', (e) => {
        e.preventDefault();
        const type = document.getElementById('ins-type').value;
        const totalAmt = parseFloat(document.getElementById('ins-total-amount').value);
        const count = parseInt(document.getElementById('ins-count').value);
        const txDate = new Date(document.getElementById('ins-date').value);
        const desc = document.getElementById('ins-desc').value;

        const eachMonthInstallmentAmount = totalAmt / count;
        let schedule = [];

        let startM = txDate.getMonth() + 1;
        let startY = txDate.getFullYear();

        if(type === 'cc') {
            // Kredi Kartı Taksit Öteleme Mantık Algoritması
            const statementDay = parseInt(document.getElementById('ins-statement-day').value);
            const txDay = txDate.getDate();
            // Hesap kesiminden sonraki tarihte ise ilk taksit sonraki ay başlar
            if(txDay > statementDay) {
                startM++;
                if(startM > 12) { startM = 1; startY++; }
            }
        } else {
            // Kredi veya Nakit Avans Mantığı (İlk Taksit Tarihi Baz Alınır)
            const fDate = new Date(document.getElementById('ins-first-date').value);
            startM = fDate.getMonth() + 1;
            startY = fDate.getFullYear();
        }

        // Taksitleri aylara otomatik dağıtan döngü çarkı
        for(let i = 1; i <= count; i++) {
            schedule.push({ index: i, m: startM, y: startY, amount: eachMonthInstallmentAmount });
            startM++;
            if(startM > 12) { startM = 1; startY++; }
        }

        state.installments.push({ id: Date.now(), type, desc, count, schedule });
        DB.set('installments', state.installments);
        document.getElementById('modal-installment').style.display = 'none';
        renderApp();
    });

    // SABİT GİDER SÖZLEŞME MODAL TETİKLEMESİ
    document.getElementById('btn-open-fixed-modal').addEventListener('click', () => {
        document.getElementById('fixed-edit-id').value = '';
        document.getElementById('fixed-edit-modification-zone').style.display = 'none';
        document.getElementById('fixed-modification-subform').style.display = 'none';
        document.getElementById('form-fixed').reset();
        document.getElementById('modal-fixed').style.display = 'flex';
    });
    document.getElementById('fixed-checkbox-modify').addEventListener('change', (e) => {
        document.getElementById('fixed-modification-subform').style.display = e.target.checked ? 'block' : 'none';
    });

    // SABİT GİDER FORMU SÖZLEŞME KAYDI
    document.getElementById('form-fixed').addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('fixed-edit-id').value;
        const type = document.getElementById('fixed-type').value;
        const name = document.getElementById('fixed-name').value;
        const amt = parseFloat(document.getElementById('fixed-amount').value);
        const sM = parseInt(document.getElementById('fixed-start-month').value);
        const sY = parseInt(document.getElementById('fixed-start-year').value);
        const duration = parseInt(document.getElementById('fixed-duration').value);

        let contractObj = {
            id: editId ? parseInt(editId) : Date.now(),
            type, name, amount: amt, startM: sM, startY: sY, duration
        };

        // Modifikasyon checkbox işaretli ise gelecek parametrelerini entegre et
        if(editId && document.getElementById('fixed-checkbox-modify').checked) {
            contractObj.modified = true;
            contractObj.newAmount = parseFloat(document.getElementById('fixed-new-amount').value);
            contractObj.modMonth = parseInt(document.getElementById('fixed-mod-month').value);
            contractObj.modYear = parseInt(document.getElementById('fixed-mod-year').value);
            contractObj.modDuration = parseInt(document.getElementById('fixed-mod-duration').value);
            contractObj.modTotalMonths = (contractObj.modYear * 12) + contractObj.modMonth;
        }

        if(editId) {
            state.fixedContracts = state.fixedContracts.map(c => c.id === contractObj.id ? contractObj : c);
        } else {
            state.fixedContracts.push(contractObj);
        }

        DB.set('fixedContracts', state.fixedContracts);
        document.getElementById('modal-fixed').style.display = 'none';
        renderApp();
    });

    // AYARLAR HEDEF BUTONU KAYDI
    document.getElementById('btn-save-goal').addEventListener('click', () => {
        const goal = parseFloat(document.getElementById('settings-goal-input').value);
        if(!isNaN(goal)) {
            state.targetGoal = goal;
            DB.set('targetGoal', goal);
            alert("Hedef kasa tutarı başarıyla güncellendi.");
            renderApp();
        }
    });

    // AYARLAR KATEGORİ SEÇİM DEĞİŞİMİ VE EKLEME EYLEMİ
    document.getElementById('settings-cat-type').addEventListener('change', renderSettingsCategories);
    document.getElementById('btn-add-category').addEventListener('click', () => {
        const type = document.getElementById('settings-cat-type').value;
        const name = document.getElementById('settings-cat-name').value.trim();
        if(name) {
            state.categories[type].push(name);
            DB.set('categories', state.categories);
            document.getElementById('settings-cat-name').value = '';
            renderSettingsCategories();
        }
    });

    // GÖRSEL TEMA VE RENK PALETİ SEÇİM MERKEZİ
    document.querySelectorAll('.color-dot').forEach(dot => {
        dot.addEventListener('click', () => {
            const clr = dot.getAttribute('data-color');
            document.body.className = document.body.className.replace(/theme-\w+/, 'theme-' + clr);
        });
    });

    // GÜNDÜZ/GECE MODU DEĞİŞİM BUTONU
    document.getElementById('btn-toggle-display-mode').addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
    });

    // Projeyi ilk kez aya kaldır
    renderApp();
});
