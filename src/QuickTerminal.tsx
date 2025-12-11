'use client'

import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  CommandLineIcon,
  PlayIcon,
  TrashIcon,
  ClockIcon,
  ChevronDownIcon,
  XMarkIcon,
  DocumentDuplicateIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';

interface CommandHistory {
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
  duration: number;
}

interface QuickTerminalProps {
  namespace?: string;
  context?: string;
}

// Common kubectl/helm command templates
const COMMAND_TEMPLATES = [
  { label: 'Get Pods', command: 'kubectl get pods -n {namespace}', category: 'kubectl' },
  { label: 'Get Services', command: 'kubectl get svc -n {namespace}', category: 'kubectl' },
  { label: 'Get Deployments', command: 'kubectl get deployments -n {namespace}', category: 'kubectl' },
  { label: 'Get Events', command: 'kubectl get events -n {namespace} --sort-by=.lastTimestamp', category: 'kubectl' },
  { label: 'Get ConfigMaps', command: 'kubectl get configmaps -n {namespace}', category: 'kubectl' },
  { label: 'Get Secrets', command: 'kubectl get secrets -n {namespace}', category: 'kubectl' },
  { label: 'Get Ingress', command: 'kubectl get ingress -n {namespace}', category: 'kubectl' },
  { label: 'Get PVCs', command: 'kubectl get pvc -n {namespace}', category: 'kubectl' },
  { label: 'Get All Resources', command: 'kubectl get all -n {namespace}', category: 'kubectl' },
  { label: 'Cluster Info', command: 'kubectl cluster-info', category: 'kubectl' },
  { label: 'Get Nodes', command: 'kubectl get nodes -o wide', category: 'kubectl' },
  { label: 'Top Pods', command: 'kubectl top pods -n {namespace}', category: 'kubectl' },
  { label: 'Top Nodes', command: 'kubectl top nodes', category: 'kubectl' },
  { label: 'List Releases', command: 'helm list -n {namespace}', category: 'helm' },
  { label: 'List All Releases', command: 'helm list -A', category: 'helm' },
  { label: 'Search Hub', command: 'helm search hub ', category: 'helm' },
  { label: 'Repo List', command: 'helm repo list', category: 'helm' },
  { label: 'Repo Update', command: 'helm repo update', category: 'helm' },
];

export default function QuickTerminal({ namespace = 'default', context }: QuickTerminalProps) {
  const [command, setCommand] = useState<string>('');
  const [history, setHistory] = useState<CommandHistory[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [showTemplates, setShowTemplates] = useState<boolean>(false);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copied, setCopied] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const templateRef = useRef<HTMLDivElement>(null);

  // Close templates dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setShowTemplates(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll to bottom when history updates
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const executeCommand = useCallback(async () => {
    if (!command.trim() || running) return;

    const startTime = Date.now();
    setRunning(true);
    setHistoryIndex(-1);

    try {
      // Replace {namespace} placeholder
      const finalCommand = command.replace(/\{namespace\}/g, namespace);
      
      const result = await invoke<{ output: string; exit_code: number }>('run_shell_command', {
        command: finalCommand,
        context: context || undefined,
      });

      const duration = Date.now() - startTime;
      
      setHistory(prev => [...prev, {
        command: finalCommand,
        output: result.output,
        exitCode: result.exit_code,
        timestamp: new Date(),
        duration,
      }]);
    } catch (e) {
      const duration = Date.now() - startTime;
      setHistory(prev => [...prev, {
        command: command.replace(/\{namespace\}/g, namespace),
        output: `Error: ${e}`,
        exitCode: 1,
        timestamp: new Date(),
        duration,
      }]);
    } finally {
      setRunning(false);
      setCommand('');
    }
  }, [command, namespace, context, running]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const newIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setCommand(history[history.length - 1 - newIndex]?.command || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommand(history[history.length - 1 - newIndex]?.command || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommand('');
      }
    } else if (e.key === 'Escape') {
      setShowTemplates(false);
    }
  }, [executeCommand, history, historyIndex]);

  const applyTemplate = (template: string) => {
    setCommand(template.replace(/\{namespace\}/g, namespace));
    setShowTemplates(false);
    inputRef.current?.focus();
  };

  const clearHistory = () => {
    setHistory([]);
  };

  const copyOutput = async (output: string, index: number) => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(String(index));
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <CommandLineIcon className="size-4 text-green-400" />
          <span className="text-xs font-medium text-gray-300">Quick Terminal</span>
          {context && (
            <span className="text-xs text-gray-500">({context})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            ns: <span className="text-indigo-400">{namespace}</span>
          </span>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="p-1 text-gray-400 hover:text-gray-200 rounded"
              title="Clear history"
            >
              <TrashIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Output area */}
      <div 
        ref={outputRef}
        className="flex-1 overflow-auto p-3 font-mono text-xs space-y-3"
      >
        {history.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            <CommandLineIcon className="size-8 mx-auto mb-2 opacity-50" />
            <p>Run kubectl and helm commands</p>
            <p className="text-xs mt-1">Use ↑↓ for history • Click templates for common commands</p>
          </div>
        ) : (
          history.map((entry, index) => (
            <div key={index} className="group">
              {/* Command */}
              <div className="flex items-center gap-2 text-gray-400">
                <span className="text-green-400">$</span>
                <span className="text-gray-200">{entry.command}</span>
                <span className="ml-auto flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => copyOutput(entry.output, index)}
                    className="p-0.5 hover:text-gray-200"
                    title="Copy output"
                  >
                    {copied === String(index) ? (
                      <CheckIcon className="size-3 text-green-400" />
                    ) : (
                      <DocumentDuplicateIcon className="size-3" />
                    )}
                  </button>
                  <span className="text-xs text-gray-600 flex items-center gap-1">
                    <ClockIcon className="size-3" />
                    {formatDuration(entry.duration)}
                  </span>
                </span>
              </div>
              {/* Output */}
              <pre className={`mt-1 whitespace-pre-wrap break-all ${
                entry.exitCode === 0 ? 'text-gray-300' : 'text-red-400'
              }`}>
                {entry.output || '(no output)'}
              </pre>
              {entry.exitCode !== 0 && (
                <div className="text-xs text-red-500 mt-1">
                  Exit code: {entry.exitCode}
                </div>
              )}
            </div>
          ))
        )}
        {running && (
          <div className="flex items-center gap-2 text-gray-400">
            <span className="text-green-400">$</span>
            <span className="text-gray-200">{command}</span>
            <span className="ml-2 animate-pulse">Running...</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-700 p-2">
        {/* Quick templates */}
        <div className="relative mb-2" ref={templateRef}>
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-800"
          >
            <span>Quick Commands</span>
            <ChevronDownIcon className={`size-3 transition-transform ${showTemplates ? 'rotate-180' : ''}`} />
          </button>
          
          {showTemplates && (
            <div className="absolute bottom-full left-0 mb-1 w-80 max-h-64 overflow-auto bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10">
              <div className="p-2">
                <div className="text-xs font-medium text-gray-400 mb-2">kubectl</div>
                <div className="space-y-1">
                  {COMMAND_TEMPLATES.filter(t => t.category === 'kubectl').map((template) => (
                    <button
                      key={template.label}
                      onClick={() => applyTemplate(template.command)}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-700 text-gray-300 hover:text-white"
                    >
                      <div className="font-medium">{template.label}</div>
                      <div className="text-gray-500 truncate">{template.command}</div>
                    </button>
                  ))}
                </div>
                <div className="text-xs font-medium text-gray-400 mt-3 mb-2">helm</div>
                <div className="space-y-1">
                  {COMMAND_TEMPLATES.filter(t => t.category === 'helm').map((template) => (
                    <button
                      key={template.label}
                      onClick={() => applyTemplate(template.command)}
                      className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-gray-700 text-gray-300 hover:text-white"
                    >
                      <div className="font-medium">{template.label}</div>
                      <div className="text-gray-500 truncate">{template.command}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Command input */}
        <div className="flex items-center gap-2 bg-gray-800 rounded-md px-3 py-2">
          <span className="text-green-400 font-mono text-sm">$</span>
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="kubectl get pods, helm list..."
            disabled={running}
            className="flex-1 bg-transparent border-0 text-gray-200 placeholder-gray-500 text-sm font-mono focus:outline-none focus:ring-0"
          />
          {command && !running && (
            <button
              onClick={() => setCommand('')}
              className="p-1 text-gray-400 hover:text-gray-200"
            >
              <XMarkIcon className="size-4" />
            </button>
          )}
          <button
            onClick={executeCommand}
            disabled={!command.trim() || running}
            className="p-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white"
          >
            <PlayIcon className="size-4" />
          </button>
        </div>
        
        {/* Hints */}
        <div className="flex items-center justify-between mt-1.5 px-1 text-xs text-gray-600">
          <span>Enter to run • ↑↓ history • {'{namespace}'} = {namespace}</span>
          <span>{history.length} command{history.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}
