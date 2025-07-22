document.addEventListener('DOMContentLoaded', () => {
    // Pega o ID do jogo da URL
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('id');

    // Encontra os dados do jogo correspondente
    const gameData = GAMES_DATA.find(game => game.id === gameId);

    const detailsContainer = document.getElementById('game-details-container');
    const notFoundContainer = document.getElementById('game-not-found');

    if (!gameData) {
        // Se o jogo não for encontrado, mostra mensagem de erro
        if(detailsContainer) detailsContainer.style.display = 'none';
        if(notFoundContainer) notFoundContainer.style.display = 'block';
        return;
    }

    // Preenche as informações básicas do jogo
    document.title = `${gameData.name} - play.u`;
    document.getElementById('game-title').textContent = gameData.name;
    document.getElementById('game-description').textContent = gameData.fullDescription;
    document.getElementById('session-duration').textContent = gameData.sessionDuration;

    // Preenche a galeria de imagens
    const gallery = document.getElementById('game-gallery');
    gameData.galleryImages.forEach(imageUrl => {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = `Imagem do jogo ${gameData.name}`;
        gallery.appendChild(img);
    });

    // --- LÓGICA DO CALENDÁRIO ---
    const monthYearHeader = document.getElementById('month-year-header');
    const calendarGrid = document.getElementById('calendar-grid');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const timeSlotsContainer = document.getElementById('time-slots-container');
    const instructionText = document.getElementById('instruction-text');
    const confirmationSection = document.getElementById('confirmation-section');
    const selectionSummary = document.getElementById('selection-summary');
    const confirmBookingBtn = document.getElementById('confirm-booking-btn');

    let currentDate = new Date();
    currentDate.setDate(1); // Garante que estamos sempre no primeiro dia do mês
    let selectedDateStr = null;
    let selectedTimeStr = null;

    function renderCalendar() {
        calendarGrid.innerHTML = '';
        timeSlotsContainer.innerHTML = '';
        instructionText.textContent = 'Selecione um dia disponível no calendário.';
        confirmationSection.style.display = 'none';
        
        const month = currentDate.getMonth();
        const year = currentDate.getFullYear();

        monthYearHeader.textContent = `${new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(currentDate)}`;
        
        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Preenche os dias vazios no início do mês
        for (let i = 0; i < firstDayOfMonth; i++) {
            calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day"></div>');
        }

        // Preenche os dias do mês
        for (let day = 1; day <= daysInMonth; day++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.textContent = day;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Verifica se o dia está disponível
            if (gameData.availability[dateStr] && gameData.availability[dateStr].length > 0) {
                dayDiv.classList.add('available');
                dayDiv.dataset.date = dateStr;

                dayDiv.addEventListener('click', () => {
                    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
                    dayDiv.classList.add('selected');
                    selectedDateStr = dateStr;
                    selectedTimeStr = null; // Reseta a hora ao trocar de dia
                    renderTimeSlots(dateStr);
                });
            }
            calendarGrid.appendChild(dayDiv);
        }
    }

    function renderTimeSlots(dateStr) {
        timeSlotsContainer.innerHTML = '';
        instructionText.textContent = 'Agora, escolha um horário abaixo.';
        confirmationSection.style.display = 'none';

        const times = gameData.availability[dateStr];
        times.forEach(time => {
            const timeBtn = document.createElement('button');
            timeBtn.className = 'time-slot-btn';
            timeBtn.textContent = time;

            timeBtn.addEventListener('click', () => {
                document.querySelectorAll('.time-slot-btn.selected').forEach(el => el.classList.remove('selected'));
                timeBtn.classList.add('selected');
                selectedTimeStr = time;
                showConfirmation();
            });
            timeSlotsContainer.appendChild(timeBtn);
        });
    }

    function showConfirmation() {
        const formattedDate = new Intl.DateTimeFormat('pt-BR').format(new Date(selectedDateStr.replace(/-/g, '/')));
        selectionSummary.textContent = `Você selecionou o dia ${formattedDate} às ${selectedTimeStr}.`;
        confirmationSection.style.display = 'block';
    }

    confirmBookingBtn.addEventListener('click', () => {
        if (selectedDateStr && selectedTimeStr) {
            alert(`Agendamento para ${gameData.name} confirmado!\nDia: ${selectedDateStr}\nHora: ${selectedTimeStr}\n\n(Em um site real, você seria redirecionado para o pagamento.)`);
        }
    });

    prevMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
    });

    renderCalendar(); // Renderiza o calendário pela primeira vez
});