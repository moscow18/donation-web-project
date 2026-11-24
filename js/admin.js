const ICON_LABELS = {
  tshirt: 'تيشيرت',
  pants: 'بنطلون',
  jacket: 'جاكيت',
  shirt: 'قميص',
  dress: 'فستان',
  kids_wear: 'ملابس أطفال'
};

const CONDITION_LABELS = {
  new: 'جديد',
  like_new: 'كالجديد',
  good: 'حالة جيدة'
};

const PIPELINE_CONFIG = {
  received: { label: 'تم الاستلام', css: 'status-received' },
  inspected: { label: 'تم الفحص', css: 'status-inspected' },
  sorted: { label: 'تم الفرز بالمخزن', css: 'status-sorted' },
  distributed: { label: 'تم التوزيع', css: 'status-distributed' }
};

let sb = null;
let currentUser = null;
let currentProfile = null;
let allDonations = [];
let allProfiles = [];
let timelineChartInstance = null;
let categoryChartInstance = null;

// طبقة الوصول للبيانات (Typed-like Data Access Layer)
const KiswahService = {
  async getSessionAndProfile() {
    const { data: { session }, error } = await sb.auth.getSession();
    if (error || !session) return null;
    const { data: profile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    return { user: session.user, profile };
  },

  async fetchDonations() {
    const { data, error } = await sb
      .from('donations')
      .select('*, donation_items(*), donation_photos(*)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async fetchProfiles() {
    const { data, error } = await sb
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async updateDonationPipeline(donationId, pipelineKey) {
    const statusMap = {
      received: 'تم الاستلام',
      inspected: 'تم الاستلام والفحص',
      sorted: 'تم الفرز بالمخزن',
      distributed: 'تم التوزيع للأسرة المستحقة'
    };
    const statusText = statusMap[pipelineKey] || 'تم الاستلام';
    const target = allDonations.find(d => String(d.id) === String(donationId));
    const fallbackPieces = target?.actual_pieces_count ?? target?.declared_pieces_count ?? target?.pieces_count ?? 0;

    const payload = { status: statusText };
    if (['inspected', 'sorted', 'distributed'].includes(pipelineKey) && (target?.actual_pieces_count === null || target?.actual_pieces_count === undefined)) {
      payload.actual_pieces_count = fallbackPieces;
      payload.verified_by = currentUser.id;
      payload.verified_at = new Date().toISOString();
    }

    const { error } = await sb.from('donations').update(payload).eq('id', donationId);
    if (error) throw error;
  },

  async addWarehouseEntry({ category, size, condition, quantity }) {
    const { data: donation, error: donErr } = await sb
      .from('donations')
      .insert([{
        user_id: currentUser.id,
        donor_name: 'إدخال مخزني مباشر',
        pickup_mode: 'تسليم في المخزن',
        campaign_name: 'تبرع ملابس عام',
        address: 'المخزن المركزي - منصة كسوة',
        pickup_date: new Date().toISOString().slice(0, 10),
        donation_category: 'clothes',
        status: 'تم الفرز بالمخزن',
        quantity_label: `${quantity} قطعة (${ICON_LABELS[category]})`,
        pieces_count: quantity,
        declared_pieces_count: quantity,
        actual_pieces_count: quantity,
        verified_by: currentUser.id,
        verified_at: new Date().toISOString(),
        employee_notes: 'إدخال مباشر لرصيد المخزن'
      }])
      .select()
      .single();

    if (donErr) throw donErr;

    const { error: itemErr } = await sb.from('donation_items').insert([{
      donation_id: donation.id,
      item_icon: category,
      quantity,
      size_label: size,
      gender_age: category === 'kids_wear' ? 'kids' : 'unisex',
      condition_label: condition,
      details: 'رصيد مخزن معتمد'
    }]);

    if (itemErr) throw itemErr;
  },

  async dispenseFromWarehouse({ familyName, familyAddress, category, size, quantity }) {
    const { data: donation, error: donErr } = await sb
      .from('donations')
      .insert([{
        user_id: currentUser.id,
        donor_name: `صرف لأسرة: ${familyName}`,
        pickup_mode: 'صرف من المخزن',
        campaign_name: 'توزيع للأسر المستفيدة',
        address: familyAddress || 'توصيل للأسرة المستفيدة',
        pickup_date: new Date().toISOString().slice(0, 10),
        donation_category: 'clothes',
        status: 'تم التوزيع للأسرة المستحقة',
        quantity_label: `${quantity} قطعة (${ICON_LABELS[category]})`,
        pieces_count: quantity,
        declared_pieces_count: quantity,
        actual_pieces_count: quantity,
        verified_by: currentUser.id,
        verified_at: new Date().toISOString(),
        employee_notes: `صرف مخزني إلى الأسرة: ${familyName}`
      }])
      .select()
      .single();

    if (donErr) throw donErr;

    const { error: itemErr } = await sb.from('donation_items').insert([{
      donation_id: donation.id,
      item_icon: category,
      quantity,
      size_label: size,
      gender_age: category === 'kids_wear' ? 'kids' : 'unisex',
      condition_label: 'like_new',
      details: `صرف للأسرة: ${familyName}`
    }]);

    if (itemErr) throw itemErr;
  },

  async updateUserRole(userId, newRole) {
    const { error } = await sb.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) throw error;
  },

  async deleteDonation(donationId) {
    const { error } = await sb.from('donations').delete().eq('id', donationId);
    if (error) throw error;
  }
};

function normalizePipelineStage(donation) {
  const s = String(donation.status || '').toLowerCase();
  if (s.includes('توزيع') || s.includes('distributed') || String(donation.donor_name || '').startsWith('صرف لأسرة:')) {
    return 'distributed';
  }
  if (s.includes('فرز') || s.includes('مخزن') || s.includes('sorted')) {
    return 'sorted';
  }
  if (s.includes('فحص') || s.includes('inspected') || (donation.actual_pieces_count !== null && donation.actual_pieces_count !== undefined)) {
    return 'inspected';
  }
  return 'received';
}

document.addEventListener('DOMContentLoaded', async () => {
  window.KiswahLoader.show('جاري تحميل لوحة الإدارة والمخزن...');

  sb = await window.KiswahRealtime.getClient();
  if (!sb) {
    window.KiswahLoader.hide();
    window.showKiswahToast('تعذر الاتصال بقاعدة البيانات.');
    return;
  }

  const authData = await KiswahService.getSessionAndProfile();
  if (!authData || !authData.profile || !['admin', 'super_admin'].includes(authData.profile.role)) {
    window.KiswahLoader.hide();
    window.location.href = 'login.html';
    return;
  }

  currentUser = authData.user;
  currentProfile = authData.profile;

  setupRoleUI();
  setupSidebarNavigation();
  setupEventListeners();
  await loadAndRenderAll();

  window.KiswahRealtime.subscribe(() => {
    loadAndRenderAll();
  });

  window.KiswahLoader.hide();
});

function setupRoleUI() {
  const isSuper = currentProfile.role === 'super_admin';
  document.getElementById('sidebar-user-name').textContent = currentProfile.full_name || currentProfile.username;
  document.getElementById('sidebar-user-email').textContent = currentProfile.email;
  document.getElementById('sidebar-role-pill').textContent = isSuper ? 'Super Admin' : 'Admin';

  if (isSuper) {
    document.getElementById('nav-admins-btn').style.display = 'flex';
  }
}

window.switchAdminScreen = function (screenKey) {
  const titles = {
    overview: { eyebrow: 'مركز القيادة والمخزن', title: 'نظرة عامة على المنصة' },
    donations: { eyebrow: 'مسار العمليات', title: 'إدارة التبرعات ومسار الفرز (Pipeline)' },
    warehouse: { eyebrow: 'المستودع المركزي', title: 'المخزن وجرد الملابس المربوط' },
    volunteers: { eyebrow: 'العمليات الميدانية', title: 'المتطوعون ومندوبو الاستلام' },
    families: { eyebrow: 'الرعاية الاجتماعية', title: 'الأسر المستفيدة وطلبات الكسوة' },
    reports: { eyebrow: 'التحليلات والتصدير', title: 'التقارير وتصدير ملفات Excel' },
    admins: { eyebrow: 'صلاحيات Super Admin', title: 'إدارة المشرفين والصلاحيات' }
  };

  document.querySelectorAll('.sidebar-link').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-screen') === screenKey);
  });

  document.querySelectorAll('.admin-screen').forEach(sec => {
    sec.classList.toggle('active', sec.id === `screen-${screenKey}`);
  });

  if (titles[screenKey]) {
    document.getElementById('topbar-eyebrow').textContent = titles[screenKey].eyebrow;
    document.getElementById('topbar-title').textContent = titles[screenKey].title;
  }
};

function setupSidebarNavigation() {
  document.querySelectorAll('.sidebar-link[data-screen]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchAdminScreen(btn.getAttribute('data-screen'));
    });
  });
}

function setupEventListeners() {
  document.getElementById('refresh-all-btn').addEventListener('click', async () => {
    window.KiswahLoader.show('جاري تحديث البيانات...');
    await loadAndRenderAll();
    window.KiswahLoader.hide();
    window.showKiswahToast('تم تحديث جميع البيانات بنجاح.');
  });

  document.getElementById('don-search').addEventListener('input', renderDonationsPipeline);
  document.getElementById('don-pipeline-filter').addEventListener('change', renderDonationsPipeline);
  document.getElementById('don-campaign-filter').addEventListener('change', renderDonationsPipeline);

  document.getElementById('wh-filter-category').addEventListener('change', renderWarehouseScreen);
  document.getElementById('wh-filter-condition').addEventListener('change', renderWarehouseScreen);

  document.getElementById('vol-search').addEventListener('input', renderVolunteersScreen);
  document.getElementById('fam-search').addEventListener('input', renderFamiliesScreen);

  document.getElementById('rep-date-from').addEventListener('change', renderReportsPreview);
  document.getElementById('rep-date-to').addEventListener('change', renderReportsPreview);
  document.getElementById('rep-campaign').addEventListener('change', renderReportsPreview);
  document.getElementById('rep-pipeline').addEventListener('change', renderReportsPreview);
  document.getElementById('export-excel-btn').addEventListener('click', exportExcelReport);

  const admSearch = document.getElementById('adm-manage-search');
  if (admSearch) admSearch.addEventListener('input', renderAdminsScreen);

  // إضافة رصيد وارد للمخزن
  document.getElementById('wh-add-stock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const category = document.getElementById('wh-in-category').value;
    const size = document.getElementById('wh-in-size').value;
    const condition = document.getElementById('wh-in-condition').value;
    const quantity = parseInt(document.getElementById('wh-in-qty').value, 10);

    window.KiswahLoader.show('جاري تسجيل الوارد في المخزن...');
    try {
      await KiswahService.addWarehouseEntry({ category, size, condition, quantity });
      await loadAndRenderAll();
      window.KiswahLoader.hide();
      window.showKiswahToast(`تمت إضافة ${quantity} قطعة (${ICON_LABELS[category]}) إلى رصيد المخزن.`);
    } catch (err) {
      window.KiswahLoader.hide();
      window.showKiswahToast('خطأ: ' + err.message);
    }
  });

  // صرف من المخزن إلى أسرة مستفيدة
  document.getElementById('wh-dispense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const familySelect = document.getElementById('wh-out-family');
    const familyName = familySelect.options[familySelect.selectedIndex]?.text || 'أسرة مستفيدة';
    const category = document.getElementById('wh-out-category').value;
    const size = document.getElementById('wh-out-size').value;
    const quantity = parseInt(document.getElementById('wh-out-qty').value, 10);

    window.KiswahLoader.show('جاري اعتماد الصرف وخصم الكمية من المخزن...');
    try {
      await KiswahService.dispenseFromWarehouse({ familyName, category, size, quantity });
      await loadAndRenderAll();
      window.KiswahLoader.hide();
      window.showKiswahToast(`تم صرف ${quantity} قطعة إلى (${familyName}) وتحديث المخزن.`);
    } catch (err) {
      window.KiswahLoader.hide();
      window.showKiswahToast('خطأ: ' + err.message);
    }
  });

  // تسجيل الخروج
  const logoutBtn = document.querySelector('[data-logout-btn]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      window.KiswahLoader.show('جاري تسجيل الخروج...');
      await sb.auth.signOut();
      window.location.href = 'login.html';
    });
  }
}

async function loadAndRenderAll() {
  try {
    const [donations, profiles] = await Promise.all([
      KiswahService.fetchDonations(),
      KiswahService.fetchProfiles()
    ]);
    allDonations = donations;
    allProfiles = profiles;

    renderOverviewScreen();
    renderDonationsPipeline();
    renderWarehouseScreen();
    renderVolunteersScreen();
    renderFamiliesScreen();
    renderReportsPreview();
    if (currentProfile.role === 'super_admin') {
      renderAdminsScreen();
    }
  } catch (err) {
    console.error(err);
    window.showKiswahToast('تعذر تحديث بعض البيانات: ' + err.message);
  }
}

function animateCounter(el, targetValue, suffix = '') {
  if (!el) return;
  const start = 0;
  const duration = 650;
  const startTime = performance.now();

  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (targetValue - start) * eased);
    el.textContent = current.toLocaleString('en-US') + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function computeWarehouseLedger() {
  const ledger = {};
  let totalIn = 0;
  let totalOut = 0;

  allDonations.forEach(d => {
    const stage = normalizePipelineStage(d);
    const items = (d.donation_items && d.donation_items.length > 0)
      ? d.donation_items
      : [{
          item_icon: 'tshirt',
          quantity: d.actual_pieces_count ?? d.declared_pieces_count ?? d.pieces_count ?? 0,
          size_label: 'L',
          condition_label: 'like_new'
        }];

    items.forEach(item => {
      const cat = item.item_icon || 'tshirt';
      const size = item.size_label || 'L';
      const cond = item.condition_label || 'like_new';
      const qty = Number(item.quantity || 0);
      const key = `${cat}__${size}__${cond}`;

      if (!ledger[key]) {
        ledger[key] = { key, category: cat, size, condition: cond, inQty: 0, outQty: 0, available: 0 };
      }

      if (stage === 'distributed') {
        ledger[key].outQty += qty;
        totalOut += qty;
      } else if (stage === 'inspected' || stage === 'sorted') {
        ledger[key].inQty += qty;
        totalIn += qty;
      }
    });
  });

  Object.values(ledger).forEach(entry => {
    entry.available = Math.max(0, entry.inQty - entry.outQty);
  });

  return {
    items: Object.values(ledger),
    totalIn,
    totalOut,
    availableTotal: Math.max(0, totalIn - totalOut)
  };
}

function renderOverviewScreen() {
  const incomingDonations = allDonations.filter(d => !String(d.donor_name || '').startsWith('صرف لأسرة:'));
  const pendingCount = incomingDonations.filter(d => normalizePipelineStage(d) === 'received').length;
  const volunteersCount = allProfiles.filter(p => p.role === 'employee').length;
  const ledger = computeWarehouseLedger();

  document.getElementById('nav-badge-donations').textContent = incomingDonations.length;
  document.getElementById('nav-badge-warehouse').textContent = ledger.availableTotal;

  animateCounter(document.getElementById('kpi-total-donations'), incomingDonations.length);
  animateCounter(document.getElementById('kpi-distributed-pieces'), ledger.totalOut + ledger.availableTotal);
  animateCounter(document.getElementById('kpi-active-volunteers'), volunteersCount);
  animateCounter(document.getElementById('kpi-pending-inspections'), pendingCount);

  document.getElementById('kpi-warehouse-sub').textContent = `متاح بالمخزن: ${ledger.availableTotal} قطعة • موزع: ${ledger.totalOut} قطعة`;

  renderOverviewCharts();

  const recentContainer = document.getElementById('overview-recent-list');
  const recent = allDonations.slice(0, 6);
  if (recent.length === 0) {
    recentContainer.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);">لا توجد عمليات مسجلة بعد.</div>`;
    return;
  }

  recentContainer.innerHTML = recent.map(d => {
    const stage = normalizePipelineStage(d);
    const cfg = PIPELINE_CONFIG[stage];
    const pieces = d.actual_pieces_count ?? d.declared_pieces_count ?? d.pieces_count ?? 0;
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding:12px 16px; background:var(--bg-page); border:1px solid var(--border-light); border-radius:14px;">
        <div>
          <strong>${d.donor_name || 'متبرع'}</strong>
          <span style="font-size:12.5px; color:var(--text-muted); margin-right:8px;">• ${d.campaign_name || 'تبرع عام'} (${pieces} قطعة)</span>
        </div>
        <span class="status-pill ${cfg.css}">${cfg.label}</span>
      </div>
    `;
  }).join('');
}

function renderOverviewCharts() {
  if (typeof Chart === 'undefined') return;

  // 1. رسم بياني للتبرعات عبر الزمن
  const byDate = {};
  allDonations.forEach(d => {
    const day = (d.pickup_date || (d.created_at ? d.created_at.slice(0, 10) : 'غير محدد'));
    const pieces = d.actual_pieces_count ?? d.declared_pieces_count ?? d.pieces_count ?? 0;
    byDate[day] = (byDate[day] || 0) + pieces;
  });

  const sortedDates = Object.keys(byDate).sort().slice(-7);
  const dateValues = sortedDates.map(k => byDate[k]);

  const ctxTime = document.getElementById('donationsTimelineChart');
  if (ctxTime) {
    if (timelineChartInstance) timelineChartInstance.destroy();
    timelineChartInstance = new Chart(ctxTime, {
      type: 'line',
      data: {
        labels: sortedDates.length ? sortedDates : ['اليوم'],
        datasets: [{
          label: 'عدد القطع',
          data: dateValues.length ? dateValues : [0],
          borderColor: '#183A2C',
          backgroundColor: 'rgba(24, 58, 44, 0.12)',
          pointBackgroundColor: '#C59B27',
          pointRadius: 5,
          borderWidth: 3,
          fill: true,
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#EFECE6' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // 2. رسم بياني للتوزيع حسب فئة الملابس
  const catTotals = { tshirt: 0, pants: 0, jacket: 0, shirt: 0, dress: 0, kids_wear: 0 };
  allDonations.forEach(d => {
    (d.donation_items || []).forEach(item => {
      if (catTotals[item.item_icon] !== undefined) {
        catTotals[item.item_icon] += Number(item.quantity || 0);
      }
    });
  });

  const ctxCat = document.getElementById('categoryDistributionChart');
  if (ctxCat) {
    if (categoryChartInstance) categoryChartInstance.destroy();
    categoryChartInstance = new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: Object.keys(catTotals).map(k => ICON_LABELS[k]),
        datasets: [{
          data: Object.values(catTotals),
          backgroundColor: ['#183A2C', '#C59B27', '#2E6B52', '#D8B863', '#4B7F6A', '#8E6D13'],
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'IBM Plex Sans Arabic' } } }
        }
      }
    });
  }
}

function renderDonationsPipeline() {
  const tbody = document.getElementById('donations-pipeline-tbody');
  const q = document.getElementById('don-search').value.trim().toLowerCase();
  const stageFilter = document.getElementById('don-pipeline-filter').value;
  const campFilter = document.getElementById('don-campaign-filter').value;

  const filtered = allDonations.filter(d => {
    const stage = normalizePipelineStage(d);
    if (stageFilter !== 'all' && stage !== stageFilter) return false;
    if (campFilter !== 'all' && d.campaign_name !== campFilter) return false;
    if (!q) return true;
    const hay = `${d.id} ${d.donor_name || ''} ${d.phone || ''} ${d.address || ''} ${d.campaign_name || ''}`.toLowerCase();
    return hay.includes(q);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:28px; color:var(--text-muted);">لا توجد تبرعات مطابقة لمعايير التصفية.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(d => {
    const stage = normalizePipelineStage(d);
    const cfg = PIPELINE_CONFIG[stage];
    const declared = d.declared_pieces_count || d.pieces_count || 0;
    const actual = d.actual_pieces_count;
    const dateStr = d.pickup_date || (d.created_at ? d.created_at.slice(0, 10) : '-');

    const itemsSummary = (d.donation_items || []).map(i =>
      `${ICON_LABELS[i.item_icon] || i.item_icon} (${i.quantity}) - ${i.size_label}`
    ).join(' • ');

    const photosHtml = (d.donation_photos || []).map(p => `
      <a href="${p.photo_url}" target="_blank" rel="noopener">
        <img src="${p.photo_url}" alt="فحص" style="width:38px; height:38px; object-fit:cover; border-radius:8px; border:1px solid var(--border-light);">
      </a>
    `).join('');

    return `
      <tr>
        <td>
          <strong>#${String(d.id).slice(0, 6).toUpperCase()}</strong><br>
          <span style="font-size:12px; color:var(--text-muted);">${dateStr}</span>
        </td>
        <td>
          <strong>${d.donor_name || 'متبرع'}</strong><br>
          <span style="font-size:12px; color:var(--text-muted); direction:ltr; display:inline-block;">${d.phone || '-'}</span><br>
          <span style="font-size:11.5px; color:var(--text-muted);">${d.address || '-'}</span>
        </td>
        <td style="max-width:230px;">
          <div style="font-weight:600; color:var(--green-dark); margin-bottom:2px;">${d.campaign_name || 'تبرع عام'}</div>
          <div style="font-size:12px; color:var(--text-muted);">${itemsSummary || `${declared} قطعة ملابس`}</div>
        </td>
        <td>
          <div>معلن: <strong>${declared}</strong></div>
          <div>فعلي: <strong>${actual !== null && actual !== undefined ? actual : '—'}</strong></div>
        </td>
        <td>
          ${photosHtml ? `<div style="display:flex; gap:4px;">${photosHtml}</div>` : '<span style="font-size:12px; color:var(--text-muted);">لا يوجد</span>'}
        </td>
        <td>
          <span class="status-pill ${cfg.css}" style="margin-bottom:6px;">${cfg.label}</span>
          <div class="input-capsule" style="height:34px; padding:0 10px;">
            <select style="font-size:12px;" onchange="handlePipelineChange('${d.id}', this.value)">
              <option value="received" ${stage === 'received' ? 'selected' : ''}>1. تم الاستلام</option>
              <option value="inspected" ${stage === 'inspected' ? 'selected' : ''}>2. تم الفحص</option>
              <option value="sorted" ${stage === 'sorted' ? 'selected' : ''}>3. تم الفرز بالمخزن</option>
              <option value="distributed" ${stage === 'distributed' ? 'selected' : ''}>4. تم التوزيع</option>
            </select>
          </div>
        </td>
        <td>
          <button type="button" class="btn-danger" onclick="handleDeleteDonation('${d.id}')">حذف</button>
        </td>
      </tr>
    `;
  }).join('');
}

window.handlePipelineChange = async (donationId, newStage) => {
  window.KiswahLoader.show('جاري تحديث مرحلة المسار ومزامنة المخزن...');
  try {
    await KiswahService.updateDonationPipeline(donationId, newStage);
    await loadAndRenderAll();
    window.KiswahLoader.hide();
    window.showKiswahToast('تم تحديث مرحلة الطلب وتحديث رصيد المخزن تلقائياً.');
  } catch (err) {
    window.KiswahLoader.hide();
    window.showKiswahToast('خطأ: ' + err.message);
  }
};

window.handleDeleteDonation = async (donationId) => {
  if (!confirm('هل أنت متأكد من حذف هذا السجل نهائياً؟')) return;
  window.KiswahLoader.show('جاري الحذف...');
  try {
    await KiswahService.deleteDonation(donationId);
    await loadAndRenderAll();
    window.KiswahLoader.hide();
    window.showKiswahToast('تم حذف السجل.');
  } catch (err) {
    window.KiswahLoader.hide();
    window.showKiswahToast('خطأ: ' + err.message);
  }
};

function renderWarehouseScreen() {
  const ledger = computeWarehouseLedger();
  const catFilter = document.getElementById('wh-filter-category').value;
  const condFilter = document.getElementById('wh-filter-condition').value;

  const lowItems = ledger.items.filter(i => i.available > 0 && i.available < 5);

  document.getElementById('wh-kpi-in').textContent = `${ledger.totalIn} قطعة`;
  document.getElementById('wh-kpi-out').textContent = `${ledger.totalOut} قطعة`;
  document.getElementById('wh-kpi-available').textContent = `${ledger.availableTotal} قطعة`;
  document.getElementById('wh-kpi-low').textContent = lowItems.length;

  // تعبئة قائمة الأسر في نموذج الصرف من المخزن
  const famSelect = document.getElementById('wh-out-family');
  const families = allProfiles.filter(p => p.account_type === 'beneficiary' || p.role === 'beneficiary');
  if (families.length > 0) {
    famSelect.innerHTML = families.map(f => `<option value="${f.id}">${f.full_name || f.username}</option>`).join('');
  } else {
    famSelect.innerHTML = `
      <option value="family-1">أسرة أم كريم (حي السلام)</option>
      <option value="family-2">أسرة محمود حسن (مدينة نصر)</option>
      <option value="family-3">أسرة سعاد عبد الله (الشروق)</option>
    `;
  }

  const filteredItems = ledger.items.filter(item => {
    if (catFilter !== 'all' && item.category !== catFilter) return false;
    if (condFilter !== 'all' && item.condition !== condFilter) return false;
    return true;
  });

  const grid = document.getElementById('warehouse-cards-grid');
  if (filteredItems.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:32px; color:var(--text-muted);">لا توجد أصناف مخزنية مطابقة. قم باعتماد تبرعات أو إضافة وارد جديد للمخزن.</div>`;
    return;
  }

  grid.innerHTML = filteredItems.map(item => {
    const pct = item.inQty > 0 ? Math.min(100, Math.round((item.available / item.inQty) * 100)) : 0;
    const meterClass = item.available === 0 ? 'empty' : (item.available < 5 ? 'low' : '');
    const statusBadge = item.available === 0
      ? '<span class="status-pill" style="background:var(--error-soft); color:var(--error-red);">نفد المخزون</span>'
      : (item.available < 5
        ? '<span class="status-pill status-inspected">مخزون منخفض</span>'
        : '<span class="status-pill status-sorted">متوفر بالمخزن</span>');

    return `
      <div class="stock-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:16px;">${ICON_LABELS[item.category] || item.category}</strong>
          ${statusBadge}
        </div>
        <div style="font-size:12.5px; color:var(--text-muted); margin-bottom:10px;">
          المقاس: <strong>${item.size}</strong> • الحالة: <strong>${CONDITION_LABELS[item.condition] || item.condition}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:13px;">
          <span>المتاح حالياً: <strong style="color:var(--green-dark); font-size:16px;">${item.available}</strong> قطعة</span>
          <span style="color:var(--text-muted);">الوارد: ${item.inQty} | المصروف: ${item.outQty}</span>
        </div>
        <div class="stock-meter">
          <div class="stock-meter-fill ${meterClass}" style="width:${pct}%;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderVolunteersScreen() {
  const tbody = document.getElementById('volunteers-tbody');
  const q = document.getElementById('vol-search').value.trim().toLowerCase();

  const volunteers = allProfiles.filter(p => {
    if (p.role !== 'employee') return false;
    if (!q) return true;
    return `${p.full_name || ''} ${p.email || ''} ${p.phone || ''}`.toLowerCase().includes(q);
  });

  if (volunteers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:var(--text-muted);">لا يوجد متطوعون أو مندوبون مسجلون حالياً.</td></tr>`;
    return;
  }

  tbody.innerHTML = volunteers.map(v => {
    const verifiedOrders = allDonations.filter(d => d.verified_by === v.id);
    const totalPieces = verifiedOrders.reduce((s, d) => s + (d.actual_pieces_count ?? d.declared_pieces_count ?? 0), 0);

    return `
      <tr>
        <td><strong>${v.full_name || v.username}</strong></td>
        <td>
          <div>${v.email}</div>
          <div style="font-size:12px; color:var(--text-muted); direction:ltr; text-align:right;">${v.phone || '-'}</div>
        </td>
        <td><strong>${verifiedOrders.length}</strong> طلب</td>
        <td><strong>${totalPieces}</strong> قطعة</td>
        <td><span class="status-pill status-sorted">نشط ميدانياً</span></td>
      </tr>
    `;
  }).join('');
}

function renderFamiliesScreen() {
  const tbody = document.getElementById('families-tbody');
  const q = document.getElementById('fam-search').value.trim().toLowerCase();

  const families = allProfiles.filter(p => {
    const isFam = p.account_type === 'beneficiary' || p.role === 'beneficiary';
    if (!isFam) return false;
    if (!q) return true;
    return `${p.full_name || ''} ${p.email || ''} ${p.phone || ''}`.toLowerCase().includes(q);
  });

  if (families.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:28px; color:var(--text-muted);">لا توجد أسر مسجلة في قاعدة البيانات بعد. يمكنك صرف طرود مباشرة من شاشة المخزن.</td></tr>`;
    return;
  }

  tbody.innerHTML = families.map(f => {
    const famName = f.full_name || f.username;
    const deliveries = allDonations.filter(d => String(d.donor_name || '').includes(famName));
    const receivedPieces = deliveries.reduce((s, d) => s + (d.actual_pieces_count ?? d.pieces_count ?? 0), 0);

    return `
      <tr>
        <td><strong>${famName}</strong></td>
        <td>
          <div>${f.email}</div>
          <div style="font-size:12px; color:var(--text-muted); direction:ltr; text-align:right;">${f.phone || '-'}</div>
        </td>
        <td><strong>${deliveries.length}</strong> طرد</td>
        <td><strong>${receivedPieces}</strong> قطعة</td>
        <td>
          <button type="button" class="btn-secondary" style="height:34px; padding:0 14px; font-size:12px;" onclick="switchAdminScreen('warehouse')">صرف من المخزن</button>
        </td>
      </tr>
    `;
  }).join('');
}

function getFilteredReportRows() {
  const from = document.getElementById('rep-date-from').value;
  const to = document.getElementById('rep-date-to').value;
  const camp = document.getElementById('rep-campaign').value;
  const pipe = document.getElementById('rep-pipeline').value;

  return allDonations.filter(d => {
    const dateVal = d.pickup_date || (d.created_at ? d.created_at.slice(0, 10) : '');
    if (from && dateVal && dateVal < from) return false;
    if (to && dateVal && dateVal > to) return false;
    if (camp !== 'all' && d.campaign_name !== camp) return false;
    if (pipe !== 'all' && normalizePipelineStage(d) !== pipe) return false;
    return true;
  });
}

function renderReportsPreview() {
  const tbody = document.getElementById('reports-preview-tbody');
  const rows = getFilteredReportRows();

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--text-muted);">لا توجد بيانات في النطاق الزمني المحدد.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(d => {
    const stage = normalizePipelineStage(d);
    const cfg = PIPELINE_CONFIG[stage];
    const dateVal = d.pickup_date || (d.created_at ? d.created_at.slice(0, 10) : '-');
    return `
      <tr>
        <td>${dateVal}</td>
        <td><strong>${d.donor_name || 'متبرع'}</strong></td>
        <td>${d.campaign_name || 'تبرع عام'}</td>
        <td><span class="status-pill ${cfg.css}">${cfg.label}</span></td>
        <td>${d.declared_pieces_count || d.pieces_count || 0}</td>
        <td><strong>${d.actual_pieces_count ?? '—'}</strong></td>
      </tr>
    `;
  }).join('');
}

function exportExcelReport() {
  if (typeof XLSX === 'undefined') {
    window.showKiswahToast('مكتبة التصدير قيد التحميل، حاول مرة أخرى.');
    return;
  }

  const rows = getFilteredReportRows();
  const ledger = computeWarehouseLedger();

  const donationsSheetData = rows.map(d => ({
    'رقم الطلب': String(d.id).slice(0, 8).toUpperCase(),
    'التاريخ': d.pickup_date || (d.created_at ? d.created_at.slice(0, 10) : ''),
    'المتبرع / الجهة': d.donor_name || '',
    'الهاتف': d.phone || '',
    'العنوان': d.address || '',
    'المبادرة': d.campaign_name || '',
    'المرحلة': PIPELINE_CONFIG[normalizePipelineStage(d)].label,
    'القطع المعلنة': d.declared_pieces_count || d.pieces_count || 0,
    'القطع الفعلية': d.actual_pieces_count ?? 0
  }));

  const warehouseSheetData = ledger.items.map(i => ({
    'الفئة': ICON_LABELS[i.category] || i.category,
    'المقاس': i.size,
    'الحالة': CONDITION_LABELS[i.condition] || i.condition,
    'إجمالي الوارد': i.inQty,
    'إجمالي المصروف': i.outQty,
    'الرصيد المتاح بالمخزن': i.available
  }));

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(donationsSheetData);
  const ws2 = XLSX.utils.json_to_sheet(warehouseSheetData);

  XLSX.utils.book_append_sheet(wb, ws1, 'سجل التبرعات');
  XLSX.utils.book_append_sheet(wb, ws2, 'جرد المخزن');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `تقرير_منصة_كسوة_${today}.xlsx`);
  window.showKiswahToast('تم تصدير ملف Excel بنجاح!');
}

function renderAdminsScreen() {
  const tbody = document.getElementById('admins-manage-tbody');
  if (!tbody) return;
  const q = document.getElementById('adm-manage-search').value.trim().toLowerCase();

  const filtered = allProfiles.filter(p => {
    if (!q) return true;
    return `${p.full_name || ''} ${p.email || ''} ${p.username || ''}`.toLowerCase().includes(q);
  });

  tbody.innerHTML = filtered.map(p => `
    <tr>
      <td><strong>${p.full_name || p.username}</strong></td>
      <td>${p.email}</td>
      <td style="direction:ltr; text-align:right;">${p.phone || '-'}</td>
      <td><span class="status-pill status-sorted">${p.role}</span></td>
      <td>
        <div class="input-capsule" style="height:36px; padding:0 10px; max-width:210px;">
          <select style="font-size:12px;" onchange="handleRoleUpdate('${p.id}', this.value)">
            <option value="donor" ${p.role === 'donor' ? 'selected' : ''}>متبرع / مستخدم</option>
            <option value="employee" ${p.role === 'employee' ? 'selected' : ''}>متطوع / مندوب (employee)</option>
            <option value="admin" ${p.role === 'admin' ? 'selected' : ''}>مشرف مخزن وإدارة (admin)</option>
            <option value="super_admin" ${p.role === 'super_admin' ? 'selected' : ''}>مدير عام (super_admin)</option>
          </select>
        </div>
      </td>
    </tr>
  `).join('');
}

window.handleRoleUpdate = async (userId, newRole) => {
  window.KiswahLoader.show('جاري تحديث الصلاحية...');
  try {
    await KiswahService.updateUserRole(userId, newRole);
    await loadAndRenderAll();
    window.KiswahLoader.hide();
    window.showKiswahToast('تم تحديث رتبة الحساب بنجاح.');
  } catch (err) {
    window.KiswahLoader.hide();
    window.showKiswahToast('خطأ: ' + err.message);
  }
};