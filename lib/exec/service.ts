import { RiskClass, Decision, ExecOptions, ExecResult } from './types';
import { classify, ClassifyResult } from './policy';
import { redactSecrets, limitOutput } from './redact';
import { getBackend } from './registry';
import { db, ExecLogEntry } from '../db';

export type PolicyPreset = 'cautious' | 'balanced' | 'autopilot' | 'custom';

export interface ExecPolicyConfig {
  preset: PolicyPreset;
  rules: Record<RiskClass, Decision>;
  allowList: string[];
}

export const PRESET_CONFIGS: Record<Exclude<PolicyPreset, 'custom'>, Record<RiskClass, Decision>> = {
  cautious: {
    read: 'auto',
    write: 'ask',
    install: 'ask',
    network: 'ask',
    destructive: 'ask',
    privileged: 'ask',
    secret: 'ask',
  },
  balanced: {
    read: 'auto',
    write: 'auto',
    install: 'auto',
    network: 'auto',
    destructive: 'ask',
    privileged: 'ask',
    secret: 'ask',
  },
  autopilot: {
    read: 'auto',
    write: 'auto',
    install: 'auto',
    network: 'auto',
    secret: 'auto',
    destructive: 'ask',
    privileged: 'ask',
  },
};

export const DEFAULT_POLICY_CONFIG: ExecPolicyConfig = {
  preset: 'balanced',
  rules: PRESET_CONFIGS.balanced,
  allowList: [],
};

// Global active abort controllers for Kill Switch
const activeAbortControllers = new Set<AbortController>();

export async function getPolicyConfig(): Promise<ExecPolicyConfig> {
  try {
    const row = await db.meta.get('execPolicy');
    if (row && row.value) {
      return {
        preset: row.value.preset || 'balanced',
        rules: { ...DEFAULT_POLICY_CONFIG.rules, ...(row.value.rules || {}) },
        allowList: Array.isArray(row.value.allowList) ? row.value.allowList : [],
      };
    }
  } catch {}
  return DEFAULT_POLICY_CONFIG;
}

export async function savePolicyConfig(config: ExecPolicyConfig): Promise<void> {
  await db.meta.put({ key: 'execPolicy', value: config });
}

export async function setPolicyPreset(preset: PolicyPreset): Promise<ExecPolicyConfig> {
  let rules = PRESET_CONFIGS.balanced;
  if (preset in PRESET_CONFIGS) {
    rules = PRESET_CONFIGS[preset as keyof typeof PRESET_CONFIGS];
  } else {
    const current = await getPolicyConfig();
    rules = current.rules;
  }
  const current = await getPolicyConfig();
  const nextConfig: ExecPolicyConfig = {
    preset,
    rules: { ...rules },
    allowList: current.allowList,
  };
  await savePolicyConfig(nextConfig);
  return nextConfig;
}

export async function addAllowListPattern(pattern: string): Promise<string[]> {
  const clean = pattern.trim();
  if (!clean) return [];
  const current = await getPolicyConfig();
  if (!current.allowList.includes(clean)) {
    current.allowList.push(clean);
    await savePolicyConfig(current);
  }
  return current.allowList;
}

export async function removeAllowListPattern(pattern: string): Promise<string[]> {
  const current = await getPolicyConfig();
  current.allowList = current.allowList.filter((p) => p !== pattern);
  await savePolicyConfig(current);
  return current.allowList;
}

export async function pruneAuditLog(): Promise<void> {
  try {
    const count = await db.execlog.count();
    if (count > 2000) {
      const excess = count - 2000;
      const oldestKeys = await db.execlog.orderBy('ts').limit(excess).primaryKeys();
      await db.execlog.bulkDelete(oldestKeys);
    }
  } catch {}
}

export async function killAll(): Promise<void> {
  // 1. Abort all active execution controllers
  for (const controller of activeAbortControllers) {
    try {
      controller.abort();
    } catch {}
  }
  activeAbortControllers.clear();

  // 2. Reset policy preset to cautious
  await setPolicyPreset('cautious');
}

export interface ExecContext {
  chatId?: string;
  workspaceRoot?: string;
  onApprovalRequired?: (info: {
    cmd: string;
    riskClasses: RiskClass[];
    reasons: string[];
  }) => Promise<{ approved: boolean; allowPattern?: string }>;
}

export async function execForAgent(
  opts: ExecOptions,
  ctx: ExecContext = {}
): Promise<ExecResult> {
  const startTime = Date.now();
  const workspaceRoot = ctx.workspaceRoot || '/workspace';
  const policyConfig = await getPolicyConfig();

  // 1. Classify command
  const classifyRes: ClassifyResult = classify(opts.cmd, { workspaceRoot });
  const riskClasses = Array.from(classifyRes.classes);

  // 2. Hard block check
  if (classifyRes.blocked) {
    const errorResult: ExecResult = {
      stdout: '',
      stderr: `Command blocked by policy: ${classifyRes.blocked}`,
      exitCode: -1,
      durationMs: Date.now() - startTime,
      timedOut: false,
      truncated: false,
    };

    const entry: ExecLogEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      chatId: ctx.chatId,
      cmd: opts.cmd,
      cwd: opts.cwd,
      riskClasses,
      decision: 'deny',
      exitCode: -1,
      durationMs: errorResult.durationMs,
      timedOut: false,
      truncated: false,
      redactedStdout: '',
      redactedStderr: errorResult.stderr,
    };
    await db.execlog.put(entry);
    await pruneAuditLog();

    return errorResult;
  }

  // 3. Determine decision
  let finalDecision: Decision = 'auto';

  // Check allow-list match first
  const isAllowListed = policyConfig.allowList.some((pattern) => {
    try {
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1));
        return regex.test(opts.cmd);
      }
      return opts.cmd.trim() === pattern.trim() || opts.cmd.trim().startsWith(pattern.trim() + ' ');
    } catch {
      return opts.cmd.trim() === pattern.trim();
    }
  });

  if (isAllowListed) {
    finalDecision = 'auto';
  } else {
    // Evaluate highest risk class decision (deny > ask > auto)
    let hasDeny = false;
    let hasAsk = false;

    for (const rc of riskClasses) {
      const d = policyConfig.rules[rc] || 'ask';
      if (d === 'deny') hasDeny = true;
      if (d === 'ask') hasAsk = true;
    }

    if (hasDeny) finalDecision = 'deny';
    else if (hasAsk) finalDecision = 'ask';
    else finalDecision = 'auto';
  }

  // Handle Deny
  if (finalDecision === 'deny') {
    const errorResult: ExecResult = {
      stdout: '',
      stderr: `Command denied by policy (risk classes: ${riskClasses.join(', ')}).`,
      exitCode: -1,
      durationMs: Date.now() - startTime,
      timedOut: false,
      truncated: false,
    };

    const entry: ExecLogEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      chatId: ctx.chatId,
      cmd: opts.cmd,
      cwd: opts.cwd,
      riskClasses,
      decision: 'deny',
      exitCode: -1,
      durationMs: errorResult.durationMs,
      timedOut: false,
      truncated: false,
      redactedStdout: '',
      redactedStderr: errorResult.stderr,
    };
    await db.execlog.put(entry);
    await pruneAuditLog();

    return errorResult;
  }

  // Handle Ask (Approval required)
  let userApproved = false;
  if (finalDecision === 'ask') {
    if (ctx.onApprovalRequired) {
      const approvalRes = await ctx.onApprovalRequired({
        cmd: opts.cmd,
        riskClasses,
        reasons: classifyRes.reasons,
      });

      if (approvalRes.approved) {
        userApproved = true;
        if (approvalRes.allowPattern) {
          await addAllowListPattern(approvalRes.allowPattern);
        }
      } else {
        const cancelResult: ExecResult = {
          stdout: '',
          stderr: 'Command execution cancelled by user.',
          exitCode: -1,
          durationMs: Date.now() - startTime,
          timedOut: false,
          truncated: false,
        };

        const entry: ExecLogEntry = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          chatId: ctx.chatId,
          cmd: opts.cmd,
          cwd: opts.cwd,
          riskClasses,
          decision: 'ask',
          userApproved: false,
          exitCode: -1,
          durationMs: cancelResult.durationMs,
          timedOut: false,
          truncated: false,
          redactedStdout: '',
          redactedStderr: cancelResult.stderr,
        };
        await db.execlog.put(entry);
        await pruneAuditLog();

        return cancelResult;
      }
    } else {
      // Default deny if no interactive prompt handler registered
      return {
        stdout: '',
        stderr: 'Command requires user approval, but no interactive prompt handler is available.',
        exitCode: -1,
        durationMs: Date.now() - startTime,
        timedOut: false,
        truncated: false,
      };
    }
  }

  // 4. Execution via Backend
  const backend = await getBackend('auto');
  if (!backend) {
    return {
      stdout: '',
      stderr: 'No execution backend available.',
      exitCode: -1,
      durationMs: Date.now() - startTime,
      timedOut: false,
      truncated: false,
    };
  }

  const controller = new AbortController();
  activeAbortControllers.add(controller);

  let rawResult: ExecResult;
  try {
    rawResult = await backend.exec({
      ...opts,
      signal: opts.signal || controller.signal,
    });
  } catch (err: any) {
    rawResult = {
      stdout: '',
      stderr: err?.message || 'Execution error',
      exitCode: -1,
      durationMs: Date.now() - startTime,
      timedOut: false,
      truncated: false,
    };
  } finally {
    activeAbortControllers.delete(controller);
  }

  // 5. Redact Secrets & Limit Output
  const redactedStdoutRaw = redactSecrets(rawResult.stdout);
  const redactedStderrRaw = redactSecrets(rawResult.stderr);

  const stdoutLimit = limitOutput(redactedStdoutRaw, 12000);
  const stderrLimit = limitOutput(redactedStderrRaw, 12000);

  const isTruncated = stdoutLimit.truncated || stderrLimit.truncated || rawResult.truncated;

  const finalResult: ExecResult = {
    stdout: stdoutLimit.output,
    stderr: stderrLimit.output,
    exitCode: rawResult.exitCode,
    durationMs: rawResult.durationMs,
    timedOut: rawResult.timedOut,
    truncated: isTruncated,
  };

  // 6. Audit Logging into Dexie DB
  const logEntry: ExecLogEntry = {
    id: crypto.randomUUID(),
    ts: Date.now(),
    chatId: ctx.chatId,
    cmd: opts.cmd,
    cwd: opts.cwd,
    riskClasses,
    decision: finalDecision,
    userApproved: finalDecision === 'ask' ? userApproved : undefined,
    exitCode: finalResult.exitCode,
    durationMs: finalResult.durationMs,
    timedOut: finalResult.timedOut,
    truncated: finalResult.truncated,
    redactedStdout: finalResult.stdout,
    redactedStderr: finalResult.stderr,
  };

  await db.execlog.put(logEntry);
  await pruneAuditLog();

  return finalResult;
}
