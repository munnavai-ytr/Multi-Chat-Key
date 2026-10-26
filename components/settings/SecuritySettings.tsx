'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Play,
  OctagonX,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Download,
  Terminal,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Eye,
  Lock,
} from 'lucide-react';
import {
  SettingsPage,
  Section,
  Card,
  Row,
  Switch,
  Segmented,
  TextField,
  SelectField,
  Button,
  Pill,
  Callout,
  EmptyHint,
  DangerZone,
} from './ui';
import {
  getPolicyConfig,
  savePolicyConfig,
  setPolicyPreset,
  addAllowListPattern,
  removeAllowListPattern,
  killAll,
  execForAgent,
  ExecPolicyConfig,
  PolicyPreset,
  PRESET_CONFIGS,
} from '@/lib/exec/service';
import { classify } from '@/lib/exec/policy';
import { runPolicySelfTest, SelfTestReport } from '@/lib/exec/policy.test';
import { RiskClass, Decision, ExecResult } from '@/lib/exec/types';
import { db, ExecLogEntry } from '@/lib/db';
import { useUIStore } from '@/store/ui';

export function SecuritySettings() {
  const { showToast, setCommandApprovalModal } = useUIStore();

  const [policyConfig, setPolicyConfigState] = useState<ExecPolicyConfig>({
    preset: 'balanced',
    rules: PRESET_CONFIGS.balanced,
    allowList: [],
  });

  const [newAllowPattern, setNewAllowPattern] = useState('');

  // Self Test state
  const [selfTestReport, setSelfTestReport] = useState<SelfTestReport | null>(null);
  const [showSelfTestDetails, setShowSelfTestDetails] = useState(false);

  // Test Box state
  const [testCmd, setTestCmd] = useState('echo "Hello Chatly Security"');
  const [testCwd, setTestCwd] = useState('/workspace');
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<{
    classification: ReturnType<typeof classify>;
    execResult?: ExecResult;
  } | null>(null);

  // Audit Log state
  const [auditLogs, setAuditLogs] = useState<ExecLogEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditRiskFilter, setAuditRiskFilter] = useState<string>('all');
  const [auditDecisionFilter, setAuditDecisionFilter] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadPolicy = async () => {
    const cfg = await getPolicyConfig();
    setPolicyConfigState(cfg);
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await db.execlog.orderBy('ts').reverse().toArray();
      setAuditLogs(logs);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    }
  };

  useEffect(() => {
    loadPolicy();
    loadAuditLogs();
  }, []);

  const handleSelectPreset = async (preset: PolicyPreset) => {
    const updated = await setPolicyPreset(preset);
    setPolicyConfigState(updated);
    showToast(`Policy set to ${preset}`, 2000);
  };

  const handleRuleChange = async (rc: RiskClass, decision: Decision) => {
    const nextRules = { ...policyConfig.rules, [rc]: decision };
    const nextConfig: ExecPolicyConfig = {
      preset: 'custom',
      rules: nextRules,
      allowList: policyConfig.allowList,
    };
    await savePolicyConfig(nextConfig);
    setPolicyConfigState(nextConfig);
    showToast(`Updated ${rc} rule to ${decision}`, 2000);
  };

  const handleAddAllowPattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAllowPattern.trim()) return;
    const list = await addAllowListPattern(newAllowPattern.trim());
    setPolicyConfigState((prev) => ({ ...prev, allowList: list }));
    setNewAllowPattern('');
    showToast('Pattern added to allow-list', 2000);
  };

  const handleRemoveAllowPattern = async (pattern: string) => {
    const list = await removeAllowListPattern(pattern);
    setPolicyConfigState((prev) => ({ ...prev, allowList: list }));
    showToast('Pattern removed', 2000);
  };

  const handleKillSwitch = async () => {
    await killAll();
    await loadPolicy();
    showToast('🚨 KILL SWITCH ACTIVATED: All tasks aborted & set to Cautious', 4000);
  };

  const handleRunSelfTest = () => {
    const report = runPolicySelfTest();
    setSelfTestReport(report);
    if (report.failed === 0) {
      showToast(`Self-test passed: All ${report.total} policy checks verified!`, 3000);
    } else {
      showToast(`Self-test completed with ${report.failed} failures`, 4000);
    }
  };

  const handleTestExecute = async () => {
    if (!testCmd.trim()) return;
    setIsTestRunning(true);
    setTestResult(null);

    const classification = classify(testCmd.trim(), { workspaceRoot: testCwd });

    try {
      const execResult = await execForAgent(
        { cmd: testCmd.trim(), cwd: testCwd },
        {
          onApprovalRequired: (info) =>
            new Promise((resolve) => {
              setCommandApprovalModal({
                cmd: info.cmd,
                riskClasses: info.riskClasses,
                reasons: info.reasons,
                resolve,
              });
            }),
        }
      );
      setTestResult({ classification, execResult });
      await loadAuditLogs();
    } catch (err: any) {
      setTestResult({
        classification,
        execResult: {
          stdout: '',
          stderr: err?.message || 'Execution error',
          exitCode: -1,
          durationMs: 0,
          timedOut: false,
          truncated: false,
        },
      });
    } finally {
      setIsTestRunning(false);
    }
  };

  const handleExportAuditLogs = () => {
    const data = JSON.stringify(auditLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatly-audit-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported audit log JSON', 2000);
  };

  const handleClearAuditLogs = async () => {
    if (!confirm('Clear all audit logs permanently?')) return;
    await db.execlog.clear();
    setAuditLogs([]);
    showToast('Audit log cleared', 2000);
  };

  const filteredLogs = auditLogs.filter((log) => {
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      if (!log.cmd.toLowerCase().includes(q) && !(log.cwd || '').toLowerCase().includes(q)) {
        return false;
      }
    }
    if (auditRiskFilter !== 'all') {
      if (!log.riskClasses.includes(auditRiskFilter as RiskClass)) return false;
    }
    if (auditDecisionFilter !== 'all') {
      if (log.decision !== auditDecisionFilter) return false;
    }
    return true;
  });

  const RISK_CLASSES: RiskClass[] = [
    'read',
    'write',
    'install',
    'network',
    'destructive',
    'privileged',
    'secret',
  ];

  return (
    <SettingsPage
      title="Permission Center & Security Policy"
      description="Manage execution permissions, risk policy presets, allow-lists, emergency kill switch, and audit logs."
    >
      {/* Emergency Kill Switch Banner */}
      <Card className="border-rose-500/30 bg-rose-500/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
              <OctagonX className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text">Emergency Kill Switch</h4>
              <p className="text-xs text-muted mt-0.5">
                Immediately abort all active execution background signals and revert policy to Cautious.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={handleKillSwitch}
            className="w-full sm:w-auto bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-md transition-all shrink-0"
          >
            <OctagonX className="w-4 h-4 mr-2" />
            Kill All Executions
          </Button>
        </div>
      </Card>

      {/* Policy Presets */}
      <Section
        title="Command Execution Policy"
        description="Choose a preset security posture or configure per-class permissions."
      >
        <Card>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text">Policy Preset</span>
              <Pill tone={policyConfig.preset === 'cautious' ? 'warning' : policyConfig.preset === 'autopilot' ? 'info' : 'accent'}>
                {policyConfig.preset.toUpperCase()}
              </Pill>
            </div>

            <Segmented
              options={[
                { id: 'cautious', label: 'Cautious' },
                { id: 'balanced', label: 'Balanced (Default)' },
                { id: 'autopilot', label: 'Autopilot' },
              ]}
              value={policyConfig.preset === 'custom' ? 'balanced' : policyConfig.preset}
              onChange={(val) => handleSelectPreset(val as PolicyPreset)}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
              <div className={`p-3 rounded-xl border ${policyConfig.preset === 'cautious' ? 'border-amber-500/50 bg-amber-500/10' : 'border-border bg-surface2/40'}`}>
                <div className="font-semibold text-text mb-1">Cautious</div>
                <div className="text-muted leading-relaxed">
                  Auto-allows safe read commands. Asks user approval for write, install, network, secret, and destructive actions.
                </div>
              </div>

              <div className={`p-3 rounded-xl border ${policyConfig.preset === 'balanced' ? 'border-accent/50 bg-accent/10' : 'border-border bg-surface2/40'}`}>
                <div className="font-semibold text-text mb-1">Balanced</div>
                <div className="text-muted leading-relaxed">
                  Auto-allows read, write, install, and network operations. Asks approval for destructive, privileged, and secret access.
                </div>
              </div>

              <div className={`p-3 rounded-xl border ${policyConfig.preset === 'autopilot' ? 'border-blue-500/50 bg-blue-500/10' : 'border-border bg-surface2/40'}`}>
                <div className="font-semibold text-text mb-1">Autopilot</div>
                <div className="text-muted leading-relaxed">
                  Maximum autonomy. Auto-allows read, write, install, network, and secret access. Asks approval only for destructive and privileged actions.
                </div>
              </div>
            </div>
          </div>
        </Card>
      </Section>

      {/* Per-Risk-Class Rules Grid */}
      <Section
        title="Risk Class Rules"
        description="Fine-tune permission decisions per command risk class."
      >
        <Card>
          <div className="divide-y divide-border">
            {RISK_CLASSES.map((rc) => {
              const currentDecision = policyConfig.rules[rc] || 'ask';
              return (
                <div key={rc} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text capitalize">{rc}</span>
                      <Pill tone={rc === 'destructive' || rc === 'privileged' ? 'danger' : rc === 'secret' ? 'warning' : 'neutral'}>
                        {rc}
                      </Pill>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {rc === 'read' && 'ls, cat, pwd, grep, find, echo, inspect state'}
                      {rc === 'write' && 'touch, mkdir, cp, mv, sed, git add/commit, build tools'}
                      {rc === 'install' && 'npm install, pip install, apt install, package updates'}
                      {rc === 'network' && 'curl, wget, git pull/push, ssh, socket network access'}
                      {rc === 'destructive' && 'rm -rf, git reset --hard, truncate, drop tables, overwrite'}
                      {rc === 'privileged' && 'sudo, systemctl, mount, user creation, system config'}
                      {rc === 'secret' && 'env, printenv, export API_KEY, reading ~/.ssh or .env'}
                    </p>
                  </div>

                  <Segmented
                    options={[
                      { id: 'auto', label: 'Auto' },
                      { id: 'ask', label: 'Ask' },
                      { id: 'deny', label: 'Deny' },
                    ]}
                    value={currentDecision}
                    onChange={(val) => handleRuleChange(rc, val as Decision)}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      </Section>

      {/* Allow-List Manager */}
      <Section
        title="Saved Command Allow-List"
        description="Commands or patterns explicitly approved to skip approval prompts."
      >
        <Card>
          <div className="p-4 space-y-3">
            <form onSubmit={handleAddAllowPattern} className="flex gap-2">
              <TextField
                value={newAllowPattern}
                onChange={setNewAllowPattern}
                placeholder="e.g. npm test or /git status.*/"
                ariaLabel="New allow-list pattern"
              />
              <Button variant="primary" type="submit" className="shrink-0">
                <Plus className="w-4 h-4 mr-1" />
                Add Pattern
              </Button>
            </form>

            {policyConfig.allowList.length === 0 ? (
              <EmptyHint message="No patterns in allow-list. Commands will follow policy rules above." />
            ) : (
              <div className="space-y-1.5 pt-1">
                {policyConfig.allowList.map((pattern, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-surface2/60 border border-border text-xs"
                  >
                    <code className="font-mono text-text">{pattern}</code>
                    <button
                      type="button"
                      onClick={() => handleRemoveAllowPattern(pattern)}
                      className="p-1 text-muted hover:text-rose-400 transition-colors"
                      title="Remove pattern"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </Section>

      {/* Policy Self-Test Runner */}
      <Section
        title="Policy Self-Test Suite"
        description="Verify the Command Policy engine against 50+ test cases (safe, risky, quoting, subshells, hard blocks)."
      >
        <Card>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-text">Unit Self-Tests</h4>
                <p className="text-xs text-muted mt-0.5">
                  Runs local assertions verifying AST splitting, path checking, secret detection, and hard block rules.
                </p>
              </div>
              <Button variant="secondary" onClick={handleRunSelfTest}>
                <ShieldCheck className="w-4 h-4 mr-1.5 text-accent" />
                Run policy self-test
              </Button>
            </div>

            {selfTestReport && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-surface2/60 border border-border text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{selfTestReport.passed} Passed</span>
                  </div>
                  {selfTestReport.failed > 0 && (
                    <div className="flex items-center gap-1.5 text-rose-400 font-medium">
                      <XCircle className="w-4 h-4" />
                      <span>{selfTestReport.failed} Failed</span>
                    </div>
                  )}
                  <div className="text-muted ml-auto font-mono">
                    Total: {selfTestReport.total} tests
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSelfTestDetails(!showSelfTestDetails)}
                  className="text-xs text-accent font-medium hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {showSelfTestDetails ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  <span>{showSelfTestDetails ? 'Hide Test Case Details' : 'View Test Case Details'}</span>
                </button>

                {showSelfTestDetails && (
                  <div className="max-h-60 overflow-y-auto space-y-1 p-2 rounded-xl bg-bg border border-border text-xs font-mono">
                    {selfTestReport.results.map((res, i) => (
                      <div
                        key={i}
                        className={`flex items-start justify-between p-1.5 rounded ${res.ok ? 'text-emerald-400/90' : 'bg-rose-500/10 text-rose-400'}`}
                      >
                        <span>{res.name}</span>
                        {res.ok ? (
                          <span className="text-[10px] font-bold">PASS</span>
                        ) : (
                          <span className="text-[10px] font-bold">FAIL: {res.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </Section>

      {/* Temporary Test Box */}
      <Section
        title='Temporary "Run a command" Test Box'
        description="Test live command execution, policy classification, approval prompts, and secret redaction."
      >
        <Card>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div className="sm:col-span-3">
                <TextField
                  label="Command Line"
                  value={testCmd}
                  onChange={setTestCmd}
                  placeholder='e.g. echo "rm -rf /" or npm install lodash'
                  ariaLabel="Test command input"
                />
              </div>
              <TextField
                label="Working Dir"
                value={testCwd}
                onChange={setTestCwd}
                placeholder="/workspace"
                ariaLabel="Test CWD"
              />
            </div>

            <Button
              variant="primary"
              onClick={handleTestExecute}
              disabled={isTestRunning}
              className="w-full sm:w-auto"
            >
              <Play className="w-4 h-4 mr-1.5" />
              {isTestRunning ? 'Executing Command...' : 'Test Run Command'}
            </Button>

            {testResult && (
              <div className="space-y-3 pt-3 border-t border-border">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-text">Policy Classification:</span>
                  {Array.from(testResult.classification.classes).map((rc) => (
                    <Pill key={rc} tone="accent">
                      {rc}
                    </Pill>
                  ))}
                  {testResult.classification.blocked && (
                    <Pill tone="danger">HARD BLOCKED</Pill>
                  )}
                </div>

                {testResult.execResult && (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-muted">
                      <span>Exit Code: {testResult.execResult.exitCode ?? 'N/A'}</span>
                      <span>Duration: {testResult.execResult.durationMs}ms</span>
                      {testResult.execResult.truncated && <Pill tone="warning">Truncated</Pill>}
                    </div>

                    {testResult.execResult.stdout && (
                      <div className="space-y-1">
                        <span className="text-muted font-medium">stdout:</span>
                        <pre className="p-3 rounded-xl bg-bg border border-border text-emerald-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                          {testResult.execResult.stdout}
                        </pre>
                      </div>
                    )}

                    {testResult.execResult.stderr && (
                      <div className="space-y-1">
                        <span className="text-muted font-medium">stderr:</span>
                        <pre className="p-3 rounded-xl bg-bg border border-border text-rose-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                          {testResult.execResult.stderr}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </Section>

      {/* Audit Log Viewer */}
      <Section
        title="Audit Log (execlog Table)"
        description="Historical log of every command execution attempt with full policy decisions."
      >
        <Card>
          <div className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-48">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={auditSearch}
                    onChange={(e) => setAuditSearch(e.target.value)}
                    placeholder="Search logs..."
                    className="w-full bg-surface2/60 border border-border rounded-xl pl-8 pr-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>

                <SelectField
                  value={auditDecisionFilter}
                  onChange={setAuditDecisionFilter}
                  options={[
                    { value: 'all', label: 'All Decisions' },
                    { value: 'auto', label: 'Auto' },
                    { value: 'ask', label: 'Ask' },
                    { value: 'deny', label: 'Deny' },
                  ]}
                  ariaLabel="Filter decision"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button variant="ghost" onClick={handleExportAuditLogs} className="text-xs">
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Export JSON
                </Button>
                <Button variant="ghost" onClick={handleClearAuditLogs} className="text-xs text-rose-400 hover:text-rose-300">
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Clear Log
                </Button>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <EmptyHint message="No execution audit log entries found." />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <div
                      key={log.id}
                      className="border border-border rounded-xl bg-surface2/40 overflow-hidden text-xs"
                    >
                      <div
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface2/70 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Pill
                            tone={
                              log.decision === 'deny'
                                ? 'danger'
                                : log.decision === 'ask'
                                ? 'warning'
                                : 'success'
                            }
                          >
                            {log.decision.toUpperCase()}
                          </Pill>
                          <code className="font-mono text-text truncate font-medium">
                            {log.cmd}
                          </code>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 text-muted text-[11px]">
                          <span>{new Date(log.ts).toLocaleTimeString()}</span>
                          <span>{log.durationMs}ms</span>
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-3 border-t border-border bg-bg/80 space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-2 text-muted">
                            <div>Timestamp: {new Date(log.ts).toLocaleString()}</div>
                            <div>Exit Code: {log.exitCode ?? 'N/A'}</div>
                            <div>Risk Classes: {log.riskClasses.join(', ')}</div>
                            <div>User Approved: {log.userApproved === undefined ? 'N/A' : log.userApproved ? 'Yes' : 'No'}</div>
                          </div>

                          {log.redactedStdout && (
                            <div className="space-y-1">
                              <span className="text-muted font-medium">Redacted stdout:</span>
                              <pre className="p-2.5 rounded-lg bg-surface text-emerald-400 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                                {log.redactedStdout}
                              </pre>
                            </div>
                          )}

                          {log.redactedStderr && (
                            <div className="space-y-1">
                              <span className="text-muted font-medium">Redacted stderr:</span>
                              <pre className="p-2.5 rounded-lg bg-surface text-rose-400 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                                {log.redactedStderr}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </Section>
    </SettingsPage>
  );
}
