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

let sb = null;
let currentUser = null;
let currentProfile = null;
let allDonations = [];
let currentFilter = 'pending';

document.addEventListener('DOMContentLoaded', async () => {
  window.KiswahLoader.show('جاري تحميل بوابة العمليات الميدانية...');

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

  if (!currentProfile || currentProfile.role === 'donor') {
    window.location.href = 'dashboard.html';
    return;
  }

  document.getElementById('emp-user-name').textContent = `الموظف: ${currentProfile.full_name || currentProfile.username}`;
  document.getElementById('emp-user-email').textContent = `${currentProfile.email} • الصلاحية: ${currentProfile.role}`;

  setupFilterControls();
  setupInspectionForm();
  setupLogoutButton();
  await loadFieldTasks();

  window.KiswahRealtime.subscribe(() => {
    loadFieldTasks();
  });

  window.KiswahLoader.hide();
});

function setupFilterControls() {
  document.querySelectorAll('.emp-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emp-filter-btn').forEach(b => {
        b.style.background = 'var(--white)';
        b.style.color = 'var(--text-main)';
      });
      btn.style.background = 'var(--green-dark)';
      btn.style.color = 'var(--white)';
      currentFilter = btn.getAttribute('data-emp-filter');
      renderTasksList();
    });
  });

  const activeBtn = document.querySelector('.emp-filter-btn[data-emp-filter="pending"]');
  if (activeBtn) {
    activeBtn.style.background = 'var(--green-dark)';
    activeBtn.style.color = 'var(--white)';
  }

  document.getElementById('emp-search-input').addEventListener('input', renderTasksList);
  document.getElementById('emp-select-donation').addEventListener('change', updateSelectedOrderPreview);
}

async function loadFieldTasks() {
  const { data, error } = await sb
    .from('donations')
    .select('*, donation_items(*), donation_photos(*)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  allDonations = data || [];

  const pendingCount = allDonations.filter(d => d.actual_pieces_count === null || d.actual_pieces_count === undefined).length;
  const myVerifiedCount = allDonations.filter(d => d.verified_by === currentUser.id).length;
  const actualPiecesSum = allDonations.reduce((s, d) => s + (d.actual_pieces_count ?? 0), 0);

  document.getElementById('emp-kpi-pending').textContent = pendingCount;
  document.getElementById('emp-kpi-my-verified').textContent = myVerifiedCount;
  document.getElementById('emp-kpi-actual-pieces').textContent = `${actualPiecesSum} قطعة`;
  document.getElementById('emp-kpi-total').textContent = allDonations.length;

  populateSelectBox();
  renderTasksList();
}

function populateSelectBox() {
  const select = document.getElementById('emp-select-donation');
  const currentVal = select.value;

  select.innerHTML = allDonations.map(d => {
    const declared = d.declared_pieces_count || d.pieces_count || 0;
    const tag = d.actual_pieces_count !== null ? '[تم الفحص]' : '[بانتظار الاستلام]';
    return `
      <option value="${d.id}">
        ${tag} ${d.donor_name || 'متبرع'} — ${declared} قطعة (${d.address})
      </option>
    `;
  }).join('');

  if (currentVal && allDonations.some(d => String(d.id) === String(currentVal))) {
    select.value = currentVal;
  }
  updateSelectedOrderPreview();
}

function updateSelectedOrderPreview() {
  const select = document.getElementById('emp-select-donation');
  const box = document.getElementById('emp-selected-order-preview');
  const order = allDonations.find(d => String(d.id) === String(select.value));

  if (!order) {
    box.innerHTML = 'لا توجد طلبات متاحة حالياً.';
    return;
  }

  const declared = order.declared_pieces_count || order.pieces_count || 0;
  document.getElementById('emp-actual-pieces').value = order.actual_pieces_count || declared;

  const itemsSummary = (order.donation_items || []).map(i =>
    `${ICON_LABELS[i.item_icon] || i.item_icon}: ${i.quantity} (${GENDER_LABELS[i.gender_age] || i.gender_age} - ${i.size_label})`
  ).join(' • ');

  box.innerHTML = `
    <div style="font-weight:700; margin-bottom:4px;">المتبرع: ${order.donor_name || 'غير محدد'}</div>
    <div>الهاتف: <a href="tel:${order.phone}" style="font-weight:700; color:var(--green-dark); direction:ltr; display:inline-block;">${order.phone || '-'}</a></div>
    <div>العنوان: <strong>${order.address}</strong> (${order.pickup_mode})</div>
    <div style="margin-top:6px; padding-top:6px; border-top:1px dashed var(--border-light);">
      <strong>الأصناف المعلنة (${declared} قطعة):</strong><br>
      <span style="color:var(--text-muted);">${itemsSummary || `${declared} قطعة ملابس`}</span>
    </div>
  `;
}

window.selectTaskForInspection = function (donationId) {
  const select = document.getElementById('emp-select-donation');
  select.value = donationId;
  updateSelectedOrderPreview();
  select.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

function renderTasksList() {
  const container = document.getElementById('emp-tasks-list');
  const q = document.getElementById('emp-search-input').value.trim().toLowerCase();

  const filtered = allDonations.filter(d => {
    const isVerified = d.actual_pieces_count !== null && d.actual_pieces_count !== undefined;
    if (currentFilter === 'pending' && isVerified) return false;
    if (currentFilter === 'verified' && !isVerified) return false;

    if (!q) return true;
    const hay = `${d.donor_name || ''} ${d.address || ''} ${d.phone || ''} ${d.campaign_name || ''}`.toLowerCase();
    return hay.includes(q);
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted);">لا توجد مهام مطابقة للتصفية الحالية.</div>`;
    return;
  }

  container.innerHTML = filtered.map(d => {
    const declared = d.declared_pieces_count || d.pieces_count || 0;
    const hasActual = d.actual_pieces_count !== null && d.actual_pieces_count !== undefined;

    const itemsBadges = (d.donation_items || []).map(item => `
      <span style="display:inline-block; background:var(--white); border:1px solid var(--border-light); padding:4px 10px; border-radius:8px; font-size:12px;">
        <strong>${ICON_LABELS[item.item_icon] || item.item_icon} (${item.quantity})</strong> — ${GENDER_LABELS[item.gender_age] || item.gender_age} • ${item.size_label} • ${CONDITION_LABELS[item.condition_label] || item.condition_label}
        ${item.details ? ` (${item.details})` : ''}
      </span>
    `).join(' ');

    const photosHtml = (d.donation_photos || []).map(p => `
      <a href="${p.photo_url}" target="_blank" rel="noopener">
        <img src="${p.photo_url}" alt="صورة الفحص" style="width:48px; height:48px; object-fit:cover; border-radius:8px; border:1px solid var(--border-light);">
      </a>
    `).join('');

    return `
      <article class="donation-item" style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <strong style="font-size:16px;">${d.donor_name || 'متبرع'}</strong>
            <span style="font-size:12px; color:var(--gold); font-weight:700; margin-right:8px;">• ${d.campaign_name || 'تبرع عام'}</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="badge-status" style="background:${hasActual ? 'var(--green-dark)' : 'var(--bg-sand)'}; color:${hasActual ? 'var(--white)' : 'var(--text-main)'};">
              ${hasActual ? 'تم الفحص' : (d.status || 'بانتظار الاستلام')}
            </span>
            <button type="button" class="btn-primary" style="height:34px; padding:0 14px; font-size:12px;" onclick="selectTaskForInspection('${d.id}')">فحص واستلام</button>
          </div>
        </div>

        <div style="font-size:13px; background:var(--white); padding:10px 12px; border-radius:10px; border:1px solid var(--border-light);">
          <div><strong>العنوان:</strong> ${d.address} (${d.pickup_mode})</div>
          <div style="margin-top:4px; display:flex; gap:16px; flex-wrap:wrap;">
            <span><strong>الهاتف:</strong> <a href="tel:${d.phone}" style="color:var(--green-dark); font-weight:700; direction:ltr; display:inline-block;">${d.phone || '-'}</a></span>
            <span><strong>الموعد المطلوب:</strong> ${d.pickup_date || '-'}</span>
          </div>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${itemsBadges || `<span style="font-size:13px;">${declared} قطعة ملابس</span>`}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-top:8px; border-top:1px solid var(--border-light); font-size:13px;">
          <div>
            <span>المعلن: <strong>${declared} قطعة</strong></span>
            <span style="margin:0 8px;">|</span>
            <span>المستلم فعلياً: <strong>${hasActual ? `${d.actual_pieces_count} قطعة` : 'لم يُفحص بعد'}</strong></span>
          </div>
          ${photosHtml ? `<div style="display:flex; gap:6px;">${photosHtml}</div>` : ''}
        </div>

        ${d.employee_notes ? `<div style="font-size:12px; color:var(--text-muted);">ملاحظة الفحص: ${d.employee_notes}</div>` : ''}
      </article>
    `;
  }).join('');
}

function setupInspectionForm() {
  const form = document.getElementById('employee-inspection-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const donationId = document.getElementById('emp-select-donation').value;
    const status = document.getElementById('emp-order-status').value;
    const actualPieces = parseInt(document.getElementById('emp-actual-pieces').value, 10);
    const files = document.getElementById('emp-inspection-photos').files;
    const notes = document.getElementById('emp-notes').value.trim();

    if (!donationId || files.length === 0) {
      window.showKiswahToast('برجاء اختيار الطلب وإرفاق صورة واحدة على الأقل.');
      return;
    }

    const btn = document.getElementById('emp-submit-btn');
    btn.disabled = true;
    window.KiswahLoader.show('جاري رفع صور الفحص وتحديث غرفة العمليات...');

    try {
      for (const file of files) {
        const ext = file.name.split('.').pop();
        const filePath = `${donationId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadErr } = await sb.storage
          .from('donation-inspections')
          .upload(filePath, file);

        if (uploadErr) throw uploadErr;

        const { data: pubData } = sb.storage
          .from('donation-inspections')
          .getPublicUrl(filePath);

        const { error: photoErr } = await sb
          .from('donation_photos')
          .insert([{
            donation_id: donationId,
            uploaded_by: currentUser.id,
            photo_url: pubData.publicUrl,
            actual_count_in_photo: actualPieces,
            notes: notes || null
          }]);

        if (photoErr) throw photoErr;
      }

      const { error: updateErr } = await sb
        .from('donations')
        .update({
          status,
          actual_pieces_count: actualPieces,
          verified_by: currentUser.id,
          verified_at: new Date().toISOString(),
          employee_notes: notes || null
        })
        .eq('id', donationId);

      if (updateErr) throw updateErr;

      document.getElementById('emp-inspection-photos').value = '';
      document.getElementById('emp-notes').value = '';

      await loadFieldTasks();
      window.KiswahLoader.hide();
      window.showKiswahToast('تم اعتماد الفحص وحفظ الصور ومزامنتها مع المتبرع والإدارة.');
    } catch (err) {
      window.KiswahLoader.hide();
      window.showKiswahToast('تعذر حفظ الفحص: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  });
}

function setupLogoutButton() {
  const btn = document.querySelector('[data-logout-btn]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    window.KiswahLoader.show('جاري تسجيل الخروج...');
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
}