-- Esquema de banco de dados para o sistema de gestão

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pacientes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  idade INTEGER,
  escola TEXT,
  responsavel TEXT,
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agenda (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL,
  professional_id TEXT,
  data TEXT NOT NULL,
  horario TEXT NOT NULL,
  duracao INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'agendado',
  motivo TEXT,
  profissional TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessoes (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL,
  data TEXT NOT NULL,
  atividade TEXT,
  observacoes TEXT,
  evolucao TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS financeiro (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL,
  data TEXT NOT NULL,
  valor REAL NOT NULL,
  status TEXT NOT NULL,
  metodo_pagamento TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS professionals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin', 'common')),
  future_plan TEXT,
  future_status TEXT NOT NULL DEFAULT 'active',
  future_company_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS registros (
  id TEXT PRIMARY KEY,
  paciente_id TEXT NOT NULL,
  paciente_nome TEXT,
  data TEXT NOT NULL,
  hora TEXT NOT NULL,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  linked_date TEXT,
  created_at TEXT NOT NULL
);

