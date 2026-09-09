<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>YA BISSO ERP - Connexion</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #121212; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
    .login-card { background: #1e1e1e; padding: 30px; border-radius: 8px; border: 1px solid #333; width: 100%; max-width: 350px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
    h2 { text-align: center; color: #ffc107; margin-bottom: 20px; }
    input, button { width: 100%; padding: 12px; margin-top: 10px; border-radius: 4px; border: 1px solid #444; background: #2a2a2a; color: #fff; box-sizing: border-box; }
    button { background: #007bff; font-weight: bold; cursor: pointer; border: none; margin-top: 20px; }
    button:hover { background: #0056b3; }
    .error { color: #dc3545; font-size: 0.9em; text-align: center; margin-top: 10px; display: none; }
  </style>
</head>
<body>

  <div class="login-card">
    <h2>YA BISSO ERP</h2>
    <form id="loginForm">
      <input type="text" id="username" placeholder="Nom d'utilisateur" required>
      <input type="password" id="password" placeholder="Mot de passe" required>
      <button type="submit">Se connecter</button>
      <div id="errorMsg" class="error">Identifiants incorrects</div>
    </form>
  </div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('yabisso_token', data.token);
        localStorage.setItem('yabisso_role', data.role);
        window.location.href = '/';
      } else {
        const errDiv = document.getElementById('errorMsg');
        errDiv.innerText = data.error || 'Échec de connexion';
        errDiv.style.display = 'block';
      }
    });
  </script>

</body>
</html>