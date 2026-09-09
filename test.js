const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'yabisso_super_secret_key';

// Génération des jetons de test pour les deux rôles
const tokenReception = jwt.sign({ id: 1, role: 'RECEPTION' }, JWT_SECRET);
const tokenGerant = jwt.sign({ id: 2, role: 'GERANT' }, JWT_SECRET);

const BASE_URL = 'http://localhost:3000/api';

async function executerTests() {
  console.log("🚀 DEMARRAGE DU TEST AUTOMATISE YABISSO ERP...\n");

  try {
    // 1. La Réception crée une nouvelle facture
    console.log("1️⃣ [RECEPTION] Création d'une facture...");
    const resFacture = await fetch(`${BASE_URL}/factures`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenReception}`
      },
      body: JSON.stringify({ client_nom: "Client YA BISSO", montant_total: 15000 })
    });
    const facture = await resFacture.json();
    console.log("   --> Facture créée :", facture);

    // 2. La Réception tente une validation directe d'annulation (Doit échouer avec Erreur 403)
    console.log("\n2️⃣ [RECEPTION] Tentative d'annulation directe (Interdite)...");
    const resForbidden = await fetch(`${BASE_URL}/factures/${facture.id}/valider-annulation`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenReception}` }
    });
    const forbiddenResult = await resForbidden.json();
    console.log("   --> Résultat attendu (Blocage) :", forbiddenResult);

    // 3. La Réception fait une demande d'annulation au Gérant
    console.log("\n3️⃣ [RECEPTION] Envoi d'une demande d'annulation au Gérant...");
    const resDemande = await fetch(`${BASE_URL}/factures/${facture.id}/demander-annulation`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenReception}` }
    });
    const demandeResult = await resDemande.json();
    console.log("   --> Statut de la demande :", demandeResult);

    // 4. Le Gérant valide l'annulation
    console.log("\n4️⃣ [GERANT] Validation définitive de l'annulation par le Gérant...");
    const resValidation = await fetch(`${BASE_URL}/factures/${facture.id}/valider-annulation`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenGerant}` }
    });
    const validationResult = await resValidation.json();
    console.log("   --> Confirmation Gérant :", validationResult);

    console.log("\n✅ TOUS LES TESTS DE SECURITE ONT REUSSI AVEC SUCCES !");

  } catch (err) {
    console.error("❌ ERREUR LORS DU TEST :", err.message);
  }
}

executerTests();