document.addEventListener('DOMContentLoaded', () => {
    // Este script só roda se o modal de disponibilidade existir
    const modal = document.getElementById('availability-modal');
    if (!modal) return;

    // Seleção de todos os elementos do modal
    const gameNameHeader = document.getElementById('availability-game-name');
    const monthYearHeader = document.getElementById('month-year-header-modal');
    const calendarGrid = document.getElementById('calendar-grid-modal');
    const prevMonthBtn = document.getElementById('prev-month-btn-modal');
    const nextMonthBtn = document.getElementById('next-month-btn-modal');
    const selectedDateHeader = document.getElementById('selected-date-header');
    const timeSlotsList = document.getElementById('time-slots-list');
    const newTimeInput = document.getElementById('new-time-input');
    const addTimeBtn = document.getElementById('add-time-btn');
    const saveDayBtn = document.getElementById('save-day-btn');
    const closeModalBtn = document.getElementById('close-availability-modal-btn');
    const messageEl = document.getElementById('availability-message');
    
    let currentGame = null;
    let selectedDateStr = null;
    let calendarDate = new Date();
    
    // Função global para ser chamada pelos scripts do painel
    window.openAvailabilityModal = (gameId) => {
        const allGames = JSON.parse(localStorage.getItem('games') || '[]');
        currentGame = allGames.find(g => g.id === gameId);
        if (!currentGame) return;

        gameNameHeader.textContent = `Gerenciar Disponibilidade: ${currentGame.name}`;
        calendarDate = new Date();
        selectedDateStr = null;
        timeSlotsList.innerHTML = '<p class="form-hint">Selecione um dia no calendário.</p>';
        selectedDateHeader.textContent = 'Nenhum dia selecionado';
        
        renderAvailabilityCalendar();
        modal.showModal();
    };

    function renderAvailabilityCalendar() {
        calendarGrid.innerHTML = '';
        const month = calendarDate.getMonth();
        const year = calendarDate.getFullYear();
        monthYearHeader.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(calendarDate);
        
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDayOfMonth; i++) calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day"></div>');

        for (let day = 1; day <= daysInMonth; day++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.textContent = day;
            dayDiv.style.cursor = 'pointer';

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            if (currentGame.availability && currentGame.availability[dateStr] && currentGame.availability[dateStr].length > 0) {
                dayDiv.classList.add('has-schedule');
            }

            dayDiv.addEventListener('click', () => {
                selectedDateStr = dateStr;
                document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
                dayDiv.classList.add('selected');
                renderTimeSlotsForDate(dateStr);
            });
            calendarGrid.appendChild(dayDiv);
        }
    }

    function renderTimeSlotsForDate(dateStr) {
        selectedDateHeader.textContent = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date(dateStr.replace(/-/g, '/')));
        timeSlotsList.innerHTML = '';
        const times = (currentGame.availability && currentGame.availability[dateStr]) || [];
        
        if (times.length === 0) {
            timeSlotsList.innerHTML = '<p class="form-hint">Nenhum horário cadastrado para este dia.</p>';
        } else {
            times.forEach(renderTimeSlotItem);
        }
    }

    function renderTimeSlotItem(time) {
        if (timeSlotsList.querySelector('p')) timeSlotsList.innerHTML = ''; // Limpa a mensagem inicial
        const item = document.createElement('div');
        item.className = 'time-slot-item';
        item.innerHTML = `<span>${time}</span><button class="remove-time-btn" data-time="${time}">×</button>`;
        item.querySelector('.remove-time-btn').addEventListener('click', (e) => e.target.parentElement.remove());
        timeSlotsList.appendChild(item);
    }
    
    addTimeBtn.addEventListener('click', () => {
        if (newTimeInput.value && selectedDateStr) {
            renderTimeSlotItem(newTimeInput.value);
            newTimeInput.value = '';
        } else if (!selectedDateStr) {
            alert('Por favor, selecione um dia no calendário primeiro.');
        }
    });

    saveDayBtn.addEventListener('click', () => {
        if (!selectedDateStr) return;
        
        const allGames = JSON.parse(localStorage.getItem('games') || '[]');
        const gameIndex = allGames.findIndex(g => g.id === currentGame.id);
        if (gameIndex === -1) return;

        const newTimes = Array.from(timeSlotsList.querySelectorAll('.time-slot-item span')).map(span => span.textContent).sort();
        
        if (!allGames[gameIndex].availability) allGames[gameIndex].availability = {};
        allGames[gameIndex].availability[selectedDateStr] = newTimes;

        localStorage.setItem('games', JSON.stringify(allGames));
        currentGame = allGames[gameIndex]; // Atualiza o jogo atual em memória

        messageEl.textContent = `Horários para ${selectedDateHeader.textContent} salvos com sucesso!`;
        messageEl.style.display = 'block';
        setTimeout(() => messageEl.style.display = 'none', 3000);
        renderAvailabilityCalendar(); // Re-renderiza para atualizar o highlight
    });

    prevMonthBtn.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderAvailabilityCalendar(); });
    nextMonthBtn.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderAvailabilityCalendar(); });
    closeModalBtn.addEventListener('click', () => modal.close());
});