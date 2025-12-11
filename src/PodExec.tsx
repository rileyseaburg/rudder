'use client'

import { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  CommandLineIcon,
  PlayIcon,
  XMarkIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface PodExecProps {
  podName: string;
  namespace: string;
  container?: string;
  onClose: () => void;
}

interface ExecHistory {
  command: string;
  output: string;
  exitCode: number;
  timestamp: Date;
}

// Common commands to run in pods
const QUICK_COMMANDS = [
  { label: 'Shell Info', command: 'echo $SHELL && whoami && pwd' },
  { label: 'List Files', command: 'ls -la' },
  { label: 'Environment', command: 'env | sort' },
  { label: 'Process List', command: 'ps aux' },
  { label: 'Memory Usage', command: 'cat /proc/meminfo | head -5' },
  { label: 'Disk Usage', command: 'df -h' },
  { label: 'Network Info', command: 'cat /etc/hosts && echo "---" && cat /etc/resolv.conf' },
  { label: 'Check Connectivity', command: 'ping -c 3 google.com 2>/dev/null || echo "ping not available"' },
  { label: 'Curl Test', command: 'curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health 2>/dev/null || echo "curl not available or endpoint not found"' },
  { label: 'Config Files', command: 'ls -la /etc/*.conf 2>/dev/null | head -10' },
  { label: 'App Logs', command: 'tail -20 /var/log/*.log 2>/dev/null || echo "No logs in /var/log"' },
];

export default function PodExec({ podName, namespace, container, onClose }: PodExecProps) {
  const [command, setCommand] = useState<string>('');
  const [history, setHistory] = useState<ExecHistory[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copied, setCopied] = useState<string | null>(null);
  const [workingDir, setWorkingDir] = useState<string>('/');
  
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll and focus
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [history]);

  useEffect(() => {
    inputRef.current?.focus();
    // Get initial working directory
    executeCommand('pwd', true);
  }, []);

  const executeCommand = useCallback(async (cmd?: string, silent: boolean = false) => {
    const commandToRun = cmd || command;
    if (!commandToRun.trim() || running) return;

    setRunning(true);
    if (!silent) setHistoryIndex(-1);

    try {
      const result = await invoke<{ output: string; exit_code: number }>('exec_in_pod', {
        podName,
        namespace,
        container: container || undefined,
        command: commandToRun,
      });

      // Update working directory if it was a cd command or pwd
      if (commandToRun.startsWith('cd ') || commandToRun === 'pwd') {
        const pwdResult = await invoke<{ output: string; exit_code: number }>('exec_in_pod', {
          podName,
          namespace,
          container: container || undefined,
          command: 'pwd',
        });
        if (pwdResult.exit_code === 0) {
          setWorkingDir(pwdResult.output.trim());
        }
      }

      if (!silent) {
        setHistory(prev => [...prev, {
          command: commandToRun,
          output: result.output,
          exitCode: result.exit_code,
          timestamp: new Date(),
        }]);
      }
    } catch (e) {
      if (!silent) {
        setHistory(prev => [...prev, {
          command: commandToRun,
          output: `Error: ${e}`,
          exitCode: 1,
          timestamp: new Date(),
        }]);
      }
    } finally {
      setRunning(false);
      if (!silent) setCommand('');
    }
  }, [command, podName, namespace, container, running]);

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
      onClose();
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setHistory([]);
    }
  }, [executeCommand, history, historyIndex, onClose]);

  const copyOutput = async (output: string, index: number) => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(String(index));
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-4xl h-[600px] mx-4 bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <CommandLineIcon className="size-5 text-green-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">Pod Exec</h3>
              <p className="text-xs text-gray-400">
                {podName}
                {container && <span className="text-indigo-400"> / {container}</span>}
                <span className="text-gray-500"> in </span>
                <span className="text-cyan-400">{namespace}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-colors"
          >
            <XMarkIcon className="size-5" />
          </button>
        </div>

        {/* Quick commands bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-800/50 border-b border-gray-700/50 overflow-x-auto">
          <span className="text-xs text-gray-500 flex-shrink-0">Quick:</span>
          {QUICK_COMMANDS.slice(0, 6).map((cmd) => (
            <button
              key={cmd.label}
              onClick={() => {
                setCommand(cmd.command);
                inputRef.current?.focus();
              }}
              className="flex-shrink-0 px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
            >
              {cmd.label}
            </button>
          ))}
          <div className="relative group">
            <button className="flex-shrink-0 px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors">
              More...
            </button>
            <div className="absolute left-0 top-full mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              {QUICK_COMMANDS.slice(6).map((cmd) => (
                <button
                  key={cmd.label}
                  onClick={() => {
                    setCommand(cmd.command);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-gray-700 text-gray-300 hover:text-white first:rounded-t-lg last:rounded-b-lg"
                >
                  {cmd.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Output area */}
        <div 
          ref={outputRef}
          className="flex-1 overflow-auto p-4 font-mono text-sm space-y-4"
        >
          {history.length === 0 ? (
            <div className="text-gray-500 text-center py-12">
              <CommandLineIcon className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-base">Execute commands in pod</p>
              <p className="text-xs mt-2 text-gray-600">
                Enter to run • ↑↓ history • Ctrl+L clear • Esc close
              </p>
            </div>
          ) : (
            history.map((entry, index) => (
              <div key={index} className="group">
                {/* Command prompt */}
                <div className="flex items-start gap-2">
                  <span className="text-green-400 select-none">$</span>
                  <span className="text-gray-200 break-all">{entry.command}</span>
                  <button
                    onClick={() => copyOutput(entry.output, index)}
                    className="ml-auto p-1 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 transition-opacity"
                    title="Copy output"
                  >
                    {copied === String(index) ? (
                      <CheckIcon className="size-4 text-green-400" />
                    ) : (
                      <DocumentDuplicateIcon className="size-4" />
                    )}
                  </button>
                </div>
                {/* Output */}
                <pre className={`mt-1 ml-5 whitespace-pre-wrap break-all text-xs leading-relaxed ${
                  entry.exitCode === 0 ? 'text-gray-400' : 'text-red-400'
                }`}>
                  {entry.output || '(no output)'}
                </pre>
                {entry.exitCode !== 0 && (
                  <div className="ml-5 text-xs text-red-500 mt-1">
                    exit code: {entry.exitCode}
                  </div>
                )}
              </div>
            ))
          )}
          {running && (
            <div className="flex items-center gap-2 text-gray-400">
              <ArrowPathIcon className="size-4 animate-spin" />
              <span>Executing...</span>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-gray-700 p-3 bg-gray-800/50">
          <div className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2 ring-1 ring-gray-700 focus-within:ring-2 focus-within:ring-indigo-500">
            <span className="text-gray-500 text-xs select-none truncate max-w-[150px]" title={workingDir}>
              {workingDir}
            </span>
            <span className="text-green-400 select-none">$</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter command..."
              disabled={running}
              autoFocus
              className="flex-1 bg-transparent border-0 text-gray-200 placeholder-gray-600 text-sm focus:outline-none focus:ring-0"
            />
            {command && !running && (
              <button
                onClick={() => setCommand('')}
                className="p-1 text-gray-500 hover:text-gray-300"
              >
                <XMarkIcon className="size-4" />
              </button>
            )}
            <button
              onClick={() => executeCommand()}
              disabled={!command.trim() || running}
              className="p-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-white transition-colors"
            >
              <PlayIcon className="size-4" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 px-1 text-xs text-gray-600">
            <span>⚠️ Commands run via kubectl exec - some features may be limited</span>
            <span>{history.length} command{history.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
