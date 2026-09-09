const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_jwt_par_defaut';

app.use(express.json());

// Connexion à la base de données PostgreSQL Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Script d'initialisation des tables SQL
const initDbQuery = `
  CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'employe',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      description TEXT
  );

  CREATE TABLE IF NOT EXISTS produits (
      id SERIAL PRIMARY KEY,
      code_barre VARCHAR(100) UNIQUE,
      nom VARCHAR(150) NOT NULL,
      description TEXT,
      prix_achat DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      prix_vente DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      quantite_stock INT NOT NULL DEFAULT 0,
      quantite_alerte INT DEFAULT 5,
      category_id INT REFERENCES categories(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ventes (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES users(id) ON DELETE SET NULL,
      total_montant DECIMAL(10, 2) NOT NULL,
      mode_paiement VARCHAR(50) DEFAULT 'espece',
      statut VARCHAR(50) DEFAULT 'complete',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vente_details (
      id SERIAL PRIMARY KEY,
      vente_id INT REFERENCES ventes(id) ON DELETE CASCADE,
      produit_id INT REFERENCES produits(id) ON DELETE RESTRICT,
      quantite INT NOT NULL,
      prix_unitaire DECIMAL(10, 2) NOT NULL,
      sous_total DECIMAL(10, 2) NOT NULL
  );
`;

// Initialisation au démarrage de la BDD
pool.query(initDbQuery)
  .then(() => console.log('Base de données initialisée avec succès !'))
  .catch((err) => console.error('Erreur lors de l’initialisation de la BDD :', err));

// Route de test principale
app.get('/', (req, res) => {
  res.send('Serveur YA BISSO ERP opérationnel et BDD connectée !');
});

// --- MODULE AUTHENTIFICATION ---

// 1. Inscription d'un utilisateur
app.post('/api/auth/register', async (req, res) => {
  try {
    const { nom, email, password, role } = req.body;
    
    if (!nom || !email || !password) {
      return res.status(400).json({ error: 'Veuillez remplir tous les champs obligatoires.' });
    }

    // Vérifier si l'utilisateur existe déjà
    const userExist = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé.' });
    }

    // Hacher le mot de passe
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insérer l'utilisateur dans la base de données
    const newUser = await pool.query(
      'INSERT INTO users (nom, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, nom, email, role, created_at',
      [nom, email, password_hash, role || 'employe']
    );

    res.status(201).json({
      message: 'Utilisateur créé avec succès !',
      user: newUser.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de l’inscription.' });
  }
});

// 2. Connexion d'un utilisateur
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Veuillez fournir un email et un mot de passe.' });
    }

    // Rechercher l'utilisateur par email
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const user = result.rows[0];

    // Vérifier le mot de passe
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect.' });
    }

    // Créer un token JWT valable 24h
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Connexion réussie !',
      token,
      user: {
        id: user.id,
        nom: user.nom,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});