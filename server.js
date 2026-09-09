const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;

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

// Initialisation au démarrage
pool.query(initDbQuery)
  .then(() => console.log('Base de données initialisée avec succès !'))
  .catch((err) => console.error('Erreur lors de l’initialisation de la BDD :', err));

app.get('/', (req, res) => {
  res.send('Serveur YA BISSO ERP opérationnel et BDD connectée !');
});

app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});