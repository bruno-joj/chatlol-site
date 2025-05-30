<?php
require_once 'config.php';

$error = '';
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $nickname = sanitize($_POST['nickname'] ?? '');
    
    if (empty($nickname)) {
        $error = 'Por favor, digite um nickname.';
    } elseif (strlen($nickname) < 3 || strlen($nickname) > 20) {
        $error = 'O nickname deve ter entre 3 e 20 caracteres.';
    } elseif (!preg_match('/^[a-zA-Z0-9_-]+$/', $nickname)) {
        $error = 'O nickname pode conter apenas letras, números, _ e -.';
    } else {
        $db = Database::getInstance()->getConnection();
        
        // Verificar se nickname já está em uso
        $stmt = $db->prepare("SELECT id FROM users_online WHERE nickname = ?");
        $stmt->execute([$nickname]);
        
        if ($stmt->rowCount() > 0) {
            $error = 'Este nickname já está sendo usado.';
        } else {
            // Criar sessão do usuário
            $session_id = generateSessionId();
            $ip_address = getUserIP();
            
            $stmt = $db->prepare("INSERT INTO users_online (nickname, session_id, ip_address) VALUES (?, ?, ?)");
            
            if ($stmt->execute([$nickname, $session_id, $ip_address])) {
                $_SESSION['nickname'] = $nickname;
                $_SESSION['session_id'] = $session_id;
                header('Location: chat.php');
                exit;
            } else {
                $error = 'Erro ao entrar no chat. Tente novamente.';
            }
        }
    }
}

// Se já está logado, redirecionar para o chat
if (isLoggedIn()) {
    header('Location: chat.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chatlol - Entrar</title>
    <link rel="stylesheet" href="style.css">
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💬</text></svg>">
</head>
<body>
    <div class="login-container">
        <div class="login-box">
            <div class="logo">
                <img src="logo.png" alt="Chatlol Logo" class="login-logo">
                <p>Conecte-se e converse em tempo real</p>
            </div>
            
            <?php if ($error): ?>
                <div class="alert alert-error">
                    <?= $error ?>
                </div>
            <?php endif; ?>
            
            <form method="POST" class="login-form">
                <div class="form-group">
                    <label for="nickname">Escolha seu nickname:</label>
                    <input 
                        type="text" 
                        id="nickname" 
                        name="nickname" 
                        required 
                        maxlength="20"
                        placeholder="Digite seu nickname"
                        value="<?= isset($_POST['nickname']) ? sanitize($_POST['nickname']) : '' ?>"
                    >
                    <small>3-20 caracteres, apenas letras, números, _ e -</small>
                </div>
                
                <button type="submit" class="btn btn-primary">
                    Entrar no Chat
                </button>
            </form>
            
            <div class="info">
                <h3>Regras do Chat:</h3>
                <ul>
                    <li>Seja respeitoso com outros usuários</li>
                    <li>Não compartilhe informações pessoais</li>
                    <li>Evite spam ou mensagens repetitivas</li>
                    <li>Mantenha conversas apropriadas</li>
                </ul>
            </div>
        </div>
    </div>
    
    <script>
    // Script específico para a página de login
    document.addEventListener('DOMContentLoaded', function() {
        // Focar no campo de nickname quando a página carregar
        const nicknameInput = document.getElementById('nickname');
        if (nicknameInput) {
            nicknameInput.focus();
        }
    });
    </script>
</body>
</html>