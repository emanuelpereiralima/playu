// assets/js/data-manager.js (NOVA VERSÃO FIREBASE)

/**
 * Gerenciador de Dados (Conectado ao Firebase)
 * * Este script agora é responsável por buscar dados do Firestore
 * e fornecê-los de forma assíncrona.
 */

// Referências diretas (assumindo que firebase-config.js já rodou)
const db = firebase.firestore();

/**
 * Busca todos os jogos publicados na coleção 'games'.
 * * @returns {Promise<Array<Object>>} Uma promessa que resolve para um array de jogos.
 */
async function getAllGames() {
    const games = [];
    try {
        // Busca na coleção 'games' do Firestore
        const snapshot = await db.collection('games').get();
        
        if (snapshot.empty) {
            console.warn("Nenhum jogo encontrado na coleção 'games'.");
            return [];
        }

        snapshot.forEach(doc => {
            games.push({
                id: doc.id, // Adiciona o ID do documento ao objeto
                ...doc.data() // Adiciona o restante dos dados (title, description, etc.)
            });
        });

        console.log('Jogos carregados do Firestore:', games);
        return games;

    } catch (error) {
        console.error("Erro ao buscar jogos do Firestore:", error);
        return []; // Retorna um array vazio em caso de erro
    }
}

/**
 * Busca um único jogo pelo seu ID.
 * * @param {string} gameId O ID do documento do jogo no Firestore.
 * @returns {Promise<Object|null>} Uma promessa que resolve para o objeto do jogo ou nulo.
 */
async function getGameById(gameId) {
    try {
        const doc = await db.collection('games').doc(gameId).get();

        if (!doc.exists) {
            console.warn(`Jogo com ID "${gameId}" não encontrado.`);
            return null;
        }

        return { id: doc.id, ...doc.data() };

    } catch (error) {
        console.error("Erro ao buscar jogo por ID:", error);
        return null;
    }
}

// Nota: As funções antigas como 'initData()' ou 'getUsers()'
// que dependiam de 'userdata.js' e 'gamedata.js'
// agora estão obsoletas ou são tratadas por outros scripts (como login.js).