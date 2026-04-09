# Backend API

O backend Flask expõe os recursos que o SPA consome:

## Pacientes
- `GET /api/pacientes`: lista todos os pacientes
- `POST /api/pacientes`: cria um paciente (campo `nome` obrigatório)
- `GET /api/pacientes/<id>` / `PATCH /api/pacientes/<id>` / `DELETE /api/pacientes/<id>`: leitura, atualização parcial e remoção

## Agenda, Sessões, Financeiro e Registros
- Cada grupo segue o mesmo padrão (`GET` lista, `POST` insere, `GET`/`PATCH`/`DELETE` por `<id>`)
- Validações exigem `paciente_id` e campos essenciais, confirmam existência do paciente e validam valores numéricos (ex.: `valor`)
- A criação de registros preenche `paciente_nome` automaticamente se não for enviado

## Relatórios e Exportação
- `GET /api/relatorio_pdf/<paciente_id>` gera um PDF de evolução
- `GET /api/exportar/pacientes`, `/api/exportar/agenda` e `/api/exportar/financeiro` retornam planilhas Excel

## Integração com o frontend
1. Compile o frontend modern (`frontend`):
   ```
   cd frontend
   npm install
   npm run build
   ```
2. Sincronize os arquivos construídos:
   ```
   python backend/scripts/sync_frontend.py
   ```
3. Execute o backend (`python backend/app.py`) e navegue no SPA.

## Endpoints utilizados pelo SPA
| Caminho | Método | Observação |
| --- | --- | --- |
| `/api/patients` | `GET` / `POST` | Listagem e criação com campos em inglês |
| `/api/patients/<id>` | `PUT` / `DELETE` | Atualiza ou exclui um paciente |
| `/api/appointments` | `GET` / `POST` | Agenda em inglês |
| `/api/appointments/<id>` | `PUT` / `DELETE` | Atualização/exclusão de agendamento |
| `/api/records` | `GET` / `POST` | Históricos médicos (`registros`) |
| `/api/financial` | `GET` / `POST` | Histórico e registro financeiro |
| `/api/dashboard` | `GET` | Métricas e dados do dia |
| `/api/notifications` | `GET` | Lista as notificações |
| `/api/notifications/<id>/read` | `PUT` | Marca como lida |
| `/api/notifications/mark-all-read` | `POST` | Marca todas como lidas |
| `/api/reports/patient-pdf` | `POST` | Link para o PDF do paciente mais recente |
| `/api/reports/export-excel` | `POST` | Link para exportar pacientes |

### Observações
- Antes de ter o build, o Flask serve um placeholder em `backend/templates/index.html`.
- A tabela `notifications` registra o estado de leitura.
