# MVP 

## Estructura

```
mpv/
├── PARA/           # Frontend — React Native + Expo
├── WhatZatppa/     # Backend — AT Protocol / Node.js monorepo
└── README.md
```

## Setup

### Backend (WhatZatppa)

Requiere **Node.js 22** y **pnpm**:

```bash
cd WhatZatppa
make deps
make build          # genera dist/
make run-dev-env    # levanta PDS + AppView + Ozone local
```

> **Datos de prueba automáticos**: `make run-dev-env` ahora ejecuta un seed PARA que crea:
> - 5 usuarios (alice, bob, carla, dan, eva)
> - 3 comunidades
> - 4 cabildeos con votos y posiciones
> - 6 posts PARA con highlights
> - 2 delegaciones de voto
>
> Todos con password: `hunter2`

> Si cambias de versión de Node, reconstruye `better-sqlite3`:
> ```bash
> nvm use 22
> cd node_modules/.pnpm/better-sqlite3@10.0.0/node_modules/better-sqlite3
> npx node-gyp rebuild
> ```

### Frontend (PARA)

```bash
cd PARA
yarn install
yarn start
```

## Requisitos

- Node.js >= 22 (backend), >= 20 (frontend)
- pnpm >= 8
- Docker (para PostgreSQL / Redis de desarrollo)
