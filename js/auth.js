let sb = null;
let selectedAccountType = 'donor';
let pendingOtpEmail = '';
let pendingOtpType = 'recovery';
let otpTimerInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
  window.KiswahLoader.show('جاري التحقق من الجلسة...');

  sb = await window.KiswahRealtime.getClient();
  if (!sb) {
    window.KiswahLoader.hide();
    window.showKiswahToast('تعذر الاتصال بخادم قاعدة البيانات.');
    return;
  }

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await redirectByUserRole(session.user.id);
    return;
  }

  setupViewNavigation();
  setupAccountTypeToggle();
  setupPasswordToggles();
  setupOtpSixDigits();
  setupSocialOAuth();
  setupLoginForm();
  setupRegisterForm();
  setupForgotForm();
  setupOtpVerifyForm();
  setupNewPasswordForm();

  window.KiswahLoader.hide();
});

async function redirectByUserRole(userId) {
  window.KiswahLoader.show('جاري التوجيه إلى بوابتك الخاصة...');
  const { data: profile } = await sb
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const role = profile?.role || 'donor';
  if (role === 'admin' || role === 'super_admin') {
    window.location.href = 'admin.html';
  } else if (role === 'employee') {
    window.location.href = 'employee.html';
  } else {
    window.location.href = 'dashboard.html';
  }
}

function showView(viewId) {
  document.querySelectorAll('.auth-step-view').forEach(v => {
    v.style.display = 'none';
  });
  const target = document.getElementById(viewId);
  if (target) target.style.display = 'block';
}

function setupViewNavigation() {
  document.getElementById('go-register-btn').addEventListener('click', () => showView('view-register'));
  document.getElementById('go-login-btn').addEventListener('click', () => showView('view-login'));
  document.getElementById('go-forgot-btn').addEventListener('click', () => showView('view-forgot'));
  document.getElementById('back-login-from-forgot').addEventListener('click', () => showView('view-login'));
  document.getElementById('change-email-btn').addEventListener('click', () => showView('view-forgot'));
}

function setupAccountTypeToggle() {
  const buttons = document.querySelectorAll('[data-account-type]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedAccountType = btn.getAttribute('data-account-type');
    });
  });
}

function setupPasswordToggles() {
  document.querySelectorAll('[data-toggle-pass]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-toggle-pass');
      const input = document.getElementById(targetId);
      if (!input) return;
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.textContent = isHidden ? 'إخفاء' : 'إظهار';
    });
  });
}

function setupOtpSixDigits() {
  const digits = Array.from(document.querySelectorAll('#otp-inputs-container .otp-input'));

  digits.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
      const cleaned = e.target.value.replace(/\D/g, '');
      e.target.value = cleaned.slice(-1);
      if (cleaned && idx < digits.length - 1) {
        digits[idx + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        digits[idx - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      pasted.split('').forEach((char, i) => {
        if (digits[i]) digits[i].value = char;
      });
      const focusIndex = Math.min(pasted.length, digits.length - 1);
      digits[focusIndex].focus();
    });
  });
}

function startOtpCountdown() {
  clearInterval(otpTimerInterval);
  let seconds = 59;
  const timerEl = document.getElementById('otp-timer-text');

  otpTimerInterval = setInterval(() => {
    seconds--;
    if (seconds > 0) {
      timerEl.textContent = `إعادة الإرسال بعد 0:${seconds < 10 ? '0' + seconds : seconds}`;
    } else {
      clearInterval(otpTimerInterval);
      timerEl.innerHTML = `<a href="javascript:void(0)" id="resend-otp-now" style="font-weight:700; color:var(--gold);">إعادة إرسال الرمز</a>`;
      document.getElementById('resend-otp-now').addEventListener('click', async () => {
        window.KiswahLoader.show('جاري إعادة إرسال الرمز إلى بريدك الإلكتروني...');
        if (pendingOtpType === 'recovery') {
          await sb.auth.resetPasswordForEmail(pendingOtpEmail);
        } else {
          await sb.auth.resend({ type: 'signup', email: pendingOtpEmail });
        }
        window.KiswahLoader.hide();
        window.showKiswahToast('تم إعادة إرسال رمز التحقق إلى بريدك الإلكتروني.');
        startOtpCountdown();
      });
    }
  }, 1000);
}

function setupSocialOAuth() {
  document.querySelectorAll('[data-oauth]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const provider = btn.getAttribute('data-oauth');
      window.KiswahLoader.show(`جاري الاتصال بحساب ${provider}...`);

      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: window.location.origin + '/pages/login.html'
        }
      });

      if (error) {
        window.KiswahLoader.hide();
        window.showKiswahToast('تعذر تسجيل الدخول: ' + error.message);
      }
    });
  });
}

function setupLoginForm() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    window.KiswahLoader.show('جاري تسجيل الدخول...');

    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error) {
      window.KiswahLoader.hide();
      window.showKiswahToast('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      return;
    }

    await redirectByUserRole(data.user.id);
  });
}

function setupRegisterForm() {
  const form = document.getElementById('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('reg-fullname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const rawPhone = document.getElementById('reg-phone').value.trim().replace(/^0+/, '');
    const password = document.getElementById('reg-password').value;

    window.KiswahLoader.show('جاري إنشاء الحساب وإرسال رمز التأكيد للبريد...');

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone: rawPhone ? '+20' + rawPhone : null,
          role: 'donor',
          account_type: selectedAccountType
        }
      }
    });

    window.KiswahLoader.hide();

    if (error) {
      window.showKiswahToast(error.message);
      return;
    }

    if (data.user && !data.session) {
      pendingOtpEmail = email;
      pendingOtpType = 'signup';
      document.getElementById('otp-target-email').textContent = email;
      document.querySelectorAll('#otp-inputs-container .otp-input').forEach(i => (i.value = ''));
      showView('view-otp');
      startOtpCountdown();
      window.showKiswahToast('تم إرسال رمز التحقق المكون من 6 أرقام إلى بريدك الإلكتروني.');
      return;
    }

    if (data.session?.user) {
      await redirectByUserRole(data.session.user.id);
    }
  });
}

function setupForgotForm() {
  const form = document.getElementById('forgot-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('forgot-email').value.trim();
    if (!email) return;

    window.KiswahLoader.show('جاري إرسال رمز الاستعادة إلى بريدك الإلكتروني...');

    const { error } = await sb.auth.resetPasswordForEmail(email);

    window.KiswahLoader.hide();

    if (error) {
      window.showKiswahToast('تعذر إرسال الرمز: ' + error.message);
      return;
    }

    pendingOtpEmail = email;
    pendingOtpType = 'recovery';
    document.getElementById('otp-target-email').textContent = email;
    document.querySelectorAll('#otp-inputs-container .otp-input').forEach(i => (i.value = ''));
    showView('view-otp');
    startOtpCountdown();
    window.showKiswahToast('تم إرسال رمز التحقق المكون من 6 أرقام إلى بريدك الإلكتروني.');
  });
}

function setupOtpVerifyForm() {
  const form = document.getElementById('otp-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const digits = Array.from(document.querySelectorAll('#otp-inputs-container .otp-input'));
    const token = digits.map(d => d.value.trim()).join('');

    if (token.length !== 6) {
      window.showKiswahToast('برجاء إدخال الرمز المكون من 6 أرقام بالكامل.');
      return;
    }

    window.KiswahLoader.show('جاري التحقق من الرمز...');

    const { data, error } = await sb.auth.verifyOtp({
      email: pendingOtpEmail,
      token,
      type: pendingOtpType
    });

    window.KiswahLoader.hide();

    if (error || !data.session) {
      window.showKiswahToast('رمز التحقق غير صحيح أو منتهي الصلاحية.');
      return;
    }

    clearInterval(otpTimerInterval);

    if (pendingOtpType === 'recovery') {
      showView('view-new-password');
    } else {
      await redirectByUserRole(data.session.user.id);
    }
  });
}

function setupNewPasswordForm() {
  const form = document.getElementById('new-pass-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;

    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      window.showKiswahToast('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل وتحتوي على رقم.');
      return;
    }

    if (newPassword !== confirmPassword) {
      window.showKiswahToast('كلمتا المرور غير متطابقتين.');
      return;
    }

    window.KiswahLoader.show('جاري حفظ كلمة المرور الجديدة...');

    const { error } = await sb.auth.updateUser({ password: newPassword });

    window.KiswahLoader.hide();

    if (error) {
      window.showKiswahToast('تعذر تحديث كلمة المرور: ' + error.message);
      return;
    }

    window.showKiswahToast('تم تغيير كلمة المرور بنجاح!');
    showView('view-login');
  });
}