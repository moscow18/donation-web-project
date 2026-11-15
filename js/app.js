const SUPABASE_URL = 'https://zsjetsailonjuwawbpke.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzamV0c2FpbG9uanV3YXdicGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NjkzNDgsImV4cCI6MjEwOTU0NTM0OH0.npaPD7V8FkEcjKbJBNSQPUaQG6EMVphkcJdfIuF-eis';

let supabaseClient = null;
try {
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.error(e);
}

function showToast(text) {
  let toast = document.getElementById('kiswah-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'kiswah-toast';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(window.__kiswahToastTimer);
  window.__kiswahToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

function formatEgyptianPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('20')) return `+${digits}`;
  if (digits.startsWith('0')) return `+20${digits.slice(1)}`;
  return `+20${digits}`;
}

let currentSlideIndex = 0;
let sliderInterval = null;

function setHeroSlide(index) {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.slider-dot');
  const dynamicTitle = document.getElementById('hero-dynamic-title');
  const dynamicDesc = document.getElementById('hero-dynamic-desc');

  if (!slides.length) return;
  currentSlideIndex = (index + slides.length) % slides.length;

  slides.forEach((slide, i) => {
    slide.classList.toggle('active', i === currentSlideIndex);
  });
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === currentSlideIndex);
  });

  const activeSlide = slides[currentSlideIndex];
  if (dynamicTitle && activeSlide.dataset.slideTitle) {
    dynamicTitle.textContent = activeSlide.dataset.slideTitle;
  }
  if (dynamicDesc && activeSlide.dataset.slideDesc) {
    dynamicDesc.textContent = activeSlide.dataset.slideDesc;
  }
}

function restartSliderAuto() {
  if (sliderInterval) clearInterval(sliderInterval);
  const slides = document.querySelectorAll('.hero-slide');
  if (slides.length > 1) {
    sliderInterval = setInterval(() => {
      setHeroSlide(currentSlideIndex + 1);
    }, 4500);
  }
}

function switchPickupModeUI(mode) {
  const addressLabel = document.getElementById('pickup-address-label');
  const addressWrapper = document.getElementById('home-address-wrapper');
  const dropoffWrapper = document.getElementById('dropoff-point-wrapper');
  const addressInput = document.getElementById('pickup-address');
  const dropoffSelect = document.getElementById('pickup-dropoff-select');

  if (!addressWrapper || !dropoffWrapper) return;

  if (mode === 'أقرب نقطة تجميع') {
    if (addressLabel) addressLabel.textContent = 'اختر أقرب نقطة تجميع معتمدة';
    addressWrapper.style.display = 'none';
    dropoffWrapper.style.display = 'flex';
    if (addressInput) addressInput.removeAttribute('required');
    if (dropoffSelect) dropoffSelect.setAttribute('required', 'required');
  } else {
    if (addressLabel) addressLabel.textContent = 'عنوان الاستلام من المنزل';
    addressWrapper.style.display = 'flex';
    dropoffWrapper.style.display = 'none';
    if (addressInput) addressInput.setAttribute('required', 'required');
    if (dropoffSelect) dropoffSelect.removeAttribute('required');
  }
}

document.addEventListener('click', async (e) => {
  const prevBtn = e.target.closest('#hero-prev-slide');
  if (prevBtn) {
    e.preventDefault();
    setHeroSlide(currentSlideIndex - 1);
    restartSliderAuto();
    return;
  }

  const nextBtn = e.target.closest('#hero-next-slide');
  if (nextBtn) {
    e.preventDefault();
    setHeroSlide(currentSlideIndex + 1);
    restartSliderAuto();
    return;
  }

  const dotBtn = e.target.closest('.slider-dot');
  if (dotBtn) {
    e.preventDefault();
    const idx = parseInt(dotBtn.getAttribute('data-slide-index') || '0', 10);
    setHeroSlide(idx);
    restartSliderAuto();
    return;
  }

  const pickupModeBtn = e.target.closest('[data-pickup-mode]');
  if (pickupModeBtn) {
    e.preventDefault();
    document.querySelectorAll('[data-pickup-mode]').forEach((b) => b.classList.remove('active'));
    pickupModeBtn.classList.add('active');
    const mode = pickupModeBtn.getAttribute('data-pickup-mode');
    switchPickupModeUI(mode);
    showToast(`تم التبديل إلى: ${mode}`);
    return;
  }

  const sizeBtn = e.target.closest('.size-pill-btn');
  if (sizeBtn) {
    e.preventDefault();
    document.querySelectorAll('.size-pill-btn').forEach((b) => b.classList.remove('active'));
    sizeBtn.classList.add('active');
    return;
  }

  const campaignBtn = e.target.closest('[data-select-campaign]');
  if (campaignBtn) {
    e.preventDefault();
    const campaignTitle = campaignBtn.getAttribute('data-select-campaign');
    const campaignSelect = document.getElementById('pickup-campaign');
    if (campaignSelect && campaignTitle) {
      campaignSelect.value = campaignTitle;
    }
    const heroSection = document.getElementById('hero');
    if (heroSection) {
      heroSection.scrollIntoView({ behavior: 'smooth' });
    }
    showToast(`تم اختيار المبادرة: ${campaignTitle}`);
    return;
  }

  const tabEmailBtn = e.target.closest('#tab-email');
  if (tabEmailBtn) {
    e.preventDefault();
    tabEmailBtn.classList.add('active');
    const tabPhoneBtn = document.getElementById('tab-phone');
    if (tabPhoneBtn) tabPhoneBtn.classList.remove('active');
    const emailGroup = document.getElementById('email-field-group');
    const phoneGroup = document.getElementById('phone-field-group');
    if (emailGroup) emailGroup.style.display = 'block';
    if (phoneGroup) phoneGroup.style.display = 'none';
    window.__kiswahLoginMode = 'email';
    return;
  }

  const tabPhoneBtn = e.target.closest('#tab-phone');
  if (tabPhoneBtn) {
    e.preventDefault();
    tabPhoneBtn.classList.add('active');
    const tabEmailBtn = document.getElementById('tab-email');
    if (tabEmailBtn) tabEmailBtn.classList.remove('active');
    const emailGroup = document.getElementById('email-field-group');
    const phoneGroup = document.getElementById('phone-field-group');
    if (phoneGroup) phoneGroup.style.display = 'block';
    if (emailGroup) emailGroup.style.display = 'none';
    window.__kiswahLoginMode = 'phone';
    return;
  }

  const togglePassBtn = e.target.closest('[data-toggle-password]');
  if (togglePassBtn) {
    e.preventDefault();
    const targetId = togglePassBtn.getAttribute('data-toggle-password');
    const input = document.getElementById(targetId);
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
    return;
  }

  const clearOtpBtn = e.target.closest('#clear-otp-btn');
  if (clearOtpBtn) {
    e.preventDefault();
    const otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach((inp) => (inp.value = ''));
    if (otpInputs[0]) otpInputs[0].focus();
    return;
  }

  const logoutBtn = e.target.closest('[data-logout-btn]');
  if (logoutBtn) {
    e.preventDefault();
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    window.location.href = 'login.html';
    return;
  }

  const googleBtn = e.target.closest('[data-google-auth]');
  if (googleBtn) {
    e.preventDefault();
    if (!supabaseClient) {
      showToast('تعذر الاتصال بخادم المصادقة');
      return;
    }
    if (window.location.protocol === 'file:') {
      showToast('افتح المشروع عبر Live Server (http://127.0.0.1:5500) لتفعيل تسجيل Google');
      return;
    }
    googleBtn.disabled = true;
    const baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const redirectUrl = `${baseDir}dashboard.html`;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account'
        }
      }
    });
    if (error) {
      googleBtn.disabled = false;
      showToast('تعذر الاتصال بخدمة Google: ' + error.message);
    }
    return;
  }

  const appleBtn = e.target.closest('[data-apple-auth]');
  if (appleBtn) {
    e.preventDefault();
    if (!supabaseClient) {
      showToast('تعذر الاتصال بخادم المصادقة');
      return;
    }
    if (window.location.protocol === 'file:') {
      showToast('افتح المشروع عبر Live Server (http://127.0.0.1:5500) لتفعيل تسجيل Apple');
      return;
    }
    appleBtn.disabled = true;
    const baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const redirectUrl = `${baseDir}dashboard.html`;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: redirectUrl
      }
    });
    if (error) {
      appleBtn.disabled = false;
      showToast('تعذر الاتصال بخدمة Apple: ' + error.message);
    }
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  window.__kiswahLoginMode = 'email';
  setHeroSlide(0);
  restartSliderAuto();

  const dateInput = document.getElementById('pickup-date');
  if (dateInput && !dateInput.value) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    dateInput.value = tomorrow;
  }

  const otpInputs = document.querySelectorAll('.otp-input');
  if (otpInputs.length > 0) {
    otpInputs[0].focus();
    otpInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const val = e.target.value.replace(/\D/g, '');
        e.target.value = val.slice(0, 1);
        if (val && index < otpInputs.length - 1) {
          otpInputs[index + 1].focus();
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          otpInputs[index - 1].focus();
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData)
          .getData('text')
          .replace(/\D/g, '')
          .slice(0, otpInputs.length);
        pasted.split('').forEach((char, idx) => {
          if (otpInputs[idx]) otpInputs[idx].value = char;
        });
        const nextIndex = Math.min(pasted.length, otpInputs.length - 1);
        otpInputs[nextIndex].focus();
      });
    });
  }

  const otpDisplayTarget = document.getElementById('otp-target-display');
  if (otpDisplayTarget) {
    const pendingEmail = localStorage.getItem('kiswah_verify_email');
    if (pendingEmail) {
      otpDisplayTarget.textContent = pendingEmail;
    }
  }

  const otpPurpose = localStorage.getItem('kiswah_otp_purpose') || 'signup';
  const newPassGroup = document.getElementById('new-password-reset-group');
  const newPassInput = document.getElementById('reset-new-password');
  if (newPassGroup && otpPurpose === 'recovery') {
    newPassGroup.style.display = 'block';
    if (newPassInput) newPassInput.setAttribute('required', 'required');
  }

  if (!supabaseClient) return;

  const ensureUserProfile = async (user) => {
    if (!user) return;
    try {
      const fullName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        'متبرع كسوة';
      const phone = user.user_metadata?.phone || user.phone || '';
      await supabaseClient.from('profiles').upsert(
        {
          id: user.id,
          full_name: fullName,
          email: user.email || '',
          phone: phone
        },
        { onConflict: 'id' }
      );
    } catch (err) {
      console.error(err);
    }
  };

  let session = null;
  try {
    const { data } = await supabaseClient.auth.getSession();
    session = data?.session || null;
  } catch (err) {
    console.error(err);
  }

  if (session?.user) {
    await ensureUserProfile(session.user);
  }

  const navAuthGuest = document.getElementById('nav-auth-guest');
  const navAuthUser = document.getElementById('nav-auth-user');
  if (navAuthGuest && navAuthUser) {
    if (session) {
      navAuthGuest.style.display = 'none';
      navAuthUser.style.display = 'flex';
    } else {
      navAuthGuest.style.display = 'flex';
      navAuthUser.style.display = 'none';
    }
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    if (session) {
      window.location.href = 'dashboard.html';
      return;
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const password = document.getElementById('login-password').value;
      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري التحقق...';

      if (window.__kiswahLoginMode === 'email') {
        const email = document.getElementById('login-email').value.trim();
        if (!email) {
          showToast('يرجى إدخال البريد الإلكتروني');
          submitBtn.disabled = false;
          submitBtn.textContent = 'تسجيل الدخول';
          return;
        }
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) {
          showToast('خطأ في تسجيل الدخول: ' + error.message);
          submitBtn.disabled = false;
          submitBtn.textContent = 'تسجيل الدخول';
          return;
        }
        window.location.href = 'dashboard.html';
      } else {
        const rawPhone = document.getElementById('login-phone').value.trim();
        if (!rawPhone) {
          showToast('يرجى إدخال رقم الهاتف');
          submitBtn.disabled = false;
          submitBtn.textContent = 'تسجيل الدخول';
          return;
        }
        const phone = formatEgyptianPhone(rawPhone);
        const { error } = await supabaseClient.auth.signInWithPassword({ phone, password });
        if (error) {
          showToast('تعذر الدخول برقم الهاتف: ' + error.message);
          submitBtn.disabled = false;
          submitBtn.textContent = 'تسجيل الدخول';
          return;
        }
        window.location.href = 'dashboard.html';
      }
    });
  }

  const forgotForm = document.getElementById('forgot-password-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value.trim();
      const submitBtn = forgotForm.querySelector('button[type="submit"]');
      if (!email) {
        showToast('يرجى إدخال البريد الإلكتروني');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري الإرسال...';

      const { error } = await supabaseClient.auth.resetPasswordForEmail(email);

      if (error) {
        showToast('تعذر إرسال رمز الاستعادة: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'إرسال رمز التحقق';
        return;
      }

      localStorage.setItem('kiswah_verify_email', email);
      localStorage.setItem('kiswah_otp_purpose', 'recovery');
      showToast('تم إرسال رمز التحقق إلى بريدك الإلكتروني');
      setTimeout(() => {
        window.location.href = 'otp.html';
      }, 700);
    });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    if (session) {
      window.location.href = 'dashboard.html';
      return;
    }

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const fullName = document.getElementById('reg-name').value.trim();
      const rawPhone = document.getElementById('reg-phone').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const phone = formatEgyptianPhone(rawPhone);

      if (password.length < 6) {
        showToast('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'جاري إنشاء الحساب...';

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone
          }
        }
      });

      if (error) {
        showToast('تعذر إنشاء الحساب: ' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'إنشاء الحساب';
        return;
      }

      if (data.session) {
        await ensureUserProfile(data.user);
        window.location.href = 'dashboard.html';
      } else {
        localStorage.setItem('kiswah_verify_email', email);
        localStorage.setItem('kiswah_otp_purpose', 'signup');
        window.location.href = 'otp.html';
      }
    });
  }

  const otpForm = document.getElementById('otp-form');
  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = Array.from(otpInputs).map((i) => i.value).join('');
      const email = localStorage.getItem('kiswah_verify_email');
      const purpose = localStorage.getItem('kiswah_otp_purpose') || 'signup';

      if (token.length < 6) {
        showToast('يرجى إدخال رمز التحقق المكون من 6 أرقام بالكامل');
        return;
      }

      if (!email) {
        showToast('لم يتم العثور على البريد الإلكتروني، يرجى المحاولة مرة أخرى');
        return;
      }

      const submitBtn = otpForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      if (purpose === 'recovery') {
        const newPassword = newPassInput ? newPassInput.value : '';
        if (newPassword.length < 6) {
          showToast('يجب أن تتكون كلمة المرور الجديدة من 6 أحرف على الأقل');
          submitBtn.disabled = false;
          return;
        }

        const { error: verifyErr } = await supabaseClient.auth.verifyOtp({
          email,
          token,
          type: 'recovery'
        });

        if (verifyErr) {
          showToast('رمز التحقق غير صحيح أو منتهي الصلاحية: ' + verifyErr.message);
          submitBtn.disabled = false;
          return;
        }

        const { error: updateErr } = await supabaseClient.auth.updateUser({
          password: newPassword
        });

        if (updateErr) {
          showToast('تعذر تحديث كلمة المرور: ' + updateErr.message);
          submitBtn.disabled = false;
          return;
        }

        localStorage.removeItem('kiswah_otp_purpose');
        showToast('تم تحديث كلمة المرور بنجاح، جاري الدخول...');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 800);
        return;
      }

      const { data, error } = await supabaseClient.auth.verifyOtp({
        email,
        token,
        type: 'signup'
      });

      if (error) {
        showToast('رمز التحقق غير صحيح أو منتهي الصلاحية: ' + error.message);
        submitBtn.disabled = false;
        return;
      }

      if (data?.user) {
        await ensureUserProfile(data.user);
      }

      localStorage.removeItem('kiswah_otp_purpose');
      showToast('تم تفعيل الحساب بنجاح، جاري الانتقال إلى لوحة التحكم...');
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 800);
    });

    const resendBtn = document.getElementById('resend-otp-btn');
    const timerEl = document.getElementById('otp-timer');
    let seconds = 60;
    if (timerEl && resendBtn) {
      const interval = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
          clearInterval(interval);
          timerEl.textContent = '00:00';
          resendBtn.style.color = '#111827';
          resendBtn.style.fontWeight = '600';
        } else {
          timerEl.textContent = seconds < 10 ? `00:0${seconds}` : `00:${seconds}`;
        }
      }, 1000);

      resendBtn.addEventListener('click', async () => {
        if (seconds > 0) {
          showToast(`يمكنك إعادة الإرسال بعد ${seconds} ثانية`);
          return;
        }
        const email = localStorage.getItem('kiswah_verify_email');
        const purpose = localStorage.getItem('kiswah_otp_purpose') || 'signup';
        if (!email) return;

        if (purpose === 'recovery') {
          const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
          if (error) {
            showToast('تعذر إعادة إرسال الرمز: ' + error.message);
          } else {
            seconds = 60;
            showToast('تم إرسال رمز استعادة جديد إلى بريدك الإلكتروني');
          }
        } else {
          const { error } = await supabaseClient.auth.resend({
            type: 'signup',
            email
          });
          if (error) {
            showToast('تعذر إعادة إرسال الرمز: ' + error.message);
          } else {
            seconds = 60;
            showToast('تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني');
          }
        }
      });
    }
  }

  const handleDonationSubmit = async (formEl, isDashboard = false) => {
    const { data: { session: currentSession } } = await supabaseClient.auth.getSession();
    if (!currentSession) {
      showToast('يرجى تسجيل الدخول أولاً لتأكيد طلب الاستلام');
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 900);
      return;
    }

    const activeModeBtn = document.querySelector('[data-pickup-mode].active');
    const activeSizeBtn = document.querySelector('.size-pill-btn.active');
    const pickupMode = activeModeBtn ? activeModeBtn.getAttribute('data-pickup-mode') : 'استلام من المنزل';
    const quantityLabel = activeSizeBtn ? activeSizeBtn.textContent.trim() : '1 - 2 حقيبة';
    const piecesCount = activeSizeBtn ? parseInt(activeSizeBtn.getAttribute('data-pieces') || '12', 10) : 12;

    const homeAddressEl = document.getElementById('pickup-address');
    const dropoffSelectEl = document.getElementById('pickup-dropoff-select');
    const address =
      pickupMode === 'أقرب نقطة تجميع' && dropoffSelectEl
        ? dropoffSelectEl.value
        : homeAddressEl
        ? homeAddressEl.value.trim()
        : '';

    const rawPhone = document.getElementById('pickup-phone').value.trim();
    const pickupDate = document.getElementById('pickup-date').value;
    const campaignEl = document.getElementById('pickup-campaign');
    const campaignName = campaignEl ? campaignEl.value : 'تبرع عام';

    if (!address || !rawPhone || !pickupDate) {
      showToast('يرجى إكمال جميع الحقول المطلوبة');
      return;
    }

    const submitBtn = formEl.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const donorName =
      currentSession.user.user_metadata?.full_name ||
      currentSession.user.user_metadata?.name ||
      currentSession.user.email;

    const { error } = await supabaseClient.from('donations').insert({
      user_id: currentSession.user.id,
      donor_name: donorName,
      pickup_mode: pickupMode,
      address: address,
      quantity_label: quantityLabel,
      pieces_count: piecesCount,
      phone: formatEgyptianPhone(rawPhone),
      pickup_date: pickupDate,
      campaign_name: campaignName,
      status: 'قيد المراجعة'
    });

    submitBtn.disabled = false;

    if (error) {
      showToast('حدث خطأ أثناء حفظ الطلب: ' + error.message);
      return;
    }

    showToast('تم تسجيل طلب استلام تبرعك بنجاح في قاعدة البيانات');
    formEl.reset();
    switchPickupModeUI('استلام من المنزل');
    document.querySelectorAll('[data-pickup-mode]').forEach((b, i) => b.classList.toggle('active', i === 0));

    if (isDashboard) {
      await loadDashboardData(currentSession.user);
    } else {
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 900);
    }
  };

  const quickBookingForm = document.getElementById('quick-booking-form');
  if (quickBookingForm) {
    quickBookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleDonationSubmit(quickBookingForm, false);
    });
  }

  const dashBookingForm = document.getElementById('dash-booking-form');
  if (dashBookingForm) {
    dashBookingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleDonationSubmit(dashBookingForm, true);
    });
  }

  async function loadDashboardData(user) {
    const nameEl = document.getElementById('dash-user-name');
    const emailEl = document.getElementById('dash-user-email');
    const phoneInput = document.getElementById('pickup-phone');
    const container = document.getElementById('dash-donations-list');

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const displayName =
      profile?.full_name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      'متبرع كسوة';

    if (nameEl) nameEl.textContent = `مرحباً، ${displayName}`;
    if (emailEl) emailEl.textContent = user.email || profile?.phone || '';
    if (phoneInput && profile?.phone) {
      phoneInput.value = profile.phone.replace('+20', '');
    }

    const { data: donations, error } = await supabaseClient
      .from('donations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      if (container) {
        container.innerHTML = `<div class="empty-state-box" style="color:#DC2626;">خطأ في جلب البيانات من قاعدة البيانات: ${error.message}</div>`;
      }
      return;
    }

    const list = donations || [];
    const totalCount = list.length;
    const totalPieces = list.reduce((sum, item) => sum + (Number(item.pieces_count) || 0), 0);
    const activeCount = list.filter((item) => item.status !== 'تم التسليم').length;
    const completedCount = list.filter((item) => item.status === 'تم التسليم').length;

    const kpiTotal = document.getElementById('kpi-total-orders');
    const kpiPieces = document.getElementById('kpi-total-pieces');
    const kpiActive = document.getElementById('kpi-active-orders');
    const kpiDone = document.getElementById('kpi-done-orders');

    if (kpiTotal) kpiTotal.textContent = totalCount;
    if (kpiPieces) kpiPieces.textContent = totalPieces;
    if (kpiActive) kpiActive.textContent = activeCount;
    if (kpiDone) kpiDone.textContent = completedCount;

    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = `
        <div class="empty-state-box">
          لا توجد طلبات تبرع مسجلة لحسابك (${user.email}) حتى الآن. استخدم النموذج المجاور لإضافة أول طلب وسينعكس فوراً هنا.
        </div>
      `;
      return;
    }

    container.innerHTML = list
      .map(
        (item) => `
        <div class="donation-item">
          <div>
            <strong style="display: block; font-size: 15px; margin-bottom: 4px;">${item.campaign_name || 'تبرع عام'} (${item.quantity_label || 'حقيبة'})</strong>
            <span style="display: block; font-size: 13px; color: var(--text-muted);">${item.pickup_mode || 'استلام من المنزل'} — ${item.address || ''}</span>
            <small style="display: block; font-size: 12px; color: var(--text-muted); margin-top: 4px;">موعد الاستلام: ${item.pickup_date || '-'} | هاتف: ${item.phone || '-'}</small>
          </div>
          <span class="badge-status">${item.status || 'قيد المراجعة'}</span>
        </div>
      `
      )
      .join('');
  }

  const dashboardRoot = document.getElementById('dashboard-root');
  if (dashboardRoot) {
    if (!session) {
      const { data: authListener } = supabaseClient.auth.onAuthStateChange(async (event, newSession) => {
        if (newSession?.user) {
          authListener.subscription.unsubscribe();
          await ensureUserProfile(newSession.user);
          await loadDashboardData(newSession.user);
        } else if (event === 'INITIAL_SESSION') {
          window.location.href = 'login.html';
        }
      });
      return;
    }
    await loadDashboardData(session.user);
  }
});