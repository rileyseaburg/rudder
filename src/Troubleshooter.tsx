'use client'

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  LightBulbIcon,
  ClipboardIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';

interface PodDiagnostic {
  name: string;
  status: string;
  ready: string;
  restarts: number;
  age: string;
  issues: Issue[];
}

interface Issue {
  severity: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  solutions: Solution[];
}

interface Solution {
  title: string;
  description: string;
  command?: string;
  action?: 'scale' | 'restart' | 'delete' | 'describe';
}

interface TroubleshooterProps {
  releaseName: string;
  namespace: string;
}

export default function Troubleshooter({ releaseName, namespace }: TroubleshooterProps) {
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PodDiagnostic[]>([]);
  const [releaseIssues, setReleaseIssues] = useState<Issue[]>([]);
  const [expandedPods, setExpandedPods] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [actionRunning, setActionRunning] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ success: boolean; message: string } | null>(null);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setDiagnostics([]);
    setReleaseIssues([]);
    setActionResult(null);

    try {
      const result = await invoke<string>('diagnose_release', {
        releaseName,
        namespace,
      });
      
      const data = JSON.parse(result);
      setDiagnostics(data.pods || []);
      setReleaseIssues(data.releaseIssues || []);
      
      // Auto-expand pods with issues
      const podsWithIssues = new Set<string>();
      (data.pods || []).forEach((pod: PodDiagnostic) => {
        if (pod.issues.length > 0) {
          podsWithIssues.add(pod.name);
        }
      });
      setExpandedPods(podsWithIssues);
    } catch (e) {
      setReleaseIssues([{
        severity: 'error',
        title: 'Diagnostics failed',
        description: String(e),
        solutions: [{
          title: 'Retry diagnostics',
          description: 'Try running diagnostics again',
        }],
      }]);
    } finally {
      setLoading(false);
    }
  }, [releaseName, namespace]);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  const copyCommand = (command: string) => {
    const expandedCommand = command
      .replace(/{namespace}/g, namespace)
      .replace(/{release}/g, releaseName);
    
    navigator.clipboard.writeText(expandedCommand);
    setCopiedCommand(command);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const runAction = async (action: string, podName?: string) => {
    setActionRunning(action);
    setActionResult(null);
    
    try {
      let result: string;
      switch (action) {
        case 'restart':
          result = await invoke<string>('restart_deployment', { releaseName, namespace });
          break;
        case 'delete-evicted':
          result = await invoke<string>('delete_failed_pods', { namespace });
          break;
        case 'describe':
          if (podName) {
            result = await invoke<string>('describe_pod', { podName, namespace });
          } else {
            result = 'No pod specified';
          }
          break;
        default:
          result = 'Unknown action';
      }
      setActionResult({ success: true, message: result });
    } catch (e) {
      setActionResult({ success: false, message: String(e) });
    } finally {
      setActionRunning(null);
    }
  };

  const togglePod = (podName: string) => {
    setExpandedPods(prev => {
      const next = new Set(prev);
      if (next.has(podName)) {
        next.delete(podName);
      } else {
        next.add(podName);
      }
      return next;
    });
  };

  const toggleIssue = (issueKey: string) => {
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(issueKey)) {
        next.delete(issueKey);
      } else {
        next.add(issueKey);
      }
      return next;
    });
  };

  const healthyPods = diagnostics.filter(p => p.issues.length === 0);
  const unhealthyPods = diagnostics.filter(p => p.issues.length > 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WrenchScrewdriverIcon className="size-5 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Release Diagnostics
          </h3>
        </div>
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="inline-flex items-center gap-x-1 rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
        >
          <ArrowPathIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Scanning...' : 'Re-scan'}
        </button>
      </div>

      {/* Action Result */}
      {actionResult && (
        <div className={`rounded-md p-3 ${actionResult.success ? 'bg-green-50 dark:bg-green-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}>
          <p className={`text-xs ${actionResult.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {actionResult.message}
          </p>
        </div>
      )}

      {/* Summary */}
      {!loading && diagnostics.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total Pods</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">{diagnostics.length}</p>
          </div>
          <div className="rounded-lg bg-green-100 p-3 dark:bg-green-500/10">
            <p className="text-xs text-green-600 dark:text-green-400">Healthy</p>
            <p className="text-lg font-semibold text-green-700 dark:text-green-400">{healthyPods.length}</p>
          </div>
          <div className="rounded-lg bg-red-100 p-3 dark:bg-red-500/10">
            <p className="text-xs text-red-600 dark:text-red-400">Issues</p>
            <p className="text-lg font-semibold text-red-700 dark:text-red-400">{unhealthyPods.length}</p>
          </div>
        </div>
      )}

      {/* Release-level issues */}
      {releaseIssues.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300">Release Issues</h4>
          {releaseIssues.map((issue, idx) => (
            <IssueCard
              key={`release-${idx}`}
              issue={issue}
              isExpanded={expandedIssues.has(`release-${idx}`)}
              onToggle={() => toggleIssue(`release-${idx}`)}
              onCopyCommand={copyCommand}
              copiedCommand={copiedCommand}
              namespace={namespace}
              releaseName={releaseName}
            />
          ))}
        </div>
      )}

      {/* Pod diagnostics */}
      {unhealthyPods.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300">Pod Issues</h4>
          {unhealthyPods.map((pod) => (
            <div
              key={pod.name}
              className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <button
                onClick={() => togglePod(pod.name)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <div className="flex items-center gap-2">
                  {expandedPods.has(pod.name) ? (
                    <ChevronDownIcon className="size-4 text-gray-400" />
                  ) : (
                    <ChevronRightIcon className="size-4 text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate max-w-xs">
                    {pod.name}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    pod.status === 'Running' ? 'bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400' :
                    pod.status === 'Pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400' :
                    'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
                  }`}>
                    {pod.status}
                  </span>
                </div>
                <span className="text-xs text-red-500">{pod.issues.length} issue{pod.issues.length !== 1 ? 's' : ''}</span>
              </button>
              
              {expandedPods.has(pod.name) && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
                    <span>Ready: {pod.ready}</span>
                    <span>Restarts: {pod.restarts}</span>
                    <span>Age: {pod.age}</span>
                  </div>
                  {pod.issues.map((issue, idx) => (
                    <IssueCard
                      key={`${pod.name}-${idx}`}
                      issue={issue}
                      isExpanded={expandedIssues.has(`${pod.name}-${idx}`)}
                      onToggle={() => toggleIssue(`${pod.name}-${idx}`)}
                      onCopyCommand={copyCommand}
                      copiedCommand={copiedCommand}
                      namespace={namespace}
                      releaseName={releaseName}
                      podName={pod.name}
                      onRunAction={runAction}
                      actionRunning={actionRunning}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      {(unhealthyPods.length > 0 || diagnostics.some(p => p.restarts > 3)) && (
        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-500/10 p-3">
          <h4 className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mb-2">Quick Actions</h4>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runAction('restart')}
              disabled={actionRunning !== null}
              className="inline-flex items-center gap-x-1 rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
            >
              <ArrowPathIcon className={`size-3.5 ${actionRunning === 'restart' ? 'animate-spin' : ''}`} />
              Restart Deployment
            </button>
            {diagnostics.some(p => p.status === 'Evicted' || p.status === 'Failed') && (
              <button
                onClick={() => runAction('delete-evicted')}
                disabled={actionRunning !== null}
                className="inline-flex items-center gap-x-1 rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-red-500 disabled:opacity-50"
              >
                Clean Failed Pods
              </button>
            )}
          </div>
        </div>
      )}

      {/* All healthy */}
      {!loading && diagnostics.length > 0 && unhealthyPods.length === 0 && releaseIssues.length === 0 && (
        <div className="rounded-lg bg-green-50 dark:bg-green-500/10 p-4 text-center">
          <CheckCircleIcon className="mx-auto size-8 text-green-500" />
          <p className="mt-2 text-sm font-medium text-green-700 dark:text-green-400">
            All pods are healthy!
          </p>
          <p className="text-xs text-green-600 dark:text-green-500">
            No issues detected with this release.
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8">
          <ArrowPathIcon className="mx-auto size-8 animate-spin text-indigo-500" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Analyzing release health...
          </p>
        </div>
      )}
    </div>
  );
}

// Issue Card Component
function IssueCard({
  issue,
  isExpanded,
  onToggle,
  onCopyCommand,
  copiedCommand,
  namespace,
  releaseName,
  podName,
  onRunAction,
  actionRunning,
}: {
  issue: Issue;
  isExpanded: boolean;
  onToggle: () => void;
  onCopyCommand: (cmd: string) => void;
  copiedCommand: string | null;
  namespace: string;
  releaseName: string;
  podName?: string;
  onRunAction?: (action: string, podName?: string) => void;
  actionRunning?: string | null;
}) {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <XCircleIcon className="size-4 text-red-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="size-4 text-yellow-500" />;
      default:
        return <CheckCircleIcon className="size-4 text-blue-500" />;
    }
  };

  const expandCommand = (cmd: string) => {
    return cmd
      .replace(/{namespace}/g, namespace)
      .replace(/{release}/g, releaseName)
      .replace(/{pod}/g, podName || '{pod}');
  };

  return (
    <div className={`rounded-lg border p-3 ${
      issue.severity === 'error' ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20' :
      issue.severity === 'warning' ? 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/20' :
      'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20'
    }`}>
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-2 text-left"
      >
        {getSeverityIcon(issue.severity)}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${
            issue.severity === 'error' ? 'text-red-800 dark:text-red-400' :
            issue.severity === 'warning' ? 'text-yellow-800 dark:text-yellow-400' :
            'text-blue-800 dark:text-blue-400'
          }`}>
            {issue.title}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {issue.description}
          </p>
        </div>
        <LightBulbIcon className={`size-4 ${isExpanded ? 'text-yellow-500' : 'text-gray-400'}`} />
      </button>

      {isExpanded && issue.solutions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            <LightBulbIcon className="size-3.5 text-yellow-500" />
            Suggested Solutions
          </p>
          {issue.solutions.map((solution, idx) => (
            <div key={idx} className="rounded bg-white dark:bg-gray-800 p-2 text-xs">
              <p className="font-medium text-gray-900 dark:text-white">{solution.title}</p>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">{solution.description}</p>
              {solution.command && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 bg-gray-100 dark:bg-gray-900 rounded px-2 py-1 text-xs font-mono text-gray-700 dark:text-gray-300 overflow-x-auto">
                    {expandCommand(solution.command)}
                  </code>
                  <button
                    onClick={() => onCopyCommand(solution.command!)}
                    className="shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    title="Copy command"
                  >
                    <ClipboardIcon className={`size-4 ${copiedCommand === solution.command ? 'text-green-500' : 'text-gray-400'}`} />
                  </button>
                </div>
              )}
              {solution.action && onRunAction && (
                <button
                  onClick={() => onRunAction(solution.action!, podName)}
                  disabled={actionRunning !== null}
                  className="mt-2 inline-flex items-center gap-x-1 rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {actionRunning === solution.action ? 'Running...' : `Run: ${solution.title}`}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
