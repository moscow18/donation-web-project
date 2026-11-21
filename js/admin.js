const ICON_LABELS = {
  tshirt: 'تيشيرت',
  pants: 'بنطلون',
  jacket: 'جاكيت',
  shirt: 'قميص',
  dress: 'فستان',
  kids_wear: 'ملابس أطفال'
};

const GENDER_LABELS = {
  men: 'رجالي',
  women: 'حريمي',
  kids: 'أطفال',
  unisex: 'متنوع'
};

const CONDITION_LABELS = {
  new: 'جديد',
  like_new: 'كالجديد',
  good: 'حالة جيدة'
};

const ROLE_LABELS = {
  donor: 'متبرع',
  employee: 'موظف ميداني',
  admin: 'مدير منظمة (Admin)',
  super_admin: 'إدارة عليا (Super Admin)'
};

let sb = null;
let currentUser = null;
let currentProfile = null;
let allDonations = [];
let allProfiles = [];

document.addEventListener('DOMContentLoaded', async () => {
  window.KiswahLoader.show('جاري تحميل بوابة المنظمة والإدارة...');

  sb = await window.KiswahRealtime.getClient();
  if (!sb) {
    window.KiswahLoader.hide();
    return;
  }

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

  if (!currentProfile || !['admin', 'super_admin'].includes(currentProfile.role)) {
    window.location.href = currentProfile?.role === 'employee' ? 'employee.html' : 'dashboard.html';
    return;
  }

  const isSuper = currentProfile.role === 'super_admin';
  document.getElementById('admin-role-tag').textContent = isSuper ? 'إدارة المنظمة العليا (Super Admin)' : 'إدارة المنظمة (Admin)';
  document.getElementById('admin-user-name').textContent = `مرحباً، ${currentProfile.full_name || currentProfile.username}`;
  document.getElementById('admin-user-email').textContent = `${currentProfile.email} (@${currentProfile.username})`;
  document.getElementById('super-admin-note').textContent = isSuper
    ? 'بصفتك Super Admin يمكنك تعيين الموظفين والمديرين والتحكم الكامل.'
    : 'بصفتك Admin يمكنك ترقية المتبرعين إلى موظفين ميدانيين.';

  setupTabs();
  setupFilters();
  setupLogout();
  await refreshAllData();

  window.KiswahRealtime.subscribe(() => {
    refreshAllData();
  });

  window.KiswahLoader.hide();
});

function setupTabs() {
  const buttons = document.querySelectorAll('[data-tab]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.getAttribute('data-tab');
      ['donations-tab', 'staff-tab', 'donors-tab'].forEach(id => {
        document.getElementById(id).style.display = id === target ? 'block' : 'none';
      });
    });
  });
}

function setupFilters() {
  document.getElementById('adm-donation-search').addEventListener('input', renderDetailedDonations);
  document.getElementById('adm-donation-filter').addEventListener('change', renderDetailedDonations);
  document.getElementById('adm-user-search').addEventListener('input', renderDonorsTable);
}

async function refreshAllData() {
  const [donationsRes, profilesRes] = await Promise.all([
    sb.from('donations').select('*, donation_items(*), donation_photos(*)').order('created_at', { ascending: false }),
    sb.from('profiles').select('*').order('created_at', { ascending: false })
  ]);

  allDonations = donationsRes.data || [];
  allProfiles = profilesRes.data || [];

  updateOrgKpis();
  renderInventoryBreakdown();
  renderDetailedDonations();
  renderStaffTable();
  renderDonorsTable();
}

function updateOrgKpis() {
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

function renderInventoryBreakdown() {
  const container = document.getElementById('org-inventory-breakdown');
  const counts = {};

  allDonations.forEach(d => {
    (d.donation_items || []).forEach(item => {
      const key = item.item_icon;
      counts[key] = (counts[key] || 0) + (item.quantity || 0);
    });
  });

  const keys = Object.keys(ICON_LABELS);
  container.innerHTML = keys.map(k => `
    <div style="background:var(--bg-page); border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:14px; text-align:center;">
      <div style="font-size:13px; color:var(--text-muted);">${ICON_LABELS[k]}</div>
      <strong style="font-size:22px; color:var(--green-dark);">${counts[k] || 0} قطعة</strong>
    </div>
  `).join('');
}

function renderDetailedDonations() {
  const container = document.getElementById('adm-donations-detailed-list');
  const query = document.getElementById('adm-donation-search').value.trim().toLowerCase();
  const filter = document.getElementById('adm-donation-filter').value;

  const profileMap = {};
  allProfiles.forEach(p => { profileMap[p.id] = p; });

  const filtered = allDonations.filter(d => {
    const isVerified = d.actual_pieces_count !== null && d.actual_pieces_count !== undefined;
    if (filter === 'verified' && !isVerified) return false;
    if (filter === 'unverified' && isVerified) return false;

    if (!query) return true;
    const text = `${d.donor_name || ''} ${d.address || ''} ${d.campaign_name || ''} ${d.phone || ''}`.toLowerCase();
    return text.includes(query);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted);">لا توجد طلبات مطابقة للبحث الحالي.</div>`;
    return;
  }

  container.innerHTML = filtered.map(d => {
    const declared = d.declared_pieces_count || d.pieces_count || 0;
    const hasActual = d.actual_pieces_count !== null && d.actual_pieces_count !== undefined;
    const verifier = d.verified_by ? profileMap[d.verified_by] : null;
    const createdDate = d.created_at ? new Date(d.created_at).toLocaleString('ar-EG') : '';

    const itemsRows = (d.donation_items || []).map(item => `
      <span style="display:inline-block; background:var(--white); border:1px solid var(--border-light); padding:5px 10px; border-radius:8px; font-size:12.5px;">
        <strong>${ICON_LABELS[item.item_icon] || item.item_icon} (${item.quantity})</strong> — ${GENDER_LABELS[item.gender_age] || item.gender_age} • مقاس ${item.size_label} • ${CONDITION_LABELS[item.condition_label] || item.condition_label}
        ${item.details ? ` — <em style="color:var(--text-muted);">${item.details}</em>` : ''}
      </span>
    `).join(' ');

    const photosHtml = (d.donation_photos || []).map(p => `
      <a href="${p.photo_url}" target="_blank" rel="noopener">
        <img src="${p.photo_url}" alt="فحص الموظف" style="width:52px; height:52px; object-fit:cover; border-radius:10px; border:1px solid var(--border-light);">
      </a>
    `).join('');

    return `
      <article class="donation-item" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <span style="font-size:11.5px; color:var(--gold); font-weight:700;">طلب #${String(d.id).slice(0, 8).toUpperCase()} • ${createdDate}</span>
            <h3 style="font-size:17px; font-weight:700;">${d.donor_name || 'متبرع'} — ${d.campaign_name || 'تبرع ملابس'}</h3>
          </div>

          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <div class="input-capsule" style="height:36px; padding:0 10px;">
              <select style="font-size:12px;" onchange="updateDonationStatus('${d.id}', this.value)">
                <option value="قيد المراجعة" ${(d.status === 'قيد المراجعة' || !d.status) ? 'selected' : ''}>قيد المراجعة</option>
                <option value="جاري الاستلام من المتبرع" ${d.status === 'جاري الاستلام من المتبرع' ? 'selected' : ''}>جاري الاستلام</option>
                <option value="تم الاستلام والفحص" ${(d.status === 'تم الاستلام والفحص' || hasActual) ? 'selected' : ''}>تم الاستلام والفحص</option>
                <option value="تم التوزيع للأسرة المستحقة" ${d.status === 'تم التوزيع للأسرة المستحقة' ? 'selected' : ''}>تم التوزيع للأسرة</option>
              </select>
            </div>
            <button type="button" class="btn-secondary" style="height:36px; padding:0 14px; font-size:12px; color:var(--error-red);" onclick="deleteDonation('${d.id}')">حذف</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:8px; font-size:13px; background:var(--white); padding:10px 14px; border-radius:10px; border:1px solid var(--border-light);">
          <div><span style="color:var(--text-muted);">الهاتف:</span> <strong style="direction:ltr; display:inline-block;">${d.phone || '-'}</strong></div>
          <div><span style="color:var(--text-muted);">طريقة الاستلام:</span> <strong>${d.pickup_mode}</strong></div>
          <div><span style="color:var(--text-muted);">الموعد:</span> <strong>${d.pickup_date || '-'}</strong></div>
          <div><span style="color:var(--text-muted);">الموظف الفاحص:</span> <strong>${verifier ? (verifier.full_name || verifier.username) : 'لم يُعيّن بعد'}</strong></div>
          <div style="grid-column:1 / -1;"><span style="color:var(--text-muted);">العنوان التفصيلي:</span> <strong>${d.address}</strong></div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${itemsRows || `<span style="font-size:13px;">${declared} قطعة ملابس</span>`}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding-top:10px; border-top:1px solid var(--border-light); font-size:13px;">
          <div>
            <span>المعلن: <strong>${declared} قطعة</strong></span>
            <span style="margin:0 10px;">|</span>
            <span>المستلم الفعلي بالمخزن: <strong>${hasActual ? `${d.actual_pieces_count} قطعة` : 'بانتظار الفحص'}</strong></span>
          </div>
          ${photosHtml ? `<div style="display:flex; gap:6px;">${photosHtml}</div>` : '<span style="font-size:12px; color:var(--text-muted);">لا توجد صور فحص مرفوعة</span>'}
        </div>

        ${d.employee_notes ? `<div style="font-size:12.5px; background:var(--bg-sand); padding:8px 12px; border-radius:8px;"><strong>ملاحظة الفحص:</strong> ${d.employee_notes}</div>` : ''}
      </article>
    `;
  }).join('');
}

window.updateDonationStatus = async (donationId, newStatus) => {
  window.KiswahLoader.show('جاري تحديث حالة الطلب...');
  const { error } = await sb
    .from('donations')
    .update({ status: newStatus })
    .eq('id', donationId);

  if (error) {
    window.KiswahLoader.hide();
    window.showKiswahToast('تعذر تحديث الحالة: ' + error.message);
    return;
  }

  await refreshAllData();
  window.KiswahLoader.hide();
  window.showKiswahToast('تم تحديث حالة الطلب بنجاح.');
};

window.deleteDonation = async (id) => {
  if (!confirm('هل تريد حذف هذا الطلب نهائياً من سجل المنظمة؟')) return;
  window.KiswahLoader.show('جاري حذف الطلب...');
  const { error } = await sb.from('donations').delete().eq('id', id);
  if (error) {
    window.KiswahLoader.hide();
    window.showKiswahToast('تعذر الحذف: ' + error.message);
    return;
  }
  await refreshAllData();
  window.KiswahLoader.hide();
  window.showKiswahToast('تم حذف الطلب.');
};

function renderStaffTable() {
  const tbody = document.getElementById('adm-staff-tbody');
  const isSuper = currentProfile.role === 'super_admin';
  const staff = allProfiles.filter(p => ['employee', 'admin', 'super_admin'].includes(p.role));

  if (staff.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">لا يوجد موظفون مسجلون حالياً.</td></tr>`;
    return;
  }

  tbody.innerHTML = staff.map(p => {
    const verifiedCount = allDonations.filter(d => d.verified_by === p.id).length;
    const canEdit = isSuper || p.role === 'employee';

    return `
      <tr style="border-bottom:1px solid var(--border-light);">
        <td style="padding:12px 14px;"><strong>${p.full_name || p.username}</strong></td>
        <td style="padding:12px 14px;">${p.email}</td>
        <td style="padding:12px 14px; direction:ltr; text-align:right;">${p.phone || '-'}</td>
        <td style="padding:12px 14px;"><span class="badge-status">${ROLE_LABELS[p.role] || p.role}</span></td>
        <td style="padding:12px 14px;"><strong>${verifiedCount} طلب</strong></td>
        <td style="padding:12px 14px;">
          ${canEdit ? `
            <div class="input-capsule" style="height:36px; padding:0 10px;">
              <select style="font-size:12px;" onchange="changeUserRole('${p.id}', this.value)">
                <option value="employee" ${p.role === 'employee' ? 'selected' : ''}>موظف ميداني (employee)</option>
                <option value="donor">إرجاع لمتبرع (donor)</option>
                ${isSuper ? `<option value="admin" ${p.role === 'admin' ? 'selected' : ''}>مدير منظمة (admin)</option>` : ''}
                ${isSuper ? `<option value="super_admin" ${p.role === 'super_admin' ? 'selected' : ''}>إدارة عليا (super_admin)</option>` : ''}
              </select>
            </div>
          ` : '<span style="font-size:12px; color:var(--text-muted);">محمي</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function renderDonorsTable() {
  const tbody = document.getElementById('adm-donors-tbody');
  const query = document.getElementById('adm-user-search').value.trim().toLowerCase();
  const isSuper = currentProfile.role === 'super_admin';

  const donors = allProfiles.filter(p => {
    if (p.role !== 'donor') return false;
    if (!query) return true;
    const text = `${p.full_name || ''} ${p.username || ''} ${p.email || ''} ${p.phone || ''}`.toLowerCase();
    return text.includes(query);
  });

  if (donors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">لا يوجد متبرعون مطابقون للبحث.</td></tr>`;
    return;
  }

  tbody.innerHTML = donors.map(p => {
    const userOrders = allDonations.filter(d => d.user_id === p.id);
    const piecesSum = userOrders.reduce((s, d) => s + (d.actual_pieces_count ?? d.declared_pieces_count ?? d.pieces_count ?? 0), 0);

    return `
      <tr style="border-bottom:1px solid var(--border-light);">
        <td style="padding:12px 14px;"><strong>${p.full_name || p.username}</strong></td>
        <td style="padding:12px 14px;">${p.email}</td>
        <td style="padding:12px 14px; direction:ltr; text-align:right;">${p.phone || '-'}</td>
        <td style="padding:12px 14px;">${userOrders.length} طلب</td>
        <td style="padding:12px 14px;"><strong>${piecesSum} قطعة</strong></td>
        <td style="padding:12px 14px;">
          <div class="input-capsule" style="height:36px; padding:0 10px;">
            <select style="font-size:12px;" onchange="changeUserRole('${p.id}', this.value)">
              <option value="donor" selected>متبرع (donor)</option>
              <option value="employee">ترقية لموظف ميداني (employee)</option>
              ${isSuper ? `<option value="admin">ترقية لمدير منظمة (admin)</option>` : ''}
            </select>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.changeUserRole = async (userId, newRole) => {
  window.KiswahLoader.show('جاري تحديث الصلاحية...');
  const { error } = await sb
    .from('profiles')
    .update({ role: newRole })
    .eq('id', userId);

  if (error) {
    window.KiswahLoader.hide();
    window.showKiswahToast('خطأ أثناء تحديث الصلاحية: ' + error.message);
    await refreshAllData();
    return;
  }

  await refreshAllData();
  window.KiswahLoader.hide();
  window.showKiswahToast('تم تحديث صلاحية الحساب بنجاح.');
};

function setupLogout() {
  const btn = document.querySelector('[data-logout-btn]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    window.KiswahLoader.show('جاري تسجيل الخروج...');
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
}