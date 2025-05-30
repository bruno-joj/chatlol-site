<?php
require_once 'config.php';

// Verificar se está logado
if (!isLoggedIn()) {
    header('Location: login.php');
    exit;
}

// Atualizar atividade do usuário
$db = Database::getInstance()->getConnection();
$stmt = $db->prepare("UPDATE users_online SET last_activity = NOW() WHERE session_id = ?");
$stmt->execute([$_SESSION['session_id']]);
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chatlol - <?= sanitize($_SESSION['nickname']) ?></title>
    <link rel="stylesheet" href="style.css">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💬</text></svg>">
</head>
<body>
    <div class="chat-container">
        <!-- Elemento de áudio para notificações -->
        <audio id="notificationSound" preload="auto">
            <source src="notification.mp3" type="audio/mpeg">
        </audio>

        <!-- Overlay para a barra lateral -->
        <div id="sidebar-overlay"></div>

        <!-- Header -->
        <header class="chat-header">
            <div class="header-left">
                <div class="logo-container">
                    <img src="logo.png" alt="Chatlol Logo" class="site-logo">
                </div>
                <span class="user-greeting">Olá, <strong><?= sanitize($_SESSION['nickname']) ?></strong></span>
            </div>
            <div class="header-right">
                <button id="toggleUsers" class="btn btn-secondary" onclick="return window.openUsersSidebar();">
                    👥 Usuários (<span id="userCount">0</span>)
                </button>
                <a href="logout.php" class="btn btn-danger">Sair</a>
            </div>
        </header>

        <div class="chat-main">
            <!-- Barra lateral de usuários -->
            <aside class="users-sidebar" id="usersSidebar">
                <div class="sidebar-header">
                    <h3>Usuários Online</h3>
                    <button id="closeSidebar" class="btn-close" onclick="return window.closeUsersSidebar();">&times;</button>
                </div>
                <div class="users-list" id="usersList">
                    <!-- Lista será carregada via JavaScript -->
                </div>
            </aside>

            <!-- Área principal do chat -->
            <main class="chat-content">
                <div class="chat-tabs">
                    <div class="tab active" data-tab="public">
                        <span>💬 Chat Público</span>
                    </div>
                    <div id="privateTabs">
                        <!-- Abas de chat privado serão adicionadas aqui -->
                    </div>
                </div>

                <!-- Chat público -->
                <div class="chat-area active" id="publicChat">
                    <div class="messages-container" id="publicMessages">
                        <!-- Mensagens serão carregadas aqui -->
                    </div>
                    <div class="typing-indicator" id="typingIndicator"></div>
                    <div class="message-input-container">
                        <input 
                            type="text" 
                            id="publicMessageInput" 
                            placeholder="Digite sua mensagem..."
                            maxlength="500"
                        >
                        <button id="sendPublicMessage" class="btn btn-primary">Enviar</button>
                    </div>
                </div>

                <!-- Container para chats privados -->
                <div id="privateChats">
                    <!-- Chats privados serão criados dinamicamente -->
                </div>
            </main>
        </div>
    </div>

    <!-- Modal para confirmações -->
    <div id="modal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 id="modalTitle"></h3>
                <button class="btn-close" id="closeModal">&times;</button>
            </div>
            <div class="modal-body" id="modalBody"></div>
            <div class="modal-footer">
                <button id="modalConfirm" class="btn btn-primary">Confirmar</button>
                <button id="modalCancel" class="btn btn-secondary">Cancelar</button>
            </div>
        </div>
    </div>

    <script>
        // Variáveis globais
        const currentUser = '<?= sanitize($_SESSION['nickname']) ?>';
        const sessionId = '<?= $_SESSION['session_id'] ?>';
        
        // Função global para abrir a barra lateral diretamente
        window.openUsersSidebar = function() {
            const sidebar = document.getElementById('usersSidebar');
            const overlay = document.getElementById('sidebar-overlay');
            const chatContent = document.querySelector('.chat-content');
            
            if (sidebar) {
                sidebar.style.left = '0px';
                sidebar.classList.add('active');
                
                if (overlay) {
                    overlay.classList.add('active');
                }
                
                // Garantir que o conteúdo principal ainda seja visível
                if (chatContent) {
                    chatContent.style.marginLeft = '0px';
                }
            }
            
            return false; // Evitar comportamento padrão
        };
        
        // Função global para fechar a barra lateral
        window.closeUsersSidebar = function() {
            const sidebar = document.getElementById('usersSidebar');
            const overlay = document.getElementById('sidebar-overlay');
            
            if (sidebar) {
                sidebar.style.left = '-280px';
                sidebar.classList.remove('active');
                
                if (overlay) {
                    overlay.classList.remove('active');
                }
            }
            
            return false; // Evitar comportamento padrão
        };
        
        // Inicializar elementos DOM
        window.addEventListener('DOMContentLoaded', () => {
            // Inicializar a barra lateral com posição explícita
            const sidebar = document.getElementById('usersSidebar');
            if (sidebar) {
                sidebar.style.left = '-280px';
            }
            
            // Adicionar event listener ao botão diretamente aqui
            const toggleBtn = document.getElementById('toggleUsers');
            if (toggleBtn) {
                toggleBtn.onclick = window.openUsersSidebar;
            }
            
            // Adicionar event listener ao botão de fechar
            const closeBtn = document.getElementById('closeSidebar');
            if (closeBtn) {
                closeBtn.onclick = window.closeUsersSidebar;
            }
            
            // Adicionar event listener ao overlay
            const overlay = document.getElementById('sidebar-overlay');
            if (overlay) {
                overlay.onclick = window.closeUsersSidebar;
            }
        });
    </script>
    <script src="script.js"></script>
</body>
</html>