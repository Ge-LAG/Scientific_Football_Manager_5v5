# Déployer Lab League sur Hostinger

Lab League est **une seule application Node.js** : elle sert le site (fichiers de `dist/`), l'API (`/api`)
et le temps réel WebSocket (`/ws`) sur **un seul port**. Aucune base de données externe n'est nécessaire :
les comptes sont stockés dans un fichier JSON (`data/lableague.json`).

## Prérequis

- Node.js **20 ou plus récent** (22 LTS recommandé).
- Une offre Hostinger capable d'exécuter une application Node.js **avec WebSocket** :
  - **Hostinger Cloud / Business (Node.js Web App)** — déploiement depuis hPanel ;
  - ou **VPS Hostinger** — contrôle total (recommandé si vous voulez beaucoup de joueurs simultanés).

> ⚠️ Le mode en ligne repose sur les WebSockets. Vérifiez dans hPanel que votre offre Node.js les laisse
> passer (c'est le cas sur VPS). Si ce n'est pas le cas, le jeu solo contre les bots fonctionne quand même :
> il tourne entièrement dans le navigateur.

## Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `PORT` | `8787` | Port d'écoute (Hostinger l'impose souvent : laissez-le fourni par la plateforme). |
| `HOST` | `0.0.0.0` | Interface d'écoute. |
| `DATA_DIR` | `./data` | Dossier du fichier de données (doit être **persistant** et **sauvegardé**). |
| `DATA_FILE` | `$DATA_DIR/lableague.json` | Chemin complet du fichier de données (prioritaire sur `DATA_DIR`). |
| `TRUST_PROXY` | `1` | `1` : l'IP client est lue dans la dernière entrée de `X-Forwarded-For` (ajoutée par le proxy Hostinger/Nginx). Mettez `0` si le serveur est exposé **sans** proxy. |

Voir `.env.example`. Aucun secret n'est requis : les mots de passe sont hachés avec scrypt et un sel aléatoire.

## Option A — Hostinger Cloud / Business (application Node.js dans hPanel)

1. **Préparer l'archive** sur votre poste :
   ```bash
   npm ci
   npm test
   npm run build
   ```
   Le dossier `dist/` contient le site construit.
2. Dans **hPanel → Sites web → Ajouter → Application Node.js** (libellé selon la version de hPanel) :
   - importez le dépôt Git (ou l'archive du projet **avec** `dist/`) ;
   - **Version de Node** : 20 ou 22 ;
   - **Commande de build** : `npm ci && npm run build` (ou laissez vide si vous envoyez déjà `dist/`) ;
   - **Commande de démarrage** : `npm start` (lance `node server/index.js`) ;
   - **Fichier d'entrée** si demandé : `server/index.js`.
3. Ajoutez la variable `DATA_DIR` vers un dossier persistant de votre espace (par ex. `/home/<compte>/lableague-data`).
4. Démarrez l'application, puis ouvrez `https://votre-domaine/api/health` : la réponse doit être `{"ok":true,…}`.
5. Activez le **SSL** (Let's Encrypt) dans hPanel : le client passe automatiquement en `wss://`.

## Option B — VPS Hostinger (Ubuntu) avec PM2 et Nginx

```bash
# 1. Node.js 22 et outils
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

# 2. Code
sudo mkdir -p /opt/lableague /var/lib/lableague && sudo chown $USER /opt/lableague /var/lib/lableague
git clone <votre-dépôt> /opt/lableague && cd /opt/lableague
npm ci && npm test && npm run build

# 3. Service
DATA_DIR=/var/lib/lableague PORT=8787 pm2 start server/index.js --name lableague
pm2 save && pm2 startup
```

Configuration Nginx (`/etc/nginx/sites-available/lableague`) — le bloc `Upgrade` est indispensable au WebSocket :

```nginx
server {
  server_name votre-domaine.fr;
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;
  }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/lableague /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx -d votre-domaine.fr
```

## Mise à jour

```bash
cd /opt/lableague && git pull && npm ci && npm test && npm run build && pm2 restart lableague
```

Le serveur s'arrête proprement sur `SIGTERM`/`SIGINT` (les données en attente sont écrites sur disque).

## Sauvegarde et restauration

- Sauvegardez régulièrement le fichier `DATA_DIR/lableague.json` (copie à chaud possible : les écritures sont atomiques).
  Exemple cron quotidien : `0 4 * * * cp /var/lib/lableague/lableague.json /var/backups/lableague-$(date +\%F).json`.
- Restauration : arrêtez le service, remettez le fichier, redémarrez.
- Si le fichier est corrompu, le serveur **refuse de démarrer plutôt que de l'écraser** : restaurez la dernière sauvegarde.

## Vérifications après mise en ligne (recette)

1. `GET /api/health` → `{"ok":true}`.
2. Page d'accueil en **français** par défaut, bascule **EN** mémorisée.
3. Créer un compte (pseudo + mot de passe), se déconnecter, se reconnecter.
4. Deux navigateurs différents : salle Manager privée par code → draft → match → rapport avec XP/ELO.
5. Arène : partie rapide dans deux navigateurs → les deux joueurs bougent, les bots complètent.
6. Supprimer un compte de test depuis le profil.

## Capacité

Une salle Manager consomme très peu (10 à 40 pas de simulation par seconde) ; une salle Arène simule 10 joueurs
à 30 Hz et diffuse ~20 instantanés/s (≈ 15 Ko/s par joueur). Un petit VPS (1 vCPU, 1 Go) accueille confortablement
plusieurs dizaines de salles simultanées. Limites intégrées : 500 salles, 8 connexions temps réel par IP, messages de 8 Ko max, ~60 messages/s par
connexion, 10 tentatives de connexion/inscription par minute et par IP, 10 échecs de connexion par pseudo
toutes les 15 minutes, codes de salle de 6 caractères tirés au hasard cryptographique.

## Option C — VPS avec Docker

```bash
docker build -t lableague .
docker run -d --name lableague --restart unless-stopped -p 8787:8787 -v lableague-data:/data lableague
```

Placez Nginx (configuration de l'option B) devant le conteneur pour le HTTPS et le WebSocket. Les données
persistent dans le volume `lableague-data` (à sauvegarder).
