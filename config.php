<?php
// config.php - Configurações do sistema

// Configurações de segurança da sessão
ini_set('session.cookie_httponly', 1);
ini_set('session.cookie_secure', 1);
ini_set('session.use_only_cookies', 1);
ini_set('session.cookie_samesite', 'Strict');
ini_set('session.gc_maxlifetime', 3600); // 1 hora
ini_set('session.cookie_lifetime', 0); // Sessão expira ao fechar o navegador

// Configurações de segurança do PHP - Modo de produção
ini_set('display_errors', 0); // Desativar exibição de erros
ini_set('display_startup_errors', 0); // Desativar exibição de erros de inicialização
error_reporting(0); // Desabilitar todos os relatórios de erro em produção
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/php_errors.log'); // Log no mesmo diretório do script

// Iniciar sessão
session_start();

// Configurações do banco de dados
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_NAME', getenv('DB_NAME') ?: 'chatsystem');
define('DB_USER', getenv('DB_USER') ?: 'chatuser');
define('DB_PASS', getenv('DB_PASS') ?: 'LalXK3v7lFrtmxYYMpYB');

// Headers de segurança
header('X-Frame-Options: DENY');
header('X-XSS-Protection: 1; mode=block');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:;');

// Classe para conexão com o banco
class Database {
    private static $instance = null;
    private $connection;
    
    private function __construct() {
        try {
            $this->connection = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false
                ]
            );
        } catch(PDOException $e) {
            error_log("Erro na conexão com o banco de dados: " . $e->getMessage());
            die("Erro na conexão com o banco de dados. Por favor, tente novamente mais tarde.");
        }
    }
    
    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function getConnection() {
        return $this->connection;
    }
}

// Funções utilitárias
function sanitize($data) {
    return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
}

function generateSessionId() {
    return bin2hex(random_bytes(32));
}

function getUserIP() {
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        return $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        return $_SERVER['HTTP_X_FORWARDED_FOR'];
    } else {
        return $_SERVER['REMOTE_ADDR'];
    }
}

// Verificar se usuário está logado
function isLoggedIn() {
    return isset($_SESSION['nickname']) && isset($_SESSION['session_id']);
}

// Logout do usuário
function logout() {
    if (isLoggedIn()) {
        $db = Database::getInstance()->getConnection();
        $stmt = $db->prepare("DELETE FROM users_online WHERE session_id = ?");
        $stmt->execute([$_SESSION['session_id']]);
    }
    session_destroy();
}
?>