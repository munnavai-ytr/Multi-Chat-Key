'use client';

import React, { useState, useEffect } from 'react';
import { Users, Sparkles, Check, AlertCircle } from 'lucide-react';
import { useKeysStore } from '@/store/keys';
import { Dialog, Button, Switch, Badge, Card } from '@/components/ui';
import { haptic } from '@/lib/haptics';

export interface SelectedCouncilModel {
  keyId: string;
  provider: string;
  model: string;
}

export interface ModelCouncilModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptText: string;
  onRunCouncil: (params: {
    prompt: string;
    models: SelectedCouncilModel[];
    allowToolsForLead: boolean;
  }) => void;
}

export function ModelCouncilModal({
  isOpen,
  onClose,
  promptText,
  onRunCouncil,
}: ModelCouncilModalProps) {
  const { keys, modelsMap } = useKeysStore();
  const [selectedModels, setSelectedModels] = useState<SelectedCouncilModel[]>([]);
  const [allowToolsForLead, setAllowToolsForLead] = useState(false);
  const [promptInput, setPromptInput] = useState(promptText);

  useEffect(() => {
    setPromptInput(promptText);
  }, [promptText]);

  // Pre-select up to 3 available models when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const candidates: SelectedCouncilModel[] = [];
    for (const key of keys) {
      const models = modelsMap[key.id] || [];
      for (const m of models) {
        if (!candidates.some((c) => c.model === m.id)) {
          candidates.push({ keyId: key.id, provider: key.provider, model: m.id });
          if (candidates.length >= 3) break;
        }
      }
      if (candidates.length >= 3) break;
    }
    setSelectedModels(candidates);
  }, [isOpen, keys, modelsMap]);

  if (!isOpen) return null;

  // Flatten all available models from all saved keys
  const allAvailableModels: { keyId: string; provider: string; model: string; keyLabel: string }[] = [];
  for (const key of keys) {
    const models = modelsMap[key.id] || [];
    for (const m of models) {
      if (!allAvailableModels.some((item) => item.keyId === key.id && item.model === m.id)) {
        allAvailableModels.push({
          keyId: key.id,
          provider: key.provider,
          model: m.id,
          keyLabel: key.label,
        });
      }
    }
  }

  const toggleModelSelection = (item: { keyId: string; provider: string; model: string }) => {
    haptic('light');
    const exists = selectedModels.some((m) => m.keyId === item.keyId && m.model === item.model);
    if (exists) {
      if (selectedModels.length <= 1) return; // Must keep at least 1 model
      setSelectedModels((prev) => prev.filter((m) => !(m.keyId === item.keyId && m.model === item.model)));
    } else {
      if (selectedModels.length >= 3) {
        // Max 3 models
        return;
      }
      setSelectedModels((prev) => [...prev, { keyId: item.keyId, provider: item.provider, model: item.model }]);
    }
  };

  const handleRun = () => {
    if (!promptInput.trim() || selectedModels.length === 0) return;
    haptic('success');
    onRunCouncil({
      prompt: promptInput.trim(),
      models: selectedModels,
      allowToolsForLead,
    });
    onClose();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Model Council"
      description="Select 2-3 AI models to evaluate your query independently in parallel."
      footer={
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!promptInput.trim() || selectedModels.length === 0}
            onClick={handleRun}
            icon={<Users className="w-4 h-4" />}
          >
            Convene Council ({selectedModels.length})
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Prompt Input */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[var(--text)]">Prompt</label>
          <textarea
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="Type your question for the council..."
            rows={3}
            className="w-full p-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] text-xs sm:text-sm text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 resize-y"
          />
        </div>

        {/* Model Selection Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-[var(--text)]">
              Select Council Members (2-3 max)
            </label>
            <span className="text-[11px] text-[var(--muted)]">{selectedModels.length}/3 selected</span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {allAvailableModels.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--muted)]">
                No saved API keys or models found. Add a key in Settings first.
              </div>
            ) : (
              allAvailableModels.map((item) => {
                const isSelected = selectedModels.some(
                  (m) => m.keyId === item.keyId && m.model === item.model
                );
                return (
                  <div
                    key={`${item.keyId}-${item.model}`}
                    onClick={() => toggleModelSelection(item)}
                    className={`p-2.5 rounded-[var(--radius-md)] border flex items-center justify-between cursor-pointer select-none transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--surface-2)] shadow-xs'
                        : 'border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--surface)]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-[var(--text)] truncate">{item.model}</div>
                      <div className="text-[10px] text-[var(--muted)] truncate">{item.keyLabel} ({item.provider})</div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {isSelected ? (
                        <div className="w-5 h-5 rounded-full bg-[var(--accent)] text-[var(--accent-fg)] flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-[var(--border-strong)]" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Allow Tools Option */}
        <Card className="p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[var(--text)]">Allow tools for lead model</div>
              <div className="text-[11px] text-[var(--muted)]">
                Let the first model invoke tools if needed; other members run pure text.
              </div>
            </div>
            <Switch
              checked={allowToolsForLead}
              onChange={setAllowToolsForLead}
              ariaLabel="Allow tools for lead model"
            />
          </div>
        </Card>
      </div>
    </Dialog>
  );
}
