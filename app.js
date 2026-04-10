const { createClient } = window.supabase;
const config = window.MOODQUEST_CONFIG || {};
const DEMO_MODE = true;

const appState = {
    doctorCharts: {
    actions: null,
    risk: null
  },
  supabase: null,
  session: null,
  profile: null,
  authMode: 'login',
  selectedRole: 'patient',
  theme: 'light',
  petTypes: [],
  petVariants: [],
  revealedPet: null
};

const appRoot = document.getElementById('appRoot');
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');

const PET_NAMES = {
  cat: 'Котик',
  fox: 'Лисичка',
  bunny: 'Зайчик',
  dragon: 'Дракончик',
  unicorn: 'Единорожка'
};

const ACTION_CONFIG = [
  { slug: 'feed', label: 'Кормить', sublabel: 'забота', icon: '🍓', fx: '❤️', sound: 'Ммм...', tone: 'berry' },
  { slug: 'walk', label: 'Гулять', sublabel: 'активность', icon: '🌿', fx: '💨', sound: 'Шух...', tone: 'mint' },
  { slug: 'play', label: 'Играть', sublabel: 'активность', icon: '✨', fx: '✨', sound: 'Уии...', tone: 'lemon' },
  { slug: 'pet', label: 'Гладить', sublabel: 'забота', icon: '🫶', fx: '💖', sound: 'Пфрр...', tone: 'lilac' },
  { slug: 'kick', label: 'Пнуть', sublabel: 'риск', icon: '⚡', fx: '⚡', sound: 'Эй...', tone: 'coral' },
  { slug: 'sleep', label: 'Спать', sublabel: 'отдых', icon: '🌙', fx: '🌙', sound: 'Хрр...', tone: 'night' }
];

document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  applyTheme(appState.theme);
  bindThemeToggle();

  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY ||
      config.SUPABASE_URL.includes('PASTE_YOUR') ||
      config.SUPABASE_ANON_KEY.includes('PASTE_YOUR')) {
    renderConfigError();
    return;
  }

  appState.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

  renderLoading();

  const { data: { session } } = await appState.supabase.auth.getSession();
  appState.session = session || null;

  appState.supabase.auth.onAuthStateChange(async (_event, session) => {
    appState.session = session || null;
    await routeApp();
  });

    await preloadReferenceData();
  await routeApp();

  document.addEventListener('visibilitychange', handleAppResume);
  window.addEventListener('focus', handleAppResume);
  window.addEventListener('pageshow', handleAppResume);
}

async function preloadReferenceData() {
  const [{ data: petTypes }, { data: petVariants }] = await Promise.all([
    appState.supabase.from('pet_types').select('*').order('name'),
    appState.supabase.from('pet_variants').select('*')
  ]);

  appState.petTypes = petTypes || [];
  appState.petVariants = petVariants || [];
}

function bindThemeToggle() {
  themeToggle.addEventListener('click', () => {
    appState.theme = appState.theme === 'light' ? 'dark' : 'light';
    applyTheme(appState.theme);
  });
}

function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
}

async function routeApp() {
  if (!appState.session) {
    renderAuthScreen();
    return;
  }

  const profile = await fetchMyProfile();
  appState.profile = profile;

  if (!profile) {
    renderFatalState(
      'Профиль не найден',
      'Пользователь есть в Auth, но профиль не загрузился. Проверь, сработал ли триггер handle_new_user.'
    );
    return;
  }

  if (profile.role === 'doctor') {
    await renderDoctorDashboard();
    return;
  }

  const hasDoctorLink = await patientHasDoctorLink(profile.id);

  if (!hasDoctorLink) {
    renderInviteScreen();
    return;
  }

  const pet = await fetchMyPet();

  if (!pet) {
    renderOnboardingScreen();
    return;
  }

  await renderPatientHomeScreen(pet);
}

async function fetchMyProfile() {
  const { data, error } = await appState.supabase
    .from('profiles')
    .select('*')
    .eq('id', appState.session.user.id)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

async function patientHasDoctorLink(patientId) {
  const { data, error } = await appState.supabase
    .from('doctor_patients')
    .select('id')
    .eq('patient_id', patientId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error(error);
    return false;
  }

  return !!data;
}

async function fetchMyPet() {
  const { data, error } = await appState.supabase
    .from('patient_pets')
    .select('*')
    .eq('patient_id', appState.session.user.id)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

async function fetchTodayMetric() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await appState.supabase
    .from('daily_patient_metrics')
    .select('*')
    .eq('patient_id', appState.session.user.id)
    .eq('date', today)
    .maybeSingle();

  if (error) {
    console.error(error);
    return null;
  }

  return data;
}

function renderLoading() {
  const tpl = document.getElementById('loadingTemplate');
  appRoot.innerHTML = '';
  appRoot.appendChild(tpl.content.cloneNode(true));
}

function renderConfigError() {
  appRoot.innerHTML = `
    <div class="mq-panel text-center animate-fadeUp">
      <div class="mx-auto mb-4 text-5xl">⚙️</div>
      <h2 class="font-display text-3xl font-extrabold tracking-[-0.05em]">Нужно подключить Supabase</h2>
      <p class="mt-2 text-sm leading-6 text-mq-muted">
        Открой файл <strong>supabase-config.js</strong> и вставь Project URL и Publishable key из Supabase Project Settings → API.
      </p>
    </div>
  `;
}

function renderFatalState(title, description) {
  appRoot.innerHTML = `
    <div class="mq-panel text-center animate-fadeUp">
      <div class="mx-auto mb-4 text-5xl">✨</div>
      <h2 class="font-display text-3xl font-extrabold tracking-[-0.05em]">${escapeHtml(title)}</h2>
      <p class="mt-2 text-sm leading-6 text-mq-muted">${escapeHtml(description)}</p>
      ${appState.session ? `
        <button id="logoutBtn" class="mq-secondary-btn mt-6 w-full" type="button">
          Выйти
        </button>
      ` : ''}
    </div>
  `;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }
}

function renderAuthScreen() {
  const tpl = document.getElementById('authTemplate');
  appRoot.innerHTML = '';
  appRoot.appendChild(tpl.content.cloneNode(true));

  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const authForm = document.getElementById('authForm');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const roleChooser = document.getElementById('roleChooser');
  const fullNameField = document.getElementById('fullNameField');
  const roleButtons = [...document.querySelectorAll('.mq-role-btn')];

  syncAuthModeUi();
  bindHeroTamagotchi();

  tabLogin.addEventListener('click', () => {
    appState.authMode = 'login';
    syncAuthModeUi();
  });

  tabRegister.addEventListener('click', () => {
    appState.authMode = 'register';
    syncAuthModeUi();
  });

  roleButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.selectedRole = btn.dataset.role;
      roleButtons.forEach((b) => b.classList.remove('mq-role-btn--active'));
      btn.classList.add('mq-role-btn--active');
    });
  });

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const fullName = document.getElementById('fullName').value.trim();

    if (!email || !password) {
      showToast('Заполни email и пароль', 'error');
      return;
    }

    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = appState.authMode === 'login' ? 'Входим...' : 'Создаём аккаунт...';

    try {
      if (appState.authMode === 'login') {
        const { error } = await appState.supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        showToast('Успешный вход ✨', 'success');
      } else {
        if (!fullName) {
          throw new Error('Укажи имя и фамилию');
        }

        const { error } = await appState.supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: appState.selectedRole,
              full_name: fullName
            }
          }
        });

        if (error) throw error;

        showToast('Аккаунт создан. Теперь войди в систему ✨', 'success');
        appState.authMode = 'login';
        syncAuthModeUi();
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Ошибка авторизации', 'error');
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = appState.authMode === 'login' ? 'Войти' : 'Создать аккаунт';
    }
  });

  function syncAuthModeUi() {
    const isRegister = appState.authMode === 'register';
    tabLogin.classList.toggle('mq-segment-btn--active', !isRegister);
    tabRegister.classList.toggle('mq-segment-btn--active', isRegister);
    roleChooser.classList.toggle('hidden', !isRegister);
    fullNameField.classList.toggle('hidden', !isRegister);
    authSubmitBtn.textContent = isRegister ? 'Создать аккаунт' : 'Войти';
  }
}

function renderInviteScreen() {
  const tpl = document.getElementById('inviteTemplate');
  appRoot.innerHTML = '';
  appRoot.appendChild(tpl.content.cloneNode(true));

  document.getElementById('logoutBtnInvite')?.addEventListener('click', handleLogout);

  const inviteForm = document.getElementById('inviteForm');
  inviteForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const inviteCode = document.getElementById('inviteCode').value.trim().toUpperCase();

    if (!inviteCode) {
      showToast('Введи код приглашения', 'error');
      return;
    }

    const submitBtn = inviteForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Подключаем...';

    try {
      const { error } = await appState.supabase.rpc('accept_invite_code', {
        p_invite_code: inviteCode
      });

      if (error) throw error;

      showToast('Пациент успешно подключён к врачу ✨', 'success');
      await routeApp();
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Не удалось применить invite-код', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Подключиться';
    }
  });
}

function renderOnboardingScreen() {
  const tpl = document.getElementById('onboardingTemplate');
  appRoot.innerHTML = '';
  appRoot.appendChild(tpl.content.cloneNode(true));
  document.getElementById('logoutBtnConnect')?.addEventListener('click', handleLogout);

  appState.revealedPet = null;

  const openCapsuleBtn = document.getElementById('openCapsuleBtn');
  const gachaCapsule = document.getElementById('gachaCapsule');
  const revealedPetWrap = document.getElementById('revealedPetWrap');
  const revealedPetImage = document.getElementById('revealedPetImage');
  const revealedPetName = document.getElementById('revealedPetName');
  const adoptPetForm = document.getElementById('adoptPetForm');
  const adoptPetBtn = document.getElementById('adoptPetBtn');
  const petNameInput = document.getElementById('petNameInput');
  const gachaPhaseLabel = document.getElementById('gachaPhaseLabel');
  const gachaStatusLabel = document.getElementById('gachaStatusLabel');
  const gachaTipLabel = document.getElementById('gachaTipLabel');
  const onboardingDescription = document.getElementById('onboardingDescription');

  openCapsuleBtn.addEventListener('click', async () => {
    openCapsuleBtn.disabled = true;
    openCapsuleBtn.textContent = 'Открываем...';
    gachaPhaseLabel.textContent = 'OPENING';
    gachaStatusLabel.textContent = 'STATUS: SCANNING';
    gachaTipLabel.textContent = 'revealing pet...';
    gachaCapsule.classList.add('is-opening');

    await wait(650);

    const randomPet = pickRandomPet();
    appState.revealedPet = randomPet;

    const assetUrl = getPetAssetUrl(randomPet.slug, 1, 'happy');

    revealedPetImage.src = assetUrl;
    revealedPetName.textContent = PET_NAMES[randomPet.slug] || randomPet.name || 'Питомец';

    gachaCapsule.classList.add('hidden');
    revealedPetWrap.classList.remove('hidden');
    adoptPetForm.classList.remove('hidden');

    gachaPhaseLabel.textContent = 'FOUND';
    gachaStatusLabel.textContent = `STATUS: ${String(randomPet.slug).toUpperCase()}`;
    gachaTipLabel.textContent = 'name your companion';
    onboardingDescription.textContent =
      'Тебе выпал эмоциональный спутник. Дай ему имя и начни свой ежедневный check-in.';

    openCapsuleBtn.classList.add('hidden');
  });

  adoptPetForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!appState.revealedPet) {
      showToast('Сначала открой капсулу', 'error');
      return;
    }

    const petName = petNameInput.value.trim();
    if (!petName) {
      showToast('Дай питомцу имя', 'error');
      return;
    }

    adoptPetBtn.disabled = true;
    adoptPetBtn.textContent = 'Приючаем...';

    try {
  const { data: insertedPet, error } = await appState.supabase
    .from('patient_pets')
    .insert({
      patient_id: appState.session.user.id,
      pet_type_id: appState.revealedPet.id,
      pet_name: petName,
      evolution_stage: 1,
      current_emotion: 'sad'
    })
    .select();

  if (error) {
    console.error(error);
    showToast('Не удалось сохранить питомца', 'error');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  const { error: metricInsertError } = await appState.supabase
    .from('daily_patient_metrics')
    .upsert(
      {
        patient_id: appState.session.user.id,
        date: today,
        total_actions: 0,
        care_actions: 0,
        play_actions: 0,
        aggressive_actions: 0,
        rest_actions: 0,
        activity_score: 0,
        risk_level: 'green'
      },
      {
        onConflict: 'patient_id,date'
      }
    );

  if (metricInsertError) {
    console.error(metricInsertError);
    showToast('Питомец создан, но не удалось записать стартовые метрики', 'error');
    return;
  }

  const { error: onboardingError } = await appState.supabase
    .from('patient_onboarding')
    .update({
      selected_pet_type_id: appState.revealedPet.id,
      has_seen_gacha_intro: true,
      has_named_pet: true,
      completed_at: new Date().toISOString()
    })
    .eq('patient_id', appState.session.user.id);

  if (onboardingError) {
    console.error(onboardingError);
    showToast('Питомец создан, но не удалось завершить onboarding', 'error');
    return;
  }

  showToast('Питомец теперь с тобой ✨', 'success');

  await wait(300);
  await routeApp();
  } catch (error) {
  console.error(error);
  showToast(error.message || 'Не удалось сохранить питомца', 'error');
  } finally {
  adoptPetBtn.disabled = false;
  adoptPetBtn.textContent = 'Приютить питомца';
  }
  });
}

async function renderPatientHomeScreen(pet) {
  const metric = await fetchTodayMetric();
  const petType = appState.petTypes.find((item) => item.id === pet.pet_type_id);
  const petSlug = petType?.slug || 'bunny';
  const emotion = String(pet.current_emotion || 'sad').trim().toLowerCase();
  const stickerClass = getEmotionStickerClass(emotion);
  const assetUrl = getPetAssetUrl(petSlug, pet.evolution_stage || 1, emotion);

  const carePercent = clampPercent((pet.care_score || 0) * 4);
  const stabilityPercent = clampPercent((pet.stability_score || 0) * 4);
  const aggressionPercent = clampPercent(Math.max(0, pet.aggression_score || 0) * 6);

  const evolutionProgress = await getEvolutionProgress(pet.id);

  appRoot.innerHTML = `
    <div class="animate-fadeUp space-y-4">
      <section class="mq-panel mq-pet-home">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <p class="mq-eyebrow">PET HOME</p>
            <h2 class="font-display text-[2rem] font-extrabold tracking-[-0.05em]">
              ${escapeHtml(pet.pet_name)}
            </h2>
          </div>
          <div class="mq-sticker ${stickerClass}">
            ${escapeHtml(emotion.toUpperCase())}
          </div>
        </div>

        <div class="mq-pet-home-screen mq-pet-home-screen--${emotion}" id="patientPetScreen">
          <div class="mq-screen-grid"></div>
          <div class="mq-screen-noise"></div>

          <div class="mq-pixel-sun"></div>
          <div class="mq-pixel-cloud mq-pixel-cloud--one"></div>
          <div class="mq-pixel-cloud mq-pixel-cloud--two"></div>
          <div class="mq-pixel-ground"></div>

          <div class="mq-emotion-overlay mq-emotion-overlay--${emotion}">
            <span></span><span></span><span></span>
          </div>

          <div class="mq-screen-hud mq-screen-hud--top">
            <span class="mq-hud-icon">❤️</span>
            <span class="mq-hud-icon">⚡</span>
            <span class="mq-hud-icon">🌙</span>
          </div>

          <div class="mq-screen-label mq-screen-label--left">STAGE ${pet.evolution_stage || 1}</div>
          <div class="mq-screen-label mq-screen-label--right">${escapeHtml(petSlug.toUpperCase())}</div>

          <div class="mq-screen-live">LIVE</div>

          <div class="mq-home-pet-wrap" id="patientPetWrap">
            <img src="${assetUrl}" alt="${escapeHtml(pet.pet_name)}" class="mq-home-pet-image" />
          </div>

          <div class="mq-screen-status">${escapeHtml(emotion.toUpperCase())}</div>
          <div class="mq-screen-tip">действия влияют на настроение</div>

          <div class="mq-fx-layer" id="fxLayer"></div>
          <div class="mq-evolution-magic-layer" id="evolutionMagicLayer"></div>
        </div>

        <div class="mt-5 mq-action-grid">
          ${ACTION_CONFIG.map(action => `
            <button
              class="mq-action-btn mq-action-btn--${action.tone}"
              data-action-slug="${action.slug}"
              type="button"
            >
              <span class="mq-action-btn__shine"></span>
              <span class="mq-action-btn__icon">${action.icon}</span>
              <span class="mq-action-btn__label">${action.label}</span>
              <span class="mq-action-btn__meta">${action.sublabel}</span>
            </button>
          `).join('')}
        </div>
      </section>

      <section class="mq-panel">
        <div class="mb-4 flex items-start justify-between gap-3">
          <div>
            <p class="mq-eyebrow">PROGRESS</p>
            <h3 class="font-display text-[1.6rem] font-extrabold tracking-[-0.05em]">
              Состояние питомца
            </h3>
          </div>
          <div class="mq-sticker mq-sticker--happy">${metric?.total_actions ?? 0}</div>
        </div>

        <div class="mq-bars">
          <div>
            <div class="mq-bar-label">
              <span>Забота</span>
              <span>${carePercent}%</span>
            </div>
            <div class="mq-bar-track"><div class="mq-bar-fill mq-bar-fill--care" style="width:${carePercent}%"></div></div>
          </div>

          <div>
            <div class="mq-bar-label">
              <span>Стабильность</span>
              <span>${stabilityPercent}%</span>
            </div>
            <div class="mq-bar-track"><div class="mq-bar-fill mq-bar-fill--stability" style="width:${stabilityPercent}%"></div></div>
          </div>

          <div>
            <div class="mq-bar-label">
              <span>Агрессия</span>
              <span>${aggressionPercent}%</span>
            </div>
            <div class="mq-bar-track"><div class="mq-bar-fill mq-bar-fill--aggression" style="width:${aggressionPercent}%"></div></div>
          </div>
        </div>

        <div class="mq-evolution-card mt-5">
          <div class="mq-evolution-card__top">
            <div>
              <p class="mq-eyebrow">EVOLUTION</p>
              <h4 class="font-display text-[1.2rem] font-extrabold tracking-[-0.04em]">
                Прогресс до stage 2
              </h4>
            </div>
            <div class="mq-mini-chip">stage ${pet.evolution_stage || 1}</div>
          </div>

          <div class="mt-3">
            <div class="mq-bar-label">
              <span>Общий прогресс</span>
              <span>${evolutionProgress.progressPercent}%</span>
            </div>
            <div class="mq-bar-track mq-bar-track--evolution">
              <div class="mq-bar-fill mq-bar-fill--evolution" style="width:${evolutionProgress.progressPercent}%"></div>
            </div>
          </div>

          <div class="mq-evolution-grid mt-4">
            <div class="mq-evolution-mini ${evolutionProgress.actionsOk ? 'is-ok' : ''}">
              <span class="mq-evolution-mini__label">Действия</span>
              <strong class="mq-evolution-mini__value">${evolutionProgress.totalActions}/200</strong>
            </div>
            <div class="mq-evolution-mini ${evolutionProgress.carePlayOk ? 'is-ok' : ''}">
              <span class="mq-evolution-mini__label">Забота+Игра</span>
              <strong class="mq-evolution-mini__value">${evolutionProgress.carePlayPercent}%</strong>
            </div>
            <div class="mq-evolution-mini ${evolutionProgress.aggressionOk ? 'is-ok' : ''}">
              <span class="mq-evolution-mini__label">Агрессия</span>
              <strong class="mq-evolution-mini__value">${evolutionProgress.aggressionPercent}%</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="mq-panel">
  <div class="flex gap-2">
    ${DEMO_MODE ? `
      <button 
      id="demoEvolveBtn" 
      class="mq-demo-toggle ${pet.evolution_stage === 2 ? 'is-stage-2' : ''}" 
      type="button"
    >
     ${pet.evolution_stage === 2 ? '↩ Stage 1' : '✨ Stage 2'}
    </button>
    ` : ''}
    <button id="logoutBtnPatient" class="mq-secondary-btn ${DEMO_MODE ? '' : 'w-full'}" type="button">
      Выйти
    </button>
  </div>
  </section>
    </div>
  `;

  document.getElementById('logoutBtnPatient')?.addEventListener('click', handleLogout);

  document.getElementById('demoEvolveBtn')?.addEventListener('click', async () => {
  try {
    const isStage2 = (pet.evolution_stage || 1) >= 2;
    const nextStage = isStage2 ? 1 : 2;

    playEvolutionTransition(nextStage);

    await wait(520);

    const { error } = await appState.supabase
      .from('patient_pets')
      .update({ evolution_stage: nextStage })
      .eq('id', pet.id);

    if (error) throw error;

    if (nextStage === 2) {
      showEvolutionPopup();
      await wait(900);
    }

    await routeApp();
  } catch (error) {
    console.error(error);
    showToast('Ошибка demo-переключения', 'error');
  }
});

  document.querySelectorAll('[data-action-slug]').forEach((button) => {
  button.addEventListener('click', async () => {
    const slug = button.dataset.actionSlug;
    const action = ACTION_CONFIG.find((item) => item.slug === slug);
    if (!action) return;

    button.disabled = true;

    try {
      const actionTypeId = await getActionTypeIdBySlug(slug);
      if (!actionTypeId) throw new Error('Тип действия не найден');

      const category = getActionCategoryBySlug(slug);

      const { error } = await appState.supabase
        .from('patient_actions')
        .insert({
          patient_id: appState.session.user.id,
          pet_id: pet.id,
          action_type_id: actionTypeId,
          action_category_snapshot: category
        });

      if (error) {
        console.error(error);
        showToast('Не удалось сохранить действие', 'error');
        return;
      }

      playPetFx(action.fx);
      playScreenReaction(action.slug);
      showToast(action.sound || '...', 'pet');

      await recalculatePetEmotion(pet.id);
      const evolutionResult = await evaluatePetEvolution(pet);

      if (evolutionResult?.evolved) {
        showEvolutionPopup();
        await wait(700);
      }

      await refreshPatientHome();
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Не удалось сохранить действие', 'error');
    } finally {
      button.disabled = false;
    }
  });
});
}

async function renderDoctorDashboard() {
  try {
    const tpl = document.getElementById('doctorDashboardTemplate');
    appRoot.innerHTML = '';
    appRoot.appendChild(tpl.content.cloneNode(true));

    const heading = document.getElementById('doctorNameHeading');
    if (heading) {
      heading.textContent = appState.profile?.full_name || 'Кабинет врача';
    }

    const [doctorPatients, doctorAlerts] = await Promise.all([
      fetchDoctorPatients(),
      fetchDoctorAlerts()
    ]);

    const patientsCount = doctorPatients.length;
    const alertsCount = doctorAlerts.length;

    const demoTarget = doctorPatients.find(item => item.patient_id) || null;
    const hasRedPatient =
     String(demoTarget?.latestMetric?.risk_level || 'green').toLowerCase() === 'red';

    const patientsCountEl = document.getElementById('doctorPatientsCount');
    const alertsCountEl = document.getElementById('doctorAlertsCount');
    const alertsSummaryEl = document.getElementById('doctorAlertsSummary');
    const patientsSummaryEl = document.getElementById('doctorPatientsSummary');
    const demoRiskBtn = document.getElementById('demoRiskBtn');

if (patientsCountEl) patientsCountEl.textContent = String(patientsCount);
if (alertsCountEl) alertsCountEl.textContent = String(alertsCount);
if (alertsSummaryEl) alertsSummaryEl.textContent = `${alertsCount} total`;
if (patientsSummaryEl) patientsSummaryEl.textContent = `${patientsCount} active`;

if (demoRiskBtn) {
  demoRiskBtn.textContent = hasRedPatient ? 'Demo RED OFF' : 'Demo RED ON';
  demoRiskBtn.classList.toggle('is-active', hasRedPatient);
}
    if (patientsCountEl) patientsCountEl.textContent = String(patientsCount);
    if (alertsCountEl) alertsCountEl.textContent = String(alertsCount);
    if (alertsSummaryEl) alertsSummaryEl.textContent = `${alertsCount} total`;
    if (patientsSummaryEl) patientsSummaryEl.textContent = `${patientsCount} active`;

    if (demoRiskBtn) {
      demoRiskBtn.textContent = hasRedPatient ? 'Demo RED OFF' : 'Demo RED ON';
      demoRiskBtn.classList.toggle('is-active', hasRedPatient);
    }

    renderDoctorAlertsList(doctorAlerts);
    renderDoctorPatientsList(doctorPatients);
    bindDoctorAnalytics(doctorPatients);

    document.getElementById('logoutBtnDoctor')?.addEventListener('click', handleLogout);
    document.getElementById('createInviteBtn')?.addEventListener('click', handleCreateInvite);
    document.getElementById('demoRiskBtn')?.addEventListener('click', handleDoctorDemoRiskToggle);
    document.getElementById('copyInviteBtn')?.addEventListener('click', handleCopyInvite);
    document.getElementById('hideInviteBtn')?.addEventListener('click', () => {
      document.getElementById('inviteResultPanel')?.classList.add('hidden');
    });
  } catch (error) {
    console.error('renderDoctorDashboard error:', error);
    renderFatalState(
      'Ошибка кабинета врача',
      error.message || 'Не удалось загрузить кабинет врача'
    );
  }
}

async function handleLogout() {
  await appState.supabase.auth.signOut();
  showToast('Ты вышла из аккаунта', 'success');
}

function bindHeroTamagotchi() {
  const heroScreen = document.getElementById('heroPetScreen');
  const heroPetWrap = document.getElementById('heroPetWrap');
  const modeLabel = document.getElementById('heroModeLabel');
  const statusLabel = document.getElementById('heroStatusLabel');
  const tipLabel = document.getElementById('heroTipLabel');
  const buttons = [...document.querySelectorAll('[data-hero-mode]')];

  if (!heroScreen || !heroPetWrap || !modeLabel || !statusLabel || !tipLabel || !buttons.length) {
    return;
  }

  const modes = {
    care: {
      mode: 'CARE MODE',
      status: 'STATUS: HAPPY',
      tip: 'feed / pet / walk'
    },
    mood: {
      mode: 'MOOD CHECK',
      status: 'STATUS: AWARE',
      tip: 'observe / track / react'
    },
    rest: {
      mode: 'REST MODE',
      status: 'STATUS: CALM',
      tip: 'sleep / pause / recover'
    }
  };

  const bouncePet = () => {
    heroPetWrap.classList.remove('is-bouncing');
    void heroPetWrap.offsetWidth;
    heroPetWrap.classList.add('is-bouncing');

    setTimeout(() => {
      heroPetWrap.classList.remove('is-bouncing');
    }, 220);
  };

  const applyMode = (mode) => {
    const preset = modes[mode] || modes.care;
    heroScreen.dataset.mode = mode;
    modeLabel.textContent = preset.mode;
    statusLabel.textContent = preset.status;
    tipLabel.textContent = preset.tip;
    bouncePet();
  };

  heroScreen.addEventListener('click', bouncePet);
  heroScreen.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      bouncePet();
    }
  });

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.dataset.heroMode;
      button.classList.add('is-pressed');
      setTimeout(() => button.classList.remove('is-pressed'), 140);
      applyMode(mode);
    });
  });
}

function playPetFx(symbol) {
  const fxLayer = document.getElementById('fxLayer');
  if (!fxLayer) return;

  const badge = document.createElement('div');
  badge.className = 'mq-fx-badge';
  badge.textContent = symbol;
  fxLayer.appendChild(badge);

  setTimeout(() => badge.remove(), 700);
}

function pickRandomPet() {
  const pool = [...appState.petTypes];
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function getPetAssetUrl(slug, stage = 1, emotion = 'happy') {
  const base = `${config.SUPABASE_URL}/storage/v1/object/public/pet-assets`;
  return `${base}/${slug}/stage-${stage}/${emotion}.png`;
}

async function getActionTypeIdBySlug(slug) {
  const { data, error } = await appState.supabase
    .from('action_types')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error) {
    console.error(error);
    return null;
  }

  return data.id;
}

function getActionCategoryBySlug(slug) {
  if (slug === 'feed' || slug === 'pet') return 'care';
  if (slug === 'walk' || slug === 'play') return 'play';
  if (slug === 'kick') return 'aggressive';
  return 'rest';
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');

  if (type === 'pet') {
    toast.className = 'mq-pet-bubble';
    toast.innerHTML = `
      <span class="mq-pet-bubble__icon">💬</span>
      <span class="mq-pet-bubble__text">${escapeHtml(message)}</span>
    `;
  } else {
    toast.className = `
      fixed left-1/2 top-5 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl px-4 py-3
      text-sm font-semibold text-white shadow-2xl backdrop-blur
      ${type === 'error' ? 'bg-red-500/90' : 'bg-slate-900/85'}
    `;
    toast.textContent = message;
  }

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('is-leaving');
  }, 1500);

  setTimeout(() => toast.remove(), 1900);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getEmotionStickerClass(emotion) {
  switch (String(emotion).trim().toLowerCase()) {
    case 'happy':
      return 'mq-sticker--happy';
    case 'sad':
      return 'mq-sticker--sad';
    case 'tense':
      return 'mq-sticker--tense';
    case 'angry':
      return 'mq-sticker--angry';
    default:
      return 'mq-sticker--sad';
  }
}

function playScreenReaction(actionSlug) {
  const screen = document.getElementById('patientPetScreen');
  const petWrap = document.getElementById('patientPetWrap');
  if (!screen || !petWrap) return;

  const addTempClass = (target, className, duration = 420) => {
    target.classList.remove(className);
    void target.offsetWidth;
    target.classList.add(className);
    setTimeout(() => target.classList.remove(className), duration);
  };

  if (actionSlug === 'kick') {
    addTempClass(screen, 'is-shaking', 360);
    addTempClass(petWrap, 'is-hit', 360);
    return;
  }

  if (actionSlug === 'sleep') {
    addTempClass(screen, 'is-sleepy', 700);
    addTempClass(petWrap, 'is-soft-bounce', 360);
    return;
  }

  if (actionSlug === 'walk') {
    addTempClass(screen, 'is-walking', 420);
    addTempClass(petWrap, 'is-soft-bounce', 300);
    return;
  }

  if (actionSlug === 'play') {
    addTempClass(screen, 'is-sparkling', 420);
    addTempClass(petWrap, 'is-bounce-big', 320);
    return;
  }

  if (actionSlug === 'feed' || actionSlug === 'pet') {
    addTempClass(screen, 'is-loving', 420);
    addTempClass(petWrap, 'is-soft-bounce', 300);
  }
}

async function recalculatePetEmotion(petId) {
  const patientId = appState.session.user.id;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: recentActions, error: recentError },
    { data: last24hActions, error: dayError }
  ] = await Promise.all([
    appState.supabase
      .from('patient_actions')
      .select('id, action_category_snapshot, created_at')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(15),

    appState.supabase
      .from('patient_actions')
      .select('id, created_at')
      .eq('patient_id', patientId)
      .gte('created_at', since24h)
  ]);

  if (recentError) {
    console.error(recentError);
    return;
  }

  if (dayError) {
    console.error(dayError);
    return;
  }

  const emotion = calculateEmotion(recentActions || [], last24hActions || []);

  const { error: updateError } = await appState.supabase
    .from('patient_pets')
    .update({
      current_emotion: emotion
    })
    .eq('id', petId);

  if (updateError) {
    console.error(updateError);
  }
}

function calculateEmotion(recentActions, last24hActions) {
  const recent = recentActions || [];
  const lastDay = last24hActions || [];

  if (lastDay.length === 0) {
    return 'sad';
  }

  if (recent.length < 3) {
    return 'sad';
  }

  const aggressiveCount = recent.filter(
    (item) => item.action_category_snapshot === 'aggressive'
  ).length;

  const careCount = recent.filter(
    (item) => item.action_category_snapshot === 'care'
  ).length;

  const playCount = recent.filter(
    (item) => item.action_category_snapshot === 'play'
  ).length;

  const aggressiveRatio = aggressiveCount / recent.length;
  const positiveRatio = (careCount + playCount) / recent.length;

  if (aggressiveRatio >= 0.4) {
    return 'angry';
  }

  if (aggressiveRatio >= 0.2) {
    return 'tense';
  }

  if (positiveRatio >= 0.6 && aggressiveRatio < 0.1) {
    return 'happy';
  }

  return 'sad';
}

async function fetchDoctorAlerts() {
  const { data, error } = await appState.supabase
    .from('doctor_alerts')
    .select(`
      id,
      alert_type,
      severity,
      title,
      message,
      created_at,
      patient_id
    `)
    .eq('doctor_id', appState.session.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('fetchDoctorAlerts error:', error);
    return [];
  }

  const alerts = data || [];
  const patientIds = [...new Set(alerts.map(a => a.patient_id).filter(Boolean))];

  let profilesMap = new Map();

  if (patientIds.length) {
    const { data: profiles, error: profilesError } = await appState.supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', patientIds);

    if (profilesError) {
      console.error('fetchDoctorAlerts profiles error:', profilesError);
    } else {
      profilesMap = new Map((profiles || []).map(p => [p.id, p.full_name]));
    }
  }

  const unique = [];
  const seen = new Set();

  for (const alert of alerts) {
    const key = [
      String(alert.patient_id || 'none'),
      String(alert.title || '').trim(),
      String(alert.message || '').trim(),
      String(alert.severity || '').trim()
    ].join('::');

    if (seen.has(key)) continue;
    seen.add(key);

    unique.push({
      ...alert,
      patient_name: profilesMap.get(alert.patient_id) || 'Пациент'
    });
  }

  return unique.slice(0, 12);
}

async function fetchDoctorPatients() {
  const doctorId = appState.session.user.id;

  const { data: links, error: linksError } = await appState.supabase
    .from('doctor_patients')
    .select('patient_id')
    .eq('doctor_id', doctorId)
    .eq('is_active', true);

  if (linksError) {
    console.error(linksError);
    return [];
  }

  const patientIds = (links || []).map(item => item.patient_id).filter(Boolean);

  if (!patientIds.length) {
    return [];
  }

  const [
    { data: profiles, error: profilesError },
    { data: pets, error: petsError },
    { data: metrics, error: metricsError }
  ] = await Promise.all([
    appState.supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', patientIds),

    appState.supabase
      .from('patient_pets')
      .select('id, patient_id, pet_name, current_emotion, evolution_stage, care_score, stability_score, aggression_score')
      .in('patient_id', patientIds),

    appState.supabase
      .from('daily_patient_metrics')
      .select('patient_id, date, total_actions, risk_level')
      .in('patient_id', patientIds)
      .order('date', { ascending: false })
  ]);

  if (profilesError) {
    console.error(profilesError);
    return [];
  }

  if (petsError) {
    console.error(petsError);
    return [];
  }

  if (metricsError) {
    console.error(metricsError);
    return [];
  }

  return patientIds.map((patientId) => {
    const profile = (profiles || []).find(item => item.id === patientId) || null;
    const pet = (pets || []).find(item => item.patient_id === patientId) || null;

    const latestMetric =
      (metrics || []).find(item => item.patient_id === patientId) || {
        patient_id: patientId,
        date: new Date().toISOString().slice(0, 10),
        total_actions: 0,
        risk_level: 'green'
      };

    return {
      patient_id: patientId,
      profile,
      pet,
      latestMetric
    };
  });
}

async function handleDoctorDemoRiskToggle() {
  try {
    const patients = await fetchDoctorPatients();
    const target = patients.find(item => item.patient_id);

    if (!target) {
      showToast('Нет пациента для demo', 'error');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const currentRisk = String(target.latestMetric?.risk_level || 'green').toLowerCase();
    const turnOn = currentRisk !== 'red';

    const { error: metricError } = await appState.supabase
      .from('daily_patient_metrics')
      .upsert({
        patient_id: target.patient_id,
        date: today,
        total_actions: turnOn ? 1 : 3,
        care_actions: turnOn ? 0 : 2,
        play_actions: turnOn ? 0 : 1,
        aggressive_actions: turnOn ? 1 : 0,
        rest_actions: 0,
        activity_score: turnOn ? 1 : 3,
        risk_level: turnOn ? 'red' : 'green'
      }, {
        onConflict: 'patient_id,date'
      });

    if (metricError) throw metricError;

    const { error: petError } = await appState.supabase
      .from('patient_pets')
      .update({
        current_emotion: turnOn ? 'angry' : 'happy'
      })
      .eq('patient_id', target.patient_id);

    if (petError) throw petError;

    showToast(turnOn ? 'Demo RED risk включён' : 'Demo RED risk выключен', 'success');
    await renderDoctorDashboard();
  } catch (error) {
    console.error('handleDoctorDemoRiskToggle error:', error);
    showToast(error.message || 'Не удалось переключить demo RED risk', 'error');
  }
}

function renderDoctorAlertsList(alerts) {
  const root = document.getElementById('doctorAlertsList');
  if (!root) return;

  if (!alerts.length) {
    root.innerHTML = `
      <div class="mq-empty-state">
        Пока нет активных сигналов. Когда система заметит риск или позитивную динамику, они появятся здесь.
      </div>
    `;
    return;
  }

  root.innerHTML = alerts.map((alert) => {
    const severity = String(alert.severity || 'yellow').toLowerCase();
    const severityClass =
      severity === 'red'
        ? 'mq-alert-pill--red'
        : severity === 'positive'
          ? 'mq-alert-pill--positive'
          : 'mq-alert-pill--yellow';

    const cardClass =
      severity === 'red'
        ? 'mq-alert-card--red'
        : severity === 'positive'
          ? 'mq-alert-card--positive'
          : 'mq-alert-card--yellow';

    return `
      <article class="mq-alert-card ${cardClass}">
        <div class="mq-alert-card__top">
          <div>
            <div class="mq-alert-card__patient">
              ${escapeHtml(alert.patient_name || 'Пациент')}
            </div>
            <h4 class="mq-alert-card__title">${escapeHtml(alert.title || 'Сигнал системы')}</h4>
          </div>
          <span class="mq-alert-pill ${severityClass}">
            ${escapeHtml(severity)}
          </span>
        </div>
        <p class="mq-alert-card__text">${escapeHtml(alert.message || '')}</p>
      </article>
    `;
  }).join('');
}

function renderDoctorPatientsList(patients) {
  const root = document.getElementById('doctorPatientsList');
  const summary = document.getElementById('doctorPatientsSummary');
  if (!root) return;

  if (!patients.length) {
    if (summary) summary.textContent = '0 active';
    root.innerHTML = `
      <div class="mq-empty-state">
        Пока нет пациентов. Создай invite-код и передай его пациенту для подключения к кабинету.
      </div>
    `;
    return;
  }

  const riskCounts = {
    green: 0,
    yellow: 0,
    red: 0
  };

  patients.forEach((item) => {
    const risk = (item.latestMetric?.risk_level ?? 'green')
      .toString()
      .trim()
      .toLowerCase() || 'green';

    if (riskCounts[risk] !== undefined) riskCounts[risk] += 1;
  });

  if (summary) {
    summary.textContent = `G ${riskCounts.green} · Y ${riskCounts.yellow} · R ${riskCounts.red}`;
  }

  root.innerHTML = `
    <div class="mq-patient-summary-row">
    <div class="mq-risk-chip mq-risk-chip--green">зелёный ${riskCounts.green}</div>
    <div class="mq-risk-chip mq-risk-chip--yellow">жёлтый ${riskCounts.yellow}</div>
    <div class="mq-risk-chip mq-risk-chip--red">красный ${riskCounts.red}</div>
    </div>

    ${patients.map((item) => {
      const patientName = item.profile?.full_name || 'Пациент';
      const petName = item.pet?.pet_name || '—';
      const emotion = String(item.pet?.current_emotion || 'sad').toLowerCase();
      const stickerClass = getEmotionStickerClass(emotion);

      const risk = (item.latestMetric?.risk_level ?? 'green')
        .toString()
        .trim()
        .toLowerCase() || 'green';

      const actionsToday = item.latestMetric?.total_actions ?? 0;
      const riskClass = getRiskClass(risk);

      return `
        <article class="mq-patient-card">
          <div class="mq-patient-card__top">
            <div>
              <h4 class="mq-patient-card__name">${escapeHtml(patientName)}</h4>
              <p class="mq-patient-card__meta">Питомец: ${escapeHtml(petName)}</p>
            </div>

            <div class="mq-patient-card__badges">
              <div class="mq-sticker ${stickerClass}">
                ${escapeHtml(emotion.toUpperCase())}
              </div>
              <div class="mq-risk-badge ${riskClass}">
                ${escapeHtml(risk.toUpperCase())}
              </div>
            </div>
          </div>

          <div class="mq-patient-card__grid">
            <div class="mq-patient-mini">
              <span class="mq-patient-mini__label">Риск</span>
              <span class="mq-patient-mini__value">${escapeHtml(risk.toUpperCase())}</span>
            </div>
            <div class="mq-patient-mini">
              <span class="mq-patient-mini__label">Сегодня</span>
              <span class="mq-patient-mini__value">${actionsToday}</span>
            </div>
            <div class="mq-patient-mini">
              <span class="mq-patient-mini__label">Стадия</span>
              <span class="mq-patient-mini__value">${item.pet?.evolution_stage ?? 1}</span>
            </div>
          </div>
        </article>
      `;
    }).join('')}
  `;
}

async function handleCreateInvite() {
  const btn = document.getElementById('createInviteBtn');
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = 'Создаём...';

  try {
    const { data, error } = await appState.supabase.rpc('create_doctor_invite', {
      p_expires_in_days: 7
    });

    if (error) throw error;

    const inviteCode = data?.invite_code || data?.[0]?.invite_code;
    if (!inviteCode) {
      throw new Error('Не удалось получить invite-код');
    }

    document.getElementById('doctorInviteCode').textContent = inviteCode;
    document.getElementById('inviteResultPanel')?.classList.remove('hidden');

    showToast('Код приглашения создан', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Не удалось создать invite-код', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Пригласить пациента';
  }
}

async function handleCopyInvite() {
  const codeEl = document.getElementById('doctorInviteCode');
  if (!codeEl) return;

  try {
    await navigator.clipboard.writeText(codeEl.textContent.trim());
    showToast('Код скопирован', 'success');
  } catch (error) {
    console.error(error);
    showToast('Не удалось скопировать код', 'error');
  }
}

function getRiskClass(risk) {
  switch (String(risk).trim().toLowerCase()) {
    case 'red':
      return 'mq-risk-badge--red';
    case 'yellow':
      return 'mq-risk-badge--yellow';
    case 'green':
    default:
      return 'mq-risk-badge--green';
  }
}

function bindDoctorAnalytics(patients) {
  const select = document.getElementById('doctorPatientSelect');
  if (!select) return;

  if (!patients.length) {
    select.innerHTML = `<option value="">Нет пациентов</option>`;
    destroyDoctorCharts();
    return;
  }

  select.innerHTML = `
    <option value="">Выбери пациента</option>
    ${patients.map((item) => `
      <option value="${item.patient_id}">
        ${escapeHtml(item.profile?.full_name || 'Пациент')}
      </option>
    `).join('')}
  `;

  select.addEventListener('change', async () => {
    const patientId = select.value;
    if (!patientId) {
      destroyDoctorCharts();
      return;
    }

    const metrics = await fetchPatientMetrics14Days(patientId);
    renderDoctorCharts(metrics);
  });

  if (patients[0]?.patient_id) {
    select.value = patients[0].patient_id;
    select.dispatchEvent(new Event('change'));
  }
}

async function fetchPatientMetrics14Days(patientId) {
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await appState.supabase
    .from('daily_patient_metrics')
    .select('date, total_actions, risk_level')
    .eq('patient_id', patientId)
    .gte('date', since)
    .order('date', { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }

  return fillMetricGapsLast14Days(data || []);
}

function fillMetricGapsLast14Days(metrics) {
  const byDate = new Map(metrics.map(item => [item.date, item]));
  const result = [];

  for (let i = 13; i >= 0; i--) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = date.toISOString().slice(0, 10);
    const row = byDate.get(key);

    result.push({
      date: key,
      total_actions: row?.total_actions ?? 0,
      risk_level: row?.risk_level ?? 'green'
    });
  }

  return result;
}

function renderDoctorCharts(metrics) {
  const actionsCanvas = document.getElementById('doctorActionsChart');
  const riskCanvas = document.getElementById('doctorRiskChart');
  if (!actionsCanvas || !riskCanvas || !window.Chart) return;

  destroyDoctorCharts();

  const labels = metrics.map(item => item.date.slice(5));
  const actionsData = metrics.map(item => item.total_actions ?? 0);
  const riskData = metrics.map(item => riskToNumber(item.risk_level));
  const riskColors = metrics.map(item => riskToColor(item.risk_level));

  appState.doctorCharts.actions = new Chart(actionsCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Actions',
          data: actionsData,
          tension: 0.35,
          fill: false,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0 }
        }
      }
    }
  });

  appState.doctorCharts.risk = new Chart(riskCanvas, {
  type: 'bar',
  data: {
    labels,
    datasets: [
      {
        label: 'Risk',
        data: riskData,
        backgroundColor: riskColors,
        borderColor: riskColors,
        borderWidth: 2,
        borderRadius: 10,
        barThickness: 22
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(context) {
            const val = context.raw;
            return val === 3 ? 'КРАСНЫЙ' : val === 2 ? 'ЖЕЛТЫЙ' : 'ЗЕЛЕНЫЙ';
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#6d655d' }
      },
      y: {
        min: 0.5,
        max: 3.5,
        ticks: {
          stepSize: 1,
          color: '#6d655d',
          callback(value) {
            if (value === 1) return 'GREEN';
            if (value === 2) return 'YELLOW';
            if (value === 3) return 'RED';
            return '';
          }
        },
        grid: {
          color(context) {
            const value = context.tick.value;
            if (value === 1) return 'rgba(120, 180, 60, 0.35)';
            if (value === 2) return 'rgba(255, 217, 94, 0.35)';
            if (value === 3) return 'rgba(255, 108, 87, 0.35)';
            return 'rgba(0,0,0,0.06)';
          }
        }
      }
    }
  },
  plugins: [
    {
      id: 'riskLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);
        const values = chart.data.datasets[0].data;

        ctx.save();
        ctx.font = '700 11px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        values.forEach((value, index) => {
          const point = meta.data[index];
          if (!point) return;

          const label = value === 3 ? 'R' : value === 2 ? 'Y' : 'G';
          ctx.fillStyle = value === 3 ? '#b63a2a' : value === 2 ? '#8a6700' : '#3c6b16';
          ctx.fillText(label, point.x, point.y - 6);
        });

        ctx.restore();
      }
    }
  ]
});
}

function destroyDoctorCharts() {
  if (appState.doctorCharts.actions) {
    appState.doctorCharts.actions.destroy();
    appState.doctorCharts.actions = null;
  }

  if (appState.doctorCharts.risk) {
    appState.doctorCharts.risk.destroy();
    appState.doctorCharts.risk = null;
  }
}

function riskToNumber(risk) {
  switch (String(risk).toLowerCase()) {
    case 'red':
      return 3;
    case 'yellow':
      return 2;
    case 'green':
    default:
      return 1;
  }
}

function riskToColor(risk) {
  switch (String(risk).toLowerCase()) {
    case 'red':
      return '#ff8a7a';
    case 'yellow':
      return '#ffe27a';
    case 'green':
    default:
      return '#c9f36a';
  }
}

function inferRiskFromEmotion(emotion) {
  switch (String(emotion || '').trim().toLowerCase()) {
    case 'angry':
      return 'red';
    case 'tense':
      return 'yellow';
    case 'happy':
    case 'sad':
    default:
      return 'green';
  }
}

async function getEvolutionProgress(petId) {
  const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await appState.supabase
    .from('patient_actions')
    .select('action_category_snapshot, created_at')
    .eq('pet_id', petId)
    .gte('created_at', since);

  if (error) {
    console.error(error);
    return {
      totalActions: 0,
      carePlayPercent: 0,
      aggressionPercent: 0,
      actionsOk: false,
      carePlayOk: false,
      aggressionOk: true,
      progressPercent: 0
    };
  }

  const actions = data || [];
  const totalActions = actions.length;

  if (!totalActions) {
    return {
      totalActions: 0,
      carePlayPercent: 0,
      aggressionPercent: 0,
      actionsOk: false,
      carePlayOk: false,
      aggressionOk: true,
      progressPercent: 0
    };
  }

  const carePlayCount = actions.filter(
    item => item.action_category_snapshot === 'care' || item.action_category_snapshot === 'play'
  ).length;

  const aggressiveCount = actions.filter(
    item => item.action_category_snapshot === 'aggressive'
  ).length;

  const carePlayPercent = Math.round((carePlayCount / totalActions) * 100);
  const aggressionPercent = Math.round((aggressiveCount / totalActions) * 100);

  const actionsOk = totalActions >= 200;
  const carePlayOk = carePlayPercent >= 60;
  const aggressionOk = aggressionPercent <= 15;

  const actionsProgress = Math.min(100, Math.round((totalActions / 200) * 100));
  const carePlayProgress = Math.min(100, Math.round((carePlayPercent / 60) * 100));
  const aggressionProgress = aggressionPercent <= 15
    ? 100
    : Math.max(0, 100 - Math.round(((aggressionPercent - 15) / 35) * 100));

  const progressPercent = Math.round((actionsProgress + carePlayProgress + aggressionProgress) / 3);

  return {
    totalActions,
    carePlayPercent,
    aggressionPercent,
    actionsOk,
    carePlayOk,
    aggressionOk,
    progressPercent
  };
}

async function evaluatePetEvolution(pet) {
  if ((pet.evolution_stage || 1) >= 2) {
    return { evolved: false };
  }

  const progress = await getEvolutionProgress(pet.id);
  const canEvolve =
    progress.totalActions >= 200 &&
    progress.carePlayPercent >= 60 &&
    progress.aggressionPercent <= 15;

  if (!canEvolve) {
    return { evolved: false, progress };
  }

  const { error } = await appState.supabase
    .from('patient_pets')
    .update({
      evolution_stage: 2
    })
    .eq('id', pet.id);

  if (error) {
    console.error(error);
    return { evolved: false, progress };
  }

  return { evolved: true, progress };
}

function showEvolutionPopup() {
  const popup = document.createElement('div');
  popup.className = 'mq-evolution-popup';
  popup.innerHTML = `
    <div class="mq-evolution-popup__burst">✨</div>
    <div class="mq-evolution-popup__card">
      <div class="mq-evolution-popup__title">Эволюция!</div>
      <div class="mq-evolution-popup__text">Питомец вырос до stage 2</div>
    </div>
  `;

  document.body.appendChild(popup);

  setTimeout(() => {
    popup.classList.add('is-leaving');
  }, 700);

  setTimeout(() => popup.remove(), 1100);
}

async function forceDemoEvolution(petId) {
  const { error } = await appState.supabase
    .from('patient_pets')
    .update({
      evolution_stage: 2
    })
    .eq('id', petId);

  if (error) throw error;
}

function playEvolutionTransition(nextStage) {
  const magicLayer = document.getElementById('evolutionMagicLayer');
  const petWrap = document.getElementById('patientPetWrap');

  if (!magicLayer || !petWrap) return;

  // ВСТАВЛЯЕМ ЖЕСТКИЙ OVERLAY
  magicLayer.innerHTML = `
    <div class="mq-evo-overlay ${nextStage === 2 ? 'is-evolve' : 'is-devolve'}"></div>
    <div class="mq-evo-ring"></div>
  `;

  // перезапуск анимации питомца
  petWrap.classList.remove('is-evolving-pet', 'is-devolving-pet');
  void petWrap.offsetWidth;

  if (nextStage === 2) {
    petWrap.classList.add('is-evolving-pet');
  } else {
    petWrap.classList.add('is-devolving-pet');
  }

  setTimeout(() => {
    magicLayer.innerHTML = '';
    petWrap.classList.remove('is-evolving-pet', 'is-devolving-pet');
  }, 900);
}

let isAppResuming = false;

async function handleAppResume() {
  if (document.visibilityState && document.visibilityState !== 'visible') {
    return;
  }

  if (isAppResuming) return;
  isAppResuming = true;

  try {
    cleanupTransientUi();

    const { data: { session } } = await appState.supabase.auth.getSession();
    appState.session = session || null;

    if (!appState.session) {
      await routeApp();
      return;
    }

    if (appState.profile?.role === 'patient') {
      await refreshPatientHome();
      return;
    }

    if (appState.profile?.role === 'doctor') {
      await renderDoctorDashboard();
      return;
    }

    await routeApp();
  } catch (error) {
    console.error('handleAppResume error:', error);
  } finally {
    isAppResuming = false;
  }
}

function cleanupTransientUi() {
  document.querySelectorAll('.mq-evolution-popup').forEach(el => el.remove());
  document.querySelectorAll('.mq-pet-bubble').forEach(el => el.remove());
  document.querySelectorAll('.mq-evo-demo-overlay').forEach(el => el.remove());

  const magicLayer = document.getElementById('evolutionMagicLayer');
  if (magicLayer) {
    magicLayer.innerHTML = '';
  }

  document.querySelectorAll('button[disabled]').forEach((btn) => {
    btn.disabled = false;
  });

  document.querySelectorAll(
    '.is-evolving, .is-devolving, .is-shaking, .is-sleepy, .is-walking, .is-sparkling, .is-loving, .is-hit, .is-soft-bounce, .is-bounce-big, .is-evolving-pet, .is-devolving-pet'
  ).forEach((el) => {
    el.classList.remove(
      'is-evolving',
      'is-devolving',
      'is-shaking',
      'is-sleepy',
      'is-walking',
      'is-sparkling',
      'is-loving',
      'is-hit',
      'is-soft-bounce',
      'is-bounce-big',
      'is-evolving-pet',
      'is-devolving-pet'
    );
  });
}

async function refreshPatientHome() {
  const pet = await fetchMyPet();
  if (!pet) {
    await routeApp();
    return;
  }

  await renderPatientHomeScreen(pet);
}