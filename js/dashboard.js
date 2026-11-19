const SUPABASE_URL = 'https://zsjetsailonjuwawbpke.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzamV0c2FpbG9uanV3YXdicGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NjkzNDgsImV4cCI6MjEwOTU0NTM0OH0.npaPD7V8FkEcjKbJBNSQPUaQG6EMVphkcJdfIuF-eis';

const sb = window.supabaseClient || window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ICON_LABELS = {
  tshirt: 'تيشيرت',
  pants: 'بنطلون',
  jacket: 'جاكيت',
  shirt: 'قميص',
  dress: 'فستان',
  kids_wear: 'ملابس أطفال'
};

let currentUser = null;
let currentProfile = null;
let selectedPickupMode = 'استلام من المنزل';
const selectedItemsState = {}; // { tshirt: { quantity: 2, size_label: 'L', gender_age: 'men', condition_label: 'good', details: '' } }

document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session }, error } = await sb.auth.getSession();
  if (error || !session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = session.user;
  await loadUserProfile();
  setupPickupModeButtons();
  setupClothesIconsSelector();
  setupDonorBookingForm();
  setupEmployeeInspectionForm();
  setupLogoutButton();
  await loadDonations();
});

async function loadUserProfile() {
  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  currentProfile = profile || {
    id: currentUser.id,
    username: currentUser.email.split('@')[0],
    full_name: currentUser.user_metadata?.full_name || currentUser.email,
    role: 'donor'
  };

  document.getElementById('dash-user-name').textContent = `مرحباً، ${currentProfile.full_name || currentProfile.username}`;
  document.getElementById('dash-user-email').textContent = `${currentUser.email} (@${currentProfile.username})`;

  const isStaff = currentProfile.role === 'employee' || currentProfile.role === 'admin';
  if (isStaff) {
    document.getElementById('dash-role-badge').textContent = 'لوحة الموظف والمستلم الميداني';
    document.getElementById('dash-status-text').textContent = 'صلاحية موظف معتمد';
    document.getElementById('employee-inspection-panel').style.display = 'block';
  }
}

function setupPickupModeButtons() {
  const buttons = document.querySelectorAll('[data-pickup-mode]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPickupMode = btn.getAttribute('data-pickup-mode');
    });
  });
}

function setupClothesIconsSelector() {
  const cards = document.querySelectorAll('.cloth-icon-card');
  cards.forEach(card => {
    const iconKey = card.getAttribute('data-icon');
    const qtyEl = card.querySelector('.qty-val');
    const plusBtn = card.querySelector('[data-action="plus"]');
    const minusBtn = card.querySelector('[data-action="minus"]');

    const updateQty = (delta) => {
      const currentQty = selectedItemsState[iconKey]?.quantity || 0;
      const nextQty = Math.max(0, currentQty + delta);

      if (nextQty === 0) {
        delete selectedItemsState[iconKey];
        card.classList.remove('selected');
      } else {
        selectedItemsState[iconKey] = {
          quantity: nextQty,
          size_label: selectedItemsState[iconKey]?.size_label || 'L',
          gender_age: selectedItemsState[iconKey]?.gender_age || 'unisex',
          condition_label: selectedItemsState[iconKey]?.condition_label || 'good',
          details: selectedItemsState[iconKey]?.details || ''
        };
        card.classList.add('selected');
      }

      qtyEl.textContent = nextQty;
      renderSelectedItemsDetails();
    };

    plusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateQty(1);
    });

    minusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      updateQty(-1);
    });

    card.addEventListener('click', () => {
      if (!selectedItemsState[iconKey]) {
        updateQty(1);
      }
    });
  });
}

function renderSelectedItemsDetails() {
  const container = document.getElementById('selected-items-details');
  const totalBadge = document.getElementById('selected-total-badge');
  const keys = Object.keys(selectedItemsState);

  const totalPieces = keys.reduce((sum, key) => sum + selectedItemsState[key].quantity, 0);
  totalBadge.textContent = `الإجمالي: ${totalPieces} قطعة`;

  if (keys.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = keys.map(key => {
    const item = selectedItemsState[key];
    return `
      <div class="item-detail-box" data-detail-key="${key}">
        <div class="item-detail-head">
          <span>${ICON_LABELS[key]} (${item.quantity} قطعة)</span>
          <span style="font-size: 11px; color: var(--text-muted);">تفاصيل القطعة</span>
        </div>
        <div class="item-detail-row">
          <select data-field="gender_age">
            <option value="men" ${item.gender_age === 'men' ? 'selected' : ''}>رجالي</option>
            <option value="women" ${item.gender_age === 'women' ? 'selected' : ''}>حريمي</option>
            <option value="kids" ${item.gender_age === 'kids' ? 'selected' : ''}>أطفال</option>
            <option value="unisex" ${item.gender_age === 'unisex' ? 'selected' : ''}>متنوع</option>
          </select>
          <select data-field="size_label">
            <option value="S" ${item.size_label === 'S' ? 'selected' : ''}>مقاس S</option>
            <option value="M" ${item.size_label === 'M' ? 'selected' : ''}>مقاس M</option>
            <option value="L" ${item.size_label === 'L' ? 'selected' : ''}>مقاس L</option>
            <option value="XL" ${item.size_label === 'XL' ? 'selected' : ''}>مقاس XL</option>
            <option value="مقاسات متنوعة" ${item.size_label === 'مقاسات متنوعة' ? 'selected' : ''}>مقاسات متنوعة</option>
          </select>
          <select data-field="condition_label">
            <option value="new" ${item.condition_label === 'new' ? 'selected' : ''}>جديد</option>
            <option value="like_new" ${item.condition_label === 'like_new' ? 'selected' : ''}>كالجديد</option>
            <option value="good" ${item.condition_label === 'good' ? 'selected' : ''}>حالة جيدة</option>
          </select>
        </div>
        <input type="text" data-field="details" placeholder="اكتب تفاصيل إضافية (مثال: 2 تيشيرت قطن صيفي + 1 شتوي)" value="${item.details}">
      </div>
    `;
  }).join('');

  container.querySelectorAll('.item-detail-box').forEach(box => {
    const key = box.getAttribute('data-detail-key');
    box.querySelectorAll('[data-field]').forEach(input => {
      input.addEventListener('change', (e) => {
        const field = e.target.getAttribute('data-field');
        selectedItemsState[key][field] = e.target.value;
      });
      input.addEventListener('input', (e) => {
        const field = e.target.getAttribute('data-field');
        selectedItemsState[key][field] = e.target.value;
      });
    });
  });
}

function setupDonorBookingForm() {
  const form = document.getElementById('dash-booking-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const itemKeys = Object.keys(selectedItemsState);
    if (itemKeys.length === 0) {
      alert('برجاء اختيار نوع واحد على الأقل من أيقونات الملابس وتحديد العدد.');
      return;
    }

    const totalPieces = itemKeys.reduce((sum, key) => sum + selectedItemsState[key].quantity, 0);
    const submitBtn = document.getElementById('submit-donation-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري إرسال الطلب...';

    try {
      const { data: donation, error: donationErr } = await sb
        .from('donations')
        .insert([{
          user_id: currentUser.id,
          donor_name: currentProfile.full_name || currentProfile.username,
          pickup_mode: selectedPickupMode,
          campaign_name: document.getElementById('pickup-campaign').value,
          address: document.getElementById('pickup-address').value.trim(),
          phone: '+20' + document.getElementById('pickup-phone').value.trim().replace(/^0+/, ''),
          pickup_date: document.getElementById('pickup-date').value,
          donation_category: 'clothes',
          quantity_label: `${totalPieces} قطعة ملابس`,
          pieces_count: totalPieces,
          declared_pieces_count: totalPieces
        }])
        .select()
        .single();

      if (donationErr) throw donationErr;

      const itemsPayload = itemKeys.map(key => ({
        donation_id: donation.id,
        item_icon: key,
        quantity: selectedItemsState[key].quantity,
        size_label: selectedItemsState[key].size_label,
        gender_age: selectedItemsState[key].gender_age,
        condition_label: selectedItemsState[key].condition_label,
        details: selectedItemsState[key].details || null
      }));

      const { error: itemsErr } = await sb
        .from('donation_items')
        .insert(itemsPayload);

      if (itemsErr) throw itemsErr;

      // تصفير الاختيارات بعد النجاح
      itemKeys.forEach(k => delete selectedItemsState[k]);
      document.querySelectorAll('.cloth-icon-card').forEach(c => {
        c.classList.remove('selected');
        c.querySelector('.qty-val').textContent = '0';
      });
      renderSelectedItemsDetails();
      form.reset();

      alert('تم تسجيل طلب التبرع بالملابس بنجاح!');
      await loadDonations();
    } catch (err) {
      alert('حدث خطأ أثناء تسجيل التبرع: ' + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إرسال طلب التبرع';
    }
  });
}

function setupEmployeeInspectionForm() {
  const form = document.getElementById('employee-verify-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const donationId = document.getElementById('inspect-donation-id').value;
    const actualPieces = parseInt(document.getElementById('actual-pieces-input').value, 10);
    const files = document.getElementById('inspection-photos-input').files;
    const notes = document.getElementById('employee-notes-input').value.trim();

    if (!donationId || files.length === 0) {
      alert('برجاء اختيار الطلب وإرفاق صورة واحدة على الأقل للقطع المستلمة.');
      return;
    }

    const btn = document.getElementById('submit-inspection-btn');
    btn.disabled = true;
    btn.textContent = 'جاري رفع الصور واعتماد الاستلام...';

    try {
      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const filePath = `${donationId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error: uploadErr } = await sb.storage
          .from('donation-inspections')
          .upload(filePath, file);

        if (uploadErr) throw uploadErr;

        const { data: publicUrlData } = sb.storage
          .from('donation-inspections')
          .getPublicUrl(filePath);

        const { error: photoRowErr } = await sb
          .from('donation_photos')
          .insert([{
            donation_id: donationId,
            uploaded_by: currentUser.id,
            photo_url: publicUrlData.publicUrl,
            actual_count_in_photo: actualPieces,
            notes: notes || null
          }]);

        if (photoRowErr) throw photoRowErr;
      }

      const { error: updateErr } = await sb
        .from('donations')
        .update({
          actual_pieces_count: actualPieces,
          verified_by: currentUser.id,
          verified_at: new Date().toISOString(),
          employee_notes: notes || null
        })
        .eq('id', donationId);

      if (updateErr) throw updateErr;

      form.reset();
      alert('تم رفع صور الفحص واعتماد العدد الفعلي المستلم بنجاح.');
      await loadDonations();
    } catch (err) {
      alert('تعذر حفظ الفحص: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'حفظ الصور واعتماد العدد الفعلي';
    }
  });
}

async function loadDonations() {
  const { data: donations, error } = await sb
    .from('donations')
    .select(`
      *,
      donation_items (*),
      donation_photos (*)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const list = donations || [];
  updateKpis(list);
  renderDonationsList(list);
  populateEmployeeSelect(list);
}

function updateKpis(list) {
  const totalOrders = list.length;
  const totalDeclared = list.reduce((sum, d) => sum + (d.declared_pieces_count || d.pieces_count || 0), 0);
  const totalActual = list.reduce((sum, d) => sum + (d.actual_pieces_count ?? d.declared_pieces_count ?? d.pieces_count ?? 0), 0);
  const doneOrders = list.filter(d => d.actual_pieces_count !== null || String(d.status).includes('تم التسليم')).length;
  const activeOrders = totalOrders - doneOrders;

  document.getElementById('kpi-total-orders').textContent = totalOrders;
  document.getElementById('kpi-total-pieces').textContent = `${totalDeclared} / ${totalActual}`;
  document.getElementById('kpi-active-orders').textContent = activeOrders;
  document.getElementById('kpi-done-orders').textContent = doneOrders;
}

function renderDonationsList(list) {
  const container = document.getElementById('dash-donations-list');

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state-box">
        لا توجد طلبات تبرع مسجلة حتى الآن. اختر قطع الملابس من القائمة المجاورة لإضافة أول طلب.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(d => {
    const declared = d.declared_pieces_count || d.pieces_count || 0;
    const hasActual = d.actual_pieces_count !== null && d.actual_pieces_count !== undefined;
    const itemsHtml = (d.donation_items || []).map(item => `
      <span class="mini-item-chip">
        ${ICON_LABELS[item.item_icon] || item.item_icon}: <strong>${item.quantity}</strong>
        ${item.size_label ? `(${item.size_label})` : ''}
        ${item.details ? `— ${item.details}` : ''}
      </span>
    `).join('');

    const photosHtml = (d.donation_photos || []).map(p => `
      <a href="${p.photo_url}" target="_blank" rel="noopener">
        <img src="${p.photo_url}" alt="صورة استلام الموظف">
      </a>
    `).join('');

    return `
      <article class="donation-item-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="font-size: 15px;">${d.campaign_name || 'تبرع ملابس'}</strong>
          <span class="booking-step-tag">${hasActual ? 'تم الفحص والاستلام' : (d.status || 'قيد المراجعة')}</span>
        </div>

        <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 6px;">
          ${d.pickup_mode} — ${d.address}
        </p>

        <div class="donation-badges-row">
          ${itemsHtml || `<span class="mini-item-chip">ملابس (${declared} قطعة)</span>`}
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); margin-top: 8px;">
          <span>المعلن من المتبرع: <strong>${declared} قطعة</strong></span>
          <span>المستلم فعلياً: <strong>${hasActual ? `${d.actual_pieces_count} قطعة` : 'في انتظار فحص الموظف'}</strong></span>
          <span>الموعد: ${d.pickup_date || '-'}</span>
        </div>

        ${(hasActual || d.employee_notes || photosHtml) ? `
          <div class="verification-box">
            ${d.employee_notes ? `<p style="margin-bottom: 6px;"><strong>ملاحظة الموظف:</strong> ${d.employee_notes}</p>` : ''}
            ${photosHtml ? `<div class="inspection-thumbs">${photosHtml}</div>` : ''}
          </div>
        ` : ''}
      </article>
    `;
  }).join('');
}

function populateEmployeeSelect(list) {
  const select = document.getElementById('inspect-donation-id');
  if (!select) return;
  select.innerHTML = list.map(d => `
    <option value="${d.id}">
      ${d.donor_name || 'متبرع'} — معلن: ${d.declared_pieces_count || d.pieces_count || 0} قطعة (${d.pickup_date || ''})
    </option>
  `).join('');
}

function setupLogoutButton() {
  const btn = document.querySelector('[data-logout-btn]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
}