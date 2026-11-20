const SUPABASE_URL = 'https://zsjetsailonjuwawbpke.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzamV0c2FpbG9uanV3YXdicGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NjkzNDgsImV4cCI6MjEwOTU0NTM0OH0.npaPD7V8FkEcjKbJBNSQPUaQG6EMVphkcJdfIuF-eis';


const ICON_LABELS = {
  tshirt: 'تيشيرت',
  pants: 'بنطلون',
  jacket: 'جاكيت',
  shirt: 'قميص',
  dress: 'فستان',
  kids_wear: 'ملابس أطفال'
};

const ROLE_LABELS = {
  donor: 'متبرع (Donor)',
  employee: 'موظف استلام (Employee)',
  admin: 'أدمن (Admin)',
  super_admin: 'سوبر أدمن (Super Admin)'
};

let sb = null;
let currentUser = null;
let currentProfile = null;
let allDonations = [];
let allProfiles = [];

async function resolveSupabaseClient() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window._supabase) return window._supabase;
  if (window.sb && typeof window.sb.auth === 'object') return window.sb;

  const candidatePaths = ['../js/app.js', 'js/app.js', '/js/app.js'];
  for (const path of candidatePaths) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) continue;
      const code = await res.text();
      const jwtMatch = code.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
      if (jwtMatch && window.supabase) {
        return window.supabase.createClient(SUPABASE_URL, jwtMatch[0]);
      }
    } catch (_) {}
  }
  return null;
}

document.addEventListener('DOMContentLoaded', async () => {
  sb = await resolveSupabaseClient();
  if (!sb) return;

  const { data: { session }, error } = await sb.auth.getSession();
  if (error || !session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = session.user;

  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  currentProfile = profile;

  // حماية الصفحة: متاحة فقط لـ admin و super_admin
  if (!currentProfile || !['admin', 'super_admin'].includes(currentProfile.role)) {
    window.location.href = 'dashboard.html';
    return;
  }

  const isSuper = currentProfile.role === 'super_admin';
  document.getElementById('admin-role-tag').textContent = isSuper ? 'صلاحيات Super Admin الكاملة' : 'صلاحيات Admin';
  document.getElementById('admin-user-name').textContent = `مرحباً، ${currentProfile.full_name || currentProfile.username}`;
  document.getElementById('admin-user-email').textContent = `${currentProfile.email} (@${currentProfile.username})`;
  document.getElementById('super-admin-note').textContent = isSuper
    ? 'بصفتك Super Admin يمكنك ترقية أو تعديل أي حساب بما في ذلك Admin و Super Admin.'
    : 'بصفتك Admin يمكنك تعيين رتب المتبرعين والموظفين.';

  setupTabs();
  setupFilters();
  setupLogout();
  await refreshAllData();
  subscribeRealtime();
});

function setupTabs() {
  const buttons = document.querySelectorAll('.admin-tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.getAttribute('data-tab');
      document.getElementById('donations-tab').style.display = target === 'donations-tab' ? 'block' : 'none';
      document.getElementById('users-tab').style.display = target === 'users-tab' ? 'block' : 'none';
    });
  });
}

function setupFilters() {
  document.getElementById('adm-donation-search').addEventListener('input', renderDonationsTable);
  document.getElementById('adm-donation-filter').addEventListener('change', renderDonationsTable);
  document.getElementById('adm-user-search').addEventListener('input', renderUsersTable);
}

async function refreshAllData() {
  const [donationsRes, profilesRes] = await Promise.all([
    sb.from('donations').select('*, donation_items(*), donation_photos(*)').order('created_at', { ascending: false }),
    sb.from('profiles').select('*').order('created_at', { ascending: false })
  ]);

  allDonations = donationsRes.data || [];
  allProfiles = profilesRes.data || [];

  updateAdminKpis();
  renderDonationsTable();
  renderUsersTable();
}

function updateAdminKpis() {
  const totalOrders = allDonations.length;
  const declaredSum = allDonations.reduce((s, d) => s + (d.declared_pieces_count || d.pieces_count || 0), 0);
  const actualSum = allDonations.reduce((s, d) => s + (d.actual_pieces_count ?? 0), 0);
  const pendingCount = allDonations.filter(d => d.actual_pieces_count === null || d.actual_pieces_count === undefined).length;

  const donorsCount = allProfiles.filter(p => p.role === 'donor').length;
  const staffCount = allProfiles.filter(p => ['employee', 'admin', 'super_admin'].includes(p.role)).length;

  document.getElementById('adm-kpi-orders').textContent = totalOrders;
  document.getElementById('adm-kpi-pieces').textContent = `${declaredSum} / ${actualSum}`;
  document.getElementById('adm-kpi-pending').textContent = pendingCount;
  document.getElementById('adm-kpi-users').textContent = `${donorsCount} متبرع / ${staffCount} موظف`;
}

function renderDonationsTable() {
  const tbody = document.getElementById('adm-donations-tbody');
  const query = document.getElementById('adm-donation-search').value.trim().toLowerCase();
  const filter = document.getElementById('adm-donation-filter').value;

  const filtered = allDonations.filter(d => {
    const isVerified = d.actual_pieces_count !== null && d.actual_pieces_count !== undefined;
    if (filter === 'verified' && !isVerified) return false;
    if (filter === 'unverified' && isVerified) return false;

    if (!query) return true;
    const text = `${d.donor_name || ''} ${d.address || ''} ${d.campaign_name || ''} ${d.phone || ''}`.toLowerCase();
    return text.includes(query);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px;">لا توجد طلبات مطابقة للبحث الحالي.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const declared = d.declared_pieces_count || d.pieces_count || 0;
    const hasActual = d.actual_pieces_count !== null && d.actual_pieces_count !== undefined;

    const itemsChips = (d.donation_items || []).map(item => `
      <span class="mini-chip">${ICON_LABELS[item.item_icon] || item.item_icon}: ${item.quantity} ${item.details ? `(${item.details})` : ''}</span>
    `).join('');

    const photosHtml = (d.donation_photos || []).map(p => `
      <a href="${p.photo_url}" target="_blank" rel="noopener">
        <img src="${p.photo_url}" alt="فحص الموظف">
      </a>
    `).join('');

    return `
      <tr>
        <td>
          <strong>${d.donor_name || 'متبرع'}</strong><br>
          <span style="font-size:12px; color:var(--text-muted); direction:ltr; display:inline-block;">${d.phone || '-'}</span>
        </td>
        <td>
          <strong>${d.campaign_name || 'تبرع ملابس'}</strong><br>
          <span style="font-size:12px; color:var(--text-muted);">${d.pickup_mode} — ${d.address}</span><br>
          <span style="font-size:11px; color:var(--text-muted);">الموعد: ${d.pickup_date || '-'}</span>
        </td>
        <td>${itemsChips || `<span class="mini-chip">${declared} قطعة ملابس</span>`}</td>
        <td>
          <div>معلن: <strong>${declared}</strong></div>
          <div>مستلم: <strong>${hasActual ? d.actual_pieces_count : 'بانتظار الموظف'}</strong></div>
          ${d.employee_notes ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${d.employee_notes}</div>` : ''}
        </td>
        <td>
          ${photosHtml ? `<div class="thumbs-row">${photosHtml}</div>` : '<span style="font-size:12px; color:var(--text-muted);">لم يتم الرفع بعد</span>'}
        </td>
        <td>
          <span class="booking-step-tag" style="display:inline-block; margin-bottom:6px;">
            ${hasActual ? 'تم الفحص والاستلام' : (d.status || 'قيد المراجعة')}
          </span><br>
          <button type="button" class="btn-secondary" style="padding: 5px 10px; font-size: 12px;" onclick="deleteDonation('${d.id}')">حذف</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.deleteDonation = async (id) => {
  if (!confirm('هل تريد حذف هذا الطلب نهائياً؟')) return;
  const { error } = await sb.from('donations').delete().eq('id', id);
  if (error) {
    alert('تعذر الحذف: ' + error.message);
    return;
  }
  await refreshAllData();
};

function renderUsersTable() {
  const tbody = document.getElementById('adm-users-tbody');
  const query = document.getElementById('adm-user-search').value.trim().toLowerCase();
  const isSuper = currentProfile.role === 'super_admin';

  const filtered = allProfiles.filter(p => {
    if (!query) return true;
    const text = `${p.full_name || ''} ${p.username || ''} ${p.email || ''} ${p.phone || ''}`.toLowerCase();
    return text.includes(query);
  });

  tbody.innerHTML = filtered.map(p => {
    const canEdit = isSuper || !['admin', 'super_admin'].includes(p.role);
    return `
      <tr>
        <td><strong>${p.full_name || '-'}</strong></td>
        <td>@${p.username}</td>
        <td>${p.email}</td>
        <td>${p.phone || '-'}</td>
        <td><span class="role-badge ${p.role}">${ROLE_LABELS[p.role] || p.role}</span></td>
        <td>
          ${canEdit ? `
            <select class="role-select-inline" onchange="changeUserRole('${p.id}', this.value)">
              <option value="donor" ${p.role === 'donor' ? 'selected' : ''}>متبرع (donor)</option>
              <option value="employee" ${p.role === 'employee' ? 'selected' : ''}>موظف موبايل (employee)</option>
              ${isSuper ? `<option value="admin" ${p.role === 'admin' ? 'selected' : ''}>أدمن (admin)</option>` : ''}
              ${isSuper ? `<option value="super_admin" ${p.role === 'super_admin' ? 'selected' : ''}>سوبر أدمن (super_admin)</option>` : ''}
            </select>
          ` : '<span style="font-size:12px; color:var(--text-muted);">محمي (Super Admin فقط)</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

window.changeUserRole = async (userId, newRole) => {
  const { error } = await sb
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    alert('خطأ أثناء تحديث الصلاحية: ' + error.message);
    await refreshAllData();
    return;
  }

  await refreshAllData();
};

function subscribeRealtime() {
  sb.channel('kiswah-admin-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'donations' }, refreshAllData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'donation_items' }, refreshAllData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'donation_photos' }, refreshAllData)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, refreshAllData)
    .subscribe();
}

function setupLogout() {
  const btn = document.querySelector('[data-logout-btn]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
}