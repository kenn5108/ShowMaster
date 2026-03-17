# ShowMaster V2

Contrôle de spectacle en direct pour [RocketShow](https://rocketshow.net) sur Raspberry Pi.

ShowMaster fournit une interface web pour gérer les playlists, les files d'attente, les paroles synchronisées et les messages scéniques pendant un spectacle live. Il se connecte à RocketShow pour le contrôle de la lecture audio/vidéo.

## Prérequis

- Raspberry Pi avec RocketShow installé
- Node.js 18 ou supérieur
- Git

Pour installer Node.js 18+ sur Raspberry Pi OS :

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git
```

## Installation

Une seule commande :

```bash
git clone https://github.com/VOTRE_USER/ShowMaster.git ~/ShowMaster
cd ~/ShowMaster
bash install.sh
```

Le script d'installation configure automatiquement :
- les dépendances Node.js (serveur + client)
- la compilation de l'interface
- la base de données
- le service systemd (démarrage automatique)
- les permissions nécessaires pour les mises à jour

Aucune configuration manuelle supplémentaire n'est requise.

## Utilisation

Après installation, ShowMaster est accessible depuis n'importe quel appareil sur le même réseau :

| Page | URL |
|------|-----|
| Interface de contrôle | `http://<ip-du-pi>:3000` |
| Vue prompteur (plein écran) | `http://<ip-du-pi>:3000/prompter` |

Pour connaître l'adresse IP du Pi : `hostname -I`

## Mises à jour

Les mises à jour se font directement depuis l'interface ShowMaster, sans aucune ligne de commande :

1. Ouvrir **Réglages** dans ShowMaster
2. Cliquer sur **Rechercher les mises à jour**
3. Si une mise à jour est disponible, cliquer sur **Appliquer la mise à jour**
4. Un écran d'attente s'affiche pendant la mise à jour
5. Les pages se rechargent automatiquement quand c'est terminé

En cas de besoin, la mise à jour peut aussi être lancée manuellement :

```bash
cd ~/ShowMaster
bash scripts/update.sh
```

## Architecture

```
ShowMaster/
├── client/              Interface React (Vite)
│   ├── src/
│   └── dist/            Build de production (généré)
├── server/              Serveur Node.js / Express / Socket.IO
│   └── src/
├── data/                Base de données SQLite (générée)
├── scripts/
│   └── update.sh        Script de mise à jour
├── system/
│   └── showmaster.service   Template systemd
├── install.sh           Script d'installation
└── package.json
```

## Commandes utiles

```bash
# Statut du service
sudo systemctl status showmaster

# Redémarrer le service
sudo systemctl restart showmaster

# Voir les logs en direct
sudo journalctl -u showmaster -f

# Arrêter le service
sudo systemctl stop showmaster
```

## Développement

Pour travailler en mode développement (avec hot-reload) :

```bash
cd ~/ShowMaster
npm run dev
```

Cela lance le serveur Node.js (port 3000) et le serveur Vite de développement en parallèle.

## Configuration

ShowMaster se configure depuis l'interface (Réglages). Les paramètres principaux :

- **Connexion RocketShow** : adresse et port de RocketShow (par défaut `127.0.0.1:8181`)
- **Décalage de synchro** : ajustement global du timing des paroles (±100 ms par pas)
- **Mode de lecture** : automatique (enchaîne les morceaux) ou manuel

## Licence

Projet privé — French Touch Records.
