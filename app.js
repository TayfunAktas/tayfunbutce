// Servis Worker Kaydı (PWA kurulumu için gereklidir)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker başarıyla kaydedildi.', reg))
            .catch(err => console.log('Service Worker hatası:', err));
    });
}

// Global Değişkenler ve LocalStorage'dan verileri çekme
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];

// DOM Elementleri
const list = document.getElementById('transaction-list');
const netBalanceEl = document.getElementById('net-balance');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const monthSelect = document.getElementById('month-select');
const yearSelect = document.getElementById('year-select');

// Modal Elementleri
const modal = document.getElementById('add-modal');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal');
const form = document.getElementById('transaction-form');

// Modalı Aç / Kapat İşlevleri
openModalBtn.addEventListener('click', () => modal.classList.add('active'));
closeModalBtn.addEventListener('click', () => modal.classList.remove('active'));

// 2026'dan 2040'a kadar Yıl Seçeneklerini Oluşturma İşlevi
function initDateSelects() {
    yearSelect.innerHTML = ''; // İçini temizle
    for (let i = 2026; i <= 2040; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        yearSelect.appendChild(option);
    }
    
    // Uygulama ilk açıldığında seçili olacak tarih mantığı
    const today = new Date();
    // Ayı o anki aya ayarla (JS aylar 0'dan başlar, biz 1 ekliyoruz)
    monthSelect.value = today.getMonth() + 1;
    
    // Geçerli yıl 2026 ile 2040 arasındaysa onu seç, değilse varsayılan olarak 2026 kalsın
    let currentYear = today.getFullYear();
    yearSelect.value = (currentYear >= 2026 && currentYear <= 2040) ? currentYear : 2026;
}

// Türk Lirası Formatlama Mantığı (İstenilen 1.000.000,00 TL formatı için)
function formatCurrency(amount) {
    // Sayıyı pozitife çevirip formatlıyoruz (Eksiyi duruma göre manuel ekliyoruz)
    const absAmount = Math.abs(amount);
    const formatted = new Intl.NumberFormat('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(absAmount);
    
    return formatted + ' TL';
}

// Arayüzü Güncelleme (Filtreleme ve Hesaplamalar)
function updateUI() {
    const selectedMonth = parseInt(monthSelect.value);
    const selectedYear = parseInt(yearSelect.value);

    // Tüm işlemleri seçilen ay ve yıla göre filtrele
    const filteredTransactions = transactions.filter(t => {
        const date = new Date(t.date);
        return (date.getMonth() + 1) === selectedMonth && date.getFullYear() === selectedYear;
    });

    list.innerHTML = '';
    let income = 0;
    let expense = 0;

    // Listeyi döngüye alıp ekrana basma
    filteredTransactions.forEach(t => {
        if (t.type === 'income') {
            income += t.amount;
        } else {
            expense += t.amount;
        }

        const li = document.createElement('li');
        li.className = 'transaction-item';
        
        // İşlem türüne göre renk ve işaret ataması
        const isIncome = t.type === 'income';
        const amountClass = isIncome ? 'text-green' : 'text-white'; // Giderler tasarımda beyaz
        const sign = isIncome ? '+' : '-';
        // İkonu açıklamaya göre dinamikleştirebiliriz, şimdilik sabit cüzdan/fatura ikonu
        const iconClass = isIncome ? 'fa-solid fa-wallet' : 'fa-solid fa-file-invoice-dollar';

        // Tarih formatlama (Örn: 24 May • 10:45)
        const dateObj = new Date(t.date);
        const dateStr = dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
        
        li.innerHTML = `
            <div class="t-left">
                <div class="t-icon">
                    <i class="${iconClass}"></i>
                </div>
                <div class="t-details">
                    <h4>${t.desc}</h4>
                    <p>${dateStr}</p>
                </div>
            </div>
            <div class="t-right">
                <span class="t-amount ${amountClass}">${sign}${formatCurrency(t.amount)}</span>
                <button class="del-btn" onclick="deleteTransaction(${t.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        list.appendChild(li);
    });

    // Net bakiye hesaplaması
    const netBalance = income - expense;

    // Özet kutularına verileri yazdırma
    totalIncomeEl.innerText = formatCurrency(income);
    totalExpenseEl.innerText = formatCurrency(expense);

    // Eksi durumlarda ana bakiye formatına eksi (-) işaretini manuel ekleyelim
    const balancePrefix = netBalance < 0 ? '-' : '';
    netBalanceEl.innerText = balancePrefix + formatCurrency(netBalance);

    // Net Bakiye Renk Mantığı (Talebe istinaden: Eksi ise kırmızı, artı ise yeşil)
    if (netBalance < 0) {
        netBalanceEl.className = 'text-red';
    } else {
        netBalanceEl.className = 'text-green';
    }

    // Verileri tarayıcı hafızasına kaydet
    localStorage.setItem('transactions', JSON.stringify(transactions));
}

// Form Gönderimi (Yeni kayıt ekleme)
form.addEventListener('submit', (e) => {
    e.preventDefault(); // Sayfa yenilenmesini engelle
    
    const desc = document.getElementById('desc').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const type = document.querySelector('input[name="type"]:checked').value;
    
    if (!desc || isNaN(amount)) return;

    // Kayıt için seçili filtre tarihlerini baz alarak tarih oluştur
    const selectedMonth = parseInt(monthSelect.value);
    const selectedYear = parseInt(yearSelect.value);
    let day = new Date().getDate(); 
    
    // İşlem objesi
    const transaction = {
        id: Date.now(), // Benzersiz ID
        desc,
        amount,
        type,
        date: new Date(selectedYear, selectedMonth - 1, day).toISOString()
    };

    transactions.push(transaction); // Diziye ekle
    updateUI(); // Ekranı yenile
    
    // Formu temizle ve modalı kapat
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    modal.classList.remove('active');
});

// Kayıt Silme İşlevi
window.deleteTransaction = function(id) {
    transactions = transactions.filter(t => t.id !== id);
    updateUI();
};

// Açılır menüler (Ay ve Yıl) değiştiğinde ekranı güncelle
monthSelect.addEventListener('change', updateUI);
yearSelect.addEventListener('change', updateUI);

// Sayfa yüklendiğinde çalışacak fonksiyonlar
initDateSelects();
updateUI();