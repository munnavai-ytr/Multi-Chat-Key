'use client';

import React, { useState } from 'react';
import { useUIStore } from '@/store/ui';
import { AlertTriangle, ShieldAlert, Check, X, Lock } from 'lucide-react';
import { Pill, Button } from '@/components/settings/ui';

export function CommandApprovalModal() {
  const { commandApprovalModal, setCommandApprovalModal } = useUIStore();
  const [alwaysAllow, setAlwaysAllow] = useState(false);

  if (!commandApprovalModal) return null;

  const { cmd, riskClasses, reasons, resolve } = commandApprovalModal;

  const handleDeny = () => {
    resolve({ approved: false });
    setCommandApprovalModal(null);
  };

  const handleApprove = () => {
    const allowPattern = alwaysAllow ? cmd.trim() : undefined;
    resolve({ approved: true, allowPattern });
    setCommandApprovalModal(null);
  };

  const toneMap: Record<string, 'danger' | 'warning' | 'info' | 'neutral' | 'accent'> = {
    destructive: 'danger',
    privileged: 'danger',
    secret: 'warning',
    network: 'warning',
    install: 'info',
    write: 'neutral',
    read: 'neutral',
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-surface border border-border-strong rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 relative overflow-hidden">
        {/* Top Warning Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-rose-500 to-amber-500" />

        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-text tracking-tight">
              Command Execution Required Approval
            </h3>
            <p className="text-sm text-muted mt-0.5">
              An action classified as sensitive requires your explicit confirmation before execution.
            </p>
          </div>
        </div>

        {/* Risk Classes & Reasons */}
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted font-medium mr-1">Risk Classes:</span>
          {riskClasses.map((rc) => (
            <Pill key={rc} tone={toneMap[rc] || 'warning'}>
              {rc}
            </Pill>
          ))}
        </div>

        {reasons.length > 0 && (
          <div className="bg-surface2/60 border border-border/60 rounded-xl p-3 text-xs text-muted space-y-1">
            <div className="font-semibold text-text mb-1">Triggered Policy Rules:</div>
            {reasons.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Command Code Display */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted">Proposed Command:</label>
          <div className="bg-bg border border-border rounded-xl p-3 max-h-40 overflow-y-auto font-mono text-xs text-text break-all select-all">
            {cmd}
          </div>
        </div>

        {/* Always Allow Checkbox */}
        <label className="flex items-center gap-2.5 text-xs text-muted cursor-pointer hover:text-text transition-colors select-none py-1">
          <input
            type="checkbox"
            checked={alwaysAllow}
            onChange={(e) => setAlwaysAllow(e.target.checked)}
            className="rounded border-border text-accent focus:ring-accent w-4 h-4 cursor-pointer"
          />
          <span>Always allow this command pattern without asking in future</span>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <Button variant="ghost" onClick={handleDeny} className="text-rose-400 hover:text-rose-300">
            <X className="w-4 h-4 mr-1.5" />
            Deny Execution
          </Button>
          <Button variant="primary" onClick={handleApprove}>
            <Check className="w-4 h-4 mr-1.5" />
            Approve & Run
          </Button>
        </div>
      </div>
    </div>
  );
}
