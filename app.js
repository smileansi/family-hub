// ============================================
// 앱 전역 상태 관리
// ============================================

// API 엔드포인트 자동 설정
// 로컬: http://127.0.0.1:5000, 원격: 현재 접속 프로토콜 그대로 사용 (http/https 자동 일치)
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? `http://${window.location.hostname}:5000`
    : `${window.location.protocol}//${window.location.hostname}`;

const appState = {
    user: null,
    events: [],
    bulletins: [],
    schedules: [],
    scheduleMembers: [],
    activeScheduleMember: '전체',
    todos: [],
    shopping: [],
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
        activeScheduleMember: appState.activeScheduleMember,
        todos: appState.todos,
        shopping: appState.shopping
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
        appState.activeScheduleMember = data.activeScheduleMember || appState.activeScheduleMember || '전체';
        appState.todos    = data.todos    || [];
        appState.shopping = data.shopping || [];
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

                // 탭 전환 시 서버에서 최신 데이터 로드 후 렌더링
                await fetchAndUpdateFromServer();

                switch(tabName) {
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
                        break;
                    case 'todos':
                        renderTodos();
                        break;
                    case 'shopping':
                        renderShopping();
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
    const tabOrder = ['calendar', 'bulletin', 'schedule', 'todos', 'shopping', 'weather'];
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
function setupModals() {
    // 이벤트 모달
    setupModal('eventModal', 'addEventBtn', 'eventForm', handleAddEvent);
    
    // 종일 체크박스 이벤트
    const allDayCheckbox = document.getElementById('eventAllDay');
    const timeInputs = document.getElementById('timeInputs');
    allDayCheckbox.addEventListener('change', () => {
        timeInputs.style.display = allDayCheckbox.checked ? 'none' : 'flex';
    });

    // 시작일 입력 시 종료일 자동 동기화
    const eventStartDate = document.getElementById('eventStartDate');
    const eventEndDate = document.getElementById('eventEndDate');
    eventStartDate.addEventListener('change', () => {
        if (!eventEndDate.value || eventEndDate.value < eventStartDate.value) {
            eventEndDate.value = eventStartDate.value;
        }
    });
    
    // 공지 모달
    setupModal('bulletinModal', 'addBulletinBtn', 'bulletinForm', handleAddBulletin);
    
    // 시간표 모달
    setupModal('scheduleModal', 'addScheduleBtn', 'scheduleForm', handleAddSchedule);
    
    // 할일 모달
    setupModal('todoModal', 'addTodoBtn', 'todoForm', handleAddTodo);
    
    // 쇼핑 모달
    setupModal('shoppingModal', 'addShoppingBtn', 'shoppingForm', handleAddShopping);
}

function setupModal(modalId, btnId, formId, submitHandler) {
    const modal = document.getElementById(modalId);
    const btn = document.getElementById(btnId);
    const form = document.getElementById(formId);
    const closeBtn = modal.querySelector('.close');

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
    dayDiv.textContent = date;
    
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
        if (normalEvents.length > 0) {
            const eventIndicator = document.createElement('div');
            eventIndicator.className = 'event-indicator';
            eventIndicator.textContent = normalEvents.length;
            dayDiv.appendChild(eventIndicator);
        }
    }
    
    // 날짜 클릭 시 일정 보기 모달
    dayDiv.addEventListener('click', () => {
        showEventViewModal(year, month, date);
    });
    
    return dayDiv;
}

function getEventsOnDate(year, month, date) {
    // ISO 형식의 날짜 문자열로 비교 (시간대 문제 회피)
    const pad = (n) => String(n).padStart(2, '0');
    const targetDateStr = `${year}-${pad(month + 1)}-${pad(date)}`;
    const holidays = appState.holidaysByYear[year] || [];

    const eventMatches = appState.events
        .filter(event => !event.isHoliday)
        .filter(event => {
            const startDateStr = (event.startDate || event.date).slice(0, 10);
            const endDateStr = (event.endDate || event.startDate || event.date).slice(0, 10);
            return targetDateStr >= startDateStr && targetDateStr <= endDateStr;
    });
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
        const existingIndicator = day.querySelector('.event-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        day.classList.remove('has-events');
        day.classList.remove('holiday');
        
        // 날짜 정보 추출
        const dateText = day.textContent.split('\n')[0]; // 이벤트 표시가 있으면 분리
        const date = parseInt(dateText);
        
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
                const eventIndicator = document.createElement('div');
                eventIndicator.className = 'event-indicator';
                eventIndicator.textContent = normalEvents.length;
                day.appendChild(eventIndicator);
            } else {
                day.classList.remove('has-events');
            }
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
    const family = document.getElementById('eventFamily').value;

    const event = {
        id: Date.now(),
        title,
        startDate,
        endDate: endDate || startDate,
        allDay,
        startTime,
        endTime,
        desc,
        family: family || '전체',
        createdAt: new Date().toISOString()
    };

    appState.events.push(event);
    saveLocalData();
    renderEvents();
    renderEventsOnCalendar(); // 캘린더에도 표시
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
    
    const filteredEvents = appState.events
        .filter(event => !event.isHoliday)
        .filter(event => {
            const startDate = new Date(event.startDate || event.date);
            const endDate = new Date(event.endDate || event.startDate || event.date);
            const eventStartMonth = startDate.getMonth();
            const eventStartYear = startDate.getFullYear();
            const eventEndMonth = endDate.getMonth();
            const eventEndYear = endDate.getFullYear();
            
            // 일정이 현재 달과 겹치는지 확인
            return (eventStartYear === currentYear && eventStartMonth === currentMonth) ||
                   (eventEndYear === currentYear && eventEndMonth === currentMonth) ||
                   (startDate <= new Date(currentYear, currentMonth + 1, 0) && endDate >= new Date(currentYear, currentMonth, 1));
    });

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

        eventDiv.className = 'event-item' + (isPast ? ' event-past' : '');

        const timeDisplay = event.allDay ? '종일' :
            (event.startTime && event.endTime ? `${event.startTime}~${event.endTime}` :
             (event.startTime || event.time || ''));
        const startDate = event.startDate || event.date;
        const dateDisplay = startDate === (event.endDate || startDate)
            ? startDate
            : `${startDate}~${event.endDate || startDate}`;

        eventDiv.innerHTML = `
            <span class="event-item-date">${dateDisplay}</span>
            <span class="event-item-time">${timeDisplay}</span>
            <span class="event-item-title">${event.title}</span>
        `;
        eventsList.appendChild(eventDiv);
    });
}

function deleteEvent(id) {
    if (confirm('정말 삭제하시겠습니까?')) {
        appState.events = appState.events.filter(e => e.id !== id);
        saveLocalData();
        renderEvents();
        renderEventsOnCalendar(); // 캘린더에서도 제거
    }
}

function showEventViewModal(year, month, date) {
    const eventsOnDay = getEventsOnDate(year, month, date);
    if (eventsOnDay.length === 0) return;
    
    const modal = document.getElementById('eventViewModal');
    const dateHeader = document.getElementById('eventViewDate');
    const list = document.getElementById('eventViewList');
    
    dateHeader.textContent = `${year}년 ${month + 1}월 ${date}일 일정`;
    list.innerHTML = '';
    
    eventsOnDay.forEach(event => {
        const eventDiv = document.createElement('div');
        eventDiv.className = 'event-item';
        const timeDisplay = event.allDay ? '종일' : 
            (event.startTime && event.endTime ? `${event.startTime} ~ ${event.endTime}` : 
             (event.startTime || event.time || '시간 미정'));
        const dateDisplay = (event.startDate || event.date) === (event.endDate || event.startDate || event.date) ? 
            (event.startDate || event.date) : `${event.startDate || event.date} ~ ${event.endDate || event.startDate || event.date}`;
        eventDiv.innerHTML = `
            <div class="event-title">${event.title}</div>
            <div class="event-date">📅 ${dateDisplay} ${timeDisplay}</div>
            ${event.desc ? `<div class="event-date" style="margin-top: 0.5rem;">${event.desc}</div>` : ''}
            <div class="event-actions">
                <button class="btn btn-small btn-danger" onclick="deleteEvent(${event.id})">삭제</button>
            </div>
        `;
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

function renderBulletins() {
    const bulletinList = document.getElementById('bulletinList');
    bulletinList.innerHTML = '';

    if (appState.bulletins.length === 0) {
        bulletinList.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">작성된 메모가 없습니다.</div>';
        return;
    }

    appState.bulletins.forEach(bulletin => {
        const bulletinDiv = document.createElement('div');
        bulletinDiv.className = 'bulletin-item';
        bulletinDiv.innerHTML = `
            <div class="bulletin-header" onclick="toggleBulletin(${bulletin.id})">
                <h3 class="bulletin-title">${bulletin.title}</h3>
                <span class="bulletin-toggle">▼</span>
            </div>
            <div class="bulletin-content collapsed"></div>
            <div class="bulletin-actions collapsed">
                <button class="btn btn-small" onclick="editBulletin(${bulletin.id})" style="background: rgba(255,255,255,0.3); color: white;">수정</button>
                <button class="btn btn-small" onclick="deleteBulletin(${bulletin.id})" style="background: rgba(255,255,255,0.3); color: white;">삭제</button>
            </div>
        `;
        // Render markdown in bulletin-content
        const contentDiv = bulletinDiv.querySelector('.bulletin-content');
        if (window.marked) {
            contentDiv.innerHTML = marked.parse(bulletin.content || '');
        } else {
            contentDiv.textContent = bulletin.content;
        }
        bulletinList.appendChild(bulletinDiv);
    });
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
    modal.style.display = 'block';

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
        modal.style.display = 'none';
    };
    closeBtn.onclick = function() {
        modal.style.display = 'none';
    };
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
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
    'hsl(6, 56%, 86%)',    // coral
    'hsl(24, 58%, 86%)',   // apricot
    'hsl(44, 55%, 88%)',   // mellow yellow
    'hsl(72, 52%, 88%)',   // soft lime
    'hsl(110, 45%, 86%)',  // mint
    'hsl(165, 50%, 86%)',  // seafoam
    'hsl(190, 55%, 86%)',  // sky
    'hsl(215, 55%, 86%)',  // baby blue
    'hsl(240, 55%, 86%)',  // periwinkle
    'hsl(265, 55%, 85%)',  // lavender
    'hsl(295, 55%, 85%)',  // orchid
    'hsl(325, 55%, 85%)',  // rose
    'hsl(0, 55%, 85%)',    // soft red
    'hsl(28, 52%, 84%)',   // peach
    'hsl(55, 52%, 86%)',   // wheat
    'hsl(160, 45%, 86%)',  // aqua
    'hsl(205, 48%, 86%)',  // powder blue
    'hsl(250, 48%, 86%)',  // bluebell
    'hsl(290, 48%, 86%)',  // violet
    'hsl(330, 48%, 86%)'   // blush
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
            color = `hsl(${hue}, 52%, 86%)`;
            while (usedColors.has(color)) {
                hue = (hue + 35) % 360;
                color = `hsl(${hue}, 52%, 86%)`;
            }
        }

        scheduleColorMap[key] = color;
        usedColors.add(color);
    });
}

function getScheduleColor(name) {
    if (!name) return '#e8f5e8';
    const key = name.toString().trim().toLowerCase();
    return scheduleColorMap[key] || '#e8f5e8';
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
        return;
    }

    const member = appState.activeScheduleMember;
    if (!member || !appState.scheduleMembers.includes(member)) {
        alert('개별 이름 탭을 선택한 상태에서 일정을 추가해주세요.');
        return;
    }

    const day = document.getElementById('scheduleDay').value;
    const startTime = document.getElementById('scheduleStartTime').value;
    const endTime = document.getElementById('scheduleEndTime').value;
    const activity = document.getElementById('scheduleActivity').value;

    if (startTime >= endTime) {
        alert('시작 시간은 끝 시간보다 빨라야 합니다.');
        return;
    }

    const schedule = {
        id: Date.now(),
        member,
        day,
        startTime,
        endTime,
        activity,
        createdAt: new Date().toISOString()
    };

    appState.schedules.push(schedule);
    saveLocalData();
    renderSchedules();
}

function renderSchedules() {
    try {
        const scheduleList = document.getElementById('scheduleList');
        const overlay = document.getElementById('scheduleOverlay');
        scheduleList.innerHTML = '';
        overlay.innerHTML = '';

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

        const timetable = document.createElement('table');
        timetable.className = 'timetable';
        
        const timeSlots = [];
        for (let hour = 8; hour <= 22; hour++) {
            timeSlots.push({ hour, minute: '00' });
        }

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.className = 'timetable-header';
        
        const timeHeader = document.createElement('th');
        timeHeader.className = 'timetable-time-header';
        timeHeader.textContent = '시간';
        headerRow.appendChild(timeHeader);
        
        daysOrder.forEach(day => {
            const dayHeader = document.createElement('th');
            dayHeader.className = 'timetable-day-header';
            dayHeader.textContent = day;
            headerRow.appendChild(dayHeader);
        });
        
        thead.appendChild(headerRow);
        timetable.appendChild(thead);

        const tbody = document.createElement('tbody');
        timeSlots.forEach(slot => {
            const row = document.createElement('tr');
            row.className = 'timetable-row';
            
            const timeCell = document.createElement('td');
            timeCell.className = 'timetable-time';
            timeCell.textContent = `${slot.hour.toString().padStart(2, '0')}:${slot.minute}`;
            row.appendChild(timeCell);
            
            daysOrder.forEach(() => {
                const cell = document.createElement('td');
                cell.className = 'timetable-slot';
                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });

        timetable.appendChild(tbody);
        scheduleList.appendChild(timetable);

        assignScheduleColors();

        // 카드 배치 (간단한 버전)
        setTimeout(() => {
            try {
                const headerHeight = timetable.querySelector('thead').offsetHeight;
                const bodyRows = timetable.querySelectorAll('tbody tr');
                const rowHeight = bodyRows[0] ? bodyRows[0].offsetHeight : 40;
                const headerCells = timetable.querySelectorAll('thead th');
                const overlayHeight = headerHeight + (bodyRows.length * rowHeight);
                
                overlay.style.height = `${overlayHeight}px`;
                overlay.style.width = `${timetable.offsetWidth}px`;
                overlay.style.left = `${timetable.offsetLeft}px`;
                overlay.style.right = 'auto';
                
                memberSchedules.forEach(schedule => {
                    const colIndex = daysOrder.indexOf(schedule.day);
                    if (colIndex < 0 || !headerCells[colIndex + 1]) return;

                    const startMinutes = parseTime(schedule.startTime);
                    const endMinutes = parseTime(schedule.endTime);
                    const top = headerHeight + ((startMinutes - 480) / 60) * rowHeight;
                    const height = ((endMinutes - startMinutes) / 60) * rowHeight;
                    
                    const headerCell = headerCells[colIndex + 1];
                    const left = headerCell.offsetLeft;
                    const width = headerCell.offsetWidth;
                    
                    const card = document.createElement('div');
                    card.className = 'schedule-card';
                    card.style.position = 'absolute';
                    card.style.top = `${top}px`;
                    card.style.left = `${left}px`;
                    card.style.width = `${width}px`;
                    card.style.height = `${height}px`;
                    card.style.backgroundColor = getScheduleColor(schedule.activity);
                    card.title = `${schedule.startTime} ~ ${schedule.endTime}`;
                    card.innerHTML = `
                        <div class="schedule-card-activity">${schedule.activity}</div>
                        <div class="schedule-card-time">${schedule.startTime} ~ ${schedule.endTime}</div>
                    `;
                    card.addEventListener('click', function() {
                        openScheduleModal(schedule);
                    });
                    overlay.appendChild(card);
                });
            } catch (e) {
                console.error('Card placement error:', e);
            }
        }, 100);
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
    const deleteBtn = document.getElementById('scheduleDeleteBtn');

    if (!modal) return;
    title.textContent = schedule.activity;
    day.textContent = `${schedule.day}요일`;
    time.textContent = `${schedule.startTime} ~ ${schedule.endTime}`;
    activity.textContent = schedule.activity;

    if (deleteBtn) {
        deleteBtn.onclick = () => {
            if (confirm('정말 이 시간표를 삭제하시겠습니까?')) {
                deleteSchedule(schedule.id);
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
    }
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
        
        todoDiv.innerHTML = `
            <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} 
                onchange="toggleTodo(${todo.id})">
            <div class="todo-content">
                <div class="todo-title">${todo.title}</div>
                <div class="todo-meta">
                    👤 ${todo.assignee} · 📅 ${todo.dueDate}
                </div>
            </div>
            <span class="todo-priority ${todo.priority}">${
                todo.priority === 'high' ? '높음' : 
                todo.priority === 'medium' ? '중간' : '낮음'
            }</span>
            <div class="event-actions">
                <button class="btn btn-small btn-danger" onclick="deleteTodo(${todo.id})">삭제</button>
            </div>
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
// 쇼핑 리스트 기능
// ============================================
function handleAddShopping() {
    const item = document.getElementById('shoppingItem').value;
    const price = parseFloat(document.getElementById('shoppingPrice').value) || 0;
    const qty = parseInt(document.getElementById('shoppingQty').value) || 1;
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

    if (appState.shopping.length === 0) {
        shoppingList.innerHTML = '<div class="empty-state">쇼핑 리스트가 비어있습니다.</div>';
        updateShoppingTotal();
        return;
    }

    appState.shopping.forEach(shop => {
        const shopDiv = document.createElement('div');
        shopDiv.className = `shopping-item ${shop.purchased ? 'completed' : ''}`;
        
        const totalPrice = shop.price * shop.qty;
        
        shopDiv.innerHTML = `
            <div class="shopping-item-content">
                <input type="checkbox" class="shopping-checkbox" ${shop.purchased ? 'checked' : ''} 
                    onchange="toggleShopping(${shop.id})">
                <div class="shopping-details">
                    <div class="shopping-item-name">${shop.item}</div>
                    <div class="shopping-item-category">${shop.category} · 수량: ${shop.qty}</div>
                </div>
            </div>
            <div class="shopping-price">₩${totalPrice.toLocaleString()}</div>
            <div class="event-actions">
                <button class="btn btn-small btn-danger" onclick="deleteShopping(${shop.id})">삭제</button>
            </div>
        `;
        
        shoppingList.appendChild(shopDiv);
    });

    updateShoppingTotal();
}

function toggleShopping(id) {
    const shop = appState.shopping.find(s => s.id === id);
    if (shop) {
        shop.purchased = !shop.purchased;
        saveLocalData();
        renderShopping();
    }
}

function deleteShopping(id) {
    if (confirm('정말 삭제하시겠습니까?')) {
        appState.shopping = appState.shopping.filter(s => s.id !== id);
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
// 위젯 통합 범사
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // 초기화
    await loadLocalData();
    initTabs();
    initSwipe();
    setupModals();
    initCalendar();
    initScheduleMembers();
    renderBulletins();
    renderSchedules();
    renderTodos();
    renderShopping();
    initWeather();
    setupInfoModal('scheduleDetailModal');

    document.getElementById('addScheduleMemberBtn').addEventListener('click', addScheduleMember);

    // 날씨 입력
    const weatherInput = document.getElementById('weatherLocation');
    const weatherSearchBtn = document.getElementById('weatherSearchBtn');
    
    if (weatherInput && weatherSearchBtn) {
        weatherInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                fetchWeather(weatherInput.value);
            }
        });
        
        weatherSearchBtn.addEventListener('click', () => {
            fetchWeather(weatherInput.value);
        });
    }
});

// ============================================
// 날씨 기능
// ============================================
function initWeather() {
    // 현재 위치 기반 날씨 우선 조회 → 실패 시 저장된 위치 또는 기본값 사용
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                fetchWeatherByCoords(position.coords.latitude, position.coords.longitude);
            },
            () => {
                // 권한 거부 or 오류 → 폴백
                fetchWeather(localStorage.getItem('weatherLocation') || '서울');
            },
            { timeout: 10000, maximumAge: 300000 }
        );
    } else {
        fetchWeather(localStorage.getItem('weatherLocation') || '서울');
    }
}

async function fetchWeatherByCoords(lat, lon) {
    const container = document.getElementById('weatherContainer');
    container.innerHTML = '<div class="weather-loading">현재 위치 날씨를 불러오는 중...</div>';

    try {
        // 역지오코딩으로 지역명 조회 (Nominatim)
        const geoResp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`,
            { headers: { 'Accept-Language': 'ko' } }
        );
        const geoData = await geoResp.json();
        const addr = geoData.address || {};
        const placeName = addr.city || addr.town || addr.village || addr.county || '현재 위치';
        const place = {
            name:      placeName,
            admin1:    addr.state || '',
            country:   addr.country || '',
            latitude:  lat,
            longitude: lon,
        };

        // 날씨 데이터 조회
        const weatherResp = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,weather_code` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia/Seoul`
        );
        const weatherData = await weatherResp.json();

        if (weatherData.error) throw new Error(weatherData.error);
        renderWeather(weatherData, place);
    } catch (e) {
        console.error('현재 위치 날씨 조회 실패:', e);
        fetchWeather(localStorage.getItem('weatherLocation') || '서울');
    }
}

async function fetchWeather(location) {
    const container = document.getElementById('weatherContainer');
    container.innerHTML = '<div class="weather-loading">날씨 정보를 불러오는 중...</div>';

    try {
        // Open-Meteo API 사용 (무료, API 키 불필요)
        const geoResponse = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&language=ko`
        );
        const geoData = await geoResponse.json();
        console.log('지오코딩 응답:', geoData);

        if (!geoData.results || geoData.results.length === 0) {
            container.innerHTML = '<div class="weather-error">도시를 찾을 수 없습니다. 다시 입력해주세요.</div>';
            return;
        }

        const place = geoData.results[0];
        console.log('선택된 위치:', place);
        
        // 현재 + 일별 날씨 데이터 요청
        const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia/Seoul`
        );
        const weatherData = await weatherResponse.json();
        console.log('날씨 API 응답:', weatherData);

        if (weatherData.error) {
            console.error('API 에러:', weatherData.error);
            container.innerHTML = '<div class="weather-error">API 요청 실패: ' + weatherData.error + '</div>';
            return;
        }

        if (!weatherData.current) {
            console.error('날씨 데이터 형식 오류:', weatherData);
            container.innerHTML = '<div class="weather-error">날씨 데이터를 파싱할 수 없습니다.</div>';
            return;
        }

        localStorage.setItem('weatherLocation', location);
        renderWeather(weatherData, place);
    } catch (error) {
        container.innerHTML = '<div class="weather-error">날씨 정보를 가져올 수 없습니다.</div>';
        console.error('날씨 에러:', error);
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
    const daily = data.daily;

    const weatherDescription = getWeatherDescription(current.weather_code);
    const weatherIcon = getWeatherIcon(current.weather_code);

    // 일별 예보
    let dailyForecast = '';
    if (daily && daily.time && daily.weather_code) {
        for (let i = 1; i < 5 && i < daily.time.length; i++) {
            const icon = getWeatherIcon(daily.weather_code[i]);
            const maxTemp = daily.temperature_2m_max ? daily.temperature_2m_max[i] : '--';
            const minTemp = daily.temperature_2m_min ? daily.temperature_2m_min[i] : '--';
            dailyForecast += `
                <div class="forecast-item">
                    <div class="forecast-day">${new Date(daily.time[i]).toLocaleDateString('ko-KR', {weekday: 'short'})}</div>
                    <div class="forecast-icon">${icon}</div>
                    <div class="forecast-temp">${maxTemp}°/${minTemp}°</div>
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="weather-main">
            <div class="weather-info">
                <div class="weather-icon">${weatherIcon}</div>
                <div class="weather-details">
                    <div class="weather-location">${place.name}, ${place.admin1 || place.country}</div>
                    <div class="weather-temp">${current.temperature_2m}°C</div>
                    <div class="weather-description">${weatherDescription}</div>
                </div>
            </div>
            
            <div class="weather-section">
                <div class="weather-section-title">📅 일별 예보</div>
                <div class="weather-forecast">
                    ${dailyForecast}
                </div>
            </div>
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
