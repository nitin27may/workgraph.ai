import Database from 'better-sqlite3';
import path from 'path';
import type { SummarizationMetrics, TokenUsage } from '@/types/meeting';

// Database file path - stored in the project root
const DB_PATH = path.join(process.cwd(), 'usage.db');

// Azure OpenAI pricing from environment variables
// Defaults to GPT-4.1 Regional (US East) pricing
export const PRICING = {
  INPUT_COST_PER_1M: parseFloat(process.env.AZURE_OPENAI_INPUT_COST_PER_1M || '2.20'),
  OUTPUT_COST_PER_1M: parseFloat(process.env.AZURE_OPENAI_OUTPUT_COST_PER_1M || '8.80'),
};

export interface UsageRecord {
  id: number;
  meetingSubject: string;
  meetingDate: string;
  meetingDurationMinutes: number | null;
  transcriptLength: number;
  transcriptWordCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  processingTimeMs: number;
  model: string;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  createdAt: string;
  requestedBy: string | null;
  requestedByEmail: string | null;
}

// User roles
export type UserRole = 'admin' | 'user';

export interface AuthorizedUser {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
}

export interface PromptTemplate {
  id: number;
  name: string;
  description: string | null;
  systemPrompt: string;
  userPromptTemplate: string;
  isDefault: boolean;
  isGlobal: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// Admin email - has full access by default
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

// Singleton database instance
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  const db = new Database(DB_PATH);

  // Run schema initialization once
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meetingSubject TEXT NOT NULL,
      meetingDate TEXT NOT NULL,
      meetingDurationMinutes INTEGER,
      transcriptLength INTEGER NOT NULL,
      transcriptWordCount INTEGER NOT NULL,
      promptTokens INTEGER NOT NULL,
      completionTokens INTEGER NOT NULL,
      totalTokens INTEGER NOT NULL,
      processingTimeMs INTEGER NOT NULL,
      model TEXT NOT NULL,
      inputCost REAL NOT NULL,
      outputCost REAL NOT NULL,
      totalCost REAL NOT NULL,
      createdAt TEXT NOT NULL,
      requestedBy TEXT,
      requestedByEmail TEXT
    )
  `);
  
  // Create authorized_users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS authorized_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      createdBy TEXT
    )
  `);
  
  // Create prompt_templates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      systemPrompt TEXT NOT NULL,
      userPromptTemplate TEXT NOT NULL,
      isDefault INTEGER NOT NULL DEFAULT 0,
      isGlobal INTEGER NOT NULL DEFAULT 0,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);
  
  // Seed admin user if not exists (only if ADMIN_EMAIL is configured)
  if (ADMIN_EMAIL) {
    const adminExists = db.prepare('SELECT id FROM authorized_users WHERE email = ?').get(ADMIN_EMAIL);
    if (!adminExists) {
      db.prepare(`
        INSERT INTO authorized_users (email, name, role, isActive, createdAt, createdBy)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(ADMIN_EMAIL, 'Admin', 'admin', 1, new Date().toISOString(), 'system');
    }
  }
  
  // Seed default global prompt if not exists
  const defaultPromptExists = db.prepare('SELECT id FROM prompt_templates WHERE isGlobal = 1').get();
  if (!defaultPromptExists) {
    const defaultSystemPrompt = `You are a meeting summarizer for enterprise clients.

Extract and structure the following from the transcript:
1. Key decisions made (max 5)
2. Action items with owners and deadlines
3. Important metrics/numbers mentioned
4. Next steps

Return ONLY valid JSON with this exact structure:
{
  "keyDecisions": ["decision1", "decision2"],
  "actionItems": [
    {"owner": "John", "task": "Follow up with client", "deadline": "Friday"}
  ],
  "metrics": ["1,247 claims processed", "3.2 days average turnaround"],
  "nextSteps": ["step1", "step2"],
  "fullSummary": "narrative summary here"
}

Be concise. Focus on actionable information. If a field has no data, return empty array.`;

    const defaultUserPromptTemplate = `Meeting: {{meetingSubject}}
Date: {{meetingDate}}

Transcript:
{{transcript}}`;

    db.prepare(`
      INSERT INTO prompt_templates (name, description, systemPrompt, userPromptTemplate, isDefault, isGlobal, createdBy, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Default Meeting Summary',
      'Standard enterprise meeting summarization format',
      defaultSystemPrompt,
      defaultUserPromptTemplate,
      1,
      1,
      'system',
      new Date().toISOString(),
      new Date().toISOString()
    );
  }
  
  // Add columns if they don't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE usage ADD COLUMN requestedBy TEXT`);
  } catch { /* column already exists */ }
  try {
    db.exec(`ALTER TABLE usage ADD COLUMN requestedByEmail TEXT`);
  } catch { /* column already exists */ }

  // Create meeting_summaries table for caching AI-generated summaries
  db.exec(`
    CREATE TABLE IF NOT EXISTS meeting_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meetingId TEXT NOT NULL UNIQUE,
      subject TEXT,
      meetingDate TEXT,
      summary TEXT NOT NULL,
      transcriptLength INTEGER,
      model TEXT,
      generatedAt TEXT NOT NULL,
      generatedBy TEXT
    )
  `);

  // Create email_summaries table for caching email summaries
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emailId TEXT NOT NULL UNIQUE,
      subject TEXT,
      fromEmail TEXT,
      receivedDate TEXT,
      summary TEXT NOT NULL,
      model TEXT,
      generatedAt TEXT NOT NULL,
      generatedBy TEXT
    )
  `);

  // Create indices for better query performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meeting_summaries_meetingId ON meeting_summaries(meetingId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meeting_summaries_generatedAt ON meeting_summaries(generatedAt)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_summaries_emailId ON email_summaries(emailId)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_email_summaries_generatedAt ON email_summaries(generatedAt)`);

  _db = db;
  return _db;
}

export function calculateCost(tokenUsage: TokenUsage): { inputCost: number; outputCost: number; totalCost: number } {
  const inputCost = (tokenUsage.promptTokens / 1_000_000) * PRICING.INPUT_COST_PER_1M;
  const outputCost = (tokenUsage.completionTokens / 1_000_000) * PRICING.OUTPUT_COST_PER_1M;
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

export function saveUsageMetrics(metrics: SummarizationMetrics): UsageRecord {
  const db = getDb();
  
  const costs = calculateCost(metrics.tokenUsage);
  
  const stmt = db.prepare(`
    INSERT INTO usage (
      meetingSubject, meetingDate, meetingDurationMinutes,
      transcriptLength, transcriptWordCount,
      promptTokens, completionTokens, totalTokens,
      processingTimeMs, model,
      inputCost, outputCost, totalCost,
      createdAt, requestedBy, requestedByEmail
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const result = stmt.run(
    metrics.meetingSubject,
    metrics.meetingDate,
    metrics.meetingDurationMinutes,
    metrics.transcriptLength,
    metrics.transcriptWordCount,
    metrics.tokenUsage.promptTokens,
    metrics.tokenUsage.completionTokens,
    metrics.tokenUsage.totalTokens,
    metrics.processingTimeMs,
    metrics.model,
    costs.inputCost,
    costs.outputCost,
    costs.totalCost,
    metrics.timestamp,
    metrics.requestedBy ?? null,
    metrics.requestedByEmail ?? null
  );
  
  db.close();
  
  return {
    id: result.lastInsertRowid as number,
    meetingSubject: metrics.meetingSubject,
    meetingDate: metrics.meetingDate,
    meetingDurationMinutes: metrics.meetingDurationMinutes,
    transcriptLength: metrics.transcriptLength,
    transcriptWordCount: metrics.transcriptWordCount,
    promptTokens: metrics.tokenUsage.promptTokens,
    completionTokens: metrics.tokenUsage.completionTokens,
    totalTokens: metrics.tokenUsage.totalTokens,
    processingTimeMs: metrics.processingTimeMs,
    model: metrics.model,
    inputCost: costs.inputCost,
    outputCost: costs.outputCost,
    totalCost: costs.totalCost,
    createdAt: metrics.timestamp,
    requestedBy: metrics.requestedBy ?? null,
    requestedByEmail: metrics.requestedByEmail ?? null,
  };
}

export function getAllUsageRecords(): UsageRecord[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM usage ORDER BY createdAt DESC');
  const records = stmt.all() as UsageRecord[];
  db.close();
  return records;
}

export function getUsageStats(): {
  totalRecords: number;
  totalTokens: number;
  totalCost: number;
  avgTokensPerMeeting: number;
  avgCostPerMeeting: number;
  avgProcessingTimeMs: number;
} {
  const db = getDb();
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as totalRecords,
      COALESCE(SUM(totalTokens), 0) as totalTokens,
      COALESCE(SUM(totalCost), 0) as totalCost,
      COALESCE(AVG(totalTokens), 0) as avgTokensPerMeeting,
      COALESCE(AVG(totalCost), 0) as avgCostPerMeeting,
      COALESCE(AVG(processingTimeMs), 0) as avgProcessingTimeMs
    FROM usage
  `).get() as {
    totalRecords: number;
    totalTokens: number;
    totalCost: number;
    avgTokensPerMeeting: number;
    avgCostPerMeeting: number;
    avgProcessingTimeMs: number;
  };
  
  db.close();
  return stats;
}

export function exportUsageToCsv(): string {
  const records = getAllUsageRecords();
  
  const headers = [
    'ID',
    'Meeting Subject',
    'Meeting Date',
    'Duration (min)',
    'Transcript Length',
    'Word Count',
    'Prompt Tokens',
    'Completion Tokens',
    'Total Tokens',
    'Processing Time (ms)',
    'Model',
    'Input Cost ($)',
    'Output Cost ($)',
    'Total Cost ($)',
    'Created At',
    'Requested By',
    'Requested By Email',
  ];
  
  const rows = records.map(r => [
    r.id,
    `"${r.meetingSubject.replace(/"/g, '""')}"`,
    r.meetingDate,
    r.meetingDurationMinutes ?? '',
    r.transcriptLength,
    r.transcriptWordCount,
    r.promptTokens,
    r.completionTokens,
    r.totalTokens,
    r.processingTimeMs,
    r.model,
    r.inputCost.toFixed(6),
    r.outputCost.toFixed(6),
    r.totalCost.toFixed(6),
    r.createdAt,
    r.requestedBy ? `"${r.requestedBy.replace(/"/g, '""')}"` : '',
    r.requestedByEmail ?? '',
  ].join(','));
  
  return [headers.join(','), ...rows].join('\n');
}

export function importUsageFromCsv(csvContent: string): { imported: number; errors: string[] } {
  const db = getDb();
  const lines = csvContent.trim().split('\n');
  const errors: string[] = [];
  let imported = 0;
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    try {
      const line = lines[i];
      // Parse CSV properly handling quoted fields
      const values = parseCSVLine(line);
      
      if (values.length < 15) {
        errors.push(`Line ${i + 1}: Insufficient columns (expected 15, got ${values.length})`);
        continue;
      }
      
      const stmt = db.prepare(`
        INSERT INTO usage (
          meetingSubject, meetingDate, meetingDurationMinutes,
          transcriptLength, transcriptWordCount,
          promptTokens, completionTokens, totalTokens,
          processingTimeMs, model,
          inputCost, outputCost, totalCost,
          createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        values[1], // meetingSubject
        values[2], // meetingDate
        values[3] === '' ? null : parseInt(values[3]), // meetingDurationMinutes
        parseInt(values[4]), // transcriptLength
        parseInt(values[5]), // transcriptWordCount
        parseInt(values[6]), // promptTokens
        parseInt(values[7]), // completionTokens
        parseInt(values[8]), // totalTokens
        parseInt(values[9]), // processingTimeMs
        values[10], // model
        parseFloat(values[11]), // inputCost
        parseFloat(values[12]), // outputCost
        parseFloat(values[13]), // totalCost
        values[14], // createdAt
      );
      
      imported++;
    } catch (error) {
      errors.push(`Line ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  db.close();
  return { imported, errors };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

export function deleteUsageRecord(id: number): boolean {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM usage WHERE id = ?');
  const result = stmt.run(id);
  db.close();
  return result.changes > 0;
}

export function clearAllUsage(): number {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM usage');
  const result = stmt.run();
  db.close();
  return result.changes;
}

// ============ User Authorization Functions ============

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export function isUserAuthorized(email: string | null | undefined): { authorized: boolean; user: AuthorizedUser | null; isAdmin: boolean } {
  if (!email) return { authorized: false, user: null, isAdmin: false };
  
  // Admin always has access
  if (isAdmin(email)) {
    return { 
      authorized: true, 
      user: { 
        id: 0, 
        email, 
        name: 'Admin', 
        role: 'admin', 
        isActive: true, 
        createdAt: '', 
        createdBy: 'system' 
      }, 
      isAdmin: true 
    };
  }
  
  const db = getDb();
  const user = db.prepare('SELECT * FROM authorized_users WHERE email = ? AND isActive = 1').get(email.toLowerCase()) as AuthorizedUser | undefined;
  db.close();
  
  if (user) {
    return { authorized: true, user, isAdmin: user.role === 'admin' };
  }
  
  return { authorized: false, user: null, isAdmin: false };
}

export function getAllAuthorizedUsers(): AuthorizedUser[] {
  const db = getDb();
  const users = db.prepare('SELECT * FROM authorized_users ORDER BY createdAt DESC').all() as AuthorizedUser[];
  db.close();
  return users;
}

export function addAuthorizedUser(email: string, name: string | null, role: UserRole, createdBy: string): AuthorizedUser {
  const db = getDb();
  
  const stmt = db.prepare(`
    INSERT INTO authorized_users (email, name, role, isActive, createdAt, createdBy)
    VALUES (?, ?, ?, 1, ?, ?)
  `);
  
  const result = stmt.run(
    email.toLowerCase(),
    name,
    role,
    new Date().toISOString(),
    createdBy
  );
  
  const user: AuthorizedUser = {
    id: result.lastInsertRowid as number,
    email: email.toLowerCase(),
    name,
    role,
    isActive: true,
    createdAt: new Date().toISOString(),
    createdBy,
  };
  
  db.close();
  return user;
}

export function updateAuthorizedUser(id: number, updates: { name?: string; role?: UserRole; isActive?: boolean }): boolean {
  const db = getDb();
  
  const setClauses: string[] = [];
  const values: (string | number)[] = [];
  
  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.role !== undefined) {
    setClauses.push('role = ?');
    values.push(updates.role);
  }
  if (updates.isActive !== undefined) {
    setClauses.push('isActive = ?');
    values.push(updates.isActive ? 1 : 0);
  }
  
  if (setClauses.length === 0) {
    db.close();
    return false;
  }
  
  values.push(id);
  const stmt = db.prepare(`UPDATE authorized_users SET ${setClauses.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  db.close();
  
  return result.changes > 0;
}

export function deleteAuthorizedUser(id: number): boolean {
  const db = getDb();
  // Don't allow deleting the main admin
  const user = db.prepare('SELECT email FROM authorized_users WHERE id = ?').get(id) as { email: string } | undefined;
  if (user && isAdmin(user.email)) {
    db.close();
    return false; // Can't delete admin
  }
  
  const stmt = db.prepare('DELETE FROM authorized_users WHERE id = ?');
  const result = stmt.run(id);
  db.close();
  return result.changes > 0;
}

export function getUserByEmail(email: string): AuthorizedUser | null {
  const db = getDb();
  const user = db.prepare('SELECT * FROM authorized_users WHERE email = ?').get(email.toLowerCase()) as AuthorizedUser | undefined;
  db.close();
  return user || null;
}

// Export authorized users to CSV
export function exportUsersToCsv(): string {
  const users = getAllAuthorizedUsers();
  const headers = ['email', 'name', 'role', 'isActive', 'createdAt', 'createdBy'];
  const rows = users.map(user => [
    user.email,
    user.name || '',
    user.role,
    user.isActive ? 'true' : 'false',
    user.createdAt,
    user.createdBy || '',
  ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
  
  return [headers.join(','), ...rows].join('\n');
}

// Import authorized users from CSV
export function importUsersFromCsv(csvContent: string, importedBy: string): { imported: number; skipped: number; errors: string[] } {
  const lines = csvContent.trim().split('\n');
  const result = { imported: 0, skipped: 0, errors: [] as string[] };
  
  if (lines.length < 2) {
    result.errors.push('CSV file must have a header row and at least one data row');
    return result;
  }
  
  // Parse header
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').toLowerCase().trim());
  const emailIdx = headers.indexOf('email');
  const nameIdx = headers.indexOf('name');
  const roleIdx = headers.indexOf('role');
  
  if (emailIdx === -1) {
    result.errors.push('CSV must have an "email" column');
    return result;
  }
  
  const db = getDb();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      // Simple CSV parsing (handles quoted values)
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          if (inQuotes && line[j + 1] === '"') {
            current += '"';
            j++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      const email = values[emailIdx]?.toLowerCase();
      if (!email) {
        result.errors.push(`Row ${i + 1}: Missing email`);
        continue;
      }
      
      // Check if user exists
      const existing = db.prepare('SELECT id FROM authorized_users WHERE email = ?').get(email);
      if (existing) {
        result.skipped++;
        continue;
      }
      
      const name = nameIdx >= 0 ? values[nameIdx] || null : null;
      const role = roleIdx >= 0 && values[roleIdx] === 'admin' ? 'admin' : 'user';
      
      db.prepare(`
        INSERT INTO authorized_users (email, name, role, isActive, createdAt, createdBy)
        VALUES (?, ?, ?, 1, ?, ?)
      `).run(email, name, role, new Date().toISOString(), importedBy);
      
      result.imported++;
    } catch (error) {
      result.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`);
    }
  }
  
  db.close();
  return result;
}

// ============ Prompt Template Functions ============

export function getUserPromptTemplates(userEmail: string): PromptTemplate[] {
  const db = getDb();
  const prompts = db.prepare(`
    SELECT * FROM prompt_templates 
    WHERE isGlobal = 1 OR createdBy = ?
    ORDER BY isGlobal DESC, isDefault DESC, name ASC
  `).all(userEmail) as PromptTemplate[];
  db.close();
  return prompts.map(p => ({
    ...p,
    isDefault: !!p.isDefault,
    isGlobal: !!p.isGlobal,
  }));
}

export function getUserDefaultPrompt(userEmail: string): PromptTemplate | null {
  const db = getDb();
  
  // First, try to get user's default prompt
  const userDefault = db.prepare(`
    SELECT * FROM prompt_templates 
    WHERE createdBy = ? AND isDefault = 1
    LIMIT 1
  `).get(userEmail) as PromptTemplate | undefined;
  
  if (userDefault) {
    db.close();
    return { ...userDefault, isDefault: !!userDefault.isDefault, isGlobal: !!userDefault.isGlobal };
  }
  
  // Fallback to global default
  const globalDefault = db.prepare(`
    SELECT * FROM prompt_templates 
    WHERE isGlobal = 1
    LIMIT 1
  `).get() as PromptTemplate | undefined;
  
  db.close();
  
  if (globalDefault) {
    return { ...globalDefault, isDefault: !!globalDefault.isDefault, isGlobal: !!globalDefault.isGlobal };
  }
  
  return null;
}

export function getPromptTemplateById(id: number, userEmail: string): PromptTemplate | null {
  const db = getDb();
  const prompt = db.prepare(`
    SELECT * FROM prompt_templates 
    WHERE id = ? AND (isGlobal = 1 OR createdBy = ?)
  `).get(id, userEmail) as PromptTemplate | undefined;
  db.close();
  
  if (!prompt) return null;
  return { ...prompt, isDefault: !!prompt.isDefault, isGlobal: !!prompt.isGlobal };
}

export function createPromptTemplate(
  name: string,
  description: string | null,
  systemPrompt: string,
  userPromptTemplate: string,
  isDefault: boolean,
  createdBy: string
): PromptTemplate {
  const db = getDb();
  
  // If this is being set as default, unset other user defaults
  if (isDefault) {
    db.prepare('UPDATE prompt_templates SET isDefault = 0 WHERE createdBy = ?').run(createdBy);
  }
  
  const stmt = db.prepare(`
    INSERT INTO prompt_templates (name, description, systemPrompt, userPromptTemplate, isDefault, isGlobal, createdBy, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
  `);
  
  const now = new Date().toISOString();
  const result = stmt.run(name, description, systemPrompt, userPromptTemplate, isDefault ? 1 : 0, createdBy, now, now);
  
  const prompt: PromptTemplate = {
    id: result.lastInsertRowid as number,
    name,
    description,
    systemPrompt,
    userPromptTemplate,
    isDefault,
    isGlobal: false,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  
  db.close();
  return prompt;
}

export function updatePromptTemplate(
  id: number,
  userEmail: string,
  updates: {
    name?: string;
    description?: string | null;
    systemPrompt?: string;
    userPromptTemplate?: string;
    isDefault?: boolean;
  }
): boolean {
  const db = getDb();
  
  // Check if user owns this prompt (can't update global prompts)
  const prompt = db.prepare('SELECT createdBy, isGlobal FROM prompt_templates WHERE id = ?').get(id) as { createdBy: string; isGlobal: number } | undefined;
  
  if (!prompt || prompt.isGlobal || prompt.createdBy !== userEmail) {
    db.close();
    return false;
  }
  
  // If setting as default, unset other defaults
  if (updates.isDefault) {
    db.prepare('UPDATE prompt_templates SET isDefault = 0 WHERE createdBy = ?').run(userEmail);
  }
  
  const setClauses: string[] = ['updatedAt = ?'];
  const values: any[] = [new Date().toISOString()];
  
  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    values.push(updates.description);
  }
  if (updates.systemPrompt !== undefined) {
    setClauses.push('systemPrompt = ?');
    values.push(updates.systemPrompt);
  }
  if (updates.userPromptTemplate !== undefined) {
    setClauses.push('userPromptTemplate = ?');
    values.push(updates.userPromptTemplate);
  }
  if (updates.isDefault !== undefined) {
    setClauses.push('isDefault = ?');
    values.push(updates.isDefault ? 1 : 0);
  }
  
  values.push(id);
  const stmt = db.prepare(`UPDATE prompt_templates SET ${setClauses.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  
  db.close();
  return result.changes > 0;
}

export function deletePromptTemplate(id: number, userEmail: string): boolean {
  const db = getDb();

  // Only allow user to delete their own templates or admins to delete any
  const isAdminUser = isAdmin(userEmail);
  const filterClause = isAdminUser ? 'id = ?' : 'id = ? AND createdBy = ?';
  const params = isAdminUser ? [id] : [id, userEmail];

  const stmt = db.prepare(`DELETE FROM prompt_templates WHERE ${filterClause}`);
  const result = stmt.run(...params);

  db.close();
  return result.changes > 0;
}

// ============================================
// Meeting Summaries - Caching Functions
// ============================================

export interface MeetingSummaryCache {
  id: number;
  meetingId: string;
  subject: string | null;
  meetingDate: string | null;
  summary: string; // JSON string
  transcriptLength: number | null;
  model: string | null;
  generatedAt: string;
  generatedBy: string | null;
}

export function saveMeetingSummary(
  meetingId: string,
  summary: any,
  metadata: {
    subject?: string;
    meetingDate?: string;
    transcriptLength?: number;
    model?: string;
    generatedBy?: string;
  }
): MeetingSummaryCache {
  const db = getDb();
  
  const summaryJson = JSON.stringify(summary);
  const now = new Date().toISOString();
  
  // Upsert: replace if exists
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO meeting_summaries 
    (meetingId, subject, meetingDate, summary, transcriptLength, model, generatedAt, generatedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    meetingId,
    metadata.subject || null,
    metadata.meetingDate || null,
    summaryJson,
    metadata.transcriptLength || null,
    metadata.model || null,
    now,
    metadata.generatedBy || null
  );
  
  const result = db.prepare('SELECT * FROM meeting_summaries WHERE meetingId = ?').get(meetingId) as MeetingSummaryCache;
  db.close();
  
  return result;
}

export function getMeetingSummaryByMeetingId(meetingId: string): MeetingSummaryCache | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM meeting_summaries WHERE meetingId = ?');
  const result = stmt.get(meetingId) as MeetingSummaryCache | undefined;
  db.close();
  
  return result || null;
}

export function deleteMeetingSummary(meetingId: string): boolean {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM meeting_summaries WHERE meetingId = ?');
  const result = stmt.run(meetingId);
  db.close();
  
  return result.changes > 0;
}

export function getAllMeetingSummaries(limit: number = 100): MeetingSummaryCache[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM meeting_summaries ORDER BY generatedAt DESC LIMIT ?');
  const results = stmt.all(limit) as MeetingSummaryCache[];
  db.close();
  
  return results;
}

// ============================================
// Email Summaries - Caching Functions
// ============================================

export interface EmailSummaryCache {
  id: number;
  emailId: string;
  subject: string | null;
  fromEmail: string | null;
  receivedDate: string | null;
  summary: string; // JSON string
  model: string | null;
  generatedAt: string;
  generatedBy: string | null;
}

export function saveEmailSummary(
  emailId: string,
  summary: any,
  metadata: {
    subject?: string;
    fromEmail?: string;
    receivedDate?: string;
    model?: string;
    generatedBy?: string;
  }
): EmailSummaryCache {
  const db = getDb();
  
  const summaryJson = JSON.stringify(summary);
  const now = new Date().toISOString();
  
  // Upsert: replace if exists
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO email_summaries 
    (emailId, subject, fromEmail, receivedDate, summary, model, generatedAt, generatedBy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    emailId,
    metadata.subject || null,
    metadata.fromEmail || null,
    metadata.receivedDate || null,
    summaryJson,
    metadata.model || null,
    now,
    metadata.generatedBy || null
  );
  
  const result = db.prepare('SELECT * FROM email_summaries WHERE emailId = ?').get(emailId) as EmailSummaryCache;
  db.close();
  
  return result;
}

export function getEmailSummaryById(emailId: string): EmailSummaryCache | null {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM email_summaries WHERE emailId = ?');
  const result = stmt.get(emailId) as EmailSummaryCache | undefined;
  db.close();
  
  return result || null;
}

export function deleteEmailSummary(emailId: string): boolean {
  const db = getDb();
  const stmt = db.prepare('DELETE FROM email_summaries WHERE emailId = ?');
  const result = stmt.run(emailId);
  db.close();
  
  return result.changes > 0;
}

export function getAllEmailSummaries(limit: number = 100): EmailSummaryCache[] {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM email_summaries ORDER BY generatedAt DESC LIMIT ?');
  const results = stmt.all(limit) as EmailSummaryCache[];
  db.close();
  
  return results;
}

export function setDefaultPrompt(id: number, userEmail: string): boolean {
  const db = getDb();
  
  // Check if user can access this prompt
  const prompt = db.prepare('SELECT isGlobal, createdBy FROM prompt_templates WHERE id = ?').get(id) as { isGlobal: number; createdBy: string } | undefined;
  
  if (!prompt || (!prompt.isGlobal && prompt.createdBy !== userEmail)) {
    db.close();
    return false;
  }
  
  // Unset all user defaults
  db.prepare('UPDATE prompt_templates SET isDefault = 0 WHERE createdBy = ?').run(userEmail);
  
  // Set new default
  db.prepare('UPDATE prompt_templates SET isDefault = 1, updatedAt = ? WHERE id = ?').run(new Date().toISOString(), id);
  
  db.close();
  return true;
}

// ============================================
// Cache Management
// ============================================

export function clearAllMeetingSummaries(): { deleted: number } {
  const db = getDb();
  const result = db.prepare('DELETE FROM meeting_summaries').run();
  db.close();
  return { deleted: result.changes };
}

export function clearAllEmailSummaries(): { deleted: number } {
  const db = getDb();
  const result = db.prepare('DELETE FROM email_summaries').run();
  db.close();
  return { deleted: result.changes };
}

export function clearAllCachedData(): { meetingsDeleted: number; emailsDeleted: number } {
  const meetingResult = clearAllMeetingSummaries();
  const emailResult = clearAllEmailSummaries();
  return {
    meetingsDeleted: meetingResult.deleted,
    emailsDeleted: emailResult.deleted
  };
}
