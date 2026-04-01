// admin.js
import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================
// STATE
// ============================
const ADMIN_EMAIL = 'admin@limasbarbershop.com';
let allAppointments = [];
let allClients = [];
let allServices = [];

// ============================
// INIT
// ============================
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('header-date').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  onAuthStateChanged(auth, user => {
    if (user && user.email === ADMIN_EMAIL) {
      showAdminApp();
    } else if (user) {
      showToast('Acesso não autorizado', 'error');
      signOut(auth);
    }
  });
});

// ============================
// AUTH
// ============================
window.adminLogin = async () => {
  const email = document.getElementById('adm-email').value.trim();
  const pass = document.getElementById('adm-pass').value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    // Try to create admin if first time
    if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
      try {
        const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
        await createUserWithEmailAndPassword(auth, email, pass);
        await seedDefaultData();
      } catch (e2) {
        showToast('Erro ao fazer login: ' + e2.message, 'error');
      }
    } else {
      showToast('Credenciais incorretas', 'error');
    }
  }
};

window.adminLogout = async () => {
  await signOut(auth);
  document.getElementById('admin-app').classList.add('hidden');
  document.getElementById('admin-login').classList.remove('hidden');
};

function showAdminApp() {
  document.getElementById('admin-login').classList.add('hidden');
  document.getElementById('admin-app').classList.remove('hidden');
  loadDashboard();
  loadAppointments();
  loadServices();
  loadHoursConfig();
  loadClients();
  loadCoupons();
  loadConfig();
}

// ============================
// SEED DEFAULT DATA
// ============================
async function seedDefaultData() {
  // Services
  const defaultServices = [
    { name: 'Corte de Cabelo', desc: 'Corte personalizado nas últimas tendências', price: 50, duration: 45, icon: 'fa-cut', active: true },
    { name: 'Barba', desc: 'Modelagem completa da barba', price: 35, duration: 30, icon: 'fa-user-tie', active: true },
    { name: 'Corte + Barba', desc: 'Combo completo corte e barba', price: 75, duration: 70, icon: 'fa-scissors', active: true },
    { name: 'Acabamento', desc: 'Acabamento na nuca e lateral', price: 25, duration: 20, icon: 'fa-magic', active: true },
  ];
  for (const s of defaultServices) await addDoc(collection(db, 'services'), s);

  // Hours config
  await setDoc(doc(db, 'config', 'hours'), {
    days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: true, 6: true },
    openTime: '08:00', closeTime: '20:00', slotDuration: 45
  });

  // Config
  await setDoc(doc(db, 'config', 'shop'), {
    name: 'Limas Barbershop', phone: '71 99999-0000',
    address: 'Salvador, BA', about: 'A melhor barbearia em domicílio de Salvador.',
    fee: 10, freeFrom: 80
  });

  // Coupon
  await addDoc(collection(db, 'coupons'), {
    code: 'BEMVINDO10', discount: 10,
    expiresAt: null, maxUses: 100, usedCount: 0, active: true,
    createdAt: new Date().toISOString()
  });

  showToast('Dados iniciais criados!');
}

// ============================
// DASHBOARD
// ============================
function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekStartStr = weekStart.toISOString().split('T')[0];

  onSnapshot(collection(db, 'appointments'), (snap) => {
    const appts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const todayAppts = appts.filter(a => a.date === today && a.status !== 'cancelled');
    const weekAppts = appts.filter(a => a.date >= weekStartStr && a.status !== 'cancelled');
    const revenue = weekAppts.filter(a => a.status === 'done').reduce((s, a) => s + Number(a.total || 0), 0);

    document.getElementById('stat-today').textContent = todayAppts.length;
    document.getElementById('stat-week').textContent = weekAppts.length;
    document.getElementById('stat-revenue').textContent = `R$${revenue.toFixed(0)}`;

    renderDashUpcoming(appts.filter(a => a.date >= today && a.status !== 'cancelled').sort((a,b) => a.date.localeCompare(b.date)));
    renderDashPending(appts.filter(a => a.status === 'pending').sort((a,b) => a.date.localeCompare(b.date)));
  });

  getDocs(collection(db, 'users')).then(snap => {
    document.getElementById('stat-clients').textContent = snap.size;
  });
}

function renderDashUpcoming(appts) {
  const el = document.getElementById('dash-upcoming');
  if (!el) return;
  if (!appts.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i><p>Nenhum agendamento próximo</p></div>'; return; }
  el.innerHTML = appts.slice(0, 5).map(a => miniApptCard(a)).join('');
}

function renderDashPending(appts) {
  const el = document.getElementById('dash-pending');
  if (!el) return;
  if (!appts.length) { el.innerHTML = '<div style="color:var(--green);font-size:14px;padding:16px 0;"><i class="fas fa-check-circle"></i> Sem pendências!</div>'; return; }
  el.innerHTML = appts.slice(0, 5).map(a => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:14px;font-weight:600">${a.userName}</div>
        <div style="font-size:12px;color:var(--text2)">${a.serviceName} · ${formatDate(a.date)} ${a.time}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-action success" onclick="updateStatus('${a.id}','confirmed')"><i class="fas fa-check"></i></button>
        <button class="btn-action danger" onclick="updateStatus('${a.id}','cancelled')"><i class="fas fa-times"></i></button>
      </div>
    </div>
  `).join('');
}

function miniApptCard(a) {
  return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
    <div style="min-width:44px;text-align:center;background:var(--accent);color:#000;border-radius:8px;padding:4px 8px">
      <div style="font-family:var(--font-display);font-size:20px;line-height:1">${a.date.split('-')[2]}</div>
      <div style="font-size:10px;font-weight:700">${['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][parseInt(a.date.split('-')[1])-1]}</div>
    </div>
    <div style="flex:1">
      <div style="font-size:14px;font-weight:600">${a.userName}</div>
      <div style="font-size:12px;color:var(--text2)">${a.serviceName} · ${a.time}</div>
    </div>
    <span class="status-badge status-${a.status}">${statusLabel(a.status)}</span>
  </div>`;
}

// ============================
// APPOINTMENTS
// ============================
function loadAppointments() {
  onSnapshot(query(collection(db, 'appointments'), orderBy('date', 'desc')), (snap) => {
    allAppointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAppts(allAppointments);
  });
}

function renderAppts(appts) {
  const tbody = document.getElementById('appts-tbody');
  if (!tbody) return;
  if (!appts.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">Nenhum agendamento</td></tr>'; return; }
  tbody.innerHTML = appts.map(a => `
    <tr>
      <td><div style="font-weight:600">${a.userName}</div><div style="font-size:12px;color:var(--text3)">${a.userPhone || ''}</div></td>
      <td>${a.serviceName}</td>
      <td>${formatDate(a.date)}<br/><span style="color:var(--text2);font-size:12px">${a.time}</span></td>
      <td style="max-width:180px;font-size:13px">${a.address || '—'}</td>
      <td><strong>R$ ${Number(a.total||0).toFixed(2)}</strong>${a.coupon ? `<br/><span style="font-size:11px;color:var(--green)">${a.coupon}</span>` : ''}</td>
      <td><span class="status-badge status-${a.status}">${statusLabel(a.status)}</span></td>
      <td>
        <div class="action-btns">
          ${a.status === 'pending' ? `<button class="btn-action success" onclick="updateStatus('${a.id}','confirmed')" title="Confirmar"><i class="fas fa-check"></i></button>` : ''}
          ${a.status === 'confirmed' ? `<button class="btn-action success" onclick="updateStatus('${a.id}','done')" title="Finalizar"><i class="fas fa-flag-checkered"></i></button>` : ''}
          ${['pending','confirmed'].includes(a.status) ? `<button class="btn-action danger" onclick="updateStatus('${a.id}','cancelled')" title="Cancelar"><i class="fas fa-times"></i></button>` : ''}
          <button class="btn-action danger" onclick="deleteAppt('${a.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.updateStatus = async (id, status) => {
  await updateDoc(doc(db, 'appointments', id), { status });
  showToast(`Status atualizado: ${statusLabel(status)}`);
};

window.deleteAppt = async (id) => {
  if (!confirm('Excluir agendamento?')) return;
  await deleteDoc(doc(db, 'appointments', id));
  showToast('Agendamento excluído');
};

window.filterAppointments = () => {
  const status = document.getElementById('filter-status').value;
  const date = document.getElementById('filter-date').value;
  let filtered = [...allAppointments];
  if (status !== 'all') filtered = filtered.filter(a => a.status === status);
  if (date) filtered = filtered.filter(a => a.date === date);
  renderAppts(filtered);
};

window.clearFilters = () => {
  document.getElementById('filter-status').value = 'all';
  document.getElementById('filter-date').value = '';
  renderAppts(allAppointments);
};

// ============================
// SERVICES
// ============================
function loadServices() {
  onSnapshot(collection(db, 'services'), (snap) => {
    allServices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderServicesAdmin();
  });
}

function renderServicesAdmin() {
  const el = document.getElementById('services-admin');
  if (!el) return;
  el.innerHTML = allServices.map(s => `
    <div class="svc-admin-card">
      <div class="svc-admin-header">
        <div class="svc-admin-name"><i class="fas ${s.icon||'fa-cut'}" style="color:var(--accent);margin-right:8px"></i>${s.name}</div>
        <div class="svc-admin-price">R$ ${Number(s.price).toFixed(2)}</div>
      </div>
      <div class="svc-admin-desc">${s.desc}</div>
      <div class="svc-admin-meta">
        <span><i class="fas fa-clock"></i> ${s.duration} min</span>
        <span style="color:${s.active ? 'var(--green)' : 'var(--red)'}">${s.active ? 'Ativo' : 'Inativo'}</span>
      </div>
      <div class="svc-admin-footer">
        <button class="btn-action" onclick="editService('${s.id}')"><i class="fas fa-edit"></i> Editar</button>
        <button class="btn-action" onclick="toggleService('${s.id}',${!s.active})">${s.active ? '<i class="fas fa-eye-slash"></i> Desativar' : '<i class="fas fa-eye"></i> Ativar'}</button>
        <button class="btn-action danger" onclick="deleteService('${s.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

window.openServiceModal = () => {
  document.getElementById('service-modal-title').textContent = 'Novo Serviço';
  document.getElementById('svc-id').value = '';
  ['svc-name','svc-desc','svc-price','svc-duration','svc-icon'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('service-modal').classList.remove('hidden');
};

window.editService = (id) => {
  const s = allServices.find(s => s.id === id);
  if (!s) return;
  document.getElementById('service-modal-title').textContent = 'Editar Serviço';
  document.getElementById('svc-id').value = s.id;
  document.getElementById('svc-name').value = s.name;
  document.getElementById('svc-desc').value = s.desc;
  document.getElementById('svc-price').value = s.price;
  document.getElementById('svc-duration').value = s.duration;
  document.getElementById('svc-icon').value = s.icon || '';
  document.getElementById('service-modal').classList.remove('hidden');
};

window.saveService = async () => {
  const id = document.getElementById('svc-id').value;
  const data = {
    name: document.getElementById('svc-name').value,
    desc: document.getElementById('svc-desc').value,
    price: parseFloat(document.getElementById('svc-price').value) || 0,
    duration: parseInt(document.getElementById('svc-duration').value) || 45,
    icon: document.getElementById('svc-icon').value || 'fa-cut',
    active: true
  };
  if (!data.name) return showToast('Informe o nome do serviço', 'error');
  if (id) {
    await updateDoc(doc(db, 'services', id), data);
  } else {
    await addDoc(collection(db, 'services'), data);
  }
  closeModal('service-modal');
  showToast('Serviço salvo!');
};

window.toggleService = async (id, active) => {
  await updateDoc(doc(db, 'services', id), { active });
  showToast(active ? 'Serviço ativado' : 'Serviço desativado');
};

window.deleteService = async (id) => {
  if (!confirm('Excluir serviço?')) return;
  await deleteDoc(doc(db, 'services', id));
  showToast('Serviço excluído');
};

// ============================
// HOURS CONFIG
// ============================
const dayNames = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
let hoursConfig = { days: {0:false,1:true,2:true,3:true,4:true,5:true,6:true}, openTime:'08:00', closeTime:'20:00', slotDuration:45 };

async function loadHoursConfig() {
  const snap = await getDoc(doc(db, 'config', 'hours'));
  if (snap.exists()) hoursConfig = snap.data();
  renderDaysConfig();
  document.getElementById('open-time').value = hoursConfig.openTime || '08:00';
  document.getElementById('close-time').value = hoursConfig.closeTime || '20:00';
  document.getElementById('slot-duration').value = hoursConfig.slotDuration || 45;

  // Blocked dates
  const bSnap = await getDocs(collection(db, 'blockedDates'));
  renderBlockedList(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
}

function renderDaysConfig() {
  const el = document.getElementById('days-config');
  if (!el) return;
  el.innerHTML = dayNames.map((d, i) => `
    <div class="day-toggle">
      <span class="day-toggle-name">${d}</span>
      <label class="toggle-switch">
        <input type="checkbox" id="day-${i}" ${hoursConfig.days[i] ? 'checked' : ''} onchange="toggleDay(${i})">
        <span class="toggle-slider"></span>
      </label>
      <span style="font-size:13px;color:var(--text2)">${hoursConfig.days[i] ? 'Aberto' : 'Fechado'}</span>
    </div>
  `).join('');
}

window.toggleDay = (i) => {
  hoursConfig.days[i] = document.getElementById(`day-${i}`).checked;
  renderDaysConfig();
};

window.saveHours = async () => {
  hoursConfig.openTime = document.getElementById('open-time').value;
  hoursConfig.closeTime = document.getElementById('close-time').value;
  hoursConfig.slotDuration = parseInt(document.getElementById('slot-duration').value);
  await setDoc(doc(db, 'config', 'hours'), hoursConfig);
  showToast('Horários salvos!');
};

window.blockDate = async () => {
  const date = document.getElementById('block-date').value;
  const reason = document.getElementById('block-reason').value;
  if (!date) return showToast('Selecione uma data', 'error');
  await addDoc(collection(db, 'blockedDates'), { date, reason: reason || 'Bloqueado' });
  document.getElementById('block-date').value = '';
  document.getElementById('block-reason').value = '';

  const bSnap = await getDocs(collection(db, 'blockedDates'));
  renderBlockedList(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  showToast('Data bloqueada!');
};

function renderBlockedList(items) {
  const el = document.getElementById('blocked-list');
  if (!el) return;
  el.innerHTML = items.map(b => `
    <div class="blocked-item">
      <div><span class="blocked-date">${formatDate(b.date)}</span> <span class="blocked-reason">— ${b.reason}</span></div>
      <button class="btn-action danger" onclick="unblockDate('${b.id}')"><i class="fas fa-times"></i></button>
    </div>
  `).join('') || '<div style="color:var(--text3);font-size:13px">Nenhuma data bloqueada</div>';
}

window.unblockDate = async (id) => {
  await deleteDoc(doc(db, 'blockedDates', id));
  const bSnap = await getDocs(collection(db, 'blockedDates'));
  renderBlockedList(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  showToast('Data desbloqueada');
};

// ============================
// CLIENTS
// ============================
function loadClients() {
  onSnapshot(collection(db, 'users'), (snap) => {
    allClients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderClients(allClients);
  });
}

async function renderClients(clients) {
  const tbody = document.getElementById('clients-tbody');
  if (!tbody) return;
  if (!clients.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text3)">Nenhum cliente</td></tr>'; return; }

  const apptSnap = await getDocs(collection(db, 'appointments'));
  const appts = apptSnap.docs.map(d => d.data());

  tbody.innerHTML = clients.map(c => {
    const count = appts.filter(a => a.userId === c.id).length;
    return `<tr>
      <td style="font-weight:600">${c.name || '—'}</td>
      <td>${c.phone || '—'}</td>
      <td>${c.email || '—'}</td>
      <td style="text-align:center">${count}</td>
      <td style="color:var(--text3);font-size:13px">${c.createdAt ? new Date(c.createdAt).toLocaleDateString('pt-BR') : '—'}</td>
    </tr>`;
  }).join('');
}

window.searchClients = () => {
  const q = document.getElementById('client-search').value.toLowerCase();
  const filtered = allClients.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.email||'').toLowerCase().includes(q) ||
    (c.phone||'').toLowerCase().includes(q)
  );
  renderClients(filtered);
};

// ============================
// COUPONS
// ============================
function loadCoupons() {
  onSnapshot(collection(db, 'coupons'), (snap) => {
    renderCoupons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

function renderCoupons(coupons) {
  const el = document.getElementById('coupons-list');
  if (!el) return;
  if (!coupons.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-tag"></i><p>Nenhum cupom cadastrado</p></div>'; return; }
  el.innerHTML = coupons.map(c => {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    return `<div class="coupon-card ${!c.active || expired ? 'coupon-inactive' : ''}">
      <div class="coupon-card-header">
        <div class="coupon-code-big">${c.code}</div>
        <div class="coupon-disc">-${c.discount}%</div>
      </div>
      <div class="coupon-meta">
        <span><i class="fas fa-calendar"></i> Expira: ${c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('pt-BR') : 'Sem prazo'}</span>
        <span><i class="fas fa-hashtag"></i> Usos: ${c.usedCount||0}${c.maxUses ? `/${c.maxUses}` : ' (ilimitado)'}</span>
        <span style="color:${c.active && !expired ? 'var(--green)':'var(--red)'}">${c.active && !expired ? 'Ativo' : 'Inativo/Expirado'}</span>
      </div>
      <div class="coupon-footer">
        <button class="btn-action" onclick="toggleCoupon('${c.id}',${!c.active})">${c.active ? 'Desativar' : 'Ativar'}</button>
        <button class="btn-action danger" onclick="deleteCoupon('${c.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

window.openCouponModal = () => {
  document.getElementById('coupon-modal').classList.remove('hidden');
};

window.saveCoupon = async () => {
  const code = document.getElementById('cpn-code').value.trim().toUpperCase();
  const discount = parseInt(document.getElementById('cpn-discount').value);
  const expiry = document.getElementById('cpn-expiry').value;
  const maxUses = parseInt(document.getElementById('cpn-uses').value) || 0;
  if (!code || !discount) return showToast('Preencha código e desconto', 'error');
  await addDoc(collection(db, 'coupons'), {
    code, discount, expiresAt: expiry || null,
    maxUses, usedCount: 0, active: true,
    createdAt: new Date().toISOString()
  });
  closeModal('coupon-modal');
  showToast('Cupom criado!');
};

window.toggleCoupon = async (id, active) => {
  await updateDoc(doc(db, 'coupons', id), { active });
  showToast(active ? 'Cupom ativado' : 'Cupom desativado');
};

window.deleteCoupon = async (id) => {
  if (!confirm('Excluir cupom?')) return;
  await deleteDoc(doc(db, 'coupons', id));
  showToast('Cupom excluído');
};

// ============================
// CONFIG
// ============================
async function loadConfig() {
  const snap = await getDoc(doc(db, 'config', 'shop'));
  if (snap.exists()) {
    const d = snap.data();
    document.getElementById('cfg-name').value = d.name || '';
    document.getElementById('cfg-phone').value = d.phone || '';
    document.getElementById('cfg-address').value = d.address || '';
    document.getElementById('cfg-about').value = d.about || '';
    document.getElementById('cfg-fee').value = d.fee || '';
    document.getElementById('cfg-free-from').value = d.freeFrom || '';
  }
}

window.saveConfig = async () => {
  await setDoc(doc(db, 'config', 'shop'), {
    name: document.getElementById('cfg-name').value,
    phone: document.getElementById('cfg-phone').value,
    address: document.getElementById('cfg-address').value,
    about: document.getElementById('cfg-about').value,
    fee: parseFloat(document.getElementById('cfg-fee').value) || 0,
    freeFrom: parseFloat(document.getElementById('cfg-free-from').value) || 0
  });
  showToast('Configurações salvas!');
};

// ============================
// NAVIGATION
// ============================
const panelTitles = { dashboard: 'Dashboard', agendamentos: 'Agendamentos', servicos: 'Serviços', horarios: 'Horários', clientes: 'Clientes', cupons: 'Cupons', config: 'Configurações' };

window.showPanel = (name) => {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`panel-${name}`)?.classList.add('active');
  document.querySelectorAll('.snav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.snav-btn[data-panel="${name}"]`)?.classList.add('active');
  document.getElementById('panel-title').textContent = panelTitles[name] || name;

  // Close sidebar on mobile
  if (window.innerWidth < 900) {
    document.getElementById('admin-sidebar').classList.remove('open');
    document.querySelector('.sidebar-overlay')?.classList.remove('show');
  }
};

window.toggleSidebar = () => {
  const sidebar = document.getElementById('admin-sidebar');
  sidebar.classList.toggle('open');
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.onclick = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('show', sidebar.classList.contains('open'));
};

window.closeModal = (id) => {
  document.getElementById(id || 'service-modal').classList.add('hidden');
};

// ============================
// UTILS
// ============================
function formatDate(dateStr) {
  if (!dateStr) return '';
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
