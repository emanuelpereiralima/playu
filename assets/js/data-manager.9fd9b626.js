// assets/js/data-manager.js

/**
 * Busca jogos públicos (Disponíveis ou Pausados) do Firestore.
 * Ignora jogos com status 'draft' (Rascunho).
 */
async function getPublicGames() {
    // Garante que o Firebase foi inicializado
    const db = window.db || firebase.firestore();
    const games = [];

    try {
        // Busca todos os jogos
        // Dica: Em um app real com milhares de jogos, usaríamos .where('status', '!=', 'draft')
        // mas isso exige criar um índice no Firebase Console. Vamos filtrar no JS por enquanto para facilitar.
        const snapshot = await db.collection('games').get();
        
        if (snapshot.empty) {
            console.log("Nenhum jogo encontrado no banco de dados.");
            return [];
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            
            // FILTRO DE SEGURANÇA: Só mostra se NÃO for rascunho
            if (data.status !== 'draft') {
                games.push({
                    id: doc.id,
                    ...data
                });
            }
        });

        return games;

    } catch (error) {
        console.error("Erro ao buscar jogos públicos:", error);
        return [];
    }
}