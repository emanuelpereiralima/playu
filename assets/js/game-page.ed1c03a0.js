// --- SINCRONIZAÇÃO AUTOMÁTICA EM TEMPO REAL ---
// Escuta por mudanças no localStorage feitas por outras abas (ex: painel de admin)
window.addEventListener('storage', (event) => {
    // Se os jogos ou agendamentos mudarem, recarrega a página.
    // Esta é a forma mais simples e segura de garantir que os dados de disponibilidade estejam sempre atualizados.
    if (event.key === 'games' || event.key === 'bookings') {
        console.log('Dados atualizados em outra aba. Recarregando a página...');
        window.location.reload();
    }
});


document.addEventListener('DOMContentLoaded', () => {
    // --- 1. CARREGAMENTO E VALIDAÇÃO DOS DADOS DO JOGO ---
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('id');

    // Usa a função centralizada do data-manager.js para buscar os jogos
    const allGames = getGames(); 
    const gameData = allGames.find(game => game.id === gameId);

    const detailsContainer = document.getElementById('game-details-container');
    const notFoundContainer = document.getElementById('game-not-found');
    const pausedMessageContainer = document.getElementById('paused-message');

    // Validações de acesso
    if (!gameData || gameData.status !== 'approved') {
        if(detailsContainer) detailsContainer.style.display = 'none';
        if(notFoundContainer) notFoundContainer.style.display = 'block';
        return;
    }
    if (gameData.isPaused) {
        if(detailsContainer) detailsContainer.style.display = 'none';
        if(pausedMessageContainer) pausedMessageContainer.style.display = 'block';
        document.title = `${gameData.name} (Pausado) - play.u`;
        return;
    }

    // --- 2. PREENCHIMENTO DO CONTEÚDO DA PÁGINA ---
    document.title = `${gameData.name} - play.u`;
    document.getElementById('game-title').textContent = gameData.name;
    document.getElementById('game-description').textContent = gameData.fullDescription;
    document.getElementById('session-duration').textContent = gameData.sessionDuration;

    const gallery = document.getElementById('game-gallery');
    if(gallery){
        gallery.innerHTML = ''; // Limpa a galeria antes de adicionar
        gameData.galleryImages.forEach(imageUrl => {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = `Imagem do jogo ${gameData.name}`;
            gallery.appendChild(img);
        });
    }

    // --- 3. LÓGICA DO CALENDÁRIO DE AGENDAMENTO ---
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
    currentDate.setDate(1);
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

        for (let i = 0; i < firstDayOfMonth; i++) {
            calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day"></div>');
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.textContent = day;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            if (gameData.availability && gameData.availability[dateStr] && gameData.availability[dateStr].length > 0) {
                dayDiv.classList.add('available');
                dayDiv.dataset.date = dateStr;

                dayDiv.addEventListener('click', () => {
                    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));
                    dayDiv.classList.add('selected');
                    selectedDateStr = dateStr;
                    selectedTimeStr = null;
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

        const times = (gameData.availability && gameData.availability[dateStr]) || [];
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
            const newBooking = {
                bookingId: Date.now().toString(),
                gameId: gameData.id,
                gameName: gameData.name,
                date: selectedDateStr,
                time: selectedTimeStr,
                bookedBy: 'Player123'
            };

            let allBookings = getBookings();
            allBookings.push(newBooking);
            saveBookings(allBookings);

            let allGames = getGames();
            const gameIndex = allGames.findIndex(g => g.id === gameData.id);
            if (gameIndex > -1) {
                const availableTimes = allGames[gameIndex].availability[selectedDateStr];
                const updatedTimes = availableTimes.filter(t => t !== selectedTimeStr);
                allGames[gameIndex].availability[selectedDateStr] = updatedTimes;
                saveGames(allGames);
            }

            alert(`Agendamento para ${gameData.name} confirmado!\nDia: ${selectedDateStr}\nHora: ${selectedTimeStr}`);
            window.location.reload();
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

    // Renderização inicial do calendário
    renderCalendar();
});