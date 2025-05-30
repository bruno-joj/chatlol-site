// Modificar a inicialização do som de notificação
window.notificationSound = new Audio('notification.mp3');
window.notificationSound.load(); // Pré-carregar o áudio

// Variável global para controlar a aba ativa
let currentActiveTab = 'public';
let updateInterval;
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 1000; // Intervalo mínimo de 1 segundo entre notificações

// Variáveis de controle para evitar atualizações excessivas
let messageCache = {
    'public': new Map(),
    private: {}
};

// Para controlar quais mensagens já foram notificadas
let notifiedMessageIds = new Set();

// Registrar o timestamp da última resposta de cada endpoint
let lastServerResponse = {
    'public': Date.now(),
    'users': Date.now()
};

// Controle para evitar processamento de dados antigos
let messageVersions = {
    'public': 0,
    private: {}
};

// Inicializar um contador para controlar a sincronização completa
let fullSyncCounter = 0;
const FULL_SYNC_INTERVAL = 24; // A cada 24 ciclos (2 minutos com polling a cada 5s)

// Variáveis globais para controle de erros
let consecutiveErrorCount = 0;
let backoffTimeout = 5000; // Intervalo inicial de 5 segundos
const MAX_BACKOFF = 60000; // Máximo de 1 minuto entre tentativas

// Flag para controlar chamadas simultâneas
let isLoadingPublicMessages = false;
let isLoadingPrivateMessages = {};

// Função para tocar o som de notificação com melhor tratamento de erros e controle de frequência
function playNotificationSound(messageId) {
    // Verificar se essa mensagem já foi notificada
    if (notifiedMessageIds.has(messageId)) {
        return;
    }
    
    // Registrar que esta mensagem já foi notificada
    notifiedMessageIds.add(messageId);
    
    const now = Date.now();
    if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) {
        return;
    }
    
    lastNotificationTime = now;
    
    try {
        const notificationSound = document.getElementById('notificationSound');
        if (notificationSound) {
            // Resetar o áudio completamente
            notificationSound.pause();
            notificationSound.currentTime = 0;
            
            // Tentar reproduzir com tratamento de erros
            notificationSound.play().catch(error => {
                // Tentar usar o áudio carregado globalmente como fallback
                try {
                    window.notificationSound.currentTime = 0;
                    window.notificationSound.play();
                } catch (globalAudioError) {
                    // Silenciar erro
                }
            });
        } else {
            window.notificationSound.play();
        }
    } catch (e) {
        // Silenciar erro
    }
}

// Função auxiliar para aplicar efeito de explosão em uma mensagem e removê-la após 10 segundos
function explodeAndRemoveMessage(messageElement) {
    if (!messageElement || messageElement.classList.contains('exploding')) {
        // Elemento não existe ou já está sendo removido
        return;
    }
    
    // Marcar como explodindo para evitar processamento duplicado
    messageElement.classList.add('exploding');
    const messageId = messageElement.dataset.id;
    
    // Aguardar 30 segundos antes de remover completamente
    setTimeout(() => {
        // Verificar se o elemento ainda existe na DOM antes de tentar removê-lo
        if (messageElement.parentNode) {
            messageElement.remove();
        }
    }, 30000); // 30 segundos
}

// Versão completamente nova da função de sincronização
function syncMessages(container, newMessages, isPrivate = false, conversationId = 'public', responseTimestamp = Date.now()) {
    if (!container) {
        return;
    }
    
    try {
        // Obter o cache correto para esta conversa
        let cache;
        if (isPrivate) {
            if (!messageCache.private[conversationId]) {
                messageCache.private[conversationId] = new Map();
                messageVersions.private[conversationId] = 0;
            }
            cache = messageCache.private[conversationId];
        } else {
            cache = messageCache['public'];
            
            // Verificar se esta resposta é mais recente que a última processada
            if (responseTimestamp < lastServerResponse[conversationId]) {
                return;
            }
            
            // Atualizar timestamp da última resposta
            lastServerResponse[conversationId] = responseTimestamp;
        }
        
        // Incrementar a versão dos dados
        const currentVersion = isPrivate ? 
            ++messageVersions.private[conversationId] : 
            ++messageVersions['public'];
        
        // Criar um conjunto com os IDs das mensagens do servidor
        const serverMessageIds = new Set(newMessages.map(msg => msg.id));
        
        // Se não há nenhuma mensagem no servidor mas temos mensagens no cache,
        // não remover as mensagens locais exceto durante uma sincronização completa
        if (newMessages.length === 0 && cache.size > 0 && fullSyncCounter < FULL_SYNC_INTERVAL - 1) {
            return;
        }
        
        // Verificar se há mensagens novas ou mensagens a serem removidas
        let hasNewMessages = false;
        let messagesToRemove = [];
        let newMessageIds = [];
        
        // Identificar mensagens a serem removidas (estão no cache mas não no servidor)
        // Limitar a remoção a apenas mensagens antigas para manter mais mensagens visíveis
        const maxMessagesToRemove = 5; // Limitar remoção a 5 mensagens por vez
        let removeCount = 0;
        
        for (const [id, msg] of cache.entries()) {
            if (!serverMessageIds.has(id)) {
                // Limitar número de mensagens removidas por vez
                if (removeCount < maxMessagesToRemove) {
                    messagesToRemove.push(id);
                    removeCount++;
                }
            }
        }
        
        // Identificar mensagens novas (estão no servidor mas não no cache)
        for (const msg of newMessages) {
            // Verificar se a mensagem tem ID e se não está no cache
            if (msg.id && !cache.has(msg.id)) {
                // Verificar se a mensagem tem os campos mínimos necessários
                if (msg.message && (msg.nickname || (isPrivate && msg.from_nickname))) {
                    hasNewMessages = true;
                    newMessageIds.push(msg.id);
                    cache.set(msg.id, msg);
                }
            }
        }
        
        // Se não há mudanças (nada para adicionar ou remover), não alterar o DOM
        if (!hasNewMessages && messagesToRemove.length === 0) {
            return;
        }
        
        // Se temos mensagens a remover, marcá-las para explosão no DOM
        if (hasNewMessages) {
            
            // Ordenar todas as mensagens do cache por ID
            const allMessages = Array.from(cache.values())
                .sort((a, b) => parseInt(a.id) - parseInt(b.id));
            
            // Preservar scroll se já estava no final
            const wasScrolledToBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;
            
            // Para cada mensagem nova, verificar se ela já existe no DOM
            for (const id of newMessageIds) {
                const msg = cache.get(id);
                if (!msg) {
                    continue; // Verificação de segurança
                }
                
                // Verificar se a mensagem já existe no DOM
                const existingMsg = container.querySelector(`.message[data-id="${id}"]`);
                if (!existingMsg) {
                    const msgElement = createMessageElement(msg, isPrivate);
                    
                    // Adicionar a nova mensagem ao DOM
                    container.appendChild(msgElement);
                    
                    // Se não é do usuário atual, tocar notificação
                    const isFromCurrentUser = isPrivate ? 
                        (msg.from_nickname === currentUser) : 
                        (msg.nickname === currentUser);
                        
                    if (!isFromCurrentUser && currentActiveTab === conversationId) {
                        playNotificationSound(id);
                    }
                }
            }
            
            // Rolar para o final se estava no final antes ou se há mensagens novas
            if (wasScrolledToBottom || newMessageIds.length > 0) {
                container.scrollTop = container.scrollHeight;
            }
        }
        
        // Remover mensagens que não estão mais no servidor
        for (const id of messagesToRemove) {
            const msgElement = container.querySelector(`.message[data-id="${id}"]`);
            if (msgElement) {
                // Aplicar efeito de explosão e remover após um atraso
                explodeAndRemoveMessage(msgElement);
            }
            
            // Remover do cache local
            cache.delete(id);
        }
    } catch (error) {
        // Silenciar erro
    }
}

// Função para criar elemento de mensagem (ajustada para público e privado)
function createMessageElement(message, isPrivate = false) {
    try {
        // Verificação de segurança: toda mensagem precisa ter um ID
        if (!message.id) {
            return null;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message';
        messageDiv.dataset.id = message.id;
        
        let username = '';
        if (isPrivate) {
            username = message.from_nickname || message.nickname || 'Usuário';
        } else {
            username = message.nickname || 'Usuário';
        }
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="username">${username}</span>
                <span class="timestamp">${message.created_at || 'agora'}</span>
            </div>
            <div class="message-content">${message.message || ''}</div>
        `;
        return messageDiv;
    } catch (error) {
        // Retornar um elemento simples como fallback
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'message error';
        fallbackDiv.textContent = 'Erro ao exibir mensagem';
        return fallbackDiv;
    }
}

// Função auxiliar para tratar respostas 401 Unauthorized
async function handleApiResponse(response, actionDescription) {
    if (response.status === 401) {
        if (updateInterval) {
            clearInterval(updateInterval);
        }
        setTimeout(() => {
            window.location.href = 'login.php';
        }, 500);
        return null;
    }
    
    if (response.status === 400) {
        try {
            const errorText = await response.text();
            console.error(`[ERRO] Detalhes do erro 400: ${errorText || 'Sem detalhes'}`);
            console.error(`[ERRO] URL da requisição: ${response.url}`);
        } catch (e) {
            console.error('[ERRO] Não foi possível ler detalhes do erro 400.');
        }
        
        return [];
    }
    
    if (!response.ok) {
        throw new Error(`Resposta não-ok do servidor: ${response.status} ${response.statusText}`);
    }
    
    try {
        // Verificar se a resposta está vazia
        const text = await response.text();
        if (!text || text.trim() === '') {
            return [];
        }
        
        // Tentar analisar o JSON
        try {
            const data = JSON.parse(text);
            return data;
        } catch (jsonError) {
            console.error(`[ERRO] Falha ao analisar JSON durante ${actionDescription}:`, jsonError);
            console.error('Texto da resposta:', text);
            return [];
        }
    } catch (error) {
        return [];
    }
}

// Função para formatar URLs de API com tratamento para múltiplos parâmetros
function formatApiUrl(baseUrl, params) {
    const url = new URL(baseUrl, window.location.origin);
    
    // Adicionar cada parâmetro à URL
    Object.keys(params).forEach((key, index) => {
        // Verificar se é o primeiro parâmetro (usar ? ou &)
        const separator = url.search ? '&' : '?';
        
        // Adicionar o parâmetro à URL
        url.search += (index === 0 ? separator : '&') + `${key}=${encodeURIComponent(params[key])}`;
    });
    
    return url.toString();
}

// Função para carregar mensagens públicas
async function loadPublicMessages() {
    if (isLoadingPublicMessages) {
        return;
    }
    
    isLoadingPublicMessages = true;
    
    try {
        const lastId = getLastMessageId('public');
        const url = formatApiUrl('api.php', { action: 'get_public_messages', last_id: lastId });
        
        const response = await fetch(url);
        const data = await handleApiResponse(response, 'carregamento de mensagens públicas');
        
        // Se a resposta foi tratada como 401, data será null
        if (data === null) return;
        
        const container = document.getElementById('publicMessages');
        if (!container) {
            return;
        }
        
        // Atualizar o último ID de mensagem recuperado
        if (data.messages && data.messages.length > 0) {
            const maxId = Math.max(...data.messages.map(msg => parseInt(msg.id)));
            setLastMessageId('public', maxId);
        }
        
        // Sincronizar mensagens com o DOM
        syncMessages(container, data.messages || [], false, 'public', Date.now());
    } catch (error) {
        // Silenciar erro
    } finally {
        isLoadingPublicMessages = false;
    }
}

// Função para carregar mensagens privadas
async function loadPrivateMessages(targetUser) {
    if (!targetUser) {
        return;
    }
    
    // Criar um ID único para esta conversa
    const conversationId = `private-${targetUser}`;
    
    // Prevenir chamadas simultâneas
    if (isLoadingPrivateMessages[targetUser]) {
        return;
    }
    
    isLoadingPrivateMessages[targetUser] = true;
    
    try {
        const lastId = getLastMessageId(conversationId);
        const url = formatApiUrl('api.php', { 
            action: 'get_private_messages', 
            with_user: targetUser,
            last_id: lastId
        });
        
        const response = await fetch(url);
        const data = await handleApiResponse(response, 'carregamento de mensagens privadas');
        
        // Se a resposta foi tratada como 401, data será null
        if (data === null) return;
        
        const container = document.getElementById(`privateMessages-${targetUser}`);
        if (!container) {
            return;
        }
        
        // Atualizar o último ID de mensagem privada recuperado
        if (data.messages && data.messages.length > 0) {
            const maxId = Math.max(...data.messages.map(msg => parseInt(msg.id)));
            setLastMessageId(conversationId, maxId);
        }
        
        // Sincronizar mensagens com o DOM
        syncMessages(container, data.messages || [], true, conversationId, Date.now());
    } catch (error) {
        // Silenciar erro
    } finally {
        isLoadingPrivateMessages[targetUser] = false;
    }
}

// Função para buscar o último ID de mensagem para uma conversa
function getLastMessageId(conversationId) {
    return localStorage.getItem(`lastMessageId_${conversationId}`) || 0;
}

// Função para armazenar o último ID de mensagem para uma conversa
function setLastMessageId(conversationId, id) {
    localStorage.setItem(`lastMessageId_${conversationId}`, id);
}

// Função para alternar entre abas
function switchTab(tabId) {
    if (!tabId) {
        return;
    }
    
    // Ocultar todas as áreas de chat
    document.querySelectorAll('.chat-area').forEach(area => {
        area.classList.remove('active');
    });
    
    // Ocultar todas as abas
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Mostrar a área de chat correspondente
    let chatArea;
    if (tabId === 'public') {
        chatArea = document.getElementById('publicChat');
    } else if (tabId.startsWith('private-')) {
        const nickname = tabId.replace('private-', '');
        chatArea = document.getElementById(`privateChat-${nickname}`);
        
        // Se for um chat privado, verificar se existe e, se não, criá-lo
        if (!chatArea && nickname) {
            createPrivateChat(nickname);
            return; // createPrivateChat vai lidar com a troca de aba
        }
    }
    
    // Ativar a aba e a área de chat
    if (chatArea) {
        chatArea.classList.add('active');
        
        const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
        if (tab) {
            tab.classList.add('active');
            
            // Garantir que a aba esteja visível rolando-a para a visualização
            scrollTabIntoView(tabId);
        }
        
        // Atualizar a variável global que controla a aba ativa
        currentActiveTab = tabId;
        
        // Carregar mensagens da conversa ativa
        if (tabId === 'public') {
            loadPublicMessages();
        } else if (tabId.startsWith('private-')) {
            const nickname = tabId.replace('private-', '');
            loadPrivateMessages(nickname);
            
            // Marcar mensagens como lidas quando o usuário acessa a conversa
            markMessagesAsRead(nickname);
        }
    }
}

// Função para criar botão "Voltar ao Chat Público"
function createBackToPublicButton() {
    // Função desativada - botão não é mais necessário
    return;
}

// Função para criar aba e área de chat privado
function createPrivateChat(nickname) {
    if (!nickname) {
        return;
    }
    
    try {
        const tabId = `private-${nickname}`;
        
        // Verificar se a aba já existe
        if (document.querySelector(`.tab[data-tab="${tabId}"]`)) {
            switchTab(tabId);
            return;
        }
        
        // Verificar se containers existem
        const privateTabs = document.getElementById('privateTabs');
        const privateChats = document.getElementById('privateChats');
        
        if (!privateTabs || !privateChats) {
            return;
        }
        
        // Criar nova aba
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.setAttribute('data-tab', tabId);
        
        // Criar botão de fechar
        const closeButton = document.createElement('button');
        closeButton.className = 'tab-close';
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Impedir que o clique chegue à aba
            closePrivateChat(nickname);
        });
        
        // Título da aba
        const tabTitle = document.createElement('span');
        tabTitle.textContent = nickname;
        
        // Adicionar elementos à aba
        tab.appendChild(tabTitle);
        tab.appendChild(closeButton);
        
        // Adicionar evento de clique à aba
        tab.addEventListener('click', () => {
            switchTab(tabId);
        });
        
        // Adicionar a aba ao container de abas
        privateTabs.appendChild(tab);
        
        // Criar área de chat privado
        const chatArea = document.createElement('div');
        chatArea.className = 'chat-area';
        chatArea.id = `privateChat-${nickname}`;
        
        // Container de mensagens
        const messagesContainer = document.createElement('div');
        messagesContainer.className = 'messages-container';
        messagesContainer.id = `privateMessages-${nickname}`;
        
        // Indicador de digitação
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';
        typingIndicator.id = `typingIndicator-${nickname}`;
        
        // Container de input
        const inputContainer = document.createElement('div');
        inputContainer.className = 'message-input-container';
        
        // Campo de input
        const messageInput = document.createElement('input');
        messageInput.type = 'text';
        messageInput.id = `privateMessageInput-${nickname}`;
        messageInput.placeholder = 'Digite sua mensagem...';
        messageInput.maxLength = 500;
        
        // Botão de enviar
        const sendButton = document.createElement('button');
        sendButton.className = 'btn btn-primary';
        sendButton.id = `sendPrivateMessage-${nickname}`;
        sendButton.textContent = 'Enviar';
        
        // Adicionar elementos ao container de input
        inputContainer.appendChild(messageInput);
        inputContainer.appendChild(sendButton);
        
        // Adicionar todos os elementos à área de chat
        chatArea.appendChild(messagesContainer);
        chatArea.appendChild(typingIndicator);
        chatArea.appendChild(inputContainer);
        
        // Adicionar área de chat ao container
        privateChats.appendChild(chatArea);
        
        // Verificar se a área de chat foi criada corretamente
        if (!document.getElementById(`privateChat-${nickname}`)) {
            return;
        }
        
        // Configurar eventos de envio de mensagem
        if (sendButton && messageInput) {
            sendButton.addEventListener('click', () => {
                sendPrivateMessageToUser(nickname, messageInput);
            });
            
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendPrivateMessageToUser(nickname, messageInput);
                }
            });
        }
        
        // Esconder todas as áreas de chat antes de mostrar a nova
        document.querySelectorAll('.chat-area').forEach(area => {
            area.classList.remove('active');
        });
        
        // Ativar a nova área de chat
        chatArea.classList.add('active');
        
        // Atualizar a aba ativa
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('active');
        });
        tab.classList.add('active');
        
        // Atualizar a variável de controle global
        currentActiveTab = tabId;
        
        // Marcar mensagens como lidas
        markMessagesAsRead(nickname);
        
        // Carregar mensagens privadas
        loadPrivateMessages(nickname);
        
        // Verificar se as abas são scrolláveis
        checkTabsScrollable();
        
        // Centralizar a aba na visualização
        scrollTabIntoView(tabId);
    } catch (error) {
        // Silenciar erro
    }
}

// Função para enviar mensagem privada
async function sendPrivateMessageToUser(nickname, inputElement) {
    if (!nickname || !inputElement) {
        return;
    }
    
    const message = inputElement.value.trim();
    if (!message) {
        return;
    }
    
    // Desabilitar o input durante o envio para evitar cliques múltiplos
    inputElement.disabled = true;
    
    try {
        const url = formatApiUrl('api.php', { action: 'send_private_message' });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                to_user: nickname,
                message: message
            })
        });
        
        const data = await handleApiResponse(response, `envio de mensagem privada para ${nickname}`);
        
        // Se a resposta foi tratada como 401, data será null
        if (data === null) return;
        
        if (data.success) {
            // Limpar o input imediatamente para melhor UX
            inputElement.value = '';
            
            // Atualizar as mensagens privadas diretamente do servidor
            await loadPrivateMessages(nickname);
            
            // Retornar o foco para o campo de mensagem
            setTimeout(() => {
                inputElement.focus();
            }, 0);
        } else {
            alert(`Erro ao enviar mensagem: ${data.error || 'Erro desconhecido'}`);
        }
    } catch (error) {
        alert(`Erro ao enviar mensagem: ${error.message || 'Erro desconhecido'}`);
    } finally {
        // Re-habilitar o input
        inputElement.disabled = false;
        
        // Garantir que o foco retorne ao campo de mensagem
        try {
            inputElement.focus();
        } catch (e) {
            // Silenciar aviso
        }
    }
}

// Função para marcar mensagens como lidas
async function markMessagesAsRead(fromUser) {
    if (!fromUser) {
        return;
    }
    
    try {
        const url = formatApiUrl('api.php', { action: 'mark_private_read' });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from_user: fromUser
            })
        });
        
        const data = await handleApiResponse(response, 'marcar mensagens como lidas');
        
        // Se a resposta foi tratada como 401, data será null
        if (data === null) return;
        
        if (data.success) {
            console.log(`[DEBUG] Mensagens de ${fromUser} marcadas como lidas com sucesso`);
        } else {
            console.error(`[ERRO] Falha ao marcar mensagens de ${fromUser} como lidas:`, data.error);
        }
    } catch (error) {
        console.error(`[ERRO] Exceção ao marcar mensagens de ${fromUser} como lidas:`, error);
    }
}

// Função para carregar usuários online
async function loadOnlineUsers() {
    try {
        const url = formatApiUrl('api.php', { action: 'get_users' });
        
        const response = await fetch(url);
        const data = await handleApiResponse(response, 'carregamento de usuários online');
        
        // Se a resposta foi tratada como 401, data será null
        if (data === null) return;
        
        const usersList = document.getElementById('usersList');
        if (!usersList) {
            return;
        }
        
        // Atualizar timestamp da última resposta
        lastServerResponse['users'] = Date.now();
        
        // Atualizar contador de usuários
        const userCount = document.getElementById('userCount');
        if (userCount) {
            userCount.textContent = data.users.length;
        }
        
        // Limpar lista atual
        usersList.innerHTML = '';
        
        // Adicionar cada usuário à lista
        data.users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.className = `user-item${user.nickname === currentUser ? ' current-user' : ''}`;
            
            // Criar avatar com iniciais
            const userAvatar = document.createElement('div');
            userAvatar.className = 'user-avatar';
            userAvatar.textContent = user.nickname.substring(0, 2).toUpperCase();
            
            const userInfo = document.createElement('div');
            userInfo.className = 'user-info';
            
            const userNickname = document.createElement('div');
            userNickname.className = 'user-nickname';
            userNickname.textContent = user.nickname;
            
            const userStatus = document.createElement('div');
            userStatus.className = 'user-status';
            userStatus.textContent = 'Online';
            
            userInfo.appendChild(userNickname);
            userInfo.appendChild(userStatus);
            
            userItem.appendChild(userAvatar);
            userItem.appendChild(userInfo);
            
            // Se não for o usuário atual, adicionar contador de mensagens não lidas e evento de clique
            if (user.nickname !== currentUser) {
                // Adicionar badge de mensagens não lidas
                if (user.unread_messages > 0) {
                    const unreadBadge = document.createElement('div');
                    unreadBadge.className = 'unread-badge';
                    unreadBadge.textContent = user.unread_messages;
                    userItem.appendChild(unreadBadge);
                }
                
                // Adicionar evento de clique para iniciar chat privado
                userItem.addEventListener('click', () => {
                    createPrivateChat(user.nickname);
                    
                    // Em dispositivos móveis, fechar a barra lateral automaticamente
                    if (window.innerWidth < 768) {
                        window.closeUsersSidebar();
                    }
                });
            }
            
            usersList.appendChild(userItem);
        });
    } catch (error) {
        // Silenciar erro
    }
}

// Função para enviar mensagem pública com tratamento para evitar duplicação
async function sendPublicMessage(inputElement) {
    if (!inputElement) {
        return;
    }
    
    const message = inputElement.value.trim();
    if (!message) {
        return;
    }
    
    // Desabilitar o input durante o envio para evitar cliques múltiplos
    inputElement.disabled = true;
    
    try {
        const url = formatApiUrl('api.php', { action: 'send_public_message' });
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message
            })
        });
        
        const data = await handleApiResponse(response, 'envio de mensagem pública');
        
        // Se a resposta foi tratada como 401, data será null
        if (data === null) return;
        
        if (data.success) {
            // Limpar o input imediatamente para melhor UX
            const sentMessage = message; // Guardar cópia da mensagem enviada
            inputElement.value = '';
            
            // Opção 1: Em vez de adicionar imediatamente, vamos atualizar do servidor
            // Isso garante consistência, evitando problemas de sincronização
            await loadPublicMessages();
            
            // Retornar o foco para o campo de mensagem
            setTimeout(() => {
                inputElement.focus();
            }, 0);
        } else {
            alert(`Erro ao enviar mensagem: ${data.error || 'Erro desconhecido'}`);
        }
    } catch (error) {
        alert(`Erro ao enviar mensagem: ${error.message || 'Erro desconhecido'}`);
    } finally {
        // Re-habilitar o input
        inputElement.disabled = false;
        
        // Garantir que o foco retorne ao campo de mensagem
        try {
            inputElement.focus();
        } catch (e) {
            // Silenciar aviso
        }
    }
}

// Função para fechar um chat privado
function closePrivateChat(nickname) {
    if (!nickname) {
        return;
    }
    
    try {
        const tabId = `private-${nickname}`;
        const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
        const chatArea = document.getElementById(`privateChat-${nickname}`);
        
        if (tab) {
            tab.remove();
        }
        
        if (chatArea) {
            chatArea.remove();
        }
        
        // Verificar se as abas são scrolláveis após remover uma
        checkTabsScrollable();
        
        // Se a aba fechada era a ativa, voltar para o chat público
        if (currentActiveTab === tabId) {
            switchTab('public');
        }
    } catch (error) {
        switchTab('public');
    }
}

// Função modificada para iniciar atualizações periódicas
function startUpdates() {
    // Limpar intervalo anterior se existir
    if (updateInterval) {
        clearInterval(updateInterval);
    }
    
    // Para a primeira execução, forçar uma sincronização completa
    fullSyncCounter = FULL_SYNC_INTERVAL; // Isso fará com que a primeira execução seja uma sincronização completa
    
    // Adicionar um flag para evitar sobreposição de requisições
    let updateInProgress = false;
    
    // Reduzir a frequência de polling para 5 segundos para diminuir carga no servidor
    updateInterval = setInterval(() => {
        if (document.hidden) {
            return;
        }
        
        // Se uma atualização anterior ainda está em andamento, pular esta
        if (updateInProgress) {
            return;
        }
        
        // Verificar se os processos de carregamento de mensagens estão em andamento
        if (isLoadingPublicMessages) {
            return;
        }
        
        // Verificar carregamento de mensagens privadas para a conversa atual
        if (currentActiveTab.startsWith('private-')) {
            const targetUser = currentActiveTab.replace('private-', '');
            if (isLoadingPrivateMessages[targetUser]) {
                return;
            }
        }
        
        updateInProgress = true;
        
        try {
            fullSyncCounter++;
            
            // A cada FULL_SYNC_INTERVAL, forçar uma sincronização completa
            if (fullSyncCounter >= FULL_SYNC_INTERVAL) {
                fullSyncCounter = 0;
                
                // Limpar caches de forma mais suave
                // Em vez de resetar completamente, vamos manter o estado e apenas forçar uma atualização
                if (currentActiveTab === 'public') {
                    // Resetar último ID para forçar carga completa, mas manter cache
                    setLastMessageId('public', 0);
                } else {
                    const targetUser = currentActiveTab.replace('private-', '');
                    if (targetUser && targetUser !== 'public') {
                        const conversationId = `private-${targetUser}`;
                        
                        // Forçar atualização completa da conversa atual
                        setLastMessageId(conversationId, 0);
                    }
                }
            }
            
            // Sempre atualizar a lista de usuários online
            loadOnlineUsers()
                .then(() => {
                    // Se chegamos aqui sem erros, resetar contador de erros
                    if (consecutiveErrorCount > 0) {
                        consecutiveErrorCount = 0;
                        backoffTimeout = 5000; // Resetar para o intervalo inicial
                    }
                })
                .catch(error => {
                    // Incrementar contador de erros
                    consecutiveErrorCount++;
                    
                    // Ajustar o backoff exponencial
                    if (consecutiveErrorCount > 3) {
                        const oldTimeout = backoffTimeout;
                        backoffTimeout = Math.min(backoffTimeout * 1.5, MAX_BACKOFF);
                        
                        // Reconfigurar o intervalo com o novo timeout
                        clearInterval(updateInterval);
                        updateInterval = setInterval(arguments.callee, backoffTimeout);
                    }
                })
                .finally(() => {
                    // Atualizar mensagens da aba atual
                    let messageUpdatePromise;
                    
                    if (currentActiveTab === 'public') {
                        messageUpdatePromise = loadPublicMessages();
                    } else {
                        const targetUser = currentActiveTab.replace('private-', '');
                        if (targetUser && targetUser !== 'public') {
                            messageUpdatePromise = loadPrivateMessages(targetUser);
                        }
                    }
                    
                    // Se temos uma promessa, aguardar sua conclusão
                    if (messageUpdatePromise) {
                        messageUpdatePromise
                            .catch(error => {
                                console.error('[ERRO] Falha ao carregar mensagens:', error);
                            })
                            .finally(() => {
                                // Independentemente do resultado, permitir a próxima atualização
                                updateInProgress = false;
                            });
                    } else {
                        // Se não há promessa (talvez não haja aba ativa), permitir a próxima atualização
                        updateInProgress = false;
                    }
                });
            
        } catch (error) {
            // Garantir que liberamos o bloqueio mesmo em caso de erro
            updateInProgress = false;
        }
    }, backoffTimeout); // Usar o backoffTimeout em vez de um valor fixo
}

// Função para resetar o estado das mensagens
function resetMessageState() {
    // Limpar caches
    messageCache = {
        'public': new Map(),
        private: {}
    };
    
    // Limpar lista de mensagens notificadas
    notifiedMessageIds.clear();
    
    // Resetar versões
    messageVersions = {
        'public': 0,
        private: {}
    };
    
    // Resetar timestamps de resposta
    lastServerResponse = {
        'public': Date.now(),
        'users': Date.now()
    };
    
    // Limpar localStorage
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('lastMessageId_')) {
            localStorage.removeItem(key);
        }
    });
}

// Função para verificar a integridade do sistema e ajustar tempo de exclusão de mensagens
function verifyIntegrity() {
    // Evitar verificações durante carregamentos em andamento
    if (isLoadingPublicMessages) {
        return;
    }
    
    // Para conversas privadas, verificar se o carregamento está em andamento
    if (currentActiveTab.startsWith('private-')) {
        const targetUser = currentActiveTab.replace('private-', '');
        if (isLoadingPrivateMessages[targetUser]) {
            return;
        }
    }
    
    try {
        // Verificar se o cache corresponde ao DOM
        if (currentActiveTab === 'public') {
            const container = document.getElementById('publicMessages');
            if (container) {
                const messagesInDOM = container.querySelectorAll('.message').length;
                const messagesInCache = messageCache['public'].size;
                
                // Se houver discrepância grave, forçar uma atualização
                // Aumentar o limite para 10 para ser mais tolerante e manter mais mensagens visíveis
                if (Math.abs(messagesInDOM - messagesInCache) > 10) {
                    // Verificar quais mensagens estão no cache mas não no DOM
                    const missingInDOM = [];
                    for (const [id, msg] of messageCache['public'].entries()) {
                        const element = container.querySelector(`.message[data-id="${id}"]`);
                        if (!element) {
                            missingInDOM.push(id);
                        }
                    }
                    
                    // Verificar quais mensagens estão no DOM mas não no cache
                    const extraInDOM = [];
                    container.querySelectorAll('.message').forEach(el => {
                        const id = el.dataset.id;
                        if (id && !messageCache['public'].has(id)) {
                            extraInDOM.push(id);
                        }
                    });
                    
                    // Remover mensagens duplicadas no DOM
                    const seenIds = new Set();
                    container.querySelectorAll('.message').forEach(el => {
                        const id = el.dataset.id;
                        if (id) {
                            if (seenIds.has(id)) {
                                el.remove();
                            } else {
                                seenIds.add(id);
                            }
                        }
                    });
                    
                    // Forçar atualização completa
                    setLastMessageId('public', 0);
                    loadPublicMessages();
                }
            }
        } else {
            const targetUser = currentActiveTab.replace('private-', '');
            if (targetUser && targetUser !== 'public') {
                const conversationId = `private-${targetUser}`;
                const container = document.getElementById(`privateMessages-${targetUser}`);
                
                if (container && messageCache.private[conversationId]) {
                    const messagesInDOM = container.querySelectorAll('.message').length;
                    const messagesInCache = messageCache.private[conversationId].size;
                    
                    // Se houver discrepância grave, forçar uma atualização
                    if (Math.abs(messagesInDOM - messagesInCache) > 10) {
                        // Limpar mensagens duplicadas no DOM
                        const seenIds = new Set();
                        container.querySelectorAll('.message').forEach(el => {
                            const id = el.dataset.id;
                            if (id) {
                                if (seenIds.has(id)) {
                                    el.remove();
                                } else {
                                    seenIds.add(id);
                                }
                            }
                        });
                        
                        // Forçar atualização completa
                        setLastMessageId(conversationId, 0);
                        loadPrivateMessages(targetUser);
                    }
                }
            }
        }
    } catch (error) {
        // Silenciar erro
    }
}

// Função para alternar a visibilidade da barra lateral
function toggleSidebar(forceState = null) {
    try {
        // Verificar se as funções globais estão disponíveis
        if (forceState === true || (forceState === null && window.openUsersSidebar)) {
            return window.openUsersSidebar();
        } else if (forceState === false || window.closeUsersSidebar) {
            return window.closeUsersSidebar();
        }
        
        // Fallback caso as funções globais não estejam disponíveis
        const sidebar = document.getElementById('usersSidebar');
        const overlay = document.getElementById('sidebar-overlay');
        
        if (!sidebar) {
            return false;
        }
        
        // Determinar o estado desejado
        let shouldBeVisible;
        if (forceState === true) {
            shouldBeVisible = true;
        } else if (forceState === false) {
            shouldBeVisible = false;
        } else {
            // Se não for forçado, inverter o estado atual
            shouldBeVisible = sidebar.style.left !== '0px';
        }
        
        // Aplicar o estado diretamente ao estilo
        if (shouldBeVisible) {
            sidebar.style.left = '0px';
            sidebar.classList.add('active');
            if (overlay) overlay.classList.add('active');
        } else {
            sidebar.style.left = '-280px';
            sidebar.classList.remove('active');
            if (overlay) overlay.classList.remove('active');
        }
        
        return false; // Evitar comportamento padrão
    } catch (error) {
        return false;
    }
}

// Função para verificar se os tabs são scrolláveis e aplicar classe visual
function checkTabsScrollable() {
    const tabsContainer = document.querySelector('.chat-tabs');
    if (!tabsContainer) return;
    
    // Verificar se o conteúdo é maior que o container
    const isScrollable = tabsContainer.scrollWidth > tabsContainer.clientWidth;
    
    // Aplicar ou remover a classe
    if (isScrollable) {
        tabsContainer.classList.add('scrollable');
    } else {
        tabsContainer.classList.remove('scrollable');
    }
}

// Função para centralizar a aba ativa na área visível
function scrollTabIntoView(tabId) {
    const tab = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const tabsContainer = document.querySelector('.chat-tabs');
    
    if (tab && tabsContainer) {
        // Calcular a posição para centralizar a aba
        const tabCenter = tab.offsetLeft + (tab.offsetWidth / 2);
        const containerCenter = tabsContainer.clientWidth / 2;
        
        // Scroll suave para centralizar a aba
        tabsContainer.scrollTo({
            left: tabCenter - containerCenter,
            behavior: 'smooth'
        });
    }
}

// Configurar listener para envio de mensagem pública com verificação de existência
const publicMessageInput = document.getElementById('publicMessageInput');
const sendPublicMessageButton = document.getElementById('sendPublicMessage');

if (publicMessageInput && sendPublicMessageButton) {
    sendPublicMessageButton.addEventListener('click', (e) => {
        e.preventDefault(); // Prevenir comportamento padrão do botão
        sendPublicMessage(publicMessageInput);
    });
    
    publicMessageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevenir o comportamento padrão do Enter (nova linha)
            sendPublicMessage(publicMessageInput);
        }
    });
    
    // Configurar foco no campo quando o chat público estiver ativo
    document.addEventListener('click', (e) => {
        if (e.target.closest('.tab[data-tab="public"]') || e.target.closest('#publicChat')) {
            // Pequeno atraso para garantir que todos os elementos estejam prontos
            setTimeout(() => {
                try {
                    publicMessageInput.focus();
                } catch (error) {
                    // Silenciar aviso
                }
            }, 50);
        }
    });
} else {
    console.warn('[AVISO] Elementos de envio de mensagem pública não encontrados');
}

// Funções específicas para a página de chat
function initChatPage() {
    try {
        // Forçar um reset completo na inicialização para garantir sincronização correta
        resetMessageState();
        
        // Garantir que o botão toggleUsers use a função global
        const toggleBtn = document.getElementById('toggleUsers');
        if (toggleBtn) {
            // Remover qualquer evento onclick existente
            toggleBtn.onclick = null;
            
            // Adicionar evento diretamente usando a função global
            toggleBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                if (typeof window.openUsersSidebar === 'function') {
                    return window.openUsersSidebar();
                } else {
                    return toggleSidebar(true);
                }
            });
        }
        
        // Verificar se as abas são scrolláveis na inicialização
        setTimeout(() => {
            checkTabsScrollable();
        }, 100);
        
        // Adicionar listener de redimensionamento para verificar scrollabilidade das abas
        window.addEventListener('resize', () => {
            checkTabsScrollable();
        });
        
        // Verificar e configurar botão de fechar sidebar
        const closeBtn = document.getElementById('closeSidebar');
        if (closeBtn) {
            // Remover qualquer evento onclick existente
            closeBtn.onclick = null;
            
            closeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                if (typeof window.closeUsersSidebar === 'function') {
                    return window.closeUsersSidebar();
                } else {
                    return toggleSidebar(false);
                }
            });
        }
        
        // Configurar overlay
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) {
            // Remover qualquer evento onclick existente
            overlay.onclick = null;
            
            overlay.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                if (typeof window.closeUsersSidebar === 'function') {
                    return window.closeUsersSidebar();
                } else {
                    return toggleSidebar(false);
                }
            });
        }
        
        // Configurar listeners para cliques nas abas com verificação de existência
        document.addEventListener('click', (event) => {
            // Verificar se o clique foi em uma aba
            if (event.target.closest('.tab')) {
                const tab = event.target.closest('.tab');
                const tabId = tab.dataset.tab;
                switchTab(tabId);
            }
            
            // Verificar se o clique foi no botão de fechar aba
            if (event.target.classList.contains('tab-close')) {
                event.stopPropagation(); // Evitar que o evento propague para a aba
                const nickname = event.target.dataset.nickname;
                closePrivateChat(nickname);
            }
        });
        
        // Verificar se a aba pública existe antes de tentar alternar para ela
        const publicTab = document.querySelector('.tab[data-tab="public"]');
        if (publicTab) {
            // Começar com o chat público
            switchTab('public');
        }
        
        // Carregar usuários online inicialmente
        loadOnlineUsers();
        
        // Iniciar atualizações automáticas com pequeno atraso para garantir que a UI está pronta
        setTimeout(() => {
            startUpdates();
            
            // Verificação de integridade após inicialização
            setTimeout(verifyIntegrity, 2000);
            
            // Configurar verificação de integridade periódica
            setInterval(verifyIntegrity, 30000); // A cada 30 segundos
        }, 500);
    } catch (error) {
        // Em caso de erro crítico, tentar redirecionar para a página de login
        window.location.href = 'login.php';
    }
}

// Iniciar atualização automática ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    // Verificar em qual página estamos (login ou chat)
    const isChatPage = document.querySelector('.chat-container') !== null;
    
    if (!isChatPage) {
        return; // Sair da função sem inicializar os componentes do chat
    }
    
    // Configurar o evento de clique no overlay para fechar a barra lateral
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
        overlay.addEventListener('click', () => {
            toggleSidebar(false);
        });
    }
    
    try {
        // Verificar se os elementos principais existem antes de prosseguir
        const mainContainer = document.querySelector('.chat-container');
        if (!mainContainer) {
            return; // Não redirecionar, apenas sair da função
        }

        // Inicializar a página de chat com todas as suas funcionalidades
        initChatPage();
        
    } catch (error) {
        // Silenciar erro
    }
});