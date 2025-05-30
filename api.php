<?php
// Configurações de erro
ini_set('display_errors', 0);
error_reporting(E_ALL);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/php_errors.log');

// Incluir configurações
require_once 'config.php';

// Iniciar sessão se ainda não estiver ativa
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Configurar cabeçalhos CORS
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: https://chatlol.site');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Credentials: true');

// Responder a requisições OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Verificar se está logado
if (!isLoggedIn()) {
    sendJsonResponse(['error' => 'Não autorizado'], 401);
    exit;
}

// Função para enviar resposta JSON
function sendJsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// Função para verificar rate limit
function checkRateLimit($ip, $action) {
    global $db;
    
    try {
        // Limpar registros antigos
        $stmt = $db->prepare("DELETE FROM rate_limits WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)");
        $stmt->execute();
        
        // Verificar limite
        $stmt = $db->prepare("SELECT COUNT(*) FROM rate_limits WHERE ip = ? AND action = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)");
        $stmt->execute([$ip, $action]);
        $count = $stmt->fetchColumn();
        
        if ($count >= 60) { // 60 requisições por minuto
            sendJsonResponse(['error' => 'Limite de requisições excedido'], 429);
        }
        
        // Registrar requisição
        $stmt = $db->prepare("INSERT INTO rate_limits (ip, action) VALUES (?, ?)");
        $stmt->execute([$ip, $action]);
    } catch (PDOException $e) {
        error_log("Erro ao verificar rate limit: " . $e->getMessage());
        // Não bloquear a requisição em caso de erro no rate limit
    }
}

// Função para buscar usuários online
function getUsersOnline() {
    global $db;
    try {
        // Limpar usuários inativos primeiro
        $stmt = $db->prepare("DELETE FROM users_online WHERE last_activity < DATE_SUB(NOW(), INTERVAL 30 MINUTE)");
        $stmt->execute();
        
        // Buscar usuários online
        $stmt = $db->prepare("SELECT nickname, last_activity FROM users_online ORDER BY nickname");
        $stmt->execute();
        $users = $stmt->fetchAll();
        
        // Contar mensagens privadas não lidas para cada usuário
        $usersWithUnread = [];
        foreach ($users as $user) {
            $stmt = $db->prepare("SELECT COUNT(*) as unread FROM private_messages WHERE to_nickname = ? AND from_nickname = ? AND is_read = FALSE");
            $stmt->execute([$_SESSION['nickname'], $user['nickname']]);
            $unread = $stmt->fetchColumn();
            
            $usersWithUnread[] = [
                'nickname' => $user['nickname'],
                'last_activity' => $user['last_activity'],
                'unread_messages' => (int)$unread,
                'is_current_user' => $user['nickname'] === $_SESSION['nickname']
            ];
        }
        
        sendJsonResponse($usersWithUnread);
    } catch (PDOException $e) {
        error_log("Erro ao buscar usuários online: " . $e->getMessage());
        sendJsonResponse(['error' => 'Erro interno do servidor'], 500);
    }
}

// Função para buscar mensagens públicas
function getPublicMessages() {
    global $db;
    try {
        $lastId = (int)($_GET['last_id'] ?? 0);
        
        $stmt = $db->prepare("
            SELECT id, nickname, message, created_at 
            FROM public_messages 
            WHERE id > ? 
            ORDER BY created_at ASC 
            LIMIT 50
        ");
        $stmt->execute([$lastId]);
        $messages = $stmt->fetchAll();
        
        sendJsonResponse($messages);
    } catch (PDOException $e) {
        error_log("Erro ao buscar mensagens públicas: " . $e->getMessage());
        sendJsonResponse(['error' => 'Erro interno do servidor'], 500);
    }
}

// Função para enviar mensagem pública
function sendPublicMessage() {
    global $db;
    try {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            sendJsonResponse(['error' => 'Método não permitido'], 405);
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            sendJsonResponse(['error' => 'JSON inválido'], 400);
        }
        
        $message = trim($input['message'] ?? '');
        
        if (empty($message)) {
            sendJsonResponse(['error' => 'Mensagem não pode estar vazia'], 400);
        }
        
        if (strlen($message) > 500) {
            sendJsonResponse(['error' => 'Mensagem muito longa'], 400);
        }
        
        // Verificar conteúdo impróprio
        if (preg_match('/\b(?:porn|sex|xxx|adult)\b/i', $message)) {
            sendJsonResponse(['error' => 'Conteúdo impróprio detectado'], 400);
        }
        
        $message = sanitize($message);
        
        $stmt = $db->prepare("INSERT INTO public_messages (nickname, message) VALUES (?, ?)");
        
        if ($stmt->execute([$_SESSION['nickname'], $message])) {
            sendJsonResponse(['success' => true, 'id' => $db->lastInsertId()]);
        } else {
            throw new PDOException("Erro ao inserir mensagem");
        }
    } catch (PDOException $e) {
        error_log("Erro ao enviar mensagem pública: " . $e->getMessage());
        sendJsonResponse(['error' => 'Erro ao enviar mensagem'], 500);
    }
}

// Função para buscar mensagens privadas
function getPrivateMessages() {
    global $db;
    try {
        $withUser = sanitize($_GET['with_user'] ?? '');
        $lastId = (int)($_GET['last_id'] ?? 0);
        
        if (empty($withUser)) {
            sendJsonResponse(['error' => 'Usuário não especificado'], 400);
        }
        
        $stmt = $db->prepare("
            SELECT id, from_nickname, to_nickname, message, is_read, created_at
            FROM private_messages 
            WHERE ((from_nickname = ? AND to_nickname = ?) OR (from_nickname = ? AND to_nickname = ?))
            AND id > ?
            ORDER BY created_at ASC 
            LIMIT 50
        ");
        $stmt->execute([$_SESSION['nickname'], $withUser, $withUser, $_SESSION['nickname'], $lastId]);
        $messages = $stmt->fetchAll();
        
        sendJsonResponse($messages);
    } catch (PDOException $e) {
        error_log("Erro ao buscar mensagens privadas: " . $e->getMessage());
        sendJsonResponse(['error' => 'Erro interno do servidor'], 500);
    }
}

// Função para enviar mensagem privada
function sendPrivateMessage() {
    global $db;
    try {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            sendJsonResponse(['error' => 'Método não permitido'], 405);
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $message = trim($input['message'] ?? '');
        $toUser = sanitize($input['to_user'] ?? '');
        
        if (empty($message) || empty($toUser)) {
            sendJsonResponse(['error' => 'Mensagem e destinatário são obrigatórios'], 400);
        }
        
        if (strlen($message) > 500) {
            sendJsonResponse(['error' => 'Mensagem muito longa'], 400);
        }
        
        // Verificar se o usuário destinatário existe e está online
        $stmt = $db->prepare("SELECT nickname FROM users_online WHERE nickname = ?");
        $stmt->execute([$toUser]);
        
        if ($stmt->rowCount() === 0) {
            sendJsonResponse(['error' => 'Usuário não encontrado ou offline'], 400);
        }
        
        $message = sanitize($message);
        
        $stmt = $db->prepare("INSERT INTO private_messages (from_nickname, to_nickname, message) VALUES (?, ?, ?)");
        
        if ($stmt->execute([$_SESSION['nickname'], $toUser, $message])) {
            sendJsonResponse(['success' => true, 'id' => $db->lastInsertId()]);
        } else {
            throw new PDOException("Erro ao inserir mensagem");
        }
    } catch (PDOException $e) {
        error_log("Erro ao enviar mensagem privada: " . $e->getMessage());
        sendJsonResponse(['error' => 'Erro ao enviar mensagem'], 500);
    }
}

// Função para marcar mensagens privadas como lidas
function markPrivateMessagesRead() {
    global $db;
    try {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            sendJsonResponse(['error' => 'Método não permitido'], 405);
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        $fromUser = sanitize($input['from_user'] ?? '');
        
        if (empty($fromUser)) {
            sendJsonResponse(['error' => 'Usuário remetente não especificado'], 400);
        }
        
        $stmt = $db->prepare("UPDATE private_messages SET is_read = TRUE WHERE from_nickname = ? AND to_nickname = ? AND is_read = FALSE");
        
        if ($stmt->execute([$fromUser, $_SESSION['nickname']])) {
            sendJsonResponse(['success' => true]);
        } else {
            throw new PDOException("Erro ao marcar mensagens como lidas");
        }
    } catch (PDOException $e) {
        error_log("Erro ao marcar mensagens como lidas: " . $e->getMessage());
        sendJsonResponse(['error' => 'Erro ao marcar mensagens como lidas'], 500);
    }
}

// Processar requisição
try {
    $db = Database::getInstance()->getConnection();
    $ip = getUserIP();
    $action = $_GET['action'] ?? '';

    // Verificar rate limit para cada ação
    checkRateLimit($ip, $action);

    // Atualizar atividade do usuário
    $stmt = $db->prepare("UPDATE users_online SET last_activity = NOW() WHERE session_id = ?");
    $stmt->execute([$_SESSION['session_id']]);

    switch ($action) {
        case 'get_users':
            getUsersOnline();
            break;
        
        case 'get_public_messages':
            getPublicMessages();
            break;
        
        case 'send_public_message':
            sendPublicMessage();
            break;
        
        case 'get_private_messages':
            getPrivateMessages();
            break;
        
        case 'send_private_message':
            sendPrivateMessage();
            break;
        
        case 'mark_private_read':
            markPrivateMessagesRead();
            break;
        
        default:
            sendJsonResponse(['error' => 'Ação inválida'], 400);
    }
} catch (Exception $e) {
    error_log("Erro na API: " . $e->getMessage());
    sendJsonResponse(['error' => 'Erro interno do servidor'], 500);
}
?>