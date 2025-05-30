# Chatlol

Chatlol is a lightweight, real-time web chat application designed for simplicity and performance. It supports both public chat rooms and private messaging between users.

##Screemshot

![Image](https://github.com/user-attachments/assets/a5f61196-604b-4e6e-b050-d06133617deb)

<img src="https://github.com/bruno-joj/chatlol-site/blob/c7d5a9f292b8690a054ed570e9e0281ddf1dc314/Print%20login%20page.png"/>
<img src="https://github.com/bruno-joj/chatlol-site/blob/62d9bb1c6c5a6a31aae2fd2310264b21fe3817f4/Captura%20de%20tela%202025-05-30%20032950.png"/>

## Features

- **Real-time Messaging**: Instant message delivery in both public and private chats
- **User Status**: See who's online at any moment
- **Private Messaging**: Direct messaging between users
- **Notification System**: Audio notifications for new messages
- **Mobile Responsive**: Works on all devices and screen sizes
- **Secure**: Built with security best practices

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/bruno-joj/chatlol.site.git
   ```

2. Set up a MySQL database and import the provided SQL schema:
   ```
   mysql -u username -p database_name < schema.sql
   ```

3. Configure your database connection in `config.php`:
   ```php
   define('DB_HOST', 'your_host');
   define('DB_NAME', 'your_database');
   define('DB_USER', 'your_username');
   define('DB_PASS', 'your_password');
   ```

4. Configure the necessary database events for message cleanup and user session management:
   ```sql
   -- Event para limpar mensagens antigas (a cada 24 horas)
   CREATE EVENT IF NOT EXISTS clean_old_messages
   ON SCHEDULE EVERY 24 HOUR
   DO
   DELETE FROM messages WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
   
   -- Event para limpar sessões de usuários inativos (a cada 5 minutos)
   CREATE EVENT IF NOT EXISTS clean_inactive_sessions
   ON SCHEDULE EVERY 5 MINUTE
   DO
   DELETE FROM users_online WHERE last_activity < DATE_SUB(NOW(), INTERVAL 10 MINUTE);
   ```
   
   To enable events in MySQL:
   ```sql
   SET GLOBAL event_scheduler = ON;
   ```
   
   Note: Make sure your database user has the EVENT privilege:
   ```sql
   GRANT EVENT ON database_name.* TO 'your_username'@'your_host';
   FLUSH PRIVILEGES;
   ```

5. Upload the files to your web server

6. Make sure the web server has appropriate permissions for the directory

## Server Requirements

- PHP 7.4 or higher
- MySQL 5.7 or higher
- Apache with mod_rewrite enabled
- HTTPS enabled (recommended for production)

## Production Setup

The application is configured for production use with:

- Error display disabled
- Content Security Policy headers
- Optimized caching for static assets
- Protection against common web vulnerabilities

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Android Chrome)

## Files Structure

- `chat.php` - Main chat interface
- `login.php` - User login page
- `api.php` - Backend API endpoints
- `config.php` - Configuration settings
- `script.js` - Frontend JavaScript functionality
- `style.css` - CSS styling
- `.htaccess` - Apache and Ngnix configuration

## Security Features

- XSS protection
- CSRF protection
- SQL injection prevention
- Content Security Policy
- HTTPS enforcement
- Session security

## License

MIT License

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

For support, please open an issue in the GitHub repository or contact the maintainer.
