'use client'

import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowPathIcon,
  PlayIcon,
  PauseIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronDownIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline';
import PodExec from './PodExec';

interface ContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  state: string;
}

interface PodCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
  lastTransitionTime: string;
}

interface Pod {
  name: string;
  namespace: string;
  status: string;
  phase: string;
  containers: string[];
  containerStatuses: ContainerStatus[];
  readyContainers: number;
  totalContainers: number;
  restarts: number;
  created: string;
  node: string;
  podIP: string;
  conditions: PodCondition[];
}

interface LogViewerProps {
  releaseName: string;
  namespace: string;
}

interface LogLine {
  index: number;
  content: string;
  timestamp?: string;
}

export default function LogViewer({ releaseName, namespace }: LogViewerProps) {
  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [streaming, setStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tailLines, setTailLines] = useState<number>(100);
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);
  const [showPodInfo, setShowPodInfo] = useState<boolean>(true);
  const [podDescription, setPodDescription] = useState<string>('');
  const [loadingDescription, setLoadingDescription] = useState<boolean>(false);
  const [showExec, setShowExec] = useState<boolean>(false);
  const [logFilter, setLogFilter] = useState<'all' | 'errors' | 'warnings' | 'info'>('all');
  
  // Selection state
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<number | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  
  const logContainerRef = useRef<HTMLDivElement>(null);
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lineElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());

  // Parse logs into lines with level detection
  const logLines: (LogLine & { level: 'error' | 'warning' | 'info' | 'debug' | 'normal' })[] = logs.split('\n').map((line, index) => {
    // Try to extract timestamp if present (ISO format at start of line)
    const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)\s+(.*)$/);
    const content = timestampMatch ? timestampMatch[2] : line;
    const lower = content.toLowerCase();
    
    // Detect log level
    let level: 'error' | 'warning' | 'info' | 'debug' | 'normal' = 'normal';
    if (lower.includes('error') || lower.includes('fatal') || lower.includes('panic') || 
        lower.includes('exception') || lower.includes('failed') || lower.includes('failure') ||
        lower.match(/\berr\b/) || lower.includes('critical')) {
      level = 'error';
    } else if (lower.includes('warn') || lower.includes('warning')) {
      level = 'warning';
    } else if (lower.includes('info')) {
      level = 'info';
    } else if (lower.includes('debug') || lower.includes('trace')) {
      level = 'debug';
    }
    
    if (timestampMatch) {
      return {
        index,
        timestamp: timestampMatch[1],
        content: timestampMatch[2],
        level,
      };
    }
    return { index, content: line, level };
  });

  // Count log levels for stats
  const logStats = {
    total: logLines.length,
    errors: logLines.filter(l => l.level === 'error').length,
    warnings: logLines.filter(l => l.level === 'warning').length,
    info: logLines.filter(l => l.level === 'info').length,
  };

  // Filter logs by level and search query
  const filteredLines = logLines.filter(line => {
    // Apply level filter
    if (logFilter === 'errors' && line.level !== 'error') return false;
    if (logFilter === 'warnings' && line.level !== 'warning' && line.level !== 'error') return false;
    if (logFilter === 'info' && line.level === 'debug') return false;
    
    // Apply search filter
    if (searchQuery) {
      const matchesSearch = line.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (line.timestamp && line.timestamp.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;
    }
    
    return true;
  });

  // Load pods for the release
  useEffect(() => {
    loadPods();
    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }
    };
  }, [releaseName, namespace]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Clear selection when logs change
  useEffect(() => {
    setSelectedLines(new Set());
    setSelectionAnchor(null);
  }, [logs, selectedPod, selectedContainer]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if log container is focused or contains focus
      const logContainer = logContainerRef.current;
      const isLogContainerFocused = logContainer && (
        document.activeElement === logContainer ||
        logContainer.contains(document.activeElement)
      );
      
      // Ctrl/Cmd + C to copy selected lines (works anywhere if we have selection)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedLines.size > 0) {
        e.preventDefault();
        copySelectedLines();
      }
      // Ctrl/Cmd + A to select all visible lines (only when log container is focused)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && isLogContainerFocused && logs) {
        e.preventDefault();
        selectAllLines();
      }
      // Escape to clear selection
      if (e.key === 'Escape' && selectedLines.size > 0) {
        e.preventDefault();
        setSelectedLines(new Set());
        setSelectionAnchor(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLines, filteredLines, logs]);

  const loadPods = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const result = await invoke<string>('get_release_pods', {
        releaseName,
        namespace,
      });
      const podList = JSON.parse(result) as Pod[];
      setPods(podList);
      
      if (podList.length > 0) {
        setSelectedPod(podList[0].name);
        if (podList[0].containers.length > 0) {
          setSelectedContainer(podList[0].containers[0]);
        }
      }
    } catch (e) {
      setError(`Failed to load pods: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [releaseName, namespace]);

  const loadPodDescription = useCallback(async (podName: string) => {
    try {
      setLoadingDescription(true);
      const result = await invoke<string>('describe_pod', {
        podName,
        namespace,
      });
      setPodDescription(result);
    } catch (e) {
      setPodDescription(`Failed to load description: ${e}`);
    } finally {
      setLoadingDescription(false);
    }
  }, [namespace]);

  // Load description when pod changes
  useEffect(() => {
    if (selectedPod) {
      loadPodDescription(selectedPod);
    }
  }, [selectedPod, loadPodDescription]);

  const fetchLogs = useCallback(async () => {
    if (!selectedPod) return;
    
    try {
      setLoading(true);
      setError('');
      const result = await invoke<string>('get_pod_logs', {
        podName: selectedPod,
        namespace,
        container: selectedContainer || undefined,
        tailLines,
        timestamps: showTimestamps,
      });
      setLogs(result);
    } catch (e) {
      setError(`Failed to fetch logs: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [selectedPod, selectedContainer, namespace, tailLines, showTimestamps]);

  const startStreaming = useCallback(() => {
    if (!selectedPod) return;
    
    setStreaming(true);
    fetchLogs();
    
    streamIntervalRef.current = setInterval(async () => {
      try {
        const result = await invoke<string>('get_pod_logs', {
          podName: selectedPod,
          namespace,
          container: selectedContainer || undefined,
          tailLines,
          timestamps: showTimestamps,
        });
        setLogs(result);
      } catch (e) {
        console.error('Log streaming error:', e);
      }
    }, 2000);
  }, [selectedPod, selectedContainer, namespace, tailLines, showTimestamps, fetchLogs]);

  const stopStreaming = useCallback(() => {
    setStreaming(false);
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
  }, []);

  const downloadLogs = useCallback(() => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPod}-${selectedContainer || 'logs'}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [logs, selectedPod, selectedContainer]);

  // Line selection handlers
  const handleLineMouseDown = useCallback((lineIndex: number, e: React.MouseEvent) => {
    // Prevent text selection during drag
    e.preventDefault();
    
    if (e.shiftKey && selectionAnchor !== null) {
      // Range selection with Shift
      const start = Math.min(selectionAnchor, lineIndex);
      const end = Math.max(selectionAnchor, lineIndex);
      const newSelection = new Set<number>();
      
      filteredLines.forEach((line) => {
        if (line.index >= start && line.index <= end) {
          newSelection.add(line.index);
        }
      });
      
      setSelectedLines(newSelection);
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle individual line with Ctrl/Cmd
      const newSelection = new Set(selectedLines);
      if (newSelection.has(lineIndex)) {
        newSelection.delete(lineIndex);
      } else {
        newSelection.add(lineIndex);
      }
      setSelectedLines(newSelection);
      setSelectionAnchor(lineIndex);
    } else {
      // Start drag selection
      setIsDragging(true);
      setDragStart(lineIndex);
      setSelectionAnchor(lineIndex);
      setSelectedLines(new Set([lineIndex]));
    }
  }, [selectionAnchor, selectedLines, filteredLines]);

  // Find which line index the mouse is currently over based on Y position
  const getLineIndexAtY = useCallback((clientY: number): number | null => {
    const container = logContainerRef.current;
    if (!container || filteredLines.length === 0) return null;

    // Get container bounds
    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    
    // Calculate relative Y position within the scrollable content
    const relativeY = clientY - containerRect.top + scrollTop;
    
    // Find the line element at this position
    for (const [index, element] of lineElementsRef.current.entries()) {
      const rect = element.getBoundingClientRect();
      const elementTop = rect.top - containerRect.top + scrollTop;
      const elementBottom = elementTop + rect.height;
      
      if (relativeY >= elementTop && relativeY < elementBottom) {
        return index;
      }
    }
    
    // If above first line, return first; if below last, return last
    if (relativeY < 0) return filteredLines[0]?.index ?? null;
    return filteredLines[filteredLines.length - 1]?.index ?? null;
  }, [filteredLines]);

  const updateDragSelection = useCallback((currentLineIndex: number) => {
    if (dragStart === null) return;
    
    const start = Math.min(dragStart, currentLineIndex);
    const end = Math.max(dragStart, currentLineIndex);
    const newSelection = new Set<number>();
    
    filteredLines.forEach((line) => {
      if (line.index >= start && line.index <= end) {
        newSelection.add(line.index);
      }
    });
    
    setSelectedLines(newSelection);
  }, [dragStart, filteredLines]);

  const handleLineMouseEnter = useCallback((lineIndex: number) => {
    if (!isDragging || dragStart === null) return;
    updateDragSelection(lineIndex);
  }, [isDragging, dragStart, updateDragSelection]);

  // Handle mouse move on container for better drag tracking
  const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || dragStart === null) return;

    const container = logContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const mouseY = e.clientY;

    // Auto-scroll when near edges
    const scrollZone = 40; // pixels from edge to trigger scroll
    const scrollSpeed = 8; // pixels per frame

    // Clear any existing auto-scroll
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }

    if (mouseY < containerRect.top + scrollZone) {
      // Scroll up
      const intensity = Math.max(0.2, 1 - (mouseY - containerRect.top) / scrollZone);
      autoScrollIntervalRef.current = setInterval(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop -= scrollSpeed * intensity;
          // Update selection while scrolling
          const lineIndex = getLineIndexAtY(mouseY);
          if (lineIndex !== null) updateDragSelection(lineIndex);
        }
      }, 16);
    } else if (mouseY > containerRect.bottom - scrollZone) {
      // Scroll down
      const intensity = Math.max(0.2, 1 - (containerRect.bottom - mouseY) / scrollZone);
      autoScrollIntervalRef.current = setInterval(() => {
        if (logContainerRef.current) {
          logContainerRef.current.scrollTop += scrollSpeed * intensity;
          // Update selection while scrolling
          const lineIndex = getLineIndexAtY(mouseY);
          if (lineIndex !== null) updateDragSelection(lineIndex);
        }
      }, 16);
    }

    // Update selection based on current mouse position
    const lineIndex = getLineIndexAtY(mouseY);
    if (lineIndex !== null) {
      updateDragSelection(lineIndex);
    }
  }, [isDragging, dragStart, getLineIndexAtY, updateDragSelection]);

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      // Clear auto-scroll
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
    }
  }, [isDragging]);

  // Global mouse up listener for drag end
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (autoScrollIntervalRef.current) {
          clearInterval(autoScrollIntervalRef.current);
          autoScrollIntervalRef.current = null;
        }
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, [isDragging]);

  const selectAllLines = useCallback(() => {
    const allIndices = new Set(filteredLines.map(line => line.index));
    setSelectedLines(allIndices);
  }, [filteredLines]);

  const clearSelection = useCallback(() => {
    setSelectedLines(new Set());
    setSelectionAnchor(null);
  }, []);

  const copySelectedLines = useCallback(async () => {
    if (selectedLines.size === 0) return;
    
    // Get selected lines in order
    const sortedIndices = Array.from(selectedLines).sort((a, b) => a - b);
    const selectedContent = sortedIndices
      .map(index => {
        const line = logLines.find(l => l.index === index);
        if (!line) return '';
        return line.timestamp 
          ? `${line.timestamp} ${line.content}`
          : line.content;
      })
      .join('\n');
    
    try {
      await navigator.clipboard.writeText(selectedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }, [selectedLines, logLines]);

  // Highlight search matches in text
  const highlightText = (text: string) => {
    if (!searchQuery) return text;
    const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">$1</mark>');
  };

  const selectedPodData = pods.find(p => p.name === selectedPod);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Pod selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Pod:</label>
          <select
            value={selectedPod}
            onChange={(e) => {
              setSelectedPod(e.target.value);
              const pod = pods.find(p => p.name === e.target.value);
              if (pod && pod.containers.length > 0) {
                setSelectedContainer(pod.containers[0]);
              }
              setLogs('');
            }}
            className="block rounded-md border-0 py-1 pl-2 pr-8 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 text-xs dark:bg-gray-800 dark:text-white dark:ring-white/10"
          >
            {pods.length === 0 && <option value="">No pods found</option>}
            {pods.map((pod) => (
              <option key={pod.name} value={pod.name}>
                {pod.name} ({pod.status})
              </option>
            ))}
          </select>
        </div>

        {/* Container selector */}
        {selectedPodData && selectedPodData.containers.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Container:</label>
            <select
              value={selectedContainer}
              onChange={(e) => {
                setSelectedContainer(e.target.value);
                setLogs('');
              }}
              className="block rounded-md border-0 py-1 pl-2 pr-8 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 text-xs dark:bg-gray-800 dark:text-white dark:ring-white/10"
            >
              {selectedPodData.containers.map((container) => (
                <option key={container} value={container}>
                  {container}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tail lines */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Lines:</label>
          <select
            value={tailLines}
            onChange={(e) => setTailLines(Number(e.target.value))}
            className="block rounded-md border-0 py-1 pl-2 pr-8 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 text-xs dark:bg-gray-800 dark:text-white dark:ring-white/10"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={5000}>5000</option>
          </select>
        </div>

        {/* Timestamps toggle */}
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showTimestamps}
            onChange={(e) => setShowTimestamps(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-800"
          />
          <span className="text-gray-500 dark:text-gray-400">Timestamps</span>
        </label>

        {/* Action buttons */}
        <div className="flex items-center gap-2 ml-auto">
          {!streaming ? (
            <button
              onClick={startStreaming}
              disabled={!selectedPod || loading}
              className="inline-flex items-center gap-x-1 rounded-md bg-green-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-green-500 disabled:opacity-50"
            >
              <PlayIcon className="size-3.5" />
              Stream
            </button>
          ) : (
            <button
              onClick={stopStreaming}
              className="inline-flex items-center gap-x-1 rounded-md bg-yellow-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-yellow-500"
            >
              <PauseIcon className="size-3.5" />
              Pause
            </button>
          )}
          
          <button
            onClick={fetchLogs}
            disabled={!selectedPod || loading}
            className="inline-flex items-center gap-x-1 rounded-md bg-indigo-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            <ArrowPathIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button
            onClick={() => setShowExec(true)}
            disabled={!selectedPod}
            className="inline-flex items-center gap-x-1 rounded-md bg-purple-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-purple-500 disabled:opacity-50"
            title="Execute commands in pod"
          >
            <CommandLineIcon className="size-3.5" />
            Exec
          </button>
          
          <button
            onClick={downloadLogs}
            disabled={!logs}
            className="inline-flex items-center gap-x-1 rounded-md bg-gray-600 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-gray-500 disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="size-3.5" />
            Download
          </button>
        </div>
      </div>

      {/* Log level filter bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">Filter:</span>
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
          <button
            onClick={() => setLogFilter('all')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              logFilter === 'all'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            All ({logStats.total})
          </button>
          <button
            onClick={() => setLogFilter('errors')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              logFilter === 'errors'
                ? 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400'
            }`}
          >
            🔴 Errors ({logStats.errors})
          </button>
          <button
            onClick={() => setLogFilter('warnings')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              logFilter === 'warnings'
                ? 'bg-yellow-100 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-yellow-600 dark:hover:text-yellow-400'
            }`}
          >
            🟡 Warnings ({logStats.warnings})
          </button>
          <button
            onClick={() => setLogFilter('info')}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
              logFilter === 'info'
                ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
            }`}
          >
            🔵 Info ({logStats.info})
          </button>
        </div>
        
        {/* Quick error summary if errors exist */}
        {logStats.errors > 0 && logFilter !== 'errors' && (
          <button
            onClick={() => setLogFilter('errors')}
            className="ml-auto flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-md hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
          >
            <ExclamationTriangleIcon className="size-3.5" />
            {logStats.errors} error{logStats.errors !== 1 ? 's' : ''} found
          </button>
        )}
      </div>

      {/* Search and selection toolbar */}
      <div className="flex items-center gap-3 mb-3">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <MagnifyingGlassIcon className="size-4 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter logs..."
            className="block w-full rounded-md border-0 py-1.5 pl-9 pr-9 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 text-xs dark:bg-gray-800 dark:text-white dark:ring-white/10 dark:placeholder:text-gray-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3"
            >
              <XMarkIcon className="size-4 text-gray-400 hover:text-gray-500" />
            </button>
          )}
        </div>

        {/* Selection actions */}
        {selectedLines.size > 0 && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selectedLines.size} line{selectedLines.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={copySelectedLines}
              className={`inline-flex items-center gap-x-1 rounded-md px-2 py-1 text-xs font-semibold shadow-sm ${
                copied 
                  ? 'bg-green-600 text-white'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {copied ? (
                <>
                  <CheckIcon className="size-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <ClipboardDocumentIcon className="size-3.5" />
                  Copy
                </>
              )}
            </button>
            <button
              onClick={clearSelection}
              className="inline-flex items-center gap-x-1 rounded-md bg-gray-500 px-2 py-1 text-xs font-semibold text-white shadow-sm hover:bg-gray-400"
            >
              <XMarkIcon className="size-3.5" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Select All button */}
      {logs && (
        <div className="mb-2 flex items-center gap-2">
          <button
            onClick={selectAllLines}
            className="inline-flex items-center gap-1 rounded-md bg-gray-700 px-2 py-1 text-xs font-medium text-gray-200 hover:bg-gray-600"
          >
            Select All
          </button>
          {selectedLines.size === 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              💡 Drag to select • Shift+Click for range • Ctrl+Click to toggle
            </span>
          )}
        </div>
      )}

      {/* Pod Status Info Panel */}
      {selectedPodData && (
        <div className="mb-3">
          <button
            onClick={() => setShowPodInfo(!showPodInfo)}
            className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-2"
          >
            <InformationCircleIcon className="size-4" />
            Pod Status
            <ChevronDownIcon className={`size-3.5 transition-transform ${showPodInfo ? 'rotate-180' : ''}`} />
          </button>
          
          {showPodInfo && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-3">
              {/* Quick status badges */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Phase badge */}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  selectedPodData.phase === 'Running' 
                    ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                    : selectedPodData.phase === 'Pending'
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                    : selectedPodData.phase === 'Succeeded'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                }`}>
                  {selectedPodData.phase === 'Running' ? (
                    <CheckCircleIcon className="size-3" />
                  ) : selectedPodData.phase === 'Pending' ? (
                    <ExclamationTriangleIcon className="size-3" />
                  ) : (
                    <XCircleIcon className="size-3" />
                  )}
                  {selectedPodData.phase}
                </span>
                
                {/* Ready badge */}
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  selectedPodData.readyContainers === selectedPodData.totalContainers && selectedPodData.totalContainers > 0
                    ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                }`}>
                  Ready: {selectedPodData.readyContainers}/{selectedPodData.totalContainers}
                </span>
                
                {/* Restarts badge */}
                {selectedPodData.restarts > 0 && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    selectedPodData.restarts > 5
                      ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                  }`}>
                    <ExclamationTriangleIcon className="size-3" />
                    {selectedPodData.restarts} restart{selectedPodData.restarts !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Pod details grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Node</dt>
                  <dd className="font-medium text-gray-900 dark:text-white truncate" title={selectedPodData.node}>
                    {selectedPodData.node || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Pod IP</dt>
                  <dd className="font-mono font-medium text-gray-900 dark:text-white">
                    {selectedPodData.podIP || '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {selectedPodData.created ? new Date(selectedPodData.created).toLocaleString() : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Namespace</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">
                    {selectedPodData.namespace}
                  </dd>
                </div>
              </div>

              {/* Container statuses */}
              {selectedPodData.containerStatuses && selectedPodData.containerStatuses.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Containers</h4>
                  <div className="space-y-1.5">
                    {selectedPodData.containerStatuses.map((container) => (
                      <div 
                        key={container.name}
                        className="flex items-center justify-between rounded bg-gray-50 dark:bg-gray-700/50 px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2">
                          {container.ready ? (
                            <CheckCircleIcon className="size-4 text-green-500" />
                          ) : (
                            <XCircleIcon className="size-4 text-red-500" />
                          )}
                          <span className="text-xs font-medium text-gray-900 dark:text-white">
                            {container.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs ${
                            container.state === 'Running' 
                              ? 'text-green-600 dark:text-green-400'
                              : container.state === 'Waiting' || container.state === 'ContainerCreating'
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}>
                            {container.state}
                          </span>
                          {container.restartCount > 0 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {container.restartCount} restart{container.restartCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditions summary */}
              {selectedPodData.conditions && selectedPodData.conditions.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Conditions</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedPodData.conditions.map((condition) => (
                      <span
                        key={condition.type}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                          condition.status === 'True'
                            ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                        title={condition.message || condition.reason}
                      >
                        {condition.status === 'True' ? (
                          <CheckCircleIcon className="size-3" />
                        ) : (
                          <XCircleIcon className="size-3" />
                        )}
                        {condition.type}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Full description toggle */}
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500">
                  <ChevronDownIcon className="size-3.5 group-open:rotate-180 transition-transform" />
                  Full kubectl describe output
                </summary>
                <div className="mt-2 rounded bg-gray-900 p-3 overflow-auto max-h-64">
                  {loadingDescription ? (
                    <div className="flex items-center gap-2 text-gray-400">
                      <ArrowPathIcon className="size-4 animate-spin" />
                      Loading description...
                    </div>
                  ) : (
                    <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono">
                      {podDescription}
                    </pre>
                  )}
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-md bg-red-50 p-3 dark:bg-red-500/10">
          <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Logs container */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={logContainerRef}
          className={`log-container absolute inset-0 overflow-auto rounded-md bg-gray-900 font-mono text-xs ${
            isDragging ? 'cursor-crosshair select-none' : ''
          }`}
          tabIndex={0}
          onMouseUp={handleMouseUp}
          onMouseMove={handleContainerMouseMove}
          onMouseLeave={() => {
            if (autoScrollIntervalRef.current) {
              clearInterval(autoScrollIntervalRef.current);
              autoScrollIntervalRef.current = null;
            }
          }}
        >
          {loading && !logs ? (
            <div className="flex items-center justify-center h-full">
              <ArrowPathIcon className="size-6 animate-spin text-gray-400" />
            </div>
          ) : !logs ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              {selectedPod ? 'Click "Stream" or "Refresh" to load logs' : 'Select a pod to view logs'}
            </div>
          ) : (
            <div className="divide-y divide-gray-800/50">
              {filteredLines.map((line) => (
                <div
                  key={line.index}
                  ref={(el) => {
                    if (el) lineElementsRef.current.set(line.index, el);
                    else lineElementsRef.current.delete(line.index);
                  }}
                  onMouseDown={(e) => handleLineMouseDown(line.index, e)}
                  onMouseEnter={() => handleLineMouseEnter(line.index)}
                  className={`flex select-none transition-colors ${
                    isDragging ? 'cursor-crosshair' : 'cursor-pointer'
                  } ${
                    selectedLines.has(line.index)
                      ? 'bg-indigo-600/30 hover:bg-indigo-600/40'
                      : line.level === 'error'
                      ? 'bg-red-500/10 hover:bg-red-500/20'
                      : line.level === 'warning'
                      ? 'bg-yellow-500/5 hover:bg-yellow-500/10'
                      : 'hover:bg-gray-800/50'
                  }`}
                >
                  {/* Level indicator */}
                  <div 
                    className={`flex-shrink-0 w-1 ${
                      line.level === 'error' ? 'bg-red-500' :
                      line.level === 'warning' ? 'bg-yellow-500' :
                      line.level === 'info' ? 'bg-blue-500' :
                      'bg-transparent'
                    }`}
                  />
                  
                  {/* Line number */}
                  <div 
                    className={`flex-shrink-0 w-12 px-2 py-0.5 text-right select-none border-r border-gray-700/50 ${
                      selectedLines.has(line.index)
                        ? 'text-indigo-300 bg-indigo-600/20'
                        : line.level === 'error'
                        ? 'text-red-400'
                        : line.level === 'warning'
                        ? 'text-yellow-400'
                        : 'text-gray-600'
                    }`}
                  >
                    {line.index + 1}
                  </div>
                  
                  {/* Timestamp */}
                  {showTimestamps && line.timestamp && (
                    <div 
                      className={`flex-shrink-0 px-2 py-0.5 ${
                        selectedLines.has(line.index)
                          ? 'text-indigo-200'
                          : 'text-gray-500'
                      }`}
                    >
                      {formatTimestamp(line.timestamp)}
                    </div>
                  )}
                  
                  {/* Content */}
                  <div 
                    className={`flex-1 px-2 py-0.5 whitespace-pre-wrap break-all ${
                      selectedLines.has(line.index)
                        ? 'text-white'
                        : line.level === 'error'
                        ? 'text-red-300'
                        : line.level === 'warning'
                        ? 'text-yellow-300'
                        : 'text-gray-100'
                    }`}
                    dangerouslySetInnerHTML={{ 
                      __html: highlightText(line.content) 
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Streaming indicator */}
        {streaming && (
          <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Live
          </div>
        )}

        {/* Auto-scroll toggle */}
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`absolute bottom-2 right-2 rounded-full p-1.5 text-xs ${
            autoScroll 
              ? 'bg-indigo-500/20 text-indigo-400' 
              : 'bg-gray-500/20 text-gray-400'
          }`}
          title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
        >
          <ChevronDownIcon className="size-4" />
        </button>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-2">
          {filteredLines.length} line{filteredLines.length !== 1 ? 's' : ''}
          {searchQuery && ` (filtered from ${logLines.length})`}
          {isDragging && (
            <span className="inline-flex items-center gap-1 text-indigo-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Selecting...
            </span>
          )}
          {!isDragging && selectedLines.size > 0 && ` • ${selectedLines.size} selected`}
        </span>
        <span>
          {selectedPod && `${selectedPod}${selectedContainer ? ` / ${selectedContainer}` : ''}`}
        </span>
      </div>

      {/* Pod Exec Modal */}
      {showExec && selectedPod && (
        <PodExec
          podName={selectedPod}
          namespace={namespace}
          container={selectedContainer || undefined}
          onClose={() => setShowExec(false)}
        />
      )}
    </div>
  );
}

// Helper to format timestamp for display
function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
  } catch {
    return timestamp.split('T')[1]?.split('Z')[0] || timestamp;
  }
}
