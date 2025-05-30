-- Criação do banco de dados
CREATE DATABASE webserver;
USE webserver;


-- Tabela de usuários online
CREATE TABLE users_online (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) UNIQUE NOT NULL,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de mensagens do chat público
CREATE TABLE public_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created_at (created_at)
);

-- Tabela de mensagens privadas
CREATE TABLE private_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    from_nickname VARCHAR(50) NOT NULL,
    to_nickname VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_participants (from_nickname, to_nickname),
    INDEX idx_created_at (created_at)
);

-- Tabela para rate limiting
CREATE TABLE rate_limits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ip VARCHAR(45) NOT NULL,
    action VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ip_action (ip, action),
    INDEX idx_created_at (created_at)
);

-- Índices adicionais para melhor performance
ALTER TABLE users_online ADD INDEX idx_last_activity (last_activity);
ALTER TABLE public_messages ADD INDEX idx_nickname (nickname);
ALTER TABLE private_messages ADD INDEX idx_is_read (is_read);

-- Evento para limpar rate limits antigos
CREATE EVENT cleanup_rate_limits
ON SCHEDULE EVERY 1 HOUR
DO
  DELETE FROM rate_limits 
  WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 HOUR);

-- Limpeza automática de usuários inativos (mais de 30 minutos)
CREATE EVENT cleanup_inactive_users
ON SCHEDULE EVERY 5 MINUTE
DO
  DELETE FROM users_online 
  WHERE last_activity < DATE_SUB(NOW(), INTERVAL 30 MINUTE);

-- Limpeza de mensagens antigas (mais de 7 dias)
CREATE EVENT cleanup_old_messages
ON SCHEDULE EVERY 1 DAY
DO BEGIN
  DELETE FROM public_messages 
  WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
  
  DELETE FROM private_messages 
  WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
END;

-- Evento para deletar mensagens públicas a cada 10 segundos
DROP EVENT IF EXISTS delete_public_messages;
CREATE EVENT delete_public_messages
ON SCHEDULE EVERY 10 SECOND
DO
  DELETE FROM public_messages;

-- Evento para deletar mensagens privadas a cada 10 segundos
DROP EVENT IF EXISTS delete_private_messages;
CREATE EVENT delete_private_messages
ON SCHEDULE EVERY 10 SECOND
DO
  DELETE FROM private_messages;

-- Garantir que o Event Scheduler está ativo
SET GLOBAL event_scheduler = ON;

-- Verificar se os eventos foram criados
SELECT * FROM information_schema.events 
WHERE event_schema = 'webserver' 
AND event_name IN ('delete_public_messages', 'delete_private_messages');