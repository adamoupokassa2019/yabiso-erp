const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'yabisso_secret_key_2026';

// Configuration de la base de données PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialisation et réinitialisation propre des tables et des comptes par défaut
async function initDB() {
    try {
        // Suppression des anciennes tables pour repartir sur du propre
        await pool.query(`DROP TABLE IF EXISTS details_vente CASCADE;`);
        await pool.query(`DROP TABLE IF EXISTS ventes CASCADE;`);
        await pool.query(`DROP TABLE IF EXISTS produits CASCADE;`);
        await pool.query(`DROP TABLE IF EXISTS utilisateurs CASCADE;`);

        // Création des tables
        await pool.query(`
            CREATE TABLE utilisateurs (
                id SERIAL PRIMARY KEY,
                nom VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) NOT NULL,
                changer_mdp BOOLEAN DEFAULT TRUE
            );

            CREATE TABLE produits (
                id SERIAL PRIMARY KEY,
                nom VARCHAR(100) NOT NULL,
                prix_vente NUMERIC(10, 2) NOT NULL,
                quantite_stock INT NOT NULL,
                quantite_alerte INT DEFAULT 5
            );

            CREATE TABLE ventes (
                id SERIAL PRIMARY KEY,
                user_id INT REFERENCES utilisateurs(id),
                mode_paiement VARCHAR(50) NOT NULL,
                montant_total NUMERIC(10, 2) NOT NULL,
                date_vente TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE details_vente (
                id SERIAL PRIMARY KEY,
                vente_id INT REFERENCES ventes(id) ON DELETE CASCADE,
                produit_id INT REFERENCES produits(id),
                quantite INT NOT NULL,
                prix_unitaire NUMERIC(10, 2) NOT NULL
            );
        `);

        // Insertion des 3 comptes demandés (avec mot de passe temporaire "Passer123" et changer_mdp = TRUE)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('Passer123', salt);

        await pool.query(
            `INSERT INTO utilisateurs (nom, email, password, role, changer_mdp) VALUES 
            ('Direction Ya Bisso', 'direction@yabisso.com', $1, 'admin', TRUE),
            ('Chef d Agence', 'agence@yabisso.com', $1, 'admin', TRUE),
            ('Secretariat Caisse', 'secretariat@yabisso.com', $1, 'caissier', TRUE)`,
            [hashedPassword]
        );

        // Insertion de quelques produits par défaut pour tester la caisse
        await pool.query(`
            INSERT INTO produits (nom, prix_vente, quantite_stock, quantite_alerte) VALUES 
            ('Affiche Publicitaire A3', 1500, 50, 5),
            ('Badges Professionnels', 500, 120, 10),
            ('Flyers Recto-Verso (Lot 100)', 5000, 30, 3),
            ('Cachet Encre Automatique', 7500, 15, 2);
        `);

        console.log("Base de données réinitialisée avec succès. Comptes par défaut créés.");
    } catch (err) {
        console.error("Erreur lors de l'initialisation de la base de données :", err);
    }
}

initDB();

// API Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Email ou mot de passe incorrect.' });
        }

        const user = result.rows.length > 0 ? result.rows[0] : null;
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Email ou mot de passe incorrect.' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
        res.json({
            token,
            user: {
                id: user.id,
                nom: user.nom,
                email: user.email,
                role: user.role,
                changer_mdp: user.changer_mdp
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API Modification de mot de passe (première connexion)
app.post('/api/auth/changer-password', async (req, res) => {
    try {
        const { email, nouveauPassword } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(nouveauPassword, salt);

        await pool.query(
            'UPDATE utilisateurs SET password = $1, changer_mdp = FALSE WHERE email = $2',
            [hashedPassword, email]
        );
        res.json({ success: true, message: "Mot de passe mis à jour avec succès." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Middleware d'authentification
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Accès non autorisé.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token invalide ou expiré.' });
        req.user = user;
        next();
    });
}

// Routes Produits
app.get('/api/produits', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM produits ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Routes Ventes
app.get('/api/ventes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.id, v.date_vente, v.mode_paiement, v.montant_total, u.nom AS caissier 
            FROM ventes v 
            LEFT JOIN utilisateurs u ON v.user_id = u.id 
            ORDER BY v.id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ventes', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { user_id, mode_paiement, items } = req.body;

        let montantTotal = 0;
        for (let item of items) {
            montantTotal += item.prix_unitaire * item.quantite;
        }

        const venteRes = await client.query(
            'INSERT INTO ventes (user_id, mode_paiement, montant_total) VALUES ($1, $2, $3) RETURNING id',
            [user_id || null, mode_paiement, montantTotal]
        );
        const venteId = venteRes.rows[0].id;

        for (let item of items) {
            await client.query(
                'INSERT INTO details_vente (vente_id, produit_id, quantite, prix_unitaire) VALUES ($1, $2, $3, $4)',
                [venteId, item.produit_id, item.quantite, item.prix_unitaire]
            );
            await client.query(
                'UPDATE produits SET quantite_stock = quantite_stock - $1 WHERE id = $2',
                [item.quantite, item.produit_id]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ success: true, venteId });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Routes Utilisateurs
app.get('/api/utilisateurs', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nom, email, role FROM utilisateurs ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/utilisateurs', verifyToken, async (req, res) => {
    try {
        const { nom, email, password, role } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const result = await pool.query(
            'INSERT INTO utilisateurs (nom, email, password, role, changer_mdp) VALUES ($1, $2, $3, $4, TRUE) RETURNING id, nom, email, role',
            [nom, email, hashedPassword, role]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/utilisateurs/:id', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM utilisateurs WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});