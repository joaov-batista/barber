// client.js
import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================
// STATE
// ============================
let currentUser = null;
let currentUserData = null;
let allServices = [];
let bookingState = {
  service: null,
  date: null,
  slot: null,
  coupon: null,
  discount: 0
};
let calendarDate = new Date();
let takenSlots = [];
let hoursConfig = null;
let blockedDates = [];
let publicCoupons = [];

// ============================
// INIT
// ============================
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      checkAuth();
    }, 500);
  }, 1800);
  setupAuthTabs();
  setupApptTabs();
});

function checkAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await loadUserData(user);
      showApp();
    } else {
      showAuthScreen();
    }
  });
}

async function loadUserData(user) {
  if (user.isAnonymous) {
    currentUserData = { name: 'Visitante', phone: '', email: '' };
    return;
  }
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    currentUserData = snap.data();
  } else {
    currentUserData = { name: user.email?.split('@')[0] || 'Usuário', phone: '', email: user.email };
  }
}

// ============================
// AUTH
// ============================
function setupAuthTabs() {
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
      document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
    });
  });
}

window.loginUser = async () => {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  if (!email || !pass) return showToast('Preencha e-mail e senha', 'error');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    showToast('E-mail ou senha incorretos', 'error');
  }
};

window.registerUser = async () => {
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;
  if (!name || !email || !pass) return showToast('Preencha todos os campos', 'error');
  if (pass.length < 6) return showToast('Senha muito curta (mín. 6 caracteres)', 'error');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), { name, phone, email, createdAt: new Date().toISOString() });
  } catch (e) {
    showToast('Erro ao criar conta: ' + e.message, 'error');
  }
};

window.loginAnon = async () => {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    showToast('Erro ao entrar', 'error');
  }
};

window.logoutUser = async () => {
  await signOut(auth);
};

// ============================
// SHOW APP
// ============================
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('client-app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('client-app').classList.remove('hidden');
  initApp();
}

async function initApp() {
  document.getElementById('hero-greeting').textContent = `Olá, ${currentUserData?.name?.split(' ')[0] || 'visitante'}! 👋`;
  await loadHoursConfig();
  await loadServices();
  await loadPublicCoupons();
  loadHomeAppointments();
  showSection('home');
}

// ============================
// HOURS CONFIG
// ============================
async function loadHoursConfig() {
  const ref = doc(db, 'config', 'hours');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    hoursConfig = snap.data();
  } else {
    hoursConfig = {
      days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
      openTime: '08:00', closeTime: '20:00', slotDuration: 45
    };
  }

  const blockedRef = collection(db, 'blockedDates');
  const bSnap = await getDocs(blockedRef);
  blockedDates = bSnap.docs.map(d => d.data().date);

  renderHoursDisplay();
}

function renderHoursDisplay() {
  const el = document.getElementById('hours-display');
  if (!el || !hoursConfig) return;
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const today = new Date().getDay();
  el.innerHTML = dayNames.map((d, i) => {
    const open = hoursConfig.days[i];
    const isToday = i === today;
    return `<div class="day-row ${isToday ? 'day-today' : ''}">
      <span class="day-name">${d}${isToday ? ' (hoje)' : ''}</span>
      ${open
        ? `<span class="day-hours">${hoursConfig.openTime} – ${hoursConfig.closeTime}</span>`
        : '<span class="day-closed">Fechado</span>'}
    </div>`;
  }).join('');
}

// ============================
// SERVICES
// ============================
async function loadServices() {
  const snap = await getDocs(collection(db, 'services'));
  if (snap.empty) {
    // seed default
    const defaults = [
      { name: 'Corte de Cabelo', desc: 'Corte personalizado com as últimas tendências', price: 50, duration: 45, icon: 'fa-cut', active: true },
      { name: 'Barba', desc: 'Modelagem completa da barba', price: 35, duration: 30, icon: 'fa-user-tie', active: true },
      { name: 'Corte + Barba', desc: 'Combo completo corte e barba', price: 75, duration: 70, icon: 'fa-scissors', active: true },
      { name: 'Acabamento', desc: 'Acabamento na nuca e lateral', price: 25, duration: 20, icon: 'fa-magic', active: true },
    ];
    for (const svc of defaults) await addDoc(collection(db, 'services'), svc);
    allServices = defaults.map((s, i) => ({ id: i, ...s }));
  } else {
    allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  renderServicesHome();
  renderServicesList();
  renderPrices();
}

function renderServicesHome() {
  const el = document.getElementById('services-home');
  if (!el) return;
  el.innerHTML = allServices.filter(s => s.active).slice(0, 4).map(s => `
    <div class="service-card" onclick="showSection('agendar'); selectService('${s.id}')">
      <div class="svc-icon"><i class="fas ${s.icon || 'fa-cut'}"></i></div>
      <div class="svc-name">${s.name}</div>
      <div class="svc-price">R$ ${Number(s.price).toFixed(2)}</div>
      <div class="svc-dur"><i class="fas fa-clock"></i> ${s.duration} min</div>
    </div>
  `).join('');
}

function renderServicesList() {
  const el = document.getElementById('services-list');
  if (!el) return;
  el.innerHTML = allServices.filter(s => s.active).map(s => `
    <div class="service-option" id="sopt-${s.id}" onclick="selectService('${s.id}')">
      <div class="so-icon"><i class="fas ${s.icon || 'fa-cut'}"></i></div>
      <div class="so-info">
        <div class="so-name">${s.name}</div>
        <div class="so-dur">${s.duration} min</div>
      </div>
      <div class="so-price">R$ ${Number(s.price).toFixed(2)}</div>
    </div>
  `).join('');
}

function renderPrices() {
  const el = document.getElementById('prices-list');
  if (!el) return;
  el.innerHTML = allServices.filter(s => s.active).map(s => `
    <div class="price-card">
      <div class="price-icon"><i class="fas ${s.icon || 'fa-cut'}"></i></div>
      <div class="price-info">
        <div class="price-name">${s.name}</div>
        <div class="price-desc">${s.desc}</div>
        <div class="price-dur"><i class="fas fa-clock"></i> ${s.duration} min</div>
      </div>
      <div class="price-val">R$&nbsp;${Number(s.price).toFixed(2)}</div>
    </div>
  `).join('');
  renderPromos();
}

async function loadPublicCoupons() {
  const snap = await getDocs(query(collection(db, 'coupons'), where('active', '==', true)));
  publicCoupons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderPromos() {
  const el = document.getElementById('promo-banner');
  if (!el) return;
  const active = publicCoupons.filter(c => {
    if (c.expiresAt && new Date(c.expiresAt) < new Date()) return false;
    return true;
  });
  if (!active.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <h4><i class="fas fa-tag"></i> Cupons de desconto disponíveis</h4>
    <p>Use um dos cupons abaixo ao agendar e economize!</p>
    <div class="coupon-chips">
      ${active.map(c => `<div class="coupon-chip">${c.code} — ${c.discount}% OFF</div>`).join('')}
    </div>
  `;
}

// ============================
// BOOKING
// ============================
window.selectService = (id) => {
  bookingState.service = allServices.find(s => String(s.id) === String(id));
  document.querySelectorAll('.service-option').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById(`sopt-${id}`);
  if (el) el.classList.add('selected');
  updateSummary();
  renderCalendar();
};

function renderCalendar() {
  const el = document.getElementById('mini-calendar');
  if (!el) return;
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const today = new Date(); today.setHours(0,0,0,0);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let days = '';
  for (let i = 0; i < firstDay; i++) days += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const isPast = date < today;
    const isClosed = !hoursConfig?.days[date.getDay()];
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isBlocked = blockedDates.includes(dateStr);
    const isToday = date.getTime() === today.getTime();
    const isSelected = bookingState.date === dateStr;
    const disabled = isPast || isClosed || isBlocked;
    days += `<div class="cal-day ${disabled ? 'disabled' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}"
      onclick="${!disabled ? `selectDate('${dateStr}')` : ''}">${d}</div>`;
  }

  el.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" onclick="prevMonth()"><i class="fas fa-chevron-left"></i></button>
      <span class="cal-month">${months[month]} ${year}</span>
      <button class="cal-nav" onclick="nextMonth()"><i class="fas fa-chevron-right"></i></button>
    </div>
    <div class="cal-grid">
      <div class="cal-weekdays">
        ${['D','S','T','Q','Q','S','S'].map(d => `<div class="cal-wd">${d}</div>`).join('')}
      </div>
      <div class="cal-days">${days}</div>
    </div>
  `;
}

window.prevMonth = () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); };
window.nextMonth = () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); };

window.selectDate = async (dateStr) => {
  bookingState.date = dateStr;
  bookingState.slot = null;
  renderCalendar();
  await loadTimeSlots(dateStr);
  updateSummary();
};

async function loadTimeSlots(dateStr) {
  const el = document.getElementById('time-slots');
  if (!el || !hoursConfig) return;
  el.innerHTML = '<div style="color:var(--text3);font-size:13px;">Carregando horários...</div>';

  // Load taken slots for that date
  const q = query(collection(db, 'appointments'), where('date', '==', dateStr), where('status', 'in', ['pending','confirmed']));
  const snap = await getDocs(q);
  takenSlots = snap.docs.map(d => d.data().time);

  // Generate slots
  const [openH, openM] = hoursConfig.openTime.split(':').map(Number);
  const [closeH, closeM] = hoursConfig.closeTime.split(':').map(Number);
  const slots = [];
  let cur = openH * 60 + openM;
  const end = closeH * 60 + closeM;
  while (cur + (hoursConfig.slotDuration || 45) <= end) {
    const h = Math.floor(cur / 60);
    const m = cur % 60;
    slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    cur += hoursConfig.slotDuration || 45;
  }

  if (!slots.length) { el.innerHTML = '<div style="color:var(--text3)">Nenhum horário disponível</div>'; return; }

  el.innerHTML = slots.map(s => `
    <div class="slot ${takenSlots.includes(s) ? 'taken' : ''} ${bookingState.slot === s ? 'selected' : ''}"
      onclick="${!takenSlots.includes(s) ? `selectSlot('${s}')` : ''}">${s}</div>
  `).join('');
}

window.selectSlot = (s) => {
  bookingState.slot = s;
  document.querySelectorAll('.slot').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.slot').forEach(el => { if (el.textContent === s) el.classList.add('selected'); });
  updateSummary();
};

window.applyCoupon = async () => {
  const code = document.getElementById('coupon-input').value.trim().toUpperCase();
  const msg = document.getElementById('coupon-msg');
  if (!code) return;

  const q = query(collection(db, 'coupons'), where('code', '==', code), where('active', '==', true));
  const snap = await getDocs(q);
  if (snap.empty) {
    msg.textContent = 'Cupom inválido ou expirado.';
    msg.className = 'error';
    bookingState.coupon = null;
    bookingState.discount = 0;
  } else {
    const cpn = snap.docs[0].data();
    if (cpn.expiresAt && new Date(cpn.expiresAt) < new Date()) {
      msg.textContent = 'Este cupom expirou.';
      msg.className = 'error';
      bookingState.coupon = null;
      bookingState.discount = 0;
    } else {
      bookingState.coupon = { id: snap.docs[0].id, ...cpn };
      bookingState.discount = cpn.discount;
      msg.textContent = `✅ Cupom aplicado: ${cpn.discount}% de desconto!`;
      msg.className = 'success';
    }
  }
  updateSummary();
};

function updateSummary() {
  const el = document.getElementById('summary-content');
  const { service, date, slot, coupon, discount } = bookingState;
  if (!el) return;
  if (!service && !date && !slot) { el.innerHTML = '<p style="color:var(--text3);font-size:13px;">Preencha os campos acima para ver o resumo.</p>'; return; }
  const price = service ? Number(service.price) : 0;
  const disc = coupon ? (price * discount / 100) : 0;
  const total = price - disc;
  el.innerHTML = `
    ${service ? `<div class="summary-row"><span class="summary-label">Serviço</span><span>${service.name}</span></div>` : ''}
    ${date ? `<div class="summary-row"><span class="summary-label">Data</span><span>${formatDate(date)}</span></div>` : ''}
    ${slot ? `<div class="summary-row"><span class="summary-label">Horário</span><span>${slot}</span></div>` : ''}
    ${service ? `<div class="summary-row"><span class="summary-label">Valor</span><span>R$ ${price.toFixed(2)}</span></div>` : ''}
    ${coupon ? `<div class="summary-row"><span class="summary-label" style="color:var(--green)">Desconto (${discount}%)</span><span style="color:var(--green)">- R$ ${disc.toFixed(2)}</span></div>` : ''}
    ${service ? `<div class="summary-row total"><span>Total</span><span>R$ ${total.toFixed(2)}</span></div>` : ''}
  `;
}

window.confirmBooking = async () => {
  if (currentUser?.isAnonymous) return showToast('Crie uma conta para agendar!', 'error');
  const { service, date, slot } = bookingState;
  if (!service) return showToast('Selecione um serviço', 'error');
  if (!date) return showToast('Selecione uma data', 'error');
  if (!slot) return showToast('Selecione um horário', 'error');

  const street = document.getElementById('addr-street').value.trim();
  const bairro = document.getElementById('addr-bairro').value.trim();
  if (!street || !bairro) return showToast('Preencha o endereço', 'error');

  const price = Number(service.price);
  const disc = bookingState.coupon ? (price * bookingState.discount / 100) : 0;
  const total = price - disc;

  try {
    await addDoc(collection(db, 'appointments'), {
      userId: currentUser.uid,
      userName: currentUserData?.name || 'Usuário',
      userPhone: currentUserData?.phone || '',
      serviceId: service.id,
      serviceName: service.name,
      date, time: slot,
      address: `${street}, ${bairro}${document.getElementById('addr-comp').value ? ', ' + document.getElementById('addr-comp').value : ''}`,
      originalPrice: price,
      discount: disc,
      total,
      coupon: bookingState.coupon?.code || null,
      status: 'pending',
      createdAt: new Date().toISOString()
    });

    // Reset booking
    bookingState = { service: null, date: null, slot: null, coupon: null, discount: 0 };
    updateSummary();

    document.getElementById('success-text').textContent = `${service.name} agendado para ${formatDate(date)} às ${slot}. Aguarde a confirmação do barbeiro!`;
    document.getElementById('success-modal').classList.remove('hidden');
  } catch (e) {
    showToast('Erro ao agendar: ' + e.message, 'error');
  }
};

// ============================
// HOME APPOINTMENTS
// ============================
function loadHomeAppointments() {
  if (!currentUser || currentUser.isAnonymous) {
    document.getElementById('home-appts').innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>Entre com sua conta para ver seus agendamentos</p></div>';
    return;
  }
  const q = query(collection(db, 'appointments'), where('userId', '==', currentUser.uid), where('status', 'in', ['pending','confirmed']), orderBy('date'));
  onSnapshot(q, (snap) => {
    const el = document.getElementById('home-appts');
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-plus"></i><p>Nenhum agendamento próximo</p></div>'; return; }
    el.innerHTML = snap.docs.slice(0, 2).map(d => {
      const a = d.data();
      const [y,m,day] = a.date.split('-');
      const months = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
      return `<div class="appt-mini-card">
        <div class="appt-date-box"><div class="adb-day">${day}</div><div class="adb-mon">${months[parseInt(m)-1]}</div></div>
        <div class="appt-info"><div class="ai-service">${a.serviceName}</div><div class="ai-time">${a.time} — ${a.address?.split(',')[0]}</div></div>
        <span class="status-badge status-${a.status}">${statusLabel(a.status)}</span>
      </div>`;
    }).join('');
  });
}

// ============================
// APPOINTMENTS LIST
// ============================
function setupApptTabs() {
  document.querySelectorAll('.appt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.appt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadApptsList(btn.dataset.filter);
    });
  });
}

function loadApptsList(filter = 'upcoming') {
  if (!currentUser || currentUser.isAnonymous) {
    document.getElementById('appts-list').innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>Entre com sua conta para ver seus agendamentos</p></div>';
    return;
  }
  const statuses = filter === 'upcoming' ? ['pending','confirmed'] : ['done','cancelled'];
  const q = query(collection(db, 'appointments'), where('userId', '==', currentUser.uid), where('status', 'in', statuses), orderBy('date', filter === 'upcoming' ? 'asc' : 'desc'));
  onSnapshot(q, (snap) => {
    const el = document.getElementById('appts-list');
    if (snap.empty) { el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-check"></i><p>Nenhum agendamento aqui</p></div>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const a = { id: d.id, ...d.data() };
      return `<div class="appt-card">
        <div class="appt-card-header">
          <div>
            <div class="appt-service-name">${a.serviceName}</div>
            <div class="appt-datetime"><i class="fas fa-calendar"></i> ${formatDate(a.date)} às ${a.time}</div>
          </div>
          <span class="status-badge status-${a.status}">${statusLabel(a.status)}</span>
        </div>
        <div class="appt-meta">
          <div><i class="fas fa-map-marker-alt"></i>${a.address}</div>
        </div>
        <div class="appt-footer">
          <div class="appt-price">R$ ${Number(a.total).toFixed(2)}</div>
          ${a.status === 'pending' ? `<button class="btn-cancel" onclick="cancelAppt('${a.id}')">Cancelar</button>` : ''}
        </div>
      </div>`;
    }).join('');
  });
}

window.cancelAppt = async (id) => {
  if (!confirm('Deseja cancelar este agendamento?')) return;
  await updateDoc(doc(db, 'appointments', id), { status: 'cancelled' });
  showToast('Agendamento cancelado');
};

// ============================
// NAVIGATION
// ============================
window.showSection = (name) => {
  document.querySelectorAll('.client-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`sec-${name}`)?.classList.add('active');
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.bnav-btn[data-section="${name}"]`)?.classList.add('active');

  if (name === 'agendamentos') loadApptsList('upcoming');
  if (name === 'agendar') { renderServicesList(); renderCalendar(); updateSummary(); }
};

window.closeModal = () => {
  document.getElementById('success-modal').classList.add('hidden');
  showSection('agendamentos');
};

// ============================
// UTILS
// ============================
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return `${parseInt(d)} de ${months[parseInt(m)-1]}`;
}

function statusLabel(s) {
  return { pending: 'Pendente', confirmed: 'Confirmado', done: 'Finalizado', cancelled: 'Cancelado' }[s] || s;
}

window.showToast = (msg, type = '') => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
};
