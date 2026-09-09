const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Serveur YA BISSO ERP opérationnel !');
});

app.listen(port, () => {
  console.log(`Serveur démarré sur le port ${port}`);
});