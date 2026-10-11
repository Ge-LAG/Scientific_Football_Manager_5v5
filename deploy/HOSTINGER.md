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
| `BACKUP_KEEP` | `7` | Nombre de copies quotidiennes conservées dans `backups/` (voir « Sauvegarde et restauration »). |

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

Le serveur copie lui-même `lableague.json` **une fois par jour** dans `backups/` (à côté du fichier de
données, donc dans `DATA_DIR/backups/`), au démarrage puis toutes les 24 h. Chaque copie porte la date :
`lableague-AAAA-MM-JJ.json`. Une seule copie par jour ; les `BACKUP_KEEP` dernières (7 par défaut) sont
conservées, les plus anciennes sont effacées. `GET /api/health` renvoie la date de la dernière copie
(champ `backup`). Les copies ne contiennent rien de plus que le fichier de données (pseudo + mot de
passe haché, progression, classement) — pensez à limiter l'accès au dossier.

### Restaurer une copie (pas à pas)

Exemple avec `DATA_DIR=/var/lib/lableague` et PM2 ; adaptez le chemin et la commande d'arrêt.

1. **Arrêtez le service** : `pm2 stop lableague`.
2. **Vérifiez la copie à remettre** (la plus récente, ou celle d'avant l'incident) :
   ```bash
   ls -t /var/lib/lableague/backups/
   node -e "JSON.parse(require('fs').readFileSync('/var/lib/lableague/backups/lableague-AAAA-MM-JJ.json','utf8'));console.log('copie lisible')"
   ```
3. **Conservez le fichier actuel au cas où** : `mv /var/lib/lableague/lableague.json /var/lib/lableague/lableague.cassé.json`
   (le serveur refuse de toute façon de démarrer sur un fichier illisible, sans jamais l'écraser).
4. **Remettez la copie** : `cp /var/lib/lableague/backups/lableague-AAAA-MM-JJ.json /var/lib/lableague/lableague.json`.
5. **Redémarrez** : `pm2 start lableague` (ou `pm2 restart lableague`), puis vérifiez
   `GET /api/health` → `{"ok":true,…}` et reconnectez un compte connu.
6. Les données postérieures à la copie (comptes créés, matchs joués depuis) sont perdues : prévenez les joueurs.

> 💡 Pour une protection supplémentaire, recopiez `backups/` hors du serveur (rsync, espace objet…) :
> les copies locales ne protègent pas d'une perte du disque.

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
