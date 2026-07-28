// ============================================
// 앱 전역 상태 관리
// ============================================

// API 엔드포인트 자동 설정
// 로컬: http://127.0.0.1:5000, 원격: 현재 접속 프로토콜 그대로 사용 (http/https 자동 일치)
const API_BASE_URL = window.location.protocol === 'file:'
    ? 'http://127.0.0.1:5000'
    : window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:5000`
    : `${window.location.protocol}//${window.location.hostname}`;

const appState = {
    user: null,
    events: [],
    bulletins: [],
    schedules: [],
    scheduleMembers: [],
    scheduleMemberInfo: {},
    activeScheduleMember: '전체',
    todos: [],
    shopping: [],
    weatherLocation: '',
    holidaysByYear: {},
    currentFilter: 'all'
};

// 페이지 최초 접근 시 데이터 로드
// 서버 우선 → 실패 시 localStorage 폴백
async function loadLocalData() {
    const ok = await fetchAndUpdateFromServer();

    if (ok) {
        // 서버 로드 성공: 구 localStorage 잔여 데이터 제거
        localStorage.removeItem('familyHubData');
    } else {
        // 서버 접근 불가 → localStorage 폴백
        const saved = localStorage.getItem('familyHubData');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                appState.events    = data.events    || [];
                appState.bulletins = data.bulletins || [];
                appState.schedules = data.schedules || [];
                appState.scheduleMembers      = data.scheduleMembers      || [];
                appState.scheduleMemberInfo   = data.scheduleMemberInfo   || {};
                appState.activeScheduleMember = data.activeScheduleMember || '전체';
                appState.todos    = data.todos    || [];
                appState.shopping = data.shopping || [];
                removeLegacyAuthors();
                removeLegacyHolidayEvents();
            } catch (e) {
                console.log('localStorage 파싱 오류:', e);
            }
        }
    }

    await fetchKoreanHolidays(new Date().getFullYear());
}

function removeLegacyAuthors() {
    appState.bulletins = appState.bulletins.map(({ createdBy, ...rest }) => rest);
    appState.schedules = appState.schedules.map(({ createdBy, ...rest }) => rest);
    appState.todos = appState.todos.map(({ createdBy, ...rest }) => rest);
    appState.shopping = appState.shopping.map(({ createdBy, ...rest }) => rest);
}

// LocalStorage에 데이터 저장
async function saveLocalData() {
    const data = {
        events: appState.events,
        bulletins: appState.bulletins,
        schedules: appState.schedules,
        scheduleMembers: appState.scheduleMembers,
        scheduleMemberInfo: appState.scheduleMemberInfo,
        activeScheduleMember: appState.activeScheduleMember,
        todos: appState.todos,
        shopping: appState.shopping,
        weatherLocation: appState.weatherLocation
    };
    
    try {
        await fetch(`${API_BASE_URL}/api/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        // 서버가 없으면 localStorage에 저장
        localStorage.setItem('familyHubData', JSON.stringify(data));
    }
    renderDashboard();
}

// 한국 공휴일 추가


// 서버에서 최신 데이터를 받아 appState를 갱신한다.
// 페이지 접근(초기 로드) 및 탭 전환 시에만 호출된다.
async function fetchAndUpdateFromServer() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/data`);
        if (!response.ok) return false;
        const data = await response.json();
        appState.events    = data.events    || [];
        appState.bulletins = data.bulletins || [];
        appState.schedules = data.schedules || [];
        appState.scheduleMembers      = data.scheduleMembers      || [];
        appState.scheduleMemberInfo   = data.scheduleMemberInfo   || {};
        appState.activeScheduleMember = data.activeScheduleMember || appState.activeScheduleMember || '전체';
        appState.todos    = data.todos    || [];
        appState.shopping = data.shopping || [];
        appState.weatherLocation = data.weatherLocation || '';
        removeLegacyAuthors();
        return true;
    } catch (e) {
        console.log('서버 데이터 조회 실패 (오프라인 모드):', e);
        return false;
    }
}

// ============================================
// 인증 없이 바로 사용합니다.
// ============================================

// ============================================
// 탭 관리
// ============================================
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageIntro = document.querySelector('.page-intro');

    tabButtons.forEach(button => {
        button.addEventListener('click', async () => {
            try {
                const tabName = button.getAttribute('data-tab');

                // 모든 탭 비활성화
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // 선택된 탭 활성화
                button.classList.add('active');
                document.getElementById(tabName).classList.add('active');
                pageIntro?.classList.toggle('is-hidden', tabName !== 'dashboard');

                // 탭 전환 시 서버에서 최신 데이터 로드 후 렌더링
                await fetchAndUpdateFromServer();

                switch(tabName) {
                    case 'dashboard':
                        renderDashboard();
                        break;
                    case 'calendar':
                        renderEventsOnCalendar();
                        renderEvents();
                        break;
                    case 'bulletin':
                        renderBulletins();
                        break;
                    case 'schedule':
                        renderScheduleMemberTabs();
                        renderSchedules();
                        renderMemberInfo();
                        break;
                    case 'todos':
                        renderTodos();
                        break;
                    case 'shopping':
                        renderShopping();
                        break;
                    case 'weather':
                        initWeather();
                        break;
                }
            } catch (error) {
                console.error('Tab error:', error);
            }
        });
    });
}

// ============================================
// 스와이프 탭 전환 (모바일)
// ============================================
function initSwipe() {
    const tabOrder = ['dashboard', 'calendar', 'bulletin', 'schedule', 'todos', 'shopping', 'weather'];
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const container = document.querySelector('.main-content') || document.body;

    container.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const elapsed = Date.now() - touchStartTime;

        // 수평 스와이프 조건: 50px 이상, 수직보다 수평이 더 크고, 500ms 이내
        if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5 || elapsed > 500) return;

        const activeId = document.querySelector('.tab-content.active')?.id;
        const currentIndex = tabOrder.indexOf(activeId);
        if (currentIndex === -1) return;

        const nextIndex = deltaX < 0
            ? Math.min(currentIndex + 1, tabOrder.length - 1)
            : Math.max(currentIndex - 1, 0);

        if (nextIndex === currentIndex) return;

        const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabOrder[nextIndex]}"]`);
        if (targetBtn) {
            targetBtn.click();
            targetBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, { passive: true });
}

// ============================================
// 모달 관리
// ============================================
function portalModalsToBody() {
    document.querySelectorAll('.modal').forEach(modal => {
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
    });
}

function setupModals() {
    setupEventModals();

    // 공지 모달
    setupModal('bulletinModal', 'addBulletinBtn', 'bulletinForm', handleAddBulletin);

    // 시간표 모달
    setupScheduleModal();
    
    // 할일 모달
    setupModal('todoModal', 'addTodoBtn', 'todoForm', handleAddTodo);

    setupModal('shoppingModal', 'addShoppingBtn', 'shoppingForm', handleAddShopping);
}

function toLocalDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

let editingEventId = null;

function setupEventModals() {
    const modal = document.getElementById('eventModal');
    const form = document.getElementById('eventForm');
    const addButton = document.getElementById('addEventBtn');
    const addForDateButton = document.getElementById('addEventForDateBtn');
    const cancelButton = document.getElementById('cancelEventBtn');
    const closeButton = modal.querySelector('.close');
    const allDayCheckbox = document.getElementById('eventAllDay');
    const timeInputs = document.getElementById('timeInputs');
    const recurrenceSelect = document.getElementById('eventRecurrence');
    const recurrenceEnd = document.getElementById('eventRecurrenceEnd');

    allDayCheckbox.addEventListener('change', () => {
        timeInputs.classList.toggle('is-hidden', allDayCheckbox.checked);
    });
    recurrenceSelect.addEventListener('change', () => {
        recurrenceEnd.disabled = recurrenceSelect.value === 'none';
        if (recurrenceEnd.disabled) recurrenceEnd.value = '';
    });

    const eventStartDate = document.getElementById('eventStartDate');
    const eventEndDate = document.getElementById('eventEndDate');
    eventStartDate.addEventListener('change', () => {
        if (!eventEndDate.value || eventEndDate.value < eventStartDate.value) {
            eventEndDate.value = eventStartDate.value;
        }
    });

    addButton.addEventListener('click', () => openEventForm(toLocalDateString(new Date())));
    addForDateButton.addEventListener('click', () => {
        const selectedDate = addForDateButton.dataset.date || toLocalDateString(new Date());
        document.getElementById('eventViewModal').classList.remove('show');
        openEventForm(selectedDate);
    });

    const closeEditor = () => modal.classList.remove('show');
    closeButton.addEventListener('click', closeEditor);
    cancelButton.addEventListener('click', closeEditor);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeEditor();
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (handleAddEvent()) {
            closeEditor();
            form.reset();
            timeInputs.classList.remove('is-hidden');
            editingEventId = null;
        }
    });
}

function openEventForm(dateString, event = null) {
    const form = document.getElementById('eventForm');
    const modal = document.getElementById('eventModal');
    const timeInputs = document.getElementById('timeInputs');
    form.reset();
    editingEventId = event?.id ?? null;

    document.getElementById('eventFormTitle').textContent = event ? '일정 수정' : '새 일정';
    document.getElementById('eventSubmitBtn').textContent = event ? '수정 저장' : '일정 저장';
    document.getElementById('eventTitle').value = event?.title || '';
    document.getElementById('eventStartDate').value = event?.startDate || event?.date || dateString;
    document.getElementById('eventEndDate').value = event?.endDate || event?.startDate || event?.date || dateString;
    document.getElementById('eventStartTime').value = event?.startTime || event?.time || '';
    document.getElementById('eventEndTime').value = event?.endTime || '';
    document.getElementById('eventDesc').value = event?.desc || '';
    document.getElementById('eventFamily').value = event?.family || '전체';
    document.getElementById('eventRecurrence').value = event?.recurrence || 'none';
    document.getElementById('eventRecurrenceEnd').value = event?.recurrenceEnd || '';
    document.getElementById('eventRecurrenceEnd').disabled = (event?.recurrence || 'none') === 'none';
    document.getElementById('eventReminder').value = event?.reminder ?? 'none';
    document.getElementById('eventAllDay').checked = Boolean(event?.allDay);
    timeInputs.classList.toggle('is-hidden', Boolean(event?.allDay));
    modal.classList.add('show');
    requestAnimationFrame(() => document.getElementById('eventTitle').focus());
}

function setupModal(modalId, btnId, formId, submitHandler) {
    const modal = document.getElementById(modalId);
    const btn = document.getElementById(btnId);
    const form = document.getElementById(formId);
    const closeBtn = modal?.querySelector('.close');

    if (!modal || !btn || !form || !closeBtn) {
        console.warn('setupModal 요소 없음:', { modalId, btnId, formId, modal: !!modal, btn: !!btn, form: !!form, closeBtn: !!closeBtn });
        return;
    }

    btn.addEventListener('click', () => {
        modal.classList.add('show');
        form.reset();
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitHandler();
        modal.classList.remove('show');
        form.reset();
    });
}

// ============================================
// 캘린더 기능
// ============================================
let currentDate = new Date();

function initCalendar() {
    updateCalendarView();
    document.getElementById('prevMonth').addEventListener('click', prevMonth);
    document.getElementById('nextMonth').addEventListener('click', nextMonth);
    renderEvents();
}

function prevMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    updateCalendarView();
    renderEvents(); // 월 변경 시 일정 리스트도 업데이트
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    updateCalendarView();
    renderEvents(); // 월 변경 시 일정 리스트도 업데이트
}

function updateCalendarView() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('currentMonth').textContent = 
        `${year}년 ${month + 1}월`;
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevLastDay = new Date(year, month, 0);
    
    const firstDayOfWeek = firstDay.getDay();
    const lastDate = lastDay.getDate();
    const prevLastDate = prevLastDay.getDate();
    
    const calendarGrid = document.getElementById('calendarGrid');
    calendarGrid.innerHTML = '';
    
    // 이전 달의 일자
    for (let i = prevLastDate - firstDayOfWeek + 1; i <= prevLastDate; i++) {
        const dayDiv = createCalendarDay(i, true, year, month - 1);
        calendarGrid.appendChild(dayDiv);
    }
    
    // 현재 달의 일자
    for (let i = 1; i <= lastDate; i++) {
        const dayDiv = createCalendarDay(i, false, year, month);
        calendarGrid.appendChild(dayDiv);
    }
    
    // 다음 달의 일자
    for (let i = 1; i <= (42 - lastDate - firstDayOfWeek); i++) {
        const dayDiv = createCalendarDay(i, true, year, month + 1);
        calendarGrid.appendChild(dayDiv);
    }
    
    // 일정 표시 업데이트
    renderEventsOnCalendar();
    fetchKoreanHolidays(year).then(() => {
        renderEventsOnCalendar();
    });
}

function createCalendarDay(date, isOtherMonth, year, month) {
    const dayDiv = document.createElement('div');
    dayDiv.className = 'calendar-day';
    const normalizedDate = new Date(year, month, date);
    const dayNumber = document.createElement('span');
    dayNumber.className = 'calendar-day-number';
    dayNumber.textContent = date;
    dayDiv.appendChild(dayNumber);
    dayDiv.dataset.date = toLocalDateString(normalizedDate);
    
    if (isOtherMonth) {
        dayDiv.classList.add('other-month');
    }
    
    const today = new Date();
    if (!isOtherMonth && 
        date === today.getDate() && 
        year === today.getFullYear() && 
        month === today.getMonth()) {
        dayDiv.classList.add('today');
    }
    
    // 이벤트가 있는 날짜 표시
    const eventsOnDay = getEventsOnDate(year, month, date);
    if (eventsOnDay.length > 0) {
        const hasHoliday = eventsOnDay.some(e => e.isHoliday);
        const normalEvents = eventsOnDay.filter(e => !e.isHoliday);
        if (hasHoliday) {
            dayDiv.classList.add('holiday');
        } else {
            dayDiv.classList.add('has-events');
        }
        renderCalendarEventTitles(dayDiv, eventsOnDay);
    }
    
    const quickAdd = document.createElement('span');
    quickAdd.className = 'calendar-quick-add';
    quickAdd.textContent = '+';
    dayDiv.appendChild(quickAdd);

    dayDiv.addEventListener('click', () => {
        showEventViewModal(
            normalizedDate.getFullYear(),
            normalizedDate.getMonth(),
            normalizedDate.getDate()
        );
    });
    
    return dayDiv;
}

let editingScheduleId = null;

function setupScheduleModal() {
    const modal = document.getElementById('scheduleModal');
    const form = document.getElementById('scheduleForm');
    const addButton = document.getElementById('addScheduleBtn');
    const closeButton = modal?.querySelector('.close');

    if (!modal || !form || !addButton || !closeButton) return;

    addButton.addEventListener('click', () => openScheduleForm());
    closeButton.addEventListener('click', () => modal.classList.remove('show'));
    modal.addEventListener('click', event => {
        if (event.target === modal) modal.classList.remove('show');
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (handleAddSchedule()) {
            modal.classList.remove('show');
            form.reset();
            editingScheduleId = null;
        }
    });
}

function openScheduleForm(schedule = null) {
    const modal = document.getElementById('scheduleModal');
    const form = document.getElementById('scheduleForm');
    form.reset();
    editingScheduleId = schedule?.id ?? null;

    document.getElementById('scheduleFormTitle').textContent = schedule ? '시간표 수정' : '시간표 추가';
    document.getElementById('scheduleSubmitBtn').textContent = schedule ? '수정 저장' : '저장';

    if (schedule) {
        document.getElementById('scheduleDay').value = schedule.day;
        document.getElementById('scheduleStartTime').value = schedule.startTime;
        document.getElementById('scheduleEndTime').value = schedule.endTime;
        document.getElementById('scheduleActivity').value = schedule.activity;
    }

    modal.classList.add('show');
    document.getElementById('scheduleActivity').focus();
}

function renderCalendarEventTitles(day, events) {
    const existingList = day.querySelector('.calendar-event-list');
    if (existingList) {
        existingList.remove();
    }

    if (!events.length) {
        return;
    }

    const visibleEvents = events.slice(0, 2);
    const eventList = document.createElement('div');
    eventList.className = 'calendar-event-list';

    visibleEvents.forEach(event => {
        const eventTitle = document.createElement('span');
        eventTitle.className = `calendar-event-title${event.isHoliday ? ' is-holiday' : ''}`;
        eventTitle.textContent = event.title;
        eventTitle.title = event.title;
        eventList.appendChild(eventTitle);
    });

    if (events.length > visibleEvents.length) {
        const moreEvents = document.createElement('span');
        moreEvents.className = 'calendar-event-more';
        moreEvents.textContent = `+${events.length - visibleEvents.length}개`;
        eventList.appendChild(moreEvents);
    }

    day.appendChild(eventList);
}

function parseLocalDate(value) {
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
}

function daysBetween(start, end) {
    return Math.round((end - start) / 86400000);
}

function eventOccursOnDate(event, targetDate) {
    const startValue = event.startDate || event.date;
    if (!startValue) return false;

    const baseStart = parseLocalDate(startValue);
    const baseEnd = parseLocalDate(event.endDate || startValue);
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const duration = Math.max(0, daysBetween(baseStart, baseEnd));
    const recurrence = event.recurrence || 'none';

    if (recurrence === 'none') {
        return target >= baseStart && target <= baseEnd;
    }
    if (target < baseStart) return false;
    if (event.recurrenceEnd && target > parseLocalDate(event.recurrenceEnd)) return false;

    if (recurrence === 'daily') return true;

    if (recurrence === 'weekly') {
        const offset = daysBetween(baseStart, target);
        return offset % 7 <= duration;
    }

    if (recurrence === 'monthly') {
        const occurrenceStart = new Date(
            target.getFullYear(),
            target.getMonth(),
            Math.min(baseStart.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate())
        );
        const occurrenceEnd = new Date(occurrenceStart);
        occurrenceEnd.setDate(occurrenceEnd.getDate() + duration);
        return target >= occurrenceStart && target <= occurrenceEnd;
    }

    if (recurrence === 'yearly') {
        const occurrenceStart = new Date(
            target.getFullYear(),
            baseStart.getMonth(),
            Math.min(baseStart.getDate(), new Date(target.getFullYear(), baseStart.getMonth() + 1, 0).getDate())
        );
        const occurrenceEnd = new Date(occurrenceStart);
        occurrenceEnd.setDate(occurrenceEnd.getDate() + duration);
        return target >= occurrenceStart && target <= occurrenceEnd;
    }

    return false;
}

function isEventOccurrenceStart(event, targetDate) {
    const startValue = event.startDate || event.date;
    if (!startValue) return false;
    const baseStart = parseLocalDate(startValue);
    const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const recurrence = event.recurrence || 'none';

    if (target < baseStart) return false;
    if (event.recurrenceEnd && target > parseLocalDate(event.recurrenceEnd)) return false;
    if (recurrence === 'none') return toLocalDateString(target) === toLocalDateString(baseStart);
    if (recurrence === 'daily') return true;
    if (recurrence === 'weekly') return daysBetween(baseStart, target) % 7 === 0;
    if (recurrence === 'monthly') {
        const startDay = Math.min(baseStart.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate());
        return target.getDate() === startDay;
    }
    if (recurrence === 'yearly') {
        const startDay = Math.min(baseStart.getDate(), new Date(target.getFullYear(), baseStart.getMonth() + 1, 0).getDate());
        return target.getMonth() === baseStart.getMonth() && target.getDate() === startDay;
    }
    return false;
}

function getEventOccurrencesForMonth(year, month) {
    const occurrences = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    appState.events.filter(event => !event.isHoliday).forEach(event => {
        for (let day = 1; day <= daysInMonth; day += 1) {
            const occurrenceStart = new Date(year, month, day);
            if (!isEventOccurrenceStart(event, occurrenceStart)) continue;
            const baseStart = parseLocalDate(event.startDate || event.date);
            const baseEnd = parseLocalDate(event.endDate || event.startDate || event.date);
            const occurrenceEnd = new Date(occurrenceStart);
            occurrenceEnd.setDate(occurrenceEnd.getDate() + Math.max(0, daysBetween(baseStart, baseEnd)));
            occurrences.push({
                ...event,
                startDate: toLocalDateString(occurrenceStart),
                endDate: toLocalDateString(occurrenceEnd),
                occurrenceOf: event.id
            });
        }
    });

    return occurrences;
}

function getEventsOnDate(year, month, date) {
    // ISO 형식의 날짜 문자열로 비교 (시간대 문제 회피)
    const pad = (n) => String(n).padStart(2, '0');
    const targetDateStr = `${year}-${pad(month + 1)}-${pad(date)}`;
    const holidays = appState.holidaysByYear[year] || [];

    const eventMatches = appState.events
        .filter(event => !event.isHoliday)
        .filter(event => eventOccursOnDate(event, new Date(year, month, date)));
    const holidayMatches = holidays.filter(event => {
        const startDateStr = event.startDate.slice(0, 10);
        const endDateStr = event.endDate.slice(0, 10);
        return targetDateStr >= startDateStr && targetDateStr <= endDateStr;
    });
    return [...eventMatches, ...holidayMatches];
}

function renderEventsOnCalendar() {
    // 캘린더의 모든 날짜에 이벤트 표시 업데이트
    const calendarDays = document.querySelectorAll('.calendar-day');
    calendarDays.forEach(day => {
        // 기존 이벤트 표시 제거
        const existingList = day.querySelector('.calendar-event-list');
        if (existingList) {
            existingList.remove();
        }
        day.classList.remove('has-events');
        day.classList.remove('holiday');
        
        // 날짜 정보 추출
        const date = parseInt(day.querySelector('.calendar-day-number')?.textContent, 10);
        
        if (!day.classList.contains('other-month')) {
            const eventsOnDay = getEventsOnDate(currentDate.getFullYear(), currentDate.getMonth(), date);
            const hasHoliday = eventsOnDay.some(e => e.isHoliday);
            const normalEvents = eventsOnDay.filter(e => !e.isHoliday);
            if (hasHoliday) {
                day.classList.add('holiday');
            } else {
                day.classList.remove('holiday');
            }
            if (normalEvents.length > 0) {
                day.classList.add('has-events');
            } else {
                day.classList.remove('has-events');
            }
            renderCalendarEventTitles(day, eventsOnDay);
        }
    });
}

function handleAddEvent() {
    const title = document.getElementById('eventTitle').value;
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value || startDate;
    const allDay = document.getElementById('eventAllDay').checked;
    const startTime = allDay ? '' : document.getElementById('eventStartTime').value;
    const endTime = allDay ? '' : document.getElementById('eventEndTime').value;
    const desc = document.getElementById('eventDesc').value;
    const family = document.getElementById('eventFamily')?.value;
    const recurrence = document.getElementById('eventRecurrence').value;
    const recurrenceEnd = document.getElementById('eventRecurrenceEnd').value;
    const reminder = document.getElementById('eventReminder').value;

    const values = {
        title,
        startDate,
        endDate: endDate || startDate,
        allDay,
        startTime,
        endTime,
        desc,
        family: family || '전체',
        recurrence,
        recurrenceEnd,
        reminder
    };

    if (editingEventId !== null) {
        const event = appState.events.find(item => item.id == editingEventId);
        if (!event) return false;
        Object.assign(event, values);
    } else {
        appState.events.push({
            id: Date.now(),
            ...values,
            createdAt: new Date().toISOString()
        });
    }
    saveLocalData();
    renderEvents();
    renderEventsOnCalendar(); // 캘린더에도 표시
    return true;
}

async function fetchKoreanHolidays(year) {
    if (appState.holidaysByYear[year]) {
        return appState.holidaysByYear[year];
    }
    try {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`);
        if (!response.ok) {
            throw new Error(`Holiday API error ${response.status}`);
        }
        const data = await response.json();
        const holidays = data.map(item => ({
            id: `holiday-${year}-${item.date}`,
            title: item.localName || item.name,
            startDate: item.date,
            endDate: item.date,
            allDay: true,
            startTime: '',
            endTime: '',
            desc: item.name || '공휴일',
            family: '전체',
            isHoliday: true,
            createdAt: new Date().toISOString()
        }));
        appState.holidaysByYear[year] = holidays;
        if (currentDate.getFullYear() === year) {
            renderEventsOnCalendar();
        }
        return holidays;
    } catch (e) {
        console.error('한국 공휴일 API 로드 실패:', e);
        return [];
    }
}

function removeLegacyHolidayEvents() {
    appState.events = appState.events.filter(event => !event.isHoliday);
}

function renderEvents() {
    const eventsList = document.getElementById('eventsList');
    eventsList.innerHTML = '';

    // 현재 조회 중인 달의 일정만 필터링
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    
    const filteredEvents = getEventOccurrencesForMonth(currentYear, currentMonth);

    const sortedEvents = filteredEvents.sort((a, b) => 
        new Date(a.startDate) - new Date(b.startDate)
    );

    if (sortedEvents.length === 0) {
        eventsList.innerHTML = '<div class="empty-state">등록된 일정이 없습니다.</div>';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    sortedEvents.forEach(event => {
        const eventDiv = document.createElement('div');
        const endDate = new Date(event.endDate || event.startDate || event.date);
        endDate.setHours(23, 59, 59, 999);
        const isPast = endDate < today;

        eventDiv.className = 'event-item event-agenda-item' + (isPast ? ' event-past' : '');

        const timeDisplay = event.allDay ? '종일' :
            (event.startTime && event.endTime ? `${event.startTime}~${event.endTime}` :
             (event.startTime || event.time || ''));
        const startDate = event.startDate || event.date;
        const start = new Date(`${startDate}T00:00:00`);
        const endDateValue = event.endDate || startDate;
        const dayBadge = document.createElement('div');
        dayBadge.className = 'event-day-badge';
        dayBadge.innerHTML = `
            <strong>${start.getDate()}</strong>
            <span>${start.toLocaleDateString('ko-KR', { weekday: 'short' })}</span>
        `;

        const content = document.createElement('div');
        content.className = 'event-agenda-content';
        const title = document.createElement('strong');
        title.className = 'event-item-title';
        title.textContent = event.title;
        const meta = document.createElement('div');
        meta.className = 'event-agenda-meta';
        const dateLabel = startDate === endDateValue
            ? timeDisplay
            : `${start.getMonth() + 1}.${start.getDate()}–${new Date(`${endDateValue}T00:00:00`).getMonth() + 1}.${new Date(`${endDateValue}T00:00:00`).getDate()} · ${timeDisplay}`;
        meta.textContent = dateLabel;
        content.append(title, meta);

        const family = document.createElement('span');
        family.className = 'event-family-chip';
        family.textContent = event.family || '전체';

        eventDiv.append(dayBadge, content, family);
        eventDiv.addEventListener('click', () => {
            showEventViewModal(start.getFullYear(), start.getMonth(), start.getDate());
        });
        eventsList.appendChild(eventDiv);
    });
}

function deleteEvent(id, viewContext) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const before = appState.events.length;
    // 숫자/문자열 ID 혼용(JSON·서버)에 맞춤
    appState.events = appState.events.filter(e => e.id != id);
    if (appState.events.length === before) return;
    saveLocalData();
    renderEvents();
    renderEventsOnCalendar();
    if (!viewContext) return;
    const { year, month, date } = viewContext;
    const modal = document.getElementById('eventViewModal');
    const remaining = getEventsOnDate(year, month, date);
    if (remaining.length === 0) {
        modal.classList.remove('show');
    } else {
        showEventViewModal(year, month, date);
    }
}

function showEventViewModal(year, month, date) {
    const eventsOnDay = getEventsOnDate(year, month, date);
    
    const modal = document.getElementById('eventViewModal');
    const dateHeader = document.getElementById('eventViewDate');
    const list = document.getElementById('eventViewList');
    const addButton = document.getElementById('addEventForDateBtn');
    
    const selectedDate = new Date(year, month, date);
    dateHeader.textContent = selectedDate.toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });
    addButton.dataset.date = toLocalDateString(selectedDate);
    list.innerHTML = '';

    if (eventsOnDay.length === 0) {
        list.innerHTML = `
            <div class="event-day-empty">
                <i class="fa-regular fa-calendar"></i>
                <strong>아직 일정이 없어요</strong>
                <span>새 일정을 바로 추가해보세요.</span>
            </div>
        `;
    }

    eventsOnDay.forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.className = 'event-card';
        const timeDisplay = event.allDay ? '종일' : 
            (event.startTime && event.endTime ? `${event.startTime} ~ ${event.endTime}` : 
             (event.startTime || event.time || '시간 미정'));
        const dateDisplay = (event.startDate || event.date) === (event.endDate || event.startDate || event.date) ? 
            (event.startDate || event.date) : `${event.startDate || event.date} ~ ${event.endDate || event.startDate || event.date}`;

        const titleEl = document.createElement('div');
        titleEl.className = 'event-title';
        titleEl.textContent = event.title;

        const metaEl = document.createElement('div');
        metaEl.className = 'event-date';
        metaEl.textContent = `${timeDisplay} · ${event.family || '전체'}`;

        eventDiv.appendChild(titleEl);
        eventDiv.appendChild(metaEl);

        if (event.desc) {
            const descEl = document.createElement('div');
            descEl.className = 'event-date';
            descEl.style.marginTop = '0.5rem';
            descEl.textContent = event.desc;
            eventDiv.appendChild(descEl);
        }

        // 공휴일은 API 캐시이므로 삭제 버튼 없음(인라인 onclick은 문자열 id에서 문법 오류가 남)
        if (!event.isHoliday) {
            const actions = document.createElement('div');
            actions.className = 'event-actions';
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-small btn-secondary';
            editBtn.type = 'button';
            editBtn.textContent = '수정';
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                modal.classList.remove('show');
                openEventForm(event.startDate || event.date, event);
            });
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-small btn-danger';
            delBtn.type = 'button';
            delBtn.textContent = '삭제';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteEvent(event.id, { year, month, date });
            });
            actions.append(editBtn, delBtn);
            eventDiv.appendChild(actions);
        }

        list.appendChild(eventDiv);
    });
    
    modal.classList.add('show');
    
    // 모달 닫기
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => modal.classList.remove('show');
    modal.onclick = (e) => {
        if (e.target === modal) modal.classList.remove('show');
    };
}

// ============================================
// 공지/메모 기능
// ============================================
function handleAddBulletin() {
    const title = document.getElementById('bulletinTitle').value;
    const content = document.getElementById('bulletinContent').value;

    const bulletin = {
        id: Date.now(),
        title,
        content,
        createdAt: new Date().toISOString()
    };

    appState.bulletins.unshift(bulletin);
    saveLocalData();
    renderBulletins();
}

function toggleBulletin(id) {
    const bulletinDiv = document.querySelector(`[onclick="toggleBulletin(${id})"]`).parentElement;
    const contentDiv = bulletinDiv.querySelector('.bulletin-content');
    const actionsDiv = bulletinDiv.querySelector('.bulletin-actions');
    const toggleIcon = bulletinDiv.querySelector('.bulletin-toggle');
    const isCollapsed = contentDiv.classList.contains('collapsed');
    contentDiv.classList.toggle('collapsed');
    actionsDiv.classList.toggle('collapsed');
    toggleIcon.textContent = isCollapsed ? '▲' : '▼';
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function formatCompactDate(value) {
    if (!value) return '날짜 없음';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '날짜 없음';
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function renderBulletins() {
    const bulletinList = document.getElementById('bulletinList');
    bulletinList.innerHTML = '';
    document.getElementById('memoSummaryCount').textContent = `${appState.bulletins.length}개의 메모`;

    if (appState.bulletins.length === 0) {
        bulletinList.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">작성된 메모가 없습니다.</div>';
        return;
    }

    appState.bulletins.forEach((bulletin, index) => {
        const bulletinDiv = document.createElement('div');
        bulletinDiv.className = 'bulletin-item';
        const preview = (bulletin.content || '')
            .replace(/[#*_>`\[\]()~-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 110);
        bulletinDiv.innerHTML = `
            <div class="bulletin-card-head">
                <span class="bulletin-index">MEMO ${String(index + 1).padStart(2, '0')}</span>
                <div class="bulletin-actions">
                    <button type="button" class="icon-action" aria-label="메모 수정" onclick="event.stopPropagation(); editBulletin(${bulletin.id})"><i class="fas fa-pen"></i></button>
                    <button type="button" class="icon-action is-danger" aria-label="메모 삭제" onclick="event.stopPropagation(); deleteBulletin(${bulletin.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <h3 class="bulletin-title">${escapeHtml(bulletin.title)}</h3>
            <p class="bulletin-preview">${escapeHtml(preview || '내용을 눌러 확인하세요.')}</p>
            <div class="bulletin-card-foot">
                <span><i class="fa-regular fa-clock"></i> ${formatCompactDate(bulletin.createdAt)}</span>
                <span class="bulletin-open">열기 <i class="fas fa-arrow-right"></i></span>
            </div>
        `;
        bulletinDiv.addEventListener('click', () => showBulletinViewModal(bulletin.id));
        bulletinList.appendChild(bulletinDiv);
    });
}

function showBulletinViewModal(id) {
    const bulletin = appState.bulletins.find(b => b.id === id);
    if (!bulletin) return;

    const modal = document.getElementById('bulletinViewModal');
    document.getElementById('bulletinViewTitle').textContent = bulletin.title;
    const body = document.getElementById('bulletinViewBody');
    if (window.marked) {
        body.innerHTML = marked.parse(bulletin.content || '');
    } else {
        body.textContent = bulletin.content;
    }

    modal.classList.add('show');
    document.getElementById('bulletinViewClose').onclick = () => modal.classList.remove('show');
    modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('show'); };
}

function editBulletin(id) {
    const bulletin = appState.bulletins.find(b => b.id === id);
    if (!bulletin) return;
    // Open modal and fill values
    const modal = document.getElementById('editBulletinModal');
    const titleInput = document.getElementById('editBulletinTitle');
    const contentInput = document.getElementById('editBulletinContent');
    titleInput.value = bulletin.title;
    contentInput.value = bulletin.content;
    modal.classList.add('show');

    // Save handler
    const form = document.getElementById('editBulletinForm');
    const closeBtn = document.getElementById('editBulletinClose');
    // Remove previous listeners
    form.onsubmit = function(e) {
        e.preventDefault();
        bulletin.title = titleInput.value;
        bulletin.content = contentInput.value;
        saveLocalData();
        renderBulletins();
        modal.classList.remove('show');
    };
    closeBtn.onclick = function() {
        modal.classList.remove('show');
    };
    modal.onclick = function(event) {
        if (event.target === modal) {
            modal.classList.remove('show');
        }
    };
}

function deleteBulletin(id) {
    const bulletin = appState.bulletins.find(b => b.id === id);
    if (!bulletin) return;

    if (confirm('정말 삭제하시겠습니까?')) {
        appState.bulletins = appState.bulletins.filter(b => b.id !== id);
        saveLocalData();
        renderBulletins();
    }
}

// ============================================
// 시간표 기능
// ============================================
function updateFamilySelects() {
    // 가족 멤버 목록 업데이트
    const familySelects = document.querySelectorAll('[id$="Family"]');
    familySelects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">가족 멤버 선택</option>' +
            '<option value="전체">전체</option>';
    });
}

const scheduleColorMap = {};

const colorPalette = [
    'hsl(215, 28%, 92%)',
    'hsl(200, 26%, 92%)',
    'hsl(185, 24%, 92%)',
    'hsl(160, 22%, 92%)',
    'hsl(145, 22%, 92%)',
    'hsl(82, 22%, 92%)',
    'hsl(48, 26%, 92%)',
    'hsl(24, 26%, 92%)',
    'hsl(350, 22%, 92%)',
    'hsl(320, 22%, 92%)',
    'hsl(280, 22%, 92%)',
    'hsl(260, 26%, 92%)',
    'hsl(235, 28%, 92%)',
    'hsl(225, 26%, 91%)',
    'hsl(210, 24%, 91%)',
    'hsl(175, 22%, 92%)',
    'hsl(130, 22%, 92%)',
    'hsl(95, 22%, 92%)',
    'hsl(60, 24%, 92%)',
    'hsl(30, 26%, 92%)'
];

function assignScheduleColors() {
    Object.keys(scheduleColorMap).forEach(key => delete scheduleColorMap[key]);

    const uniqueActivities = Array.from(new Set(appState.schedules
        .map(s => s.activity && s.activity.toString().trim())
        .filter(Boolean)
    ));

    uniqueActivities.sort((a, b) => a.localeCompare(b, 'ko-KR', { sensitivity: 'base' }));
    const usedColors = new Set();

    uniqueActivities.forEach(activity => {
        const key = activity.toLowerCase();
        const unusedColor = colorPalette.find(color => !usedColors.has(color));
        let color;
        if (unusedColor) {
            color = unusedColor;
        } else {
            let hue = (usedColors.size * 40) % 360;
            color = `hsl(${hue}, 26%, 92%)`;
            while (usedColors.has(color)) {
                hue = (hue + 35) % 360;
                color = `hsl(${hue}, 26%, 92%)`;
            }
        }

        scheduleColorMap[key] = color;
        usedColors.add(color);
    });
}

function getScheduleColor(name) {
    if (!name) return '#f1f5f9';
    const key = name.toString().trim().toLowerCase();
    return scheduleColorMap[key] || '#f1f5f9';
}

function parseTime(time) {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
}

function initScheduleMembers() {
    renderScheduleMemberTabs();
}

function renderScheduleMemberTabs() {
    const tabsContainer = document.getElementById('scheduleMemberTabs');
    tabsContainer.innerHTML = '';

    appState.scheduleMembers.forEach(member => {
        const tab = document.createElement('button');
        tab.className = `member-tab ${appState.activeScheduleMember === member ? 'active' : ''}`;
        tab.textContent = member;
        tab.addEventListener('click', () => {
            appState.activeScheduleMember = member;
            saveLocalData();
            renderScheduleMemberTabs();
            renderSchedules();
            renderMemberInfo();
        });
        tabsContainer.appendChild(tab);
    });

    if (appState.scheduleMembers.length === 0) {
        const info = document.createElement('div');
        info.className = 'schedule-tab-info';
        info.textContent = '이름을 먼저 추가해주세요.';
        tabsContainer.appendChild(info);
    }
}

function renderMemberInfo() {
    const area = document.getElementById('memberInfoArea');
    if (!area) return;
    const member = appState.activeScheduleMember;
    if (!member || !appState.scheduleMembers.includes(member)) {
        area.innerHTML = '';
        return;
    }
    const info = appState.scheduleMemberInfo[member] || {};

    area.innerHTML = `
        <div class="member-info-display" id="memberInfoDisplay">
            <span class="member-info-text">
                ${info.grade ? `${info.grade}학년` : '?학년'}
                ${info.classNum ? `${info.classNum}반` : '?반'}
                ${info.number ? `${info.number}번` : '?번'}
                ${info.teacher ? `· 담임 ${info.teacher} 선생님` : ''}
            </span>
            <button class="member-info-edit-btn" onclick="showMemberInfoEdit()">수정</button>
        </div>
        <div class="member-info-edit" id="memberInfoEdit" style="display:none;">
            <input type="text" id="infoGrade" placeholder="학년" value="${info.grade || ''}" maxlength="2">
            <label>학년</label>
            <input type="text" id="infoClass" placeholder="반" value="${info.classNum || ''}" maxlength="2">
            <label>반</label>
            <input type="text" id="infoNumber" placeholder="번호" value="${info.number || ''}" maxlength="3">
            <label>번</label>
            <input type="text" id="infoTeacher" placeholder="담임 선생님 이름" value="${info.teacher || ''}">
            <label>선생님</label>
            <button class="btn btn-primary btn-small" onclick="saveMemberInfo()">저장</button>
            <button class="btn btn-secondary btn-small" onclick="renderMemberInfo()">취소</button>
        </div>
    `;
}

function showMemberInfoEdit() {
    document.getElementById('memberInfoDisplay').style.display = 'none';
    document.getElementById('memberInfoEdit').style.display = 'flex';
    document.getElementById('infoGrade').focus();
}

function saveMemberInfo() {
    const member = appState.activeScheduleMember;
    if (!member) return;
    appState.scheduleMemberInfo[member] = {
        grade:    document.getElementById('infoGrade').value.trim(),
        classNum: document.getElementById('infoClass').value.trim(),
        number:   document.getElementById('infoNumber').value.trim(),
        teacher:  document.getElementById('infoTeacher').value.trim(),
    };
    saveLocalData();
    renderMemberInfo();
}

function addScheduleMember() {
    const name = prompt('추가할 이름을 입력해주세요:');
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (appState.scheduleMembers.includes(trimmed)) {
        alert('이미 등록된 이름입니다.');
        return;
    }
    appState.scheduleMembers.push(trimmed);
    appState.activeScheduleMember = trimmed;
    saveLocalData();
    renderScheduleMemberTabs();
    renderSchedules();
}

function handleAddSchedule() {
    if (appState.scheduleMembers.length === 0) {
        alert('먼저 이름을 추가해주세요.');
        return false;
    }

    const member = appState.activeScheduleMember;
    if (!member || !appState.scheduleMembers.includes(member)) {
        alert('개별 이름 탭을 선택한 상태에서 일정을 추가해주세요.');
        return false;
    }

    const day = document.getElementById('scheduleDay').value;
    const startTime = document.getElementById('scheduleStartTime').value;
    const endTime = document.getElementById('scheduleEndTime').value;
    const activity = document.getElementById('scheduleActivity').value;

    if (startTime >= endTime) {
        alert('시작 시간은 끝 시간보다 빨라야 합니다.');
        return false;
    }

    if (editingScheduleId !== null) {
        const schedule = appState.schedules.find(item => item.id === editingScheduleId);
        if (!schedule) return false;
        Object.assign(schedule, { member, day, startTime, endTime, activity });
    } else {
        appState.schedules.push({
            id: Date.now(),
            member,
            day,
            startTime,
            endTime,
            activity,
            createdAt: new Date().toISOString()
        });
    }
    saveLocalData();
    renderSchedules();
    return true;
}

function renderSchedules() {
    try {
        const scheduleList = document.getElementById('scheduleList');
        scheduleList.innerHTML = '';

        if (appState.scheduleMembers.length === 0) {
            scheduleList.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">먼저 이름을 추가해주세요.</div>';
            return;
        }

        if (!appState.scheduleMembers.includes(appState.activeScheduleMember)) {
            appState.activeScheduleMember = appState.scheduleMembers[0];
        }

        const daysOrder = ['월', '화', '수', '목', '금', '토'];
        const memberSchedules = appState.schedules
            .filter(s => s.member === appState.activeScheduleMember)
            .map(s => {
                let startTime = s.startTime || s.time;
                let endTime = s.endTime || (s.time ? `${(parseInt(s.time.split(':')[0]) + 1).toString().padStart(2, '0')}:00` : startTime);
                return { ...s, startTime, endTime };
            });

        if (memberSchedules.length === 0) {
            scheduleList.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">등록된 시간표가 없습니다.</div>';
            return;
        }

        const schedulesByDay = {};
        daysOrder.forEach(day => {
            schedulesByDay[day] = memberSchedules
                .filter(s => s.day === day)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
        });

        assignScheduleColors();

        const startOfDay = 8 * 60;
        const endOfDay = 23 * 60;
        const slotMinutes = 5;
        const totalSlots = (endOfDay - startOfDay) / slotMinutes;

        const grid = document.createElement('div');
        grid.className = 'schedule-week-grid';
        grid.style.setProperty('--schedule-slots', totalSlots);

        const corner = document.createElement('div');
        corner.className = 'schedule-grid-corner';
        corner.textContent = '시간';
        grid.appendChild(corner);

        daysOrder.forEach((day, index) => {
            const header = document.createElement('div');
            header.className = 'schedule-grid-day';
            header.style.gridColumn = `${index + 2}`;
            header.textContent = day;
            grid.appendChild(header);

            const lane = document.createElement('div');
            lane.className = 'schedule-grid-lane';
            lane.style.gridColumn = `${index + 2}`;
            lane.style.gridRow = `2 / span ${totalSlots}`;
            grid.appendChild(lane);
        });

        for (let hour = 8; hour <= 22; hour++) {
            const row = 2 + ((hour * 60 - startOfDay) / slotMinutes);

            const label = document.createElement('div');
            label.className = 'schedule-grid-time';
            label.style.gridRow = `${row} / span ${60 / slotMinutes}`;
            label.textContent = `${hour.toString().padStart(2, '0')}:00`;
            grid.appendChild(label);

            const line = document.createElement('div');
            line.className = 'schedule-grid-hour-line';
            line.style.gridRow = `${row}`;
            grid.appendChild(line);
        }

        memberSchedules.forEach(schedule => {
            const dayIndex = daysOrder.indexOf(schedule.day);
            if (dayIndex < 0) return;

            const rawStart = parseTime(schedule.startTime);
            const rawEnd = parseTime(schedule.endTime);
            if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd <= rawStart) return;

            const visibleStart = Math.max(rawStart, startOfDay);
            const visibleEnd = Math.min(rawEnd, endOfDay);
            if (visibleEnd <= visibleStart) return;

            const startRow = 2 + Math.round((visibleStart - startOfDay) / slotMinutes);
            const rowSpan = Math.max(1, Math.round((visibleEnd - visibleStart) / slotMinutes));

            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'schedule-grid-card';
            card.style.gridColumn = `${dayIndex + 2}`;
            card.style.gridRow = `${startRow} / span ${rowSpan}`;
            card.style.backgroundColor = getScheduleColor(schedule.activity);
            card.title = `${schedule.activity} · ${schedule.startTime} ~ ${schedule.endTime}`;

            const activity = document.createElement('strong');
            activity.textContent = schedule.activity;
            const time = document.createElement('span');
            time.textContent = `${schedule.startTime} ~ ${schedule.endTime}`;
            card.append(activity, time);
            card.addEventListener('click', () => openScheduleModal(schedule));
            grid.appendChild(card);
        });

        const mobileList = document.createElement('div');
        mobileList.className = 'schedule-mobile-list';

        daysOrder.forEach(day => {
            const daySchedules = schedulesByDay[day];
            if (!daySchedules.length) return;

            const group = document.createElement('section');
            group.className = 'schedule-mobile-day';
            const heading = document.createElement('h3');
            heading.textContent = `${day}요일`;
            group.appendChild(heading);

            daySchedules.forEach(schedule => {
                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'schedule-mobile-card';
                card.style.setProperty('--schedule-color', getScheduleColor(schedule.activity));

                const time = document.createElement('span');
                time.textContent = `${schedule.startTime}–${schedule.endTime}`;
                const activity = document.createElement('strong');
                activity.textContent = schedule.activity;
                card.append(time, activity);
                card.addEventListener('click', () => openScheduleModal(schedule));
                group.appendChild(card);
            });

            mobileList.appendChild(group);
        });

        scheduleList.append(grid, mobileList);
    } catch (error) {
        console.error('Render schedules error:', error);
    }
}

function openScheduleModal(schedule) {
    const modal = document.getElementById('scheduleDetailModal');
    const title = document.getElementById('scheduleDetailTitle');
    const day = document.getElementById('scheduleDetailDay');
    const time = document.getElementById('scheduleDetailTime');
    const activity = document.getElementById('scheduleDetailActivity');
    const editBtn = document.getElementById('scheduleEditBtn');
    const deleteBtn = document.getElementById('scheduleDeleteBtn');

    if (!modal) return;
    title.textContent = schedule.activity;
    day.textContent = `${schedule.day}요일`;
    time.textContent = `${schedule.startTime} ~ ${schedule.endTime}`;
    activity.textContent = schedule.activity;

    if (editBtn) {
        editBtn.onclick = () => {
            modal.classList.remove('show');
            openScheduleForm(schedule);
        };
    }

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (deleteSchedule(schedule.id)) {
                modal.classList.remove('show');
            }
        };
    }

    modal.classList.add('show');
}

function setupInfoModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
}

function deleteSchedule(id) {
    if (confirm('정말 삭제하시겠습니까?')) {
        appState.schedules = appState.schedules.filter(s => s.id !== id);
        saveLocalData();
        renderSchedules();
        return true;
    }
    return false;
}

// ============================================
// 할일 기능
// ============================================
function handleAddTodo() {
    const title = document.getElementById('todoTitle').value;
    const assignee = document.getElementById('todoAssignee').value;
    const dueDate = document.getElementById('todoDueDate').value;
    const priority = document.getElementById('todoPriority').value;

    const todo = {
        id: Date.now(),
        title,
        assignee: assignee || '미지정',
        dueDate,
        priority,
        completed: false,
        createdAt: new Date().toISOString()
    };

    appState.todos.push(todo);
    saveLocalData();
    renderTodos();
}

function renderTodos() {
    const todoList = document.getElementById('todoList');
    todoList.innerHTML = '';
    const completedCount = appState.todos.filter(todo => todo.completed).length;
    const activeCount = appState.todos.length - completedCount;
    const progress = appState.todos.length ? Math.round((completedCount / appState.todos.length) * 100) : 0;
    document.getElementById('todoSummaryText').textContent = `${activeCount}개의 할 일이 남았어요`;
    document.getElementById('todoSummaryMeta').textContent = `전체 ${appState.todos.length}개 중 ${completedCount}개 완료`;
    document.getElementById('todoProgressBar').style.width = `${progress}%`;

    let filtered = appState.todos;
    
    if (appState.currentFilter === 'active') {
        filtered = appState.todos.filter(t => !t.completed);
    } else if (appState.currentFilter === 'completed') {
        filtered = appState.todos.filter(t => t.completed);
    }

    if (filtered.length === 0) {
        todoList.innerHTML = '<div class="empty-state">할일이 없습니다.</div>';
        return;
    }

    filtered.forEach(todo => {
        const todoDiv = document.createElement('div');
        todoDiv.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        const priorityLabel = todo.priority === 'high' ? '중요' : todo.priority === 'medium' ? '보통' : '여유';
        
        todoDiv.innerHTML = `
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} 
                onchange="toggleTodo(${todo.id})" aria-label="${escapeHtml(todo.title)} 완료">
            <div class="todo-content">
                <div class="todo-title">${escapeHtml(todo.title)}</div>
                <div class="todo-meta">
                    <span><i class="fa-regular fa-user"></i> ${escapeHtml(todo.assignee)}</span>
                    <span><i class="fa-regular fa-calendar"></i> ${formatCompactDate(todo.dueDate)}</span>
                </div>
            </div>
            <span class="todo-priority ${todo.priority}">${priorityLabel}</span>
            <button type="button" class="icon-action is-danger todo-delete" aria-label="할 일 삭제" onclick="deleteTodo(${todo.id})"><i class="fas fa-trash"></i></button>
        `;
        
        todoList.appendChild(todoDiv);
    });
}

function toggleTodo(id) {
    const todo = appState.todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveLocalData();
        renderTodos();
    }
}

function deleteTodo(id) {
    if (confirm('정말 삭제하시겠습니까?')) {
        appState.todos = appState.todos.filter(t => t.id !== id);
        saveLocalData();
        renderTodos();
    }
}

// 할일 필터
document.addEventListener('DOMContentLoaded', () => {
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            appState.currentFilter = btn.getAttribute('data-filter');
            renderTodos();
        });
    });
});

// ============================================
// 쇼핑 리스트
// ============================================
function handleAddShopping() {
    const item = document.getElementById('shoppingItem').value;
    const price = parseFloat(document.getElementById('shoppingPrice').value) || 0;
    const qty = parseInt(document.getElementById('shoppingQty').value, 10) || 1;
    const category = document.getElementById('shoppingCategory').value;

    const shopping = {
        id: Date.now(),
        item,
        price,
        qty,
        category,
        purchased: false,
        createdAt: new Date().toISOString()
    };

    appState.shopping.push(shopping);
    saveLocalData();
    renderShopping();
}

function renderShopping() {
    const shoppingList = document.getElementById('shoppingList');
    shoppingList.innerHTML = '';
    const pendingItems = appState.shopping.filter(shop => !shop.purchased);
    const purchasedCount = appState.shopping.length - pendingItems.length;
    document.getElementById('shoppingSummaryText').textContent = `${pendingItems.length}개를 구매할 예정이에요`;
    document.getElementById('shoppingSummaryMeta').textContent = purchasedCount
        ? `${purchasedCount}개 구매 완료`
        : '체크하면 구매 완료로 정리돼요';

    if (appState.shopping.length === 0) {
        shoppingList.innerHTML = '<div class="empty-state">쇼핑 리스트가 비어있습니다.</div>';
        updateShoppingTotal();
        return;
    }

    appState.shopping.forEach(shop => {
        const shopDiv = document.createElement('div');
        shopDiv.className = `shopping-item ${shop.purchased ? 'completed' : ''}`;

        const totalPrice = shop.price * shop.qty;
        const categoryIcons = {
            '식품': 'fa-apple-whole',
            '생활용품': 'fa-pump-soap',
            '의류': 'fa-shirt',
            '전자제품': 'fa-plug'
        };
        const categoryIcon = categoryIcons[shop.category] || 'fa-bag-shopping';

        shopDiv.innerHTML = `
            <span class="shopping-category-icon"><i class="fas ${categoryIcon}"></i></span>
            <div class="shopping-item-content">
                <input type="checkbox" class="shopping-checkbox" ${shop.purchased ? 'checked' : ''}
                    onchange="toggleShopping(${shop.id})" aria-label="${escapeHtml(shop.item)} 구매 완료">
                <div class="shopping-details">
                    <div class="shopping-item-name">${escapeHtml(shop.item)}</div>
                    <div class="shopping-item-category">${escapeHtml(shop.category)} · ${shop.qty}개</div>
                </div>
            </div>
            <div class="shopping-price">₩${totalPrice.toLocaleString()}</div>
            <button type="button" class="icon-action is-danger shopping-delete" aria-label="쇼핑 항목 삭제" onclick="deleteShopping(${shop.id})"><i class="fas fa-trash"></i></button>
        `;

        shoppingList.appendChild(shopDiv);
    });

    updateShoppingTotal();
}

function toggleShopping(id) {
    const shop = appState.shopping.find(s => s.id == id);
    if (shop) {
        shop.purchased = !shop.purchased;
        saveLocalData();
        renderShopping();
    }
}

function deleteShopping(id) {
    if (confirm('정말 삭제하시겠습니까?')) {
        appState.shopping = appState.shopping.filter(s => s.id != id);
        saveLocalData();
        renderShopping();
    }
}

function updateShoppingTotal() {
    const total = appState.shopping
        .filter(s => !s.purchased)
        .reduce((sum, s) => sum + (s.price * s.qty), 0);
    document.getElementById('shoppingTotal').textContent = `₩${total.toLocaleString()}`;
}

// ============================================
// 오늘 대시보드와 일정 알림
// ============================================
function dashboardEmpty(message) {
    return `<div class="dashboard-empty"><i class="fa-regular fa-circle-check"></i><span>${message}</span></div>`;
}

function dashboardRows(items) {
    return items.map(item => `
        <div class="dashboard-row">
            <span class="dashboard-row-time">${escapeHtml(item.time || '종일')}</span>
            <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.meta || '')}</small></div>
        </div>
    `).join('');
}

function renderDashboard() {
    const eventContainer = document.getElementById('dashboardEvents');
    if (!eventContainer) return;

    const today = new Date();
    const todayString = toLocalDateString(today);
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][today.getDay()];
    const todayEvents = getEventsOnDate(today.getFullYear(), today.getMonth(), today.getDate())
        .filter(event => !event.isHoliday)
        .sort((a, b) => (a.startTime || '99:99').localeCompare(b.startTime || '99:99'));
    const todaySchedules = appState.schedules
        .filter(schedule => schedule.day === weekday)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const pendingTodos = appState.todos
        .filter(todo => !todo.completed)
        .sort((a, b) => (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31'));
    const pendingShopping = appState.shopping.filter(item => !item.purchased);

    document.getElementById('dashboardDateText').textContent =
        `${today.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}에 필요한 내용을 모았어요.`;
    document.getElementById('dashboardEventCount').textContent = todayEvents.length;
    document.getElementById('dashboardScheduleCount').textContent = todaySchedules.length;
    document.getElementById('dashboardTodoCount').textContent = pendingTodos.length;
    document.getElementById('dashboardShoppingCount').textContent = pendingShopping.length;

    eventContainer.innerHTML = todayEvents.length
        ? dashboardRows(todayEvents.slice(0, 5).map(event => ({
            time: event.allDay ? '종일' : event.startTime,
            title: event.title,
            meta: event.family || '전체'
        })))
        : dashboardEmpty('오늘 등록된 일정이 없어요');

    document.getElementById('dashboardSchedules').innerHTML = todaySchedules.length
        ? dashboardRows(todaySchedules.slice(0, 5).map(schedule => ({
            time: schedule.startTime,
            title: schedule.activity,
            meta: `${schedule.member} · ${schedule.endTime}까지`
        })))
        : dashboardEmpty('오늘 시간표가 비어 있어요');

    document.getElementById('dashboardTodos').innerHTML = pendingTodos.length
        ? dashboardRows(pendingTodos.slice(0, 5).map(todo => ({
            time: todo.dueDate === todayString ? '오늘' : formatCompactDate(todo.dueDate),
            title: todo.title,
            meta: todo.assignee || '미지정'
        })))
        : dashboardEmpty('남은 할 일이 없어요');

    document.getElementById('dashboardShopping').innerHTML = pendingShopping.length
        ? dashboardRows(pendingShopping.slice(0, 5).map(item => ({
            time: `${item.qty || 1}개`,
            title: item.item,
            meta: item.category || '기타'
        })))
        : dashboardEmpty('장보기 목록을 모두 완료했어요');
}

function showReminderToast(event) {
    const toast = document.createElement('div');
    toast.className = 'reminder-toast';
    toast.innerHTML = `<i class="fa-regular fa-bell"></i><div><strong>${escapeHtml(event.title)}</strong><span>일정 시간이 다가왔어요</span></div>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 250);
    }, 5000);
}

function setNotificationStatus(message, isError = false) {
    const status = document.getElementById('notificationStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', isError);
}

function isIosDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

function updateNotificationButton() {
    const button = document.getElementById('enableNotificationsBtn');
    if (!button) return;
    button.disabled = false;

    if (!window.isSecureContext) {
        button.innerHTML = '<i class="fa-solid fa-lock"></i> HTTPS 필요';
        setNotificationStatus('알림은 HTTPS 주소에서만 사용할 수 있어요.', true);
        return;
    }

    if (typeof Notification === 'undefined') {
        button.innerHTML = isIosDevice()
            ? '<i class="fa-solid fa-mobile-screen"></i> 설치 안내'
            : '<i class="fa-regular fa-bell-slash"></i> 알림 미지원';
        setNotificationStatus(
            isIosDevice() && !isStandaloneApp()
                ? 'iPhone에서는 공유 → 홈 화면에 추가한 뒤 앱 아이콘으로 실행하세요.'
                : '이 브라우저에서는 알림을 지원하지 않아요.',
            true
        );
        return;
    }

    const enabled = Notification.permission === 'granted';
    button.classList.toggle('is-enabled', enabled);
    button.innerHTML = enabled
        ? '<i class="fas fa-bell"></i> 알림 사용 중'
        : '<i class="fa-regular fa-bell"></i> 알림 켜기';
    if (Notification.permission === 'denied') {
        setNotificationStatus('브라우저 설정에서 Family Hub 알림 권한을 허용해주세요.', true);
    } else if (enabled) {
        setNotificationStatus('일정 알림이 켜져 있어요.');
    } else {
        setNotificationStatus('버튼을 눌러 일정 알림을 허용하세요.');
    }
}

async function requestNotificationPermission() {
    if (!window.isSecureContext) {
        setNotificationStatus('현재 HTTP 접속입니다. HTTPS로 접속해야 알림을 켤 수 있어요.', true);
        return;
    }
    if (typeof Notification === 'undefined') {
        setNotificationStatus(
            isIosDevice() && !isStandaloneApp()
                ? 'Safari의 공유 버튼에서 “홈 화면에 추가”한 후, 생성된 Family Hub 아이콘으로 실행해주세요.'
                : '현재 모바일 브라우저는 웹 알림을 지원하지 않아요.',
            true
        );
        return;
    }
    if (Notification.permission === 'denied') {
        setNotificationStatus('알림이 차단되어 있습니다. 휴대폰의 사이트 설정에서 권한을 변경해주세요.', true);
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        setNotificationStatus(
            permission === 'granted'
                ? '알림을 허용했습니다. 일정 시간이 되면 알려드릴게요.'
                : '알림 권한이 허용되지 않았어요.',
            permission !== 'granted'
        );
    } catch (error) {
        console.error('Notification permission error:', error);
        setNotificationStatus('알림 권한을 요청할 수 없습니다. HTTPS와 브라우저 설정을 확인해주세요.', true);
    }
    updateNotificationButton();
}

async function registerNotificationServiceWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return null;
    try {
        return await navigator.serviceWorker.register('./sw.js');
    } catch (error) {
        console.error('Service worker registration error:', error);
        setNotificationStatus('모바일 알림 서비스를 시작하지 못했습니다.', true);
        return null;
    }
}

function showSystemNotification(event) {
    const options = {
        body: event.allDay ? '오늘 예정된 일정입니다.' : `${event.startTime} 일정이 곧 시작됩니다.`,
        tag: `family-hub-${event.id}`,
        renotify: true
    };

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
            .then(registration => registration.showNotification(`Family Hub · ${event.title}`, options))
            .catch(error => console.error('Persistent notification error:', error));
        return;
    }
    new Notification(`Family Hub · ${event.title}`, options);
}

function checkEventReminders() {
    const now = new Date();
    const notified = new Set(JSON.parse(localStorage.getItem('familyHubNotified') || '[]'));
    let changed = false;

    for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
        const occurrenceDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
        const events = getEventsOnDate(
            occurrenceDate.getFullYear(),
            occurrenceDate.getMonth(),
            occurrenceDate.getDate()
        ).filter(event => !event.isHoliday && event.reminder !== 'none' && event.reminder !== undefined);

        events.forEach(event => {
            const [hours, minutes] = (event.allDay ? '09:00' : event.startTime || '09:00').split(':').map(Number);
            const eventTime = new Date(occurrenceDate);
            eventTime.setHours(hours, minutes, 0, 0);
            const reminderTime = new Date(eventTime.getTime() - Number(event.reminder) * 60000);
            const key = `${event.id}-${toLocalDateString(occurrenceDate)}-${event.reminder}`;
            const elapsed = now - reminderTime;

            if (elapsed >= 0 && elapsed < 300000 && !notified.has(key)) {
                showReminderToast(event);
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    showSystemNotification(event);
                }
                notified.add(key);
                changed = true;
            }
        });
    }

    if (changed) {
        localStorage.setItem('familyHubNotified', JSON.stringify([...notified].slice(-200)));
    }
}

function initDashboardAndNotifications() {
    renderDashboard();
    registerNotificationServiceWorker();
    updateNotificationButton();
    document.getElementById('enableNotificationsBtn')?.addEventListener('click', requestNotificationPermission);
    document.querySelectorAll('[data-dashboard-tab]').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector(`.tab-btn[data-tab="${button.dataset.dashboardTab}"]`)?.click();
        });
    });
    checkEventReminders();
    setInterval(checkEventReminders, 60000);
}


// ============================================
// 위젯 통합 범사
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // 초기화
    portalModalsToBody();
    await loadLocalData();
    initTabs();
    initSwipe();
    setupModals();
    initCalendar();
    initScheduleMembers();
    renderBulletins();
    renderSchedules();
    renderMemberInfo();
    renderTodos();
    renderShopping();
    initDashboardAndNotifications();
    initWeather();
    initHeaderWeather();
    setupInfoModal('scheduleDetailModal');

    document.getElementById('addScheduleMemberBtn').addEventListener('click', addScheduleMember);

    // 날씨 검색
    const weatherInput = document.getElementById('weatherLocation');
    const weatherSearchBtn = document.getElementById('weatherSearchBtn');
    const weatherLocateBtn = document.getElementById('weatherLocateBtn');
    if (weatherInput && weatherSearchBtn) {
        weatherSearchBtn.addEventListener('click', () => {
            const loc = weatherInput.value.trim();
            if (loc) fetchWeather(loc);
        });
        weatherInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const loc = weatherInput.value.trim();
                if (loc) fetchWeather(loc);
            }
        });
    }
    weatherLocateBtn?.addEventListener('click', requestCurrentPositionWeather);
});

// ============================================
// 날씨 기능
// ============================================
let currentLocationWeatherData = null;
const currentLocationWeatherPlace = { name: '현재 위치', admin1: '' };

function initWeather() {
    if (currentLocationWeatherData) {
        renderWeather(currentLocationWeatherData, currentLocationWeatherPlace);
        return;
    }

    if (appState.weatherLocation) {
        fetchWeather(appState.weatherLocation);
    } else {
        // 저장된 지역 없으면 검색 안내
        const container = document.getElementById('weatherContainer');
        container.innerHTML = `
            <div class="weather-location-error">
                <div class="weather-location-error-icon">🌤️</div>
                <p>지역을 검색해서 날씨를 확인하세요.</p>
            </div>
        `;
    }
}

function initHeaderWeather() {
    const widget = document.getElementById('headerWeatherWidget');
    if (!widget) return;

    widget.addEventListener('click', () => {
        if (!currentLocationWeatherData) requestCurrentPositionWeather();
        document.querySelector('.tab-btn[data-tab="weather"]')?.click();
    });

    requestCurrentPositionWeather();
}

function requestCurrentPositionWeather() {
    if (!navigator.geolocation) {
        updateHeaderWeatherWidget(null, '위치 미지원');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        position => fetchWeatherByCoordinates(position.coords.latitude, position.coords.longitude),
        error => {
            const message = error.code === error.PERMISSION_DENIED ? '위치 허용 필요' : '위치 확인 실패';
            updateHeaderWeatherWidget(null, message);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 }
    );
}

async function fetchWeatherByCoordinates(latitude, longitude) {
    try {
        const [weatherData, place] = await Promise.all([
            fetchWeatherForecast(latitude, longitude),
            fetchCurrentLocationName(latitude, longitude)
        ]);

        currentLocationWeatherData = weatherData;
        currentLocationWeatherPlace.name = place.name;
        currentLocationWeatherPlace.admin1 = place.admin1;
        updateHeaderWeatherWidget(weatherData.current, place.name);

        if (document.getElementById('weather')?.classList.contains('active')) {
            renderWeather(currentLocationWeatherData, currentLocationWeatherPlace);
        }
    } catch (error) {
        console.error('현재 위치 날씨 조회 실패:', error);
        updateHeaderWeatherWidget(null, '날씨 확인 실패');
    }
}

async function fetchCurrentLocationName(latitude, longitude) {
    try {
        const response = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client` +
            `?latitude=${latitude}&longitude=${longitude}&localityLanguage=ko`
        );
        if (!response.ok) throw new Error('Reverse geocoding failed');
        const location = await response.json();
        return {
            name: location.locality || location.city || '현재 위치',
            admin1: location.principalSubdivision || ''
        };
    } catch (error) {
        console.warn('현재 위치 이름 조회 실패:', error);
        return { name: '현재 위치', admin1: '' };
    }
}

async function fetchWeatherForecast(latitude, longitude) {
    const response = await fetch(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m` +
        `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset` +
        `&timezone=auto&forecast_days=7`
    );
    const weatherData = await response.json();
    if (!response.ok || weatherData.error || !weatherData.current) {
        throw new Error(weatherData.reason || 'Weather unavailable');
    }
    return weatherData;
}

function updateHeaderWeatherWidget(current, status) {
    const widget = document.getElementById('headerWeatherWidget');
    const icon = document.getElementById('headerWeatherIcon');
    const temperature = document.getElementById('headerWeatherTemp');
    const description = document.getElementById('headerWeatherDesc');
    if (!widget || !icon || !temperature || !description) return;

    widget.classList.toggle('is-ready', Boolean(current));
    icon.textContent = current ? getWeatherIcon(current.weather_code) : '⌖';
    temperature.textContent = current ? `${Math.round(current.temperature_2m)}°` : status;
    description.textContent = current ? `${getWeatherDescription(current.weather_code)} · ${status}` : '눌러서 날씨 보기';
}

async function fetchWeather(location) {
    const container = document.getElementById('weatherContainer');
    container.innerHTML = '<div class="weather-loading">날씨 정보를 불러오는 중...</div>';

    try {
        const geoResp = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=ko`
        );
        const geoData = await geoResp.json();

        if (!geoData.results || geoData.results.length === 0) {
            container.innerHTML = '<div class="weather-error">지역을 찾을 수 없습니다. 다시 검색해주세요.</div>';
            return;
        }

        const place = geoData.results[0];
        const weatherData = await fetchWeatherForecast(place.latitude, place.longitude);

        // 지역 저장 (서버 JSON에 반영)
        appState.weatherLocation = location;
        saveLocalData();

        // input 값도 동기화
        const input = document.getElementById('weatherLocation');
        if (input) input.value = location;

        renderWeather(weatherData, place);
    } catch (e) {
        console.error('날씨 조회 실패:', e);
        container.innerHTML = '<div class="weather-error">날씨 정보를 가져올 수 없습니다. 네트워크를 확인해주세요.</div>';
    }
}


function renderWeather(data, place) {
    const container = document.getElementById('weatherContainer');
    
    if (!data || !data.current) {
        console.error('날씨 데이터 없음:', data);
        container.innerHTML = '<div class="weather-error">날씨 데이터를 표시할 수 없습니다.</div>';
        return;
    }

    const current = data.current;
    const hourly = data.hourly;
    const daily = data.daily;
    const weatherDescription = getWeatherDescription(current.weather_code);
    const weatherIcon = getWeatherIcon(current.weather_code);
    const locationLabel = [place?.name, place?.admin1 || place?.country]
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(', ') || '현재 위치';

    const currentHour = current.time?.slice(0, 13);
    const today = current.time?.slice(0, 10);
    const hourlyIndexes = (hourly?.time || [])
        .map((time, index) => ({ time, index }))
        .filter(item => item.time.startsWith(today) && item.time.slice(0, 13) >= currentHour)
        .slice(0, 12);

    const hourlyForecast = hourlyIndexes.map(({ time, index }, itemIndex) => `
        <article class="weather-hour-card${itemIndex === 0 ? ' is-now' : ''}">
            <span class="weather-hour-time">${itemIndex === 0 ? '지금' : `${time.slice(11, 13)}시`}</span>
            <span class="weather-hour-icon">${getWeatherIcon(hourly.weather_code[index])}</span>
            <strong>${Math.round(hourly.temperature_2m[index])}°</strong>
            <span class="weather-hour-rain"><i class="fas fa-droplet"></i> ${hourly.precipitation_probability[index] ?? 0}%</span>
        </article>
    `).join('');

    const dailyForecast = (daily?.time || []).slice(0, 7).map((date, index) => {
        const label = index === 0
            ? '오늘'
            : new Date(`${date}T00:00:00`).toLocaleDateString('ko-KR', { weekday: 'short' });
        return `
            <article class="weather-day-row${index === 0 ? ' is-today' : ''}">
                <strong>${label}</strong>
                <span class="weather-day-date">${date.slice(5).replace('-', '.')}</span>
                <span class="weather-day-icon">${getWeatherIcon(daily.weather_code[index])}</span>
                <span class="weather-day-condition">${getWeatherDescription(daily.weather_code[index])}</span>
                <span class="weather-day-rain"><i class="fas fa-droplet"></i> ${daily.precipitation_probability_max?.[index] ?? 0}%</span>
                <span class="weather-day-temp"><b>${Math.round(daily.temperature_2m_max[index])}°</b> <em>${Math.round(daily.temperature_2m_min[index])}°</em></span>
            </article>
        `;
    }).join('');

    container.innerHTML = `
        <div class="weather-dashboard">
            <section class="weather-now-card">
                <div class="weather-now-top">
                    <div>
                        <span class="weather-now-label"><i class="fas fa-location-dot"></i> ${locationLabel}</span>
                        <h3>${weatherDescription}</h3>
                        <p>오늘 외출 전 날씨를 확인해보세요.</p>
                    </div>
                    <span class="weather-now-icon">${weatherIcon}</span>
                </div>
                <div class="weather-now-main">
                    <strong>${Math.round(current.temperature_2m)}<sup>°</sup></strong>
                    <span>체감 ${Math.round(current.apparent_temperature)}°</span>
                </div>
                <div class="weather-now-stats">
                    <span><i class="fas fa-droplet"></i><small>습도</small><b>${current.relative_humidity_2m}%</b></span>
                    <span><i class="fas fa-wind"></i><small>바람</small><b>${Math.round(current.wind_speed_10m)} km/h</b></span>
                    <span><i class="fas fa-cloud-rain"></i><small>강수확률</small><b>${hourly?.precipitation_probability?.[hourlyIndexes[0]?.index] ?? 0}%</b></span>
                </div>
            </section>

            <section class="weather-panel weather-hourly-panel">
                <div class="weather-panel-heading">
                    <div><span>TODAY</span><h3>오늘 시간대별 날씨</h3></div>
                    <small>현재 시각 이후</small>
                </div>
                <div class="weather-hourly-scroll">${hourlyForecast || '<p class="weather-empty">오늘의 시간대별 예보가 끝났어요.</p>'}</div>
            </section>

            <section class="weather-panel weather-weekly-panel">
                <div class="weather-panel-heading">
                    <div><span>7 DAYS</span><h3>주간 예보</h3></div>
                    <small>최고·최저 기온</small>
                </div>
                <div class="weather-week-list">${dailyForecast}</div>
            </section>
        </div>
    `;
}

function getWeatherIcon(code) {
    // WMO Weather codes
    if (code === 0) return '☀️';
    if (code === 1 || code === 2) return '🌤️';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code === 51 || code === 53 || code === 55 || code === 61 || code === 63 || code === 65 || code === 80 || code === 81 || code === 82) return '🌧️';
    if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return '❄️';
    if (code === 80 || code === 81 || code === 82) return '⛈️';
    if (code === 95 || code === 96 || code === 99) return '⛈️';
    return '🌤️';
}

function getWeatherDescription(code) {
    const descriptions = {
        0: '맑음',
        1: '거의 맑음',
        2: '구름 조금',
        3: '흐림',
        45: '안개',
        48: '서리 안개',
        51: '이슬비',
        53: '중간 이슬비',
        55: '강한 이슬비',
        61: '약한 비',
        63: '중간 비',
        65: '강한 비',
        71: '약한 눈',
        73: '중간 눈',
        75: '강한 눈',
        77: '눈입자',
        80: '약한 소나기',
        81: '중간 소나기',
        82: '강한 소나기',
        85: '약한 눈소나기',
        86: '강한 눈소나기',
        95: '뇌우',
        96: '우박과 뇌우',
        99: '강한 우박 뇌우'
    };
    return descriptions[code] || '불명';
}
