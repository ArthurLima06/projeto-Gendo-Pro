# Gendo Pro

Este repositório agora está organizado por camadas:

```
project-root/
+-- backend/        # Flask application, templates, static e scripts
+-- frontend/       # Vite/React source, dist, configs
+-- database/       # SQLite, schema, migrations, seeders
+-- config/         # Configurações e variáveis de ambiente
+-- logs/           # Arquivos de log gerados em runtime
+-- README.md       # Esta documentação
+-- requirements.txt  # Dependências do backend
```

## Como rodar o backend
1. (Opcional) instale virtualenv/requirements:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Garanta que o banco esteja disponível em `database/database.db`.
3. Inicie o aplicativo:
   ```bash
   python backend/app.py
   ```

O backend roda em `localhost:5000` e serve:
- `/api/*` para o REST completo
- `/assets/*` e `/static/*` para o SPA
- `/` e rotas desconhecidas para `backend/templates/index.html`
- `/api/health` para check de integridade

## Como rebuildar o frontend
1. Entre em `frontend`:
   ```bash
   cd frontend
   npm install
   npm run build
   ```
2. Volte para a raiz e copie os arquivos construídos:
   ```bash
   python backend/scripts/sync_frontend.py
   ```
3. Reinicie o backend para servir o novo SPA.

## Sincronização e logs
- O script `backend/scripts/sync_frontend.py` copia `frontend/dist/index.html` e os ativos estáticos para `backend/templates` e `backend/static`.
- Os logs podem ser direcionados para `logs/` conforme o ambiente.

## Configurações adicionais
- Caminhos úteis: `config/settings.py`, `config/.env`.
- O backend lê `config.settings.DATABASE_DIR` e `DATABASE_DIR / "database.db"`.

## Observações
- A tabela `notifications` mantém o status de leitura.
- O `backend` permanece responsável por todas as rotas e lógica do Flask; o `frontend` é apenas um cliente SPA.
