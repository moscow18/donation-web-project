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
  new: 'جديد بالكرتونة',
  like_new: 'كالجديد',
  good: 'حالة جيدة جداً'
};

let sb = null;
let currentUser = null;
let currentProfile = null;
let selectedPickupMode = 'استلام من المنزل';
const selectedItemsState = {};

document.addEventListener('DOMContentLoaded', async () => {
  window.KiswahLoader.show('جاري تحميل بوابة المتبرع...');

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

  currentProfile = profile || {
    id: currentUser.id,
    username: currentUser.email.split('@')[0],
    full_name: currentUser.user_metadata?.full_name || currentUser.email,
    role: 'donor'
  };

  // توجيه تلقائي إذا كان الحساب موظفاً أو إدارة لبوابته المستقلة
  if (currentProfile.role === 'employee') {
    window.location.href = 'employee.html';
    return;
  }
  if (currentProfile.role === 'admin' || currentProfile.role === 'super_admin') {
    window.location.href = 'admin.html';
    return;
  }

  document.getElementById('donor-user-name').textContent = `مرحباً، ${currentProfile.full_name || currentProfile.username}`;
  document.getElementById('donor-user-email').textContent = `${currentUser.email} • رقم الحساب: #${currentUser.id.slice(0, 8).toUpperCase()}`;

  setupPickupModeButtons();
  setupClothesIconsSelector();
  setupDonorBookingForm();
  setupLogoutButton();
  await loadMyDonations();

  window.KiswahRealtime.subscribe(() => {
    loadMyDonations();
  });

  window.KiswahLoader.hide();
});

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
        card.style.borderColor = 'var(--border-light)';
        card.style.background = 'var(--bg-page)';
      } else {
        selectedItemsState[iconKey] = {
          quantity: nextQty,
          size_label: selectedItemsState[iconKey]?.size_label || 'L',
          gender_age: selectedItemsState[iconKey]?.gender_age || 'unisex',
          condition_label: selectedItemsState[iconKey]?.condition_label || 'like_new',
          details: selectedItemsState[iconKey]?.details || ''
        };
        card.style.borderColor = 'var(--green-dark)';
        card.style.background = 'var(--bg-sand)';
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
      if (!selectedItemsState[iconKey]) updateQty(1);
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
      <div class="form-group" data-detail-key="${key}" style="border:1px solid var(--border-light); border-radius:var(--radius-sm); padding:12px; background:var(--bg-page);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:13.5px; color:var(--green-dark);">${ICON_LABELS[key]} (${item.quantity} قطعة)</strong>
          <span style="font-size:11.5px; color:var(--text-muted);">حدّد مواصفات القطع</span>
        </div>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-bottom:8px;">
          <div class="input-capsule" style="height:38px; padding:0 8px;">
            <select data-field="gender_age" style="font-size:12px;">
              <option value="men" ${item.gender_age === 'men' ? 'selected' : ''}>رجالي</option>
              <option value="women" ${item.gender_age === 'women' ? 'selected' : ''}>حريمي</option>
              <option value="kids" ${item.gender_age === 'kids' ? 'selected' : ''}>أطفال</option>
              <option value="unisex" ${item.gender_age === 'unisex' ? 'selected' : ''}>متنوع</option>
            </select>
          </div>
          <div class="input-capsule" style="height:38px; padding:0 8px;">
            <select data-field="size_label" style="font-size:12px;">
              <option value="S" ${item.size_label === 'S' ? 'selected' : ''}>مقاس S</option>
              <option value="M" ${item.size_label === 'M' ? 'selected' : ''}>مقاس M</option>
              <option value="L" ${item.size_label === 'L' ? 'selected' : ''}>مقاس L</option>
              <option value="XL" ${item.size_label === 'XL' ? 'selected' : ''}>مقاس XL</option>
              <option value="مقاسات متنوعة" ${item.size_label === 'مقاسات متنوعة' ? 'selected' : ''}>مقاسات متنوعة</option>
            </select>
          </div>
          <div class="input-capsule" style="height:38px; padding:0 8px;">
            <select data-field="condition_label" style="font-size:12px;">
              <option value="new" ${item.condition_label === 'new' ? 'selected' : ''}>جديد</option>
              <option value="like_new" ${item.condition_label === 'like_new' ? 'selected' : ''}>كالجديد</option>
              <option value="good" ${item.condition_label === 'good' ? 'selected' : ''}>حالة جيدة</option>
            </select>
          </div>
        </div>
        <div class="input-capsule" style="height:38px;">
          <input type="text" data-field="details" placeholder="وصف إضافي للقطع (الألوان، الموسم، الخامة...)" value="${item.details}" style="font-size:12.5px;">
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-detail-key]').forEach(box => {
    const key = box.getAttribute('data-detail-key');
    box.querySelectorAll('[data-field]').forEach(input => {
      const sync = (e) => {
        selectedItemsState[key][e.target.getAttribute('data-field')] = e.target.value;
      };
      input.addEventListener('change', sync);
      input.addEventListener('input', sync);
    });
  });
}

function setupDonorBookingForm() {
  const form = document.getElementById('donor-booking-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const itemKeys = Object.keys(selectedItemsState);
    if (itemKeys.length === 0) {
      window.showKiswahToast('برجاء اختيار نوع واحد على الأقل من الملابس وتحديد العدد.');
      return;
    }

    const totalPieces = itemKeys.reduce((sum, key) => sum + selectedItemsState[key].quantity, 0);
    const submitBtn = document.getElementById('submit-donation-btn');
    submitBtn.disabled = true;
    window.KiswahLoader.show('جاري تسجيل طلب التبرع...');

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

      const { error: itemsErr } = await sb.from('donation_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;

      itemKeys.forEach(k => delete selectedItemsState[k]);
      document.querySelectorAll('.cloth-icon-card').forEach(c => {
        c.style.borderColor = 'var(--border-light)';
        c.style.background = 'var(--bg-page)';
        c.querySelector('.qty-val').textContent = '0';
      });
      renderSelectedItemsDetails();
      form.reset();

      await loadMyDonations();
      window.KiswahLoader.hide();
      window.showKiswahToast('تم تسجيل طلب التبرع بنجاح وسيظهر للمندوب فوراً!');
    } catch (err) {
      window.KiswahLoader.hide();
      window.showKiswahToast('حدث خطأ: ' + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function loadMyDonations() {
  const { data: donations, error } = await sb
    .from('donations')
    .select('*, donation_items(*), donation_photos(*)')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const list = donations || [];

  const totalOrders = list.length;
  const totalDeclared = list.reduce((sum, d) => sum + (d.declared_pieces_count || d.pieces_count || 0), 0);
  const totalVerified = list.reduce((sum, d) => sum + (d.actual_pieces_count ?? 0), 0);
  const completedOrders = list.filter(d => d.actual_pieces_count !== null || String(d.status).includes('تم')).length;

  document.getElementById('donor-kpi-orders').textContent = totalOrders;
  document.getElementById('donor-kpi-declared').textContent = `${totalDeclared} قطعة`;
  document.getElementById('donor-kpi-verified').textContent = `${totalVerified} قطعة`;
  document.getElementById('donor-kpi-completed').textContent = completedOrders;

  const container = document.getElementById('donor-donations-list');
  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--text-muted);">
        لا توجد تبرعات مسجلة في حسابك بعد. ابدأ باختيار قطع الملابس من القائمة المجاورة.
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(d => {
    const declared = d.declared_pieces_count || d.pieces_count || 0;
    const hasActual = d.actual_pieces_count !== null && d.actual_pieces_count !== undefined;
    const stepLevel = hasActual ? 4 : (String(d.status).includes('جاري') ? 2 : 1);
    const createdDate = d.created_at ? new Date(d.created_at).toLocaleDateString('ar-EG') : '';

    const itemsRows = (d.donation_items || []).map(item => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background:var(--white); border:1px solid var(--border-light); border-radius:10px; font-size:13px;">
        <div>
          <strong>${ICON_LABELS[item.item_icon] || item.item_icon}</strong>
          <span style="color:var(--text-muted); margin-right:6px;">(${GENDER_LABELS[item.gender_age] || item.gender_age} • مقاس ${item.size_label} • ${CONDITION_LABELS[item.condition_label] || item.condition_label})</span>
          ${item.details ? `<div style="font-size:12px; color:var(--text-muted);">${item.details}</div>` : ''}
        </div>
        <span class="badge-status">${item.quantity} قطعة</span>
      </div>
    `).join('');

    const photosHtml = (d.donation_photos || []).map(p => `
      <a href="${p.photo_url}" target="_blank" rel="noopener">
        <img src="${p.photo_url}" alt="توثيق الاستلام" style="width:54px; height:54px; object-fit:cover; border-radius:10px; border:1px solid var(--border-light);">
      </a>
    `).join('');

    return `
      <article class="donation-item" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <span style="font-size:11.5px; color:var(--gold); font-weight:700;">طلب رقم #${String(d.id).slice(0, 8).toUpperCase()} • ${createdDate}</span>
            <h3 style="font-size:17px; font-weight:700; margin-top:2px;">${d.campaign_name || 'تبرع ملابس'}</h3>
          </div>
          <span class="badge-status" style="background:${hasActual ? 'var(--green-dark)' : 'var(--bg-sand)'}; color:${hasActual ? 'var(--white)' : 'var(--text-main)'};">
            ${hasActual ? 'تم الاستلام والفحص' : (d.status || 'بانتظار المندوب')}
          </span>
        </div>

        <!-- شريط تتبع مراحل التبرع للمتبرع -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; font-size:11.5px; text-align:center;">
          <div style="padding:6px; border-radius:8px; background:${stepLevel >= 1 ? 'var(--green-dark)' : 'var(--white)'}; color:${stepLevel >= 1 ? 'var(--white)' : 'var(--text-muted)'}; font-weight:600;">1. تم التسجيل</div>
          <div style="padding:6px; border-radius:8px; background:${stepLevel >= 2 ? 'var(--green-dark)' : 'var(--white)'}; color:${stepLevel >= 2 ? 'var(--white)' : 'var(--text-muted)'}; font-weight:600;">2. في الطريق</div>
          <div style="padding:6px; border-radius:8px; background:${stepLevel >= 3 ? 'var(--green-dark)' : 'var(--white)'}; color:${stepLevel >= 3 ? 'var(--white)' : 'var(--text-muted)'}; font-weight:600;">3. تم الفحص</div>
          <div style="padding:6px; border-radius:8px; background:${stepLevel >= 4 ? 'var(--green-dark)' : 'var(--white)'}; color:${stepLevel >= 4 ? 'var(--white)' : 'var(--text-muted)'}; font-weight:600;">4. جاهز للتوزيع</div>
        </div>

        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; font-size:13px; background:var(--white); padding:10px 12px; border-radius:10px; border:1px solid var(--border-light);">
          <div><span style="color:var(--text-muted);">الطريقة:</span> <strong>${d.pickup_mode}</strong></div>
          <div><span style="color:var(--text-muted);">الموعد:</span> <strong>${d.pickup_date || '-'}</strong></div>
          <div><span style="color:var(--text-muted);">الهاتف:</span> <strong style="direction:ltr; display:inline-block;">${d.phone || '-'}</strong></div>
          <div style="grid-column:1 / -1;"><span style="color:var(--text-muted);">العنوان:</span> <strong>${d.address}</strong></div>
        </div>

        <div style="display:flex; flex-direction:column; gap:6px;">
          <strong style="font-size:13px;">تفاصيل القطع المعلنة (${declared} قطعة):</strong>
          ${itemsRows || `<div style="font-size:13px; color:var(--text-muted);">${declared} قطعة ملابس</div>`}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; padding-top:10px; border-top:1px solid var(--border-light); font-size:13px;">
          <div>
            <span style="color:var(--text-muted);">المعلن:</span> <strong>${declared} قطعة</strong>
            <span style="margin:0 8px;">|</span>
            <span style="color:var(--text-muted);">المستلم الفعلي:</span> <strong>${hasActual ? `${d.actual_pieces_count} قطعة` : 'بانتظار فحص المندوب'}</strong>
          </div>
          ${photosHtml ? `<div style="display:flex; gap:6px;">${photosHtml}</div>` : ''}
        </div>

        ${d.employee_notes ? `<div style="font-size:12.5px; background:var(--bg-sand); padding:8px 12px; border-radius:8px;"><strong>تقرير الموظف المستلم:</strong> ${d.employee_notes}</div>` : ''}
      </article>
    `;
  }).join('');
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