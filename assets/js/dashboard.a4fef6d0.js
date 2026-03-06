// =================================================================
// DASHBOARD.JS - COM EDIÇÃO DE NOME E CORREÇÕES
// =================================================================

// Variáveis de Estado
let allBookings = []; 
let isShowingHistory = false; 

document.addEventListener('DOMContentLoaded', () => {
    // Instancia Auth localmente
    const auth = firebase.auth();
    
    // 1. Monitora Login
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            loadUserProfile(user);
            await loadUserBookings(user);
        } else {
            window.location.href = 'login.html';
        }
    });

    // 2. Botão Logout
    const logoutBtn = document.getElementById('dash-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut().then(() => window.location.href = 'index.html');
        });
    }
});

// =================================================================
// A. PERFIL DO USUÁRIO (COM UPDATE)
// =================================================================
function loadUserProfile(user) {
    const nameEl = document.getElementById('user-name-display');
    const emailEl = document.getElementById('user-email-display');
    const avatarEl = document.getElementById('user-avatar-display');

    // Se o nome estiver vazio (null), usa "Aventureiro"
    if (nameEl) nameEl.textContent = user.displayName || "Aventureiro";
    if (emailEl) emailEl.textContent = user.email;
    if (avatarEl && user.photoURL) avatarEl.src = user.photoURL;
}

// --- LÓGICA DO MODAL ---
window.openEditModal = () => {
    const modal = document.getElementById('edit-modal');
    const input = document.getElementById('new-name-input');
    const user = firebase.auth().currentUser;

    if (input && user) input.value = user.displayName || '';
    if (modal) modal.classList.add('active');
};

window.closeEditModal = () => {
    const modal = document.getElementById('edit-modal');
    if (modal) modal.classList.remove('active');
};

window.saveProfileName = async () => {
    const input = document.getElementById('new-name-input');
    const newName = input.value.trim();
    const saveBtn = document.querySelector('.modal-actions button:last-child'); // Botão Salvar

    if (!newName) return alert("Por favor, digite um nome.");

    try {
        saveBtn.innerText = "Salvando...";
        const user = firebase.auth().currentUser;

        // Atualiza no Firebase Auth
        await user.updateProfile({
            displayName: newName
        });

        // Atualiza na tela imediatamente
        document.getElementById('user-name-display').textContent = newName;
        
        closeEditModal();
        alert("Nome atualizado com sucesso!");

    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        alert("Erro ao atualizar. Tente novamente.");
    } finally {
        saveBtn.innerText = "Salvar";
    }
};


// =================================================================
// B. AGENDAMENTOS (LÓGICA CORRIGIDA)
// =================================================================
async function loadUserBookings(user) {
    const db = firebase.firestore();
    const listContainer = document.getElementById('user-bookings-list');
    
    if (!listContainer) return;

    try {
        // ATENÇÃO: Se der erro de índice aqui, clique no link do console!
        const snapshot = await db.collection('bookings')
            .where('userId', '==', user.uid)
            .orderBy('date', 'desc')
            .get();

        if (snapshot.empty) {
            renderEmptyState(listContainer);
            return;
        }

        allBookings = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderBookingsList();

    } catch (error) {
        console.error("Erro ao carregar agendamentos:", error);
        
        // Mensagem amigável se for erro de índice
        if (error.code === 'failed-precondition') {
             console.warn("⚠️ FALTA O ÍNDICE NO FIREBASE. CLIQUE NO LINK ACIMA NO CONSOLE PARA CRIAR.");
        }

        listContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Carregando agendamentos... (Se demorar, verifique o console)</p>';
    }
}

function renderEmptyState(container) {
    container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 10px;">
            <ion-icon name="calendar-outline" style="font-size: 3rem; margin-bottom: 10px;"></ion-icon>
            <p>Você ainda não tem agendamentos.</p>
            <a href="index.html" class="submit-btn small-btn" style="margin-top: 10px;">Explorar Jogos</a>
        </div>
    `;
}

// =================================================================
// C. CONTROLE DE VISUALIZAÇÃO
// =================================================================
window.toggleBookingView = () => {
    isShowingHistory = !isShowingHistory;
    
    const btn = document.getElementById('toggle-history-btn');
    if (btn) {
        if (isShowingHistory) {
            btn.innerHTML = '<ion-icon name="arrow-undo-outline" style="vertical-align: middle; margin-right: 5px;"></ion-icon> Ver Futuros';
            btn.style.borderColor = 'var(--primary-color)';
            btn.style.color = 'var(--primary-color)';
        } else {
            btn.innerHTML = '<ion-icon name="time-outline" style="vertical-align: middle; margin-right: 5px;"></ion-icon> Ver Histórico';
            btn.style.borderColor = 'var(--border-color)';
            btn.style.color = 'var(--text-muted)';
        }
    }
    renderBookingsList();
};

function renderBookingsList() {
    const listContainer = document.getElementById('user-bookings-list');
    const now = new Date();
    now.setHours(0,0,0,0);

    const filteredList = allBookings.filter(booking => {
        const parts = booking.date.split('-');
        const bookingDate = new Date(parts[0], parts[1] - 1, parts[2]);
        
        return isShowingHistory ? (bookingDate < now) : (bookingDate >= now);
    });

    if (filteredList.length === 0) {
        listContainer.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">
                ${isShowingHistory ? 'Nenhum agendamento antigo.' : 'Nenhum agendamento futuro.'}
            </div>
        `;
        return;
    }

    listContainer.innerHTML = '';

    filteredList.forEach(booking => {
        const dateParts = booking.date.split('-');
        const dateFormatted = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        const isHistoryItem = isShowingHistory;

        const card = document.createElement('div');
        card.className = 'booking-card';
        card.style.cssText = `
            background: var(--card-bg); 
            border: 1px solid var(--border-color); 
            border-radius: 8px; 
            padding: 15px; 
            display: flex; gap: 15px; align-items: center; margin-bottom: 10px;
            opacity: ${isHistoryItem ? '0.6' : '1'};
        `;

        card.innerHTML = `
            <img src="${booking.cover || 'assets/images/logo.png'}" alt="Capa" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px;">
            <div style="flex: 1;">
                <h4 style="margin: 0; color: var(--text-color); font-size: 1rem;">${booking.gameName}</h4>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 5px;">
                    <ion-icon name="calendar-outline"></ion-icon> ${dateFormatted} 
                    <span style="margin: 0 5px;">•</span> 
                    <ion-icon name="time-outline"></ion-icon> ${booking.time}
                </div>
            </div>
            <div>
                ${isHistoryItem 
                    ? `<span style="font-size: 0.8rem; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px;">Finalizado</span>` 
                    : `<button onclick="window.location.href='sala-host.html?sessionId=${booking.sessionId}'" class="submit-btn small-btn" style="padding: 8px 15px; font-size: 0.85rem; cursor: pointer;">Entrar</button>`
                }
            </div>
        `;
        listContainer.appendChild(card);
    });
}