const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || 'votre_secret_jwt_par_defaut';

// Middleware JSON et fichiers statiques (Front-end dans le dossier 'public')
app.use(express.json());
app.use(express.static('public'));

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

// Initialisation au démarrage de la BDD et création automatique d'un compte admin par défaut si inexistant
pool.query(initDbQuery)
  .then(async () => {
    console.log('Base de données initialisée avec succès !');
    
    // Vérifier si un admin existe déjà, sinon en créer un par défaut
    const adminCheck = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@yabisoo.com']);
    if (adminCheck.rows.length === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('admin123', salt);
      await pool.query(
        'INSERT INTO users (nom, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['Adamou (Admin)', 'admin@yabisoo.com', hash, 'admin']
      );
      console.log('Compte administrateur par défaut créé : admin@yabisoo.com / admin123');
    }
  })
  .catch((err) => console.error('Erreur lors de l’initialisation de la BDD :', err));

// --- MODULE AUTHENTIFICATION ---

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nom, email, password, role } = req.body;
    if (!nom || !email || !password) {
      return res.status(400).json({ error: 'Veuillez remplir tous les champs obligatoires.' });
    }
    const userExist = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userExist.rows.length > 0) {
      return res.status(400).json({ error: 'Cet email est déjà utilisé.' });
    }
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const newUser = await pool.query(
      'INSERT INTO users (nom, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, nom, email, role, created_at',
      [nom, email, password_hash, role || 'employe']
    );
    res.status(201).json({ message: 'Utilisateur créé avec succès !', user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de l’inscription.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Veuillez fournir un email et un mot de passe.' });
    }
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect.' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Email ou mot de passe incorrect.' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: 'Connexion réussie !', token, user: { id: user.id, nom: user.nom, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la connexion.' });
  }
});

// --- MODULE STOCK (Catégories & Produits) ---

app.post('/api/categories', async (req, res) => {
  try {
    const { nom, description } = req.body;
    if (!nom) {
      return res.status(400).json({ error: 'Le nom de la catégorie est obligatoire.' });
    }
    const newCategory = await pool.query(
      'INSERT INTO categories (nom, description) VALUES ($1, $2) RETURNING *',
      [nom, description]
    );
    res.status(201).json({ message: 'Catégorie créée avec succès !', category: newCategory.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de la création de la catégorie.' });
  }
});

app.get('/api/categories', async (req, res) => {
  try {
    const categories = await pool.query('SELECT * FROM categories ORDER BY nom ASC');
    res.json(categories.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des catégories.' });
  }
});

app.post('/api/produits', async (req, res) => {
  try {
    const { code_barre, nom, description, prix_achat, prix_vente, quantite_stock, quantite_alerte, category_id } = req.body;
    if (!nom || prix_vente === undefined) {
      return res.status(400).json({ error: 'Le nom et le prix de vente sont obligatoires.' });
    }
    const newProduit = await pool.query(
      `INSERT INTO produits (code_barre, nom, description, prix_achat, prix_vente, quantite_stock, quantite_alerte, category_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [code_barre, nom, description, prix_achat || 0, prix_vente, quantite_stock || 0, quantite_alerte || 5, category_id]
    );
    res.status(201).json({ message: 'Produit ajouté au stock avec succès !', produit: newProduit.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur lors de l’ajout du produit.' });
  }
});

app.get('/api/produits', async (req, res) => {
  try {
    const query = `
      SELECT p.*, c.nom AS category_nom 
      FROM produits p 
      LEFT JOIN categories c ON p.category_id = c.id 
      ORDER BY p.nom ASC
    `;
    const produits = await pool.query(query);
    res.json(produits.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération des produits.' });
  }
});

// --- MODULE VENTES ---

app.post('/api/ventes', async (req, res) => {
  const client = await pool.connect();
  try {
    const { user_id, mode_paiement, items } = req.body; 

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Le panier est vide.' });
    }

    await client.query('BEGIN');

    let total_montant = 0;
    for (let item of items) {
      const produitCheck = await client.query('SELECT quantite_stock, prix_vente FROM produits WHERE id = $1', [item.produit_id]);
      if (produitCheck.rows.length === 0) {
        throw new Error(`Produit ID ${item.produit_id} introuvable.`);
      }
      const produit = produitCheck.rows[0];
      if (produit.quantite_stock < item.quantite) {
        throw new Error(`Stock insuffisant pour le produit ID ${item.produit_id}. Stock disponible : ${produit.quantite_stock}`);
      }
      total_montant += (item.prix_unitaire || produit.prix_vente) * item.quantite;
    }

    const venteQuery = `
      INSERT INTO ventes (user_id, total_montant, mode_paiement, statut) 
      VALUES ($1, $2, $3, 'complete') RETURNING *
    `;
    const venteResult = await client.query(venteQuery, [user_id || null, total_montant, mode_paiement || 'espece']);
    const nouvelleVente = venteResult.rows[0];

    for (let item of items) {
      const prixU = item.prix_unitaire || 0;
      const sousTotal = prixU * item.quantite;

      await client.query(
        `INSERT INTO vente_details (vente_id, produit_id, quantite, prix_unitaire, sous_total) 
         VALUES ($1, $2, $3, $4, $5)`,
        [nouvelleVente.id, item.produit_id, item.quantite, prixU, sousTotal]
      );

      await client.query(
        `UPDATE produits SET quantite_stock = quantite_stock - $1 WHERE id = $2`,
        [item.quantite, item.produit_id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Vente enregistrée avec succès et stock mis à jour !',
      vente: nouvelleVente
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Erreur lors de l’enregistrement de la vente.' });
  } finally {
    client.release();
  }
});

app.get('/api/ventes', async (req, res) => {
  try {
    const query = `
      SELECT v.*, u.nom AS vendeur_nom 
      FROM ventes v 
      LEFT JOIN users u ON v.user_id = u.id 
      ORDER BY v.created_at DESC
    `;
    const ventes = await pool.query(query);
    res.json(ventes.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la récupération de l’historique des ventes.' });
  }
});

// Démarrage du serveur
app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});